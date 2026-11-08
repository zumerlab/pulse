// Pulse site: the header, the side navigation, the pager, and the code blocks (a copy
// button and syntax highlighting, no library). No analytics, no tracking.

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
    ['openHAB', 'openhab.html'],
    ['Tutorial', 'tutorial.html'],
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

// ─── Code blocks ─────────────────────────────────────────
// A small tokenizer, the one of Orbit's site, for the languages of the pages:
// TypeScript, HTML, CSS, the shell and JSON. Colors come from site.css (.hl-*).

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const span = (cls, s) => (s ? `<span class="hl-${cls}">${esc(s)}</span>` : '');

// Runs a list of [class, regex] rules over the text, the first rule that matches wins.
function scan(text, rules) {
  const re = new RegExp(rules.map(([, r]) => `(${r.source})`).join('|'), 'g');
  let out = '', last = 0, m;
  while ((m = re.exec(text))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    out += esc(text.slice(last, m.index));
    const i = m.slice(1).findIndex((g) => g !== undefined);
    out += span(rules[i][0], m[0]);
    last = re.lastIndex;
  }
  return out + esc(text.slice(last));
}

const JS_KEYWORDS = 'await|break|case|catch|class|const|continue|default|delete|do|else|export|extends|finally|for|from|function|if|import|in|instanceof|let|new|of|return|static|super|switch|this|throw|try|typeof|var|void|while|yield|async|true|false|null|undefined'
  + '|type|interface|readonly|as|satisfies|enum|declare|implements|private|protected|public|abstract|keyof|infer|never|unknown|string|number|boolean';

