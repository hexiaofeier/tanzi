import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchPage, parseRedirectPage, parseArticle, validateArticleUrl, validateSogouUrl, search, readArticle, exitCode } from './collector.mjs';

// A missing injected fetch must fail locally rather than contact a real service.
globalThis.fetch = async () => { throw new Error('Real networking is forbidden in regression tests.'); };
const articleUrl = 'https://mp.weixin.qq.com/s/example';
const row = (index, date = '') => `<li id="sogou_vr_11002601_box_${index}"><div class="txt-box"><h3><a id="sogou_vr_11002601_title_${index}" href="/link?url=article${index}">标题${index}</a></h3><p class="txt-info">摘要${index}</p><div class="s-p"><a class="all-time-y2">同名公众号</a>${date ? `<span class="s2">${date}</span>` : ''}</div></div></li>`;
const searchHtml = (count) => `<html><body><ul class="news-list">${Array.from({ length: count }, (_, index) => row(index)).join('')}</ul></body></html>`;
const redirectHtml = (index) => `<script>var url = ''; url += 'https://mp.weixin.qq.com/s/article${index}'; location.href = url;</script>`;
const articleHtml = '<h1 id="activity-name">文章标题</h1><span id="js_name">公众号</span><span id="publish_time">2026-09-06</span><div id="js_content"><p>第一段</p><p>第二段</p><script>throw new Error("never run")</script></div>';
function fixtureFetch(responses) {
  const calls = [];
  const delays = [];
  return {
    calls, delays,
    options: {
      sleepImpl: async (milliseconds) => delays.push(milliseconds),
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        assert.equal(init.redirect, 'manual');
        assert.ok(init.signal instanceof AbortSignal);
        const response = responses.shift();
        assert.ok(response, `Unexpected extra request number ${calls.length}`);
        if (response instanceof Error) throw response;
        return new Response(response.body ?? '', { status: response.status ?? 200, headers: response.headers });
      },
    },
  };
}

test('missing dates retain every item and cannot inherit another article date', () => {
  const parsed = parseSearchPage(`<ul>${row(0)}${row(1, "<script>document.write(timeConvert('1783164489'))</script>")}</ul>`);
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].title, '标题0');
  assert.equal(parsed.items[0].publish_time, null);
  assert.equal(parsed.items[0].date_status, 'missing');
  assert.equal(parsed.items[1].title, '标题1');
  assert.equal(parsed.items[1].publish_time, new Date(1783164489000).toISOString());
  assert.equal(parsed.items[1].account, '同名公众号');
});

test('empty article content fails explicitly, including whitespace/script-only body', async () => {
  for (const body of ['<html>已删除</html>', '<div id="js_content"> \n <script>notBody()</script></div>']) {
    const mock = fixtureFetch([{ body }]);
    const result = await readArticle(articleUrl, mock.options);
    assert.equal(result.status, 'error');
    assert.equal(result.article, null);
    assert.equal(result.errors[0].code, 'empty_content');
    assert.equal(exitCode(result), 1);
  }
  const parsed = parseArticle(articleHtml, articleUrl);
  assert.equal(parsed.content, '第一段\n第二段');
  assert.equal(parsed.publish_time, '2026-09-06');
  assert.equal(parsed.content_status, 'available');
});

test('only explicit zero results can become zero_result; unexpected HTML is an error', async () => {
  const empty = fixtureFetch([{ body: '<div class="no-result">没有找到相关的微信公众号文章</div>' }]);
  const zero = await search('主题', empty.options);
  assert.equal(zero.status, 'zero_result');
  assert.equal(exitCode(zero), 0);
  const broken = fixtureFetch([{ body: '<html><title>服务提示</title><body>稍后查看</body></html>' }]);
  const failure = await search('主题', broken.options);
  assert.equal(failure.status, 'error');
  assert.equal(failure.errors[0].code, 'parser_error');
});

test('limit is applied before URL resolution and all requests are spaced serially', async () => {
  const mock = fixtureFetch([{ body: searchHtml(10) }, ...Array.from({ length: 3 }, (_, index) => ({ body: redirectHtml(index) }))]);
  const result = await search('主题', { ...mock.options, limit: 3, maxPages: 3, discoverAccounts: true });
  assert.equal(result.status, 'success');
  assert.equal(result.results.length, 3);
  assert.equal(result.coverage.candidates_seen, 10);
  assert.equal(result.coverage.selected, 3);
  assert.equal(result.requests.search, 1);
  assert.equal(result.requests.resolve, 3);
  assert.equal(mock.calls.length, 4);
  assert.deepEqual(mock.delays, [1000, 1000, 1000]);
  assert.equal(result.accounts.length, 1);
  assert.equal(result.accounts[0].identity_status, 'identity_unverified');
  assert.equal(result.accounts[0].matched_articles.length, 3);
});

test('cross-page limit caps selected items even when the last page has more candidates', async () => {
  const mock = fixtureFetch([{ body: searchHtml(1) }, { body: redirectHtml(0) }, { body: searchHtml(10) }, { body: redirectHtml(1) }]);
  const result = await search('主题', { ...mock.options, limit: 2, maxPages: 3 });
  assert.equal(result.status, 'success');
  assert.equal(result.requests.total, 4);
  assert.equal(result.coverage.pages_fetched, 2);
  assert.equal(result.coverage.selected, 2);
});

