/**
 * Local adaptation of tjx666/wx-search-cli 0.1.0 (MIT).
 * Upstream main reviewed: 70b75b71384b4bcfce86be744b685f02f9440c16, 2026-09-06.
 * Original Sogou approach: fancyboi999/weixin_search_mcp. See LICENSE and SOURCE.md.
 */
import * as cheerio from 'cheerio';

export const VERSION = '1.0.0';
export const BACKEND = 'wx-search-cli-tanzi';
export const REQUEST_TIMEOUT_MS = 15_000;
const SOGOU_ORIGIN = 'https://weixin.sogou.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
const ARTICLE_PARAMETERS = new Set(['__biz', 'mid', 'idx', 'sn', 'chksm', 'src', 'timestamp', 'ver', 'signature', 'scene', 'subscene', 'appmsgid', 'itemidx']);
const ERROR_MESSAGES = {
  invalid_arguments: 'Invalid command arguments.',
  invalid_url: 'URL is outside the permitted article/search hosts or paths.',
  captcha: 'Verification challenge encountered; collection stopped.',
  rate_limited: 'Rate limit encountered; collection stopped.',
  login_required: 'Login required; collection stopped.',
  access_denied: 'Access denied; collection stopped.',
  network_error: 'Network request failed; no retry was made.',
  timeout: 'Request timed out; no retry was made.',
  http_error: 'Unexpected HTTP response.',
  parser_error: 'Expected page structure or redirect URL was not found.',
  empty_content: 'Article body is missing or empty.',
  too_many_redirects: 'Redirect limit reached; collection stopped.',
};

export class CollectionError extends Error {
  constructor(code, stage, httpStatus) {
    super(ERROR_MESSAGES[code] ?? 'Collection failed.');
    this.code = code;
    this.stage = stage;
    this.httpStatus = httpStatus;
    this.blocked = ['captcha', 'rate_limited', 'login_required', 'access_denied'].includes(code);
  }
}

function errorRecord(error, stage = 'collection') {
  const safe = error instanceof CollectionError ? error : new CollectionError('network_error', stage);
  return { code: safe.code, stage: safe.stage, message: safe.message, ...(safe.httpStatus ? { http_status: safe.httpStatus } : {}) };
}

function parsedUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) throw new Error();
    return url;
  } catch {
    throw new CollectionError('invalid_url', 'validation');
  }
}

/** Article locator parameters are retained; unrelated authentication parameters are dropped. */
export function validateArticleUrl(value) {
  const url = parsedUrl(value);
  if (url.hostname !== 'mp.weixin.qq.com' || !/^\/s(?:\/[A-Za-z0-9_-]+)?\/?$/.test(url.pathname)) {
    throw new CollectionError('invalid_url', 'validation');
  }
  url.hash = '';
  for (const name of [...url.searchParams.keys()]) {
    if (!ARTICLE_PARAMETERS.has(name)) url.searchParams.delete(name);
  }
  return url.toString();
}

export function validateSogouUrl(value, paths = ['/weixin', '/link']) {
  const url = parsedUrl(value);
  if (url.origin !== SOGOU_ORIGIN || !paths.includes(url.pathname)) throw new CollectionError('invalid_url', 'validation');
  url.hash = '';
  return url.toString();
}

function validateRequestUrl(value) {
  const url = parsedUrl(value);
  if (url.hostname === 'mp.weixin.qq.com') return validateArticleUrl(value);
  return validateSogouUrl(value);
}

function compact(value) { return value.replace(/\s+/g, ' ').trim(); }