const js = (text) => scan(text, [
  ['comment', /\/\/[^\n]*|\/\*[\s\S]*?\*\//],
  ['string', /`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/],
  ['keyword', new RegExp(`\\b(?:${JS_KEYWORDS})\\b`)],
  ['number', /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/],
  ['type', /\b[A-Z][\w$]*\b/],
  ['fn', /\b[A-Za-z_$][\w$]*(?=\s*\()/],
  ['punct', /=>|[{}()[\];,.:?]/],
]);

const cssValue = (text) => scan(text, [
  ['comment', /\/\*[\s\S]*?\*\//],
  ['string', /'[^'\n]*'|"[^"\n]*"/],
  ['var', /--[\w-]+/],
  ['number', /#[0-9a-fA-F]{3,8}\b|-?\d*\.?\d+(?:deg|turn|px|rem|em|%|ms|s|vh|vw|cqmin|cqw|cqh|fr)?\b/],
  ['fn', /\b[a-z-]+(?=\()/],
  ['punct', /[(),]/],
]);

function css(text) {
  // Declarations inside braces; selectors and at-rules outside.
  let out = '', depth = 0;
  for (const part of text.split(/(\/\*[\s\S]*?\*\/|[{}])/)) {
    if (!part) continue;
    if (part.startsWith('/*')) { out += span('comment', part); continue; }
    if (part === '{') { depth++; out += span('punct', part); continue; }
    if (part === '}') { depth = Math.max(0, depth - 1); out += span('punct', part); continue; }
    if (depth === 0 || /^\s*[^:;]*\{/.test(part)) {
      out += scan(part, [['at', /@[\w-]+/], ['selector', /[^\s,@][^,{]*?(?=\s*(?:,|$))/]]);
    } else {
      out += part.split(/(;)/).map((decl) => {
        if (decl === ';') return span('punct', decl);
        const m = decl.match(/^(\s*)([\w-]+)(\s*:)([\s\S]*)$/);
        if (!m) return scan(decl, [['selector', /[^\s][^,]*?(?=\s*(?:,|$))/]]);
        return esc(m[1]) + span(m[2].startsWith('--') ? 'var' : 'prop', m[2]) + span('punct', m[3]) + cssValue(m[4]);
      }).join('');
    }
  }
  return out;
}

function html(text) {
  let out = '', last = 0, m;
  const re = /<!--[\s\S]*?-->|<(script|style)\b([^>]*)>([\s\S]*?)<\/\1>|<\/?[a-zA-Z][\w-]*(?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*\s*\/?>/g;
  const tag = (t) => {
    const mm = t.match(/^(<\/?)([\w-]+)([\s\S]*?)(\/?>)$/);
    if (!mm) return esc(t);
    const attrs = mm[3].replace(/([^\s=]+)(?:(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+))?|(\s+)/g, (a, name, eq, val, ws) => {
      if (ws) return ws;
      if (!name) return esc(a);
      let v = '';
      if (val !== undefined) {
        const inner = val.replace(/^["']|["']$/g, '');
        v = span('punct', eq) + (name === 'style'
          ? span('string', val[0]) + cssValue(inner) + span('string', val.at(-1))
          : span('string', val));
      }
      return span('attr', name) + v;
    });
    return span('punct', mm[1]) + span('tag', mm[2]) + attrs + span('punct', mm[4]);
  };
  while ((m = re.exec(text))) {
    out += esc(text.slice(last, m.index));
    if (m[0].startsWith('<!--')) out += span('comment', m[0]);
    else if (m[1]) {
      const open = m[0].slice(0, m[0].indexOf('>') + 1);
      out += tag(open) + (m[1] === 'style' ? css(m[3]) : js(m[3])) + tag(`</${m[1]}>`);
    } else out += tag(m[0]);
    last = re.lastIndex;
  }
  return out + esc(text.slice(last));
}

const sh = (text) => scan(text, [
  ['comment', /#[^\n]*/],
  ['string', /'[^'\n]*'|"[^"\n]*"/],
  ['keyword', /^(?:npm|npx|pnpm|yarn|node|cd|git|unzip|cp|mkdir)\b/m],
]);

const json = (text) => scan(text, [
  ['attr', /"(?:\\.|[^"\\])*"(?=\s*:)/],
  ['string', /"(?:\\.|[^"\\])*"/],
  ['number', /-?\d+(?:\.\d+)?/],
  ['keyword', /\b(?:true|false|null)\b/],
  ['punct', /[{}[\],:]/],
]);

const LANGS = { html, xml: html, css, js, javascript: js, ts: js, mjs: js, sh, bash: sh, shell: sh, json };

function guess(text) {
  const t = text.trim();
  if (/^</.test(t)) return 'html';
  if (/^(npm|npx|pnpm|yarn|node|git|cd|unzip|cp|mkdir)\b/.test(t)) return 'sh';
  if (/^[{[]/.test(t)) return /"\s*:/.test(t) ? 'json' : 'js';  // an object literal, as in a reading
  if (/^(import|export|const|let|var|function|document|window|\/\/)/m.test(t) && !/^[.#:\w-][^{]*\{\s*[\w-]+\s*:/m.test(t)) return 'js';
  if (/[.#:\w-][^{]*\{[^}]*:[^}]*;?\s*\}/.test(t) || /^\s*--[\w-]+\s*:/m.test(t)) return 'css';
  return 'js';
}

function highlight(text, lang) {
  const fn = LANGS[lang] || LANGS[guess(text)];
  try { return fn(text); } catch { return esc(text); }
}

// Each <pre> gets its language from data-lang, from the extension of its data-file, or
// from a guess; a copy button sits in a wrapper so it stays put while the code scrolls.
async function copy(text) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

function codeBlock(pre) {
  pre.dataset.code = '';
  let code = pre.querySelector('code');
  if (!code) {
    code = document.createElement('code');
    code.append(...pre.childNodes);
    pre.append(code);
  }
  const lang = pre.dataset.lang || (code.className.match(/language-(\w+)/) || [])[1]
    || (pre.dataset.file || '').split('.').pop();
  if (!pre.hasAttribute('data-plain')) code.innerHTML = highlight(code.textContent, lang);
  const wrap = document.createElement('div');
  wrap.className = 'code';
  pre.replaceWith(wrap);
  wrap.append(pre);
  const button = document.createElement('button');
  button.className = 'copy';
  button.type = 'button';
  button.textContent = 'Copy';
  button.setAttribute('aria-label', 'Copy the code');
  button.addEventListener('click', async () => {
    try {
      await copy(code.textContent);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Select and copy';
    }
    setTimeout(() => { button.textContent = 'Copy'; }, 1400);
  });
  wrap.append(button);
}

header();
nav();
pager();
// The code blocks one per task, so that no task runs long on a slow phone.
const pending = [...document.querySelectorAll('pre:not([data-code])')];
const next = () => {
  const pre = pending.shift();
  if (!pre) return;
  codeBlock(pre);
  (window.requestIdleCallback || setTimeout)(next);
};
next();
