#!/usr/bin/env node
// Read-only fallback using the installed OpenCLI adapters and a fresh owned tab.
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { delimiter, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const HELP = `node xhs-read.mjs note|comments --input search.json [--rank 1] [--limit 3] [--output file]
Reads one existing Xiaohongshu search result in a fresh OpenCLI-owned tab.
Requires installed OpenCLI 1.8.7 and connected browser extension; no installation or login changes.
Comments: 1..5 top-level comments (default 3), no nested replies. No automatic retries.
Stop on login/security errors. Note text excludes image OCR, video, and comments.
`;
const fail = (code) => Object.assign(new Error(code), { code });
const normalize = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();

export function validateTarget(target) {
  let url;
  try { url = new URL(target?.url); } catch { throw fail('invalid_target'); }
  if (url.protocol !== 'https:' || url.hostname !== 'www.xiaohongshu.com' || url.username || url.password || !url.searchParams.get('xsec_token')) throw fail('invalid_target');
  const id = url.pathname.match(/^\/(?:search_result|explore|note|discovery\/item)\/([a-f0-9]+)\/?$/i)?.[1];
  if (!id) throw fail('invalid_target');
  return { url: target.url, id };
}

export async function collect({ target, mode, limit = 3, createPage, noteAdapter, commentsAdapter }) {
  const validated = validateTarget(target);
  if (!['note', 'comments'].includes(mode) || !Number.isInteger(limit) || limit < 1 || limit > 5) throw fail('invalid_arguments');
  const page = createPage();
  let opened = false;
  try {
    page.goto = async function(url) {
      if (opened || url !== validated.url) throw fail('unexpected_navigation');
      opened = true;
      await this.newTab(url);
      await this.wait({ time: 3 });
    };
    // Read and validate the note before collecting comments on this same page.
    const rows = await noteAdapter.func(page, { 'note-id': validated.url });
    const fields = Object.fromEntries(rows.map(row => [row.field, row.value]));
    if (!fields.content?.trim()) throw fail('empty_body');
    if (target.title && normalize(fields.title) !== normalize(target.title)) throw fail('title_mismatch');
    if (target.author && normalize(fields.author) !== normalize(target.author)) throw fail('author_mismatch');
    const result = { note_id: validated.id, title: fields.title, author: fields.author, content: fields.content, content_length: fields.content.length, likes: fields.likes, collects: fields.collects, comment_count: fields.comments, tags: fields.tags, identity_verified: true, coverage: 'visible_note_text_only; no image OCR or video transcription' };
    if (mode === 'comments') {
      // Adapter requests the same URL again; it is already open and validated.
      page.goto = async function(url) { if (url !== validated.url) throw fail('unexpected_navigation'); };
      const comments = await commentsAdapter.func(page, { 'note-id': validated.url, limit, 'with-replies': false });
      if (!Array.isArray(comments) || comments.some(row => row.is_reply || typeof row.text !== 'string')) throw fail('unexpected_comments');
      result.comments = comments.slice(0, limit).map(row => ({ rank: row.rank, text: row.text, likes: row.likes, time: row.time, is_reply: false }));
      result.comments_limit = limit;
      result.comments_coverage = 'up to requested top-level comments in current page order; no nested replies or profile identifiers';
    }
    return result;
  } finally {
    // Closes only the uniquely named automation session created by this invocation.
    await page.closeWindow();
  }
}

async function installedOpencli() {
  const candidates = new Set();
  for (const bin of (process.env.PATH ?? '').split(delimiter)) {
    candidates.add(join(bin, 'node_modules', '@jackwener', 'opencli'));
    candidates.add(resolve(bin, '../lib/node_modules/@jackwener/opencli'));
  }
  for (const folder of candidates) {
    try {
      const manifest = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'));
      if (manifest.name !== '@jackwener/opencli') continue;
      if (manifest.version !== '1.8.7') throw fail('opencli_version_not_verified');
      return folder;
    } catch (error) { if (error.code === 'opencli_version_not_verified') throw error; }
  }
  throw fail('opencli_not_found');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { console.log(HELP); return; }
  let output;
  const result = { backend: 'tanzi-xhs-read / installed OpenCLI 1.8.7', method: 'fresh_owned_tab', fetched_at: new Date().toISOString(), status: 'error' };
  try {
    const mode = args.shift();
    const flags = {};
    while (args.length) {
      const key = args.shift();
      const value = args.shift();
      if (!['--input', '--rank', '--limit', '--output'].includes(key) || !value || flags[key]) throw fail('invalid_arguments');
      flags[key] = value;
    }
    output = flags['--output'];
    if (!flags['--input']) throw fail('invalid_arguments');
    const rank = Number(flags['--rank'] ?? 1);
    const limit = Number(flags['--limit'] ?? 3);
    if (!Number.isInteger(rank) || rank < 1) throw fail('invalid_arguments');
    const search = JSON.parse((await readFile(flags['--input'], 'utf8')).replace(/^\uFEFF/, ''));
    const target = (Array.isArray(search) ? search : search.results)?.[rank - 1];
    validateTarget(target);
    const folder = await installedOpencli();
    const { Page } = await import(pathToFileURL(join(folder, 'dist/src/browser/page.js')));
    const { setDaemonCommandTimeoutSeconds } = await import(pathToFileURL(join(folder, 'dist/src/browser/daemon-client.js')));
    const { command: noteAdapter } = await import(pathToFileURL(join(folder, 'clis/xiaohongshu/note.js')));
    const { command: commentsAdapter } = await import(pathToFileURL(join(folder, 'clis/xiaohongshu/comments.js')));
    if (noteAdapter.access !== 'read' || commentsAdapter.access !== 'read') throw fail('adapter_not_readonly');
    setDaemonCommandTimeoutSeconds(20);
    result.mode = mode;
    result.data = await collect({ target, mode, limit, noteAdapter, commentsAdapter, createPage: () => new Page(`tanzi-xhs-${process.pid}-${Date.now()}`, 30, undefined, 'background', 'adapter', 'ephemeral') });
    result.status = 'success';
  } catch (error) {
    const code = String(error.code ?? (/Navigation rejected/i.test(String(error.message)) ? 'navigation_rejected' : 'read_failed')).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
    result.error = { code, message: 'Read failed; no retry. Check the error code and current connection, target, login or security state.' };
    if (/AUTH|SECURITY|RATE|captcha/i.test(code)) result.status = 'blocked';
  }
  const json = JSON.stringify(result, null, 2) + '\n';
  if (output) { await mkdir(dirname(resolve(output)), { recursive: true }); await writeFile(output, json, 'utf8'); }
  process.stdout.write(json);
  process.exitCode = result.status === 'success' ? 0 : 1;
}

if (process.argv[1] && pathToFileURL(await realpath(resolve(process.argv[1]))).href === import.meta.url) await main();
