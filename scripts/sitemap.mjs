// Builds docs/sitemap.xml from the HTML pages in docs/, with each page's last commit
// date as lastmod (today for a page changed since). Run it after adding, removing or
// changing a page: npm run sitemap. The root robots.txt of zumerlab.com lists it.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const SITE = 'https://zumerlab.com/pulse/';

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}

// 404.html and redirect stubs are not pages of their own.
const isPage = (file) => !file.endsWith(`${sep}404.html`) && !/http-equiv="refresh"/i.test(readFileSync(file, 'utf8'));

// Folders for index pages: the form the site links itself by.
const urlOf = (file) => SITE + relative(DOCS, file).split(sep).join('/').replace(/(^|\/)index\.html$/, '$1');

const git = (...args) => execFileSync('git', args, { cwd: DOCS, encoding: 'utf8' }).trim();
const today = new Date().toISOString().slice(0, 10);
const lastmod = (file) => (git('status', '--porcelain', '--', file) ? today : git('log', '-1', '--format=%cs', '--', file) || today);

const urls = htmlFiles(DOCS).filter(isPage).map((f) => ({ loc: urlOf(f), lastmod: lastmod(f) }))
  .sort((a, b) => a.loc.localeCompare(b.loc));

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n')}
</urlset>
`;

writeFileSync(join(DOCS, 'sitemap.xml'), xml);
console.log(`docs/sitemap.xml: ${urls.length} pages`);