export function parseDate(raw = '') {
  raw = raw.trim();
  if (!raw) return { publish_time: null, date_status: 'missing', date_raw: null };
  const unix = raw.match(/(?:timeConvert\s*\(\s*['"]?)(\d{10})(?:['"]?\s*\))/);
  if (unix) return { publish_time: new Date(Number(unix[1]) * 1000).toISOString(), date_status: 'parsed', date_raw: null };
  const calendar = raw.match(/^(\d{4})[-年/](\d{1,2})[-月/](\d{1,2})日?(?:\s|$)/);
  if (calendar) {
    const iso = `${calendar[1]}-${calendar[2].padStart(2, '0')}-${calendar[3].padStart(2, '0')}`;
    const timestamp = Date.parse(`${iso}T00:00:00Z`);
    if (Number.isFinite(timestamp) && new Date(timestamp).toISOString().startsWith(iso)) {
      return { publish_time: iso, date_status: 'parsed', date_raw: null };
    }
  }
  return { publish_time: null, date_status: 'unparsed', date_raw: compact(raw).slice(0, 100) };
}

function detectGate(url, body, stage) {
  const $ = cheerio.load(body);
  const title = compact($('title').text());
  if (/antispider|\/captcha|\/verify/i.test(url) || $('#seccoderight, #captcha, input[name="captcha"]').length || /anti\.min\.css/i.test(body)) {
    throw new CollectionError('captcha', stage);
  }
  const hasContent = $('#js_content, li[id*="sogou_vr_11002601_box_"]').length > 0;
  if (/访问过于频繁|访问太频繁|频繁访问|请求过于频繁/.test(title)) throw new CollectionError('rate_limited', stage);
  if (/安全验证|环境异常|请输入验证码|访问验证/.test(title)) throw new CollectionError('captcha', stage);
  if (!hasContent) {
    const visible = compact($('body').text());
    if (/访问过于频繁|访问太频繁|请求过于频繁/.test(visible)) throw new CollectionError('rate_limited', stage);
    if (/请输入验证码|完成安全验证|当前环境异常/.test(visible)) throw new CollectionError('captcha', stage);
    if (/登录后(?:查看|继续|访问)|请先登录|请登录后|扫码登录/.test(visible) || /^(?:.*[ -])?(?:登录|登入|Log in|Sign in)$/i.test(title)) {
      throw new CollectionError('login_required', stage);
    }
  }
}

/** Parse within each list item so absent dates cannot drop or mispair articles. */
export function parseSearchPage(body, page = 1) {
  detectGate(SOGOU_ORIGIN, body, 'search');
  const $ = cheerio.load(body);
  const rows = $('li[id*="sogou_vr_11002601_box_"]').toArray();
  const items = rows.map((row) => {
    const item = $(row);
    const anchor = item.find('a[id*="sogou_vr_11002601_title_"]').first();
    const title = compact(anchor.text());
    const href = anchor.attr('href');
    let link = null;
    try {
      if (href) link = validateRequestUrl(new URL(href, SOGOU_ORIGIN).toString());
    } catch { /* Keep the candidate and report the invalid locator when selected. */ }
    const account = compact(item.find('.s-p .all-time-y2, .s-p a.account, .s-p a').first().text()) || null;
    const rawDate = item.find('.s-p .s2').first().text();
    return { title: title || null, account, ...parseDate(rawDate), summary: compact(item.find('p.txt-info, .txt-info').first().text()) || null, link, page };
  });
  if (items.length) return { items, zero_result: false, candidates_seen: rows.length };
  const visible = compact($('body').text());
  const explicitZero = /没有找到.{0,120}(?:相关|符合).{0,60}(?:结果|微信|文章)|未找到相关(?:结果|文章)|暂无相关(?:结果|文章)/.test(visible);
  if (explicitZero) return { items: [], zero_result: true, candidates_seen: 0 };
  throw new CollectionError('parser_error', 'search');
}

function decodeLiteral(literal) {
  const source = literal.slice(1, -1);
  if (/[\r\n]/.test(source)) throw new CollectionError('parser_error', 'resolve');
  return source.replace(/\\(x[\da-fA-F]{2}|u[\da-fA-F]{4}|[\\/'"]|.)/g, (_, escape) => {
    if (/^[xu]/.test(escape)) return String.fromCharCode(parseInt(escape.slice(1), 16));
    if (/^[\\/'"]$/.test(escape)) return escape;
    throw new CollectionError('parser_error', 'resolve');
  });
}

/** Read string literals only. Never evaluate scripts from a remote page. */
export function parseRedirectPage(body) {
  const pieces = [...body.matchAll(/\burl\s*\+=\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g)];
  let value = pieces.map((match) => decodeLiteral(match[1])).join('').replaceAll('@', '');
  if (!value) {
    const literal = body.match(/\b(?:url|location\.href)\s*=\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/);
    if (literal) value = decodeLiteral(literal[1]).replaceAll('@', '');
  }
  if (!value) throw new CollectionError('parser_error', 'resolve');
  if (value.startsWith('weixin.qq.com/')) value = `https://mp.${value}`;
  else if (value.startsWith('mp.weixin.qq.com/')) value = `https://${value}`;
  return validateArticleUrl(value);
}

function collectText(node, output) {
  for (const child of node.children ?? []) {
    if (child.type === 'text') {
      const value = child.data?.trim();
      if (value) output.push(value);
    } else if (child.type === 'tag') collectText(child, output);
  }
}

export function parseArticle(body, url) {
  detectGate(url, body, 'read');
  const $ = cheerio.load(body);
  const root = $('#js_content').first();
  root.find('script, style, noscript, iframe, form').remove();
  const texts = [];
  if (root.length) collectText(root.get(0), texts);
  const content = texts.join('\n').trim();
  if (!content) throw new CollectionError('empty_content', 'read');
  let dateRaw = $('#publish_time, #js_publish_time, #post-date').first().text();
  if (!dateRaw.trim()) {
    const ct = body.match(/\b(?:var\s+)?ct\s*=\s*['"]?(\d{10})['"]?\s*[;,]/);
    if (ct) dateRaw = `timeConvert('${ct[1]}')`;
  }
  return {
    url: validateArticleUrl(url),
    title: compact($('#activity-name, h1.rich_media_title').first().text()) || $('meta[property="og:title"]').attr('content')?.trim() || null,
    account: compact($('#js_name, #profileBt a, .rich_media_meta_nickname').first().text()) || null,
    ...parseDate(dateRaw), content, content_status: 'available', content_length: content.length,
  };
}

function makeTransport(options, requests) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const sleepImpl = options.sleepImpl ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const cookies = new Map(); // Anonymous Sogou response cookies, for this operation only.
  async function request(input, stage, referer) {
    let url = validateRequestUrl(input);
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (requests.total > 0) await sleepImpl(1000);
      const headers = { Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'zh-CN,zh;q=0.9', 'User-Agent': UA };
      if (referer) headers.Referer = validateSogouUrl(referer);
      if (new URL(url).origin === SOGOU_ORIGIN && cookies.size) headers.Cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
      requests.total++;
      requests[stage]++;
      let response;
      let body;
      try {
        response = await fetchImpl(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (response.status === 429) throw new CollectionError('rate_limited', stage, 429);
        if (response.status === 401) throw new CollectionError('login_required', stage, 401);
        if (response.status === 403) throw new CollectionError('access_denied', stage, 403);
        if (new URL(url).origin === SOGOU_ORIGIN) {
          for (const cookie of response.headers.getSetCookie?.() ?? []) {
            const pair = cookie.split(';', 1)[0];
            const equals = pair.indexOf('=');
            const name = pair.slice(0, equals).trim();
            const value = pair.slice(equals + 1).trim();
            if (equals > 0 && /^[!#$%&'*+.^_`|~\da-z-]+$/i.test(name) && !/[\r\n;]/.test(value)) cookies.set(name, value);
          }
        }
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          if (!location) throw new CollectionError('parser_error', stage);
          const next = new URL(location, url).toString();
          if (/antispider|\/captcha|\/verify/i.test(next)) throw new CollectionError('captcha', stage);
          url = validateRequestUrl(next);
          // A Sogou HTTP redirect already gives the required locator. Do not fetch the body in search.
          if (stage === 'resolve' && new URL(url).hostname === 'mp.weixin.qq.com') return { url, body: null };
          if (redirects === 3) throw new CollectionError('too_many_redirects', stage);
          continue;
        }
        if (!response.ok) throw new CollectionError('http_error', stage, response.status);
        // Enforce redirect:'manual' even when a custom fetch implementation ignores it.
        if (response.url && validateRequestUrl(response.url) !== url) throw new CollectionError('invalid_url', stage);
        body = await response.text();
      } catch (error) {
        if (error instanceof CollectionError) throw error;
        throw new CollectionError(['TimeoutError', 'AbortError'].includes(error?.name) ? 'timeout' : 'network_error', stage);
      }
      detectGate(url, body, stage);
      return { url, body };
    }
    throw new CollectionError('too_many_redirects', stage);
  }
  return { request };
}

function baseEnvelope() {
  return { status: 'error', backend: BACKEND, adapter_version: VERSION, source_family: 'sogou_weixin', fetched_at: new Date().toISOString(), requests: { total: 0, search: 0, resolve: 0, read: 0 }, errors: [] };
}

function accountCandidates(results, query) {
  const groups = new Map();
  for (const result of results) {
    if (!result.account) continue;
    if (!groups.has(result.account)) groups.set(result.account, { display_name: result.account, identity_status: 'identity_unverified', queries: [query], matched_articles: [] });
    groups.get(result.account).matched_articles.push({ title: result.title, url: result.real_url, search_link: result.link, publish_time: result.publish_time, query });
  }
  return [...groups.values()];
}

export async function search(query, options = {}) {
  const output = { ...baseEnvelope(), query: typeof query === 'string' ? query.trim() : null, results: [], coverage: { scope: 'sogou_search_index', is_exhaustive: false, limit: options.limit ?? 5, max_pages: options.maxPages ?? 1, pages_fetched: 0, candidates_seen: 0, selected: 0, returned: 0, resolved: 0, body_fetched: false, stop_reason: null } };
  const { limit, max_pages: maxPages } = output.coverage;
  if (!output.query || output.query.length > 500 || !Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 3) {
    output.errors.push(errorRecord(new CollectionError('invalid_arguments', 'validation')));
    return output;
  }
  const transport = makeTransport(options, output.requests);
  const seen = new Set();
  let blocked = false;
  try {
    for (let page = 1; page <= maxPages; page++) {
      const searchUrl = new URL('/weixin', SOGOU_ORIGIN);
      searchUrl.search = new URLSearchParams({ type: '2', s_from: 'input', query: output.query, ie: 'utf8', page: String(page), _sug_: 'n', _sug_type_: '' }).toString();
      const response = await transport.request(searchUrl.toString(), 'search');
      output.coverage.pages_fetched++;
      const parsed = parseSearchPage(response.body, page);
      output.coverage.candidates_seen += parsed.candidates_seen;
      if (parsed.zero_result) { output.coverage.stop_reason = 'explicit_zero_result'; break; }
      // Select before any redirect request; the total selection count also caps cross-page requests.
      const selected = parsed.items.slice(0, limit - output.coverage.selected);
      for (const candidate of selected) {
        output.coverage.selected++;
        const result = { ...candidate, query: output.query, real_url: null, url_status: 'unresolved', content_status: 'not_fetched' };
        output.results.push(result);
        if (!candidate.title || !candidate.link) {
          output.errors.push(errorRecord(new CollectionError('parser_error', 'search_item')));
          continue;
        }
        if (new URL(candidate.link).hostname === 'mp.weixin.qq.com') result.real_url = validateArticleUrl(candidate.link);
        else {
          const resolved = await transport.request(validateSogouUrl(candidate.link, ['/link']), 'resolve', searchUrl.toString());
          result.real_url = resolved.body === null ? validateArticleUrl(resolved.url) : parseRedirectPage(resolved.body);
        }
        result.url_status = 'resolved';
        if (seen.has(result.real_url)) output.results.pop();
        else seen.add(result.real_url);
      }
      if (output.coverage.selected >= limit) { output.coverage.stop_reason = 'limit'; break; }
      if (page === maxPages) output.coverage.stop_reason = 'max_pages';
    }
  } catch (error) {
    output.errors.push(errorRecord(error));
    blocked = error instanceof CollectionError && error.blocked;
    output.coverage.stop_reason = error instanceof CollectionError ? error.code : 'network_error';
    const last = output.results.at(-1);
    if (last && last.url_status !== 'resolved') last.url_status = blocked ? 'blocked' : 'failed';
  }
  output.coverage.returned = output.results.length;
  output.coverage.resolved = output.results.filter((result) => result.real_url).length;
  output.status = output.errors.length ? (output.results.length ? 'partial' : blocked ? 'blocked' : 'error') : output.results.length ? 'success' : 'zero_result';
  if (options.discoverAccounts) output.accounts = accountCandidates(output.results, output.query);
  return output;
}

export async function readArticle(target, options = {}) {
  const output = { ...baseEnvelope(), target: null, article: null, coverage: { scope: 'single_article', body_fetched: false, stop_reason: null } };
  try {
    output.target = validateArticleUrl(target);
    const referer = options.referer ? validateSogouUrl(options.referer) : undefined;
    const transport = makeTransport(options, output.requests);
    const response = await transport.request(output.target, 'read', referer);
    output.article = parseArticle(response.body, response.url);
    output.coverage.body_fetched = true;
    output.status = 'success';
  } catch (error) {
    output.errors.push(errorRecord(error, 'read'));
    output.status = error instanceof CollectionError && error.blocked ? 'blocked' : 'error';
    output.coverage.stop_reason = error instanceof CollectionError ? error.code : 'network_error';
  }
  return output;
}

export function exitCode(output) {
  if (output.errors.some((error) => error.code === 'invalid_arguments')) return 64;
  return ['success', 'zero_result'].includes(output.status) ? 0 : output.status === 'partial' ? 2 : 1;
}
