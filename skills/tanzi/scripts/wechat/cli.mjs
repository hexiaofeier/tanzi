#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { BACKEND, VERSION, search, readArticle, exitCode } from './collector.mjs';

const HELP = `Tanzi WeChat collector ${VERSION} (wx-search-cli adaptation)

node cli.mjs search "关键词" [--limit 5] [--max-pages 1] [--discover-accounts] [--output file]
node cli.mjs read "https://mp.weixin.qq.com/s/..." [--referer sogouURL] [--output file]
node cli.mjs --help | --version

Limits: --limit 1..50; --max-pages 1..3. Requests are serial, >=1s apart,
15s timeout, no retries. Verification/rate limits/login requirements stop collection.
Search returns metadata and locators; use read to fetch article text explicitly.
JSON is always printed; --output also writes UTF-8 JSON, including failure results.
Exit codes: 0 success/explicit zero results; 2 partial; 1 failure/blocked; 64 arguments.
`;

const args = process.argv.slice(2);
if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
  process.stdout.write(HELP);
} else if (args.length === 1 && args[0] === '--version') {
  process.stdout.write(`${VERSION}\n`);
} else {
  let outputFile;
  let result;
  try {
    const [command, target, ...flags] = args;
    if (!['search', 'read'].includes(command) || !target || target.startsWith('--')) throw new Error();
    const options = {};
    const seen = new Set();
    for (let i = 0; i < flags.length; i++) {
      const flag = flags[i];
      if (seen.has(flag)) throw new Error();
      seen.add(flag);
      if (flag === '--discover-accounts' && command === 'search') { options.discoverAccounts = true; continue; }
      const value = flags[++i];
      if (!value || value.startsWith('--')) throw new Error();
      if (flag === '--output') outputFile = value;
      else if (flag === '--referer' && command === 'read') options.referer = value;
      else if (flag === '--limit' && command === 'search' && /^\d+$/.test(value)) options.limit = Number(value);
      else if (flag === '--max-pages' && command === 'search' && /^\d+$/.test(value)) options.maxPages = Number(value);
      else throw new Error();
    }
    result = command === 'search' ? await search(target, options) : await readArticle(target, options);
  } catch {
    result = { status: 'error', backend: BACKEND, adapter_version: VERSION, source_family: 'sogou_weixin', fetched_at: new Date().toISOString(), requests: { total: 0, search: 0, resolve: 0, read: 0 }, errors: [{ code: 'invalid_arguments', stage: 'validation', message: 'Invalid arguments. See --help.' }] };
  }
  let json = `${JSON.stringify(result, null, 2)}\n`;
  if (outputFile) {
    try {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, json, 'utf8');
    }
    catch {
      result.errors.push({ code: 'output_error', stage: 'output', message: 'Could not write the requested output file.' });
      result.status = result.results?.length || result.article ? 'partial' : 'error';
      json = `${JSON.stringify(result, null, 2)}\n`;
    }
  }
  process.stdout.write(json);
  process.exitCode = exitCode(result);
}
