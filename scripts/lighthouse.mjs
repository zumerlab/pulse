// Development: Lighthouse over the site's pages, served from docs/ with gzip as Pages
// serves them, on a phone and on a desktop. Prints the four scores of each page and
// fails below 100 on any. node scripts/lighthouse.mjs [page…] (file names without
// .html; every page by default). Needs Chrome; the lighthouse CLI comes through npx.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = fileURLToPath(new URL('../docs/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.xml': 'application/xml', '.md': 'text/markdown' };

const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = join(DOCS, path);
  if (!file.startsWith(DOCS) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end();
    return;
  }
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  const gzip = /text|javascript|svg|xml/.test(type) && /gzip/.test(req.headers['accept-encoding'] ?? '');
  res.writeHead(200, { 'content-type': type, 'cache-control': 'max-age=600', ...(gzip ? { 'content-encoding': 'gzip' } : {}) });
  const body = createReadStream(file);
  (gzip ? body.pipe(createGzip()) : body).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

// Asynchronous on purpose: the server above lives in this process, so a synchronous run
// would leave Chrome's requests unanswered.
const lighthouse = (args) => new Promise((resolve, reject) => {
  const child = spawn('npx', ['--yes', 'lighthouse@13', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
  child.on('error', reject);
  child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`lighthouse exited with ${code}`))));
});

const named = process.argv.slice(2);
// Every page but the redirect stubs of retired ones.
const isPage = (f) => f.endsWith('.html') && !/http-equiv="refresh"/i.test(readFileSync(join(DOCS, f), 'utf8'));
const pages = named.length ? named : readdirSync(DOCS).filter(isPage).map((f) => f.slice(0, -5)).sort();
const out = mkdtempSync(join(tmpdir(), 'pulse-lighthouse-'));
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];
let short = false;
console.log(`${'page'.padEnd(16)} ${'form'.padEnd(8)} perf a11y best seo   LCP    CLS    TBT`);
for (const form of ['mobile', 'desktop']) {
  for (const page of pages) {
    const url = `http://127.0.0.1:${port}/${page === 'index' ? '' : `${page}.html`}`;
    const file = join(out, `${page}-${form}.json`);
    await lighthouse([url, '--quiet', '--output=json', `--output-path=${file}`, `--only-categories=${CATEGORIES.join(',')}`,
      '--chrome-flags=--headless=new', ...(form === 'desktop' ? ['--preset=desktop'] : [])]);
    const { categories, audits } = JSON.parse(readFileSync(file, 'utf8'));
    const scores = CATEGORIES.map((k) => Math.round(categories[k].score * 100));
    if (scores.some((s) => s < 100)) short = true;
    const metric = (id, unit, digits) => `${(audits[id].numericValue / (unit === 's' ? 1000 : 1)).toFixed(digits)}${unit}`;
    console.log(`${page.padEnd(16)} ${form.padEnd(8)} ${scores.map((s) => String(s).padStart(4)).join(' ')}   ${metric('largest-contentful-paint', 's', 1).padEnd(6)} ${metric('cumulative-layout-shift', '', 3).padEnd(6)} ${metric('total-blocking-time', 'ms', 0)}`);
  }
}
server.close();
console.log(short ? `\nBelow 100 somewhere; the reports are in ${out}` : '\n100 everywhere.');
process.exit(short ? 1 : 0);