test('429 stops immediately and retains already obtained results as partial', async () => {
  const mock = fixtureFetch([{ body: searchHtml(10) }, { body: redirectHtml(0) }, { status: 429 }]);
  const result = await search('主题', { ...mock.options, limit: 5, maxPages: 3 });
  assert.equal(mock.calls.length, 3);
  assert.equal(result.status, 'partial');
  assert.equal(result.results[0].url_status, 'resolved');
  assert.equal(result.results[1].url_status, 'blocked');
  assert.equal(result.errors[0].code, 'rate_limited');
  assert.equal(result.coverage.stop_reason, 'rate_limited');
  assert.equal(exitCode(result), 2);
  const immediatelyBlocked = fixtureFetch([{ status: 429 }]);
  assert.equal((await search('主题', immediatelyBlocked.options)).status, 'blocked');
});

test('captcha and login pages stop collection without retrying or claiming zero results', async () => {
  for (const [body, code] of [['<div id="seccoderight">验证码</div>', 'captcha'], ['<html><title>登录</title><body>请先登录</body></html>', 'login_required']]) {
    const mock = fixtureFetch([{ body }]);
    const result = await search('主题', mock.options);
    assert.equal(result.status, 'blocked');
    assert.equal(result.errors[0].code, code);
    assert.equal(mock.calls.length, 1);
  }
});

test('redirect parsing never executes JavaScript and rejects foreign destinations', () => {
  globalThis.__wechatParserExecuted = false;
  const parsed = parseRedirectPage(`<script>globalThis.__wechatParserExecuted = true; url += 'weixin.qq.com/s?__biz=abc'; url += '&mid=123&idx=1&sn=xyz';</script>`);
  assert.equal(globalThis.__wechatParserExecuted, false);
  assert.equal(new URL(parsed).hostname, 'mp.weixin.qq.com');
  assert.throws(() => parseRedirectPage("<script>url += 'https://evil.example/s/fake'</script>"), { code: 'invalid_url' });
  assert.throws(() => parseRedirectPage('<script>eval("anything")</script>'), { code: 'parser_error' });
  delete globalThis.__wechatParserExecuted;
});

test('anonymous cookies stay in memory and are never sent across origins', async () => {
  const mock = fixtureFetch([
    { body: searchHtml(1), headers: { 'Set-Cookie': 'SNUID=anonymous-secret; Path=/; HttpOnly' } },
    { status: 302, headers: { Location: articleUrl } },
  ]);
  const searchResult = await search('主题', { ...mock.options, limit: 1 });
  assert.equal(mock.calls[0].init.headers.Cookie, undefined);
  assert.equal(mock.calls[1].init.headers.Cookie, 'SNUID=anonymous-secret');
  assert.equal(mock.calls.length, 2); // search resolves the locator without reading WeChat.
  assert.ok(!JSON.stringify(searchResult).includes('anonymous-secret'));
  const crossOrigin = fixtureFetch([
    { status: 302, headers: { Location: 'https://weixin.sogou.com/link?url=temporary' } },
    { status: 302, headers: { 'Set-Cookie': 'SNUID=temporary-secret; Path=/', Location: articleUrl } },
    { body: articleHtml },
  ]);
  const read = await readArticle(articleUrl, crossOrigin.options);
  assert.equal(read.status, 'success');
  assert.equal(crossOrigin.calls[2].init.headers.Cookie, undefined);
  assert.ok(!JSON.stringify(read).includes('temporary-secret'));
});

test('URL validation rejects credentials, nonstandard ports, lookalikes and unsafe redirects', async () => {
  for (const url of ['https://mp.weixin.qq.com.evil.example/s/a', 'https://name:secret@mp.weixin.qq.com/s/a', 'https://mp.weixin.qq.com:8443/s/a', 'file:///s/a', 'https://mp.weixin.qq.com/mp/login']) {
    assert.throws(() => validateArticleUrl(url), { code: 'invalid_url' });
  }
  assert.throws(() => validateSogouUrl('http://weixin.sogou.com/link?url=a'), { code: 'invalid_url' });
  assert.throws(() => validateSogouUrl('https://weixin.sogou.com/anything'), { code: 'invalid_url' });
  const clean = validateArticleUrl('https://mp.weixin.qq.com/s?__biz=abc&mid=123&idx=1&sn=hash&signature=locator&key=secret&pass_ticket=secret&uin=123#fragment');
  assert.equal(new URL(clean).searchParams.get('signature'), 'locator');
  assert.equal(new URL(clean).searchParams.get('key'), null);
  assert.equal(new URL(clean).searchParams.get('uin'), null);
  const mock = fixtureFetch([{ status: 302, headers: { Location: 'https://evil.example/private' } }]);
  const result = await readArticle(articleUrl, mock.options);
  assert.equal(result.status, 'error');
  assert.equal(result.errors[0].code, 'invalid_url');
  assert.equal(mock.calls.length, 1);
});

test('network errors are structured, do not expose raw error text and are not retried', async () => {
  const mock = fixtureFetch([new Error('Cookie=SNUID=should-never-be-printed')]);
  const result = await search('主题', mock.options);
  assert.equal(result.status, 'error');
  assert.equal(result.errors[0].code, 'network_error');
  assert.equal(mock.calls.length, 1);
  assert.ok(!JSON.stringify(result).includes('should-never-be-printed'));
});
