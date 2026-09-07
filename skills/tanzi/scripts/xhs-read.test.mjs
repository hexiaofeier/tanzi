import test from 'node:test';
import assert from 'node:assert/strict';
import { collect } from './xhs-read.mjs';

const target = { title: '标题', author: '作者', url: 'https://www.xiaohongshu.com/search_result/abcdef123?xsec_token=RESOURCE&xsec_source=pc_search' };
function setup() {
  const calls = [];
  const page = { newTab: async url => calls.push(['new', url]), wait: async () => {}, closeWindow: async () => calls.push(['close']) };
  const noteAdapter = { func: async (page, args) => { await page.goto(args['note-id']); return [{ field: 'title', value: '标题' }, { field: 'author', value: '作者' }, { field: 'content', value: '真实正文' }]; } };
  return { target, mode: 'note', createPage: () => page, noteAdapter, calls, page };
}
test('fresh tab preserves the signed URL and closes only this session', async () => {
  const s = setup();
  const result = await collect(s);
  assert.equal(result.content, '真实正文');
  assert.deepEqual(s.calls, [['new', target.url], ['close']]);
});
test('security error stops immediately without retries and still closes', async () => {
  const s = setup();
  s.noteAdapter.func = async page => { await page.goto(target.url); throw Object.assign(new Error('restricted'), { code: 'SECURITY_BLOCK' }); };
  await assert.rejects(collect(s), { code: 'SECURITY_BLOCK' });
  assert.equal(s.calls.filter(c => c[0] === 'new').length, 1);
  assert.equal(s.calls.at(-1)[0], 'close');
});
test('wrong identity and invalid targets cannot pass content validation', async () => {
  const s = setup();
  await assert.rejects(collect({ ...s, target: { ...target, author: '其他作者' } }), { code: 'author_mismatch' });
  const bad = setup();
  await assert.rejects(collect({ ...bad, target: { ...target, url: 'https://example.com/?xsec_token=x' } }), { code: 'invalid_target' });
  assert.equal(bad.calls.length, 0);
});
test('comment sample reuses the validated page and omits profile identifiers', async () => {
  const s = setup();
  s.mode = 'comments';
  s.limit = 2;
  s.commentsAdapter = { func: async (page, args) => {
    await page.goto(args['note-id']);
    assert.equal(args.limit, 2);
    assert.equal(args['with-replies'], false);
    return [1, 2, 3].map(rank => ({ rank, text: `评论${rank}`, likes: 1, userId: 'private-field', profileUrl: 'unused', is_reply: false }));
  } };
  const result = await collect(s);
  assert.equal(result.comments.length, 2);
  assert.equal(result.comments[0].userId, undefined);
  assert.deepEqual(s.calls, [['new', target.url], ['close']]);
});
