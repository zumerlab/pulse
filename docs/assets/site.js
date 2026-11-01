// Pulse site: the header, the side navigation and the pager. No analytics, no tracking.

const REPO = 'zumerlab/pulse';
const NAV = [
  ['Pulse', [
    ['Why', 'principles.html'],
    ['The object', 'object.html'],
    ['Elements', 'elements.html'],
    ['The board', 'board.html'],
  ]],
  ['In use', [
    ['Home Assistant', 'home-assistant.html'],
    ['Your own source', 'sources.html'],
    ['In your project', 'adapt.html'],
  ]],
];
const PAGES = NAV.flatMap(([, items]) => items);

const MARK = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
  <circle cx="16" cy="16" r="13" opacity=".35"/><circle cx="16" cy="16" r="9" opacity=".6"/><circle cx="16" cy="16" r="4" fill="currentColor" stroke="none"/></svg>`;
const GH = `<svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`;

const here = location.pathname.split('/').pop() || 'index.html';
const current = (path) => (path === here ? ' aria-current="page"' : '');

function header() {
  const head = document.querySelector('[data-site-head]');
  if (!head) return;
  head.className = 'site-head';
  head.innerHTML = `
    <a class="brand" href="index.html">${MARK}Pulse</a>
    <nav class="links" aria-label="Site">
      ${PAGES.map(([label, path]) => `<a href="${path}"${current(path)}>${label}</a>`).join('')}
      <a class="gh" href="https://github.com/${REPO}">${GH}GitHub</a>
    </nav>
    <button class="menu-toggle" type="button" aria-expanded="false">Menu</button>`;
  if (!document.querySelector('[data-site-nav]')) {
    const extra = document.createElement('nav');
    extra.className = 'site-nav home-nav';
    extra.setAttribute('data-site-nav', '');
    head.after(extra);
  }
  head.querySelector('.menu-toggle').addEventListener('click', (e) => {
    const open = document.body.classList.toggle('nav-open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });
}

function nav() {
  const el = document.querySelector('[data-site-nav]');
  if (!el) return;
  el.innerHTML = NAV.map(([title, items]) => `<h2>${title}</h2><ul>${items.map(([label, path]) =>
    `<li><a href="${path}"${current(path)}>${label}</a></li>`).join('')}</ul>`).join('')
    + `<p class="nav-foot"><a href="https://github.com/${REPO}">Source on GitHub</a><br><a href="https://zumerlab.com/orbit/">Orbit</a> · <a href="https://zumerlab.com/zumly/">Zumly</a></p>`;
}

function pager() {
  const el = document.querySelector('[data-pager]');
  if (!el) return;
  const i = PAGES.findIndex(([, path]) => path === here);
  if (i < 0) return;
  const prev = PAGES[i - 1], next = PAGES[i + 1];
  el.className = 'pager';
  el.innerHTML = `${prev ? `<a href="${prev[1]}"><small>Previous</small>${prev[0]}</a>` : ''}${next ? `<a class="next" href="${next[1]}"><small>Next</small>${next[0]}</a>` : ''}`;
}

header();
nav();
pager();
