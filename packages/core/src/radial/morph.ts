// Writes markup into an element by changing only what differs from what is
// there. The elements that stay the same stay: their animations keep running
// (a wave does not start over each time a value moves), an image does not
// load again, a control keeps the focus. Attributes and text follow the
// markup; an element of another kind is replaced. Children with a key
// (`data-key`, or a plot's `data-plot`) are matched by it, so a dot that
// moves keeps being the same dot and can glide to its new place.
//
// What Orbit writes on the elements it lays out (its layout properties and
// its marker attribute) is not in the markup and is left alone, and so is
// what the viewer opened (a <details>). An element marked `data-own` keeps
// its content as it is (a live map moved by its own code): the markup may
// carry it empty.

const ORBIT_PROP = /^--o(-layout-|-value-angle$|-arc-start$|_stack$)/;
const keep = (el: Element, name: string) => name.startsWith('data-orbit') || (name === 'open' && el.localName === 'details');
const keyOf = (n: Node) => n.nodeType === 1 ? (n as Element).getAttribute('data-key') ?? (n as Element).getAttribute('data-plot') : null;

let scratch: HTMLElement | null = null;
// The declarations of a style attribute, as the browser reads them (shorthands as their longhands).
function declarations(text: string) {
  scratch ??= document.createElement('div');
  scratch.setAttribute('style', text);
  const out = new Map<string, [string, string]>();
  for (let i = 0; i < scratch.style.length; i++) {
    const p = scratch.style.item(i);
    out.set(p, [scratch.style.getPropertyValue(p), scratch.style.getPropertyPriority(p)]);
  }
  return out;
}

function patchStyle(el: HTMLElement | SVGElement, text: string) {
  const want = declarations(text), s = el.style;
  for (const [p, [v, prio]] of want) if (s.getPropertyValue(p) !== v || s.getPropertyPriority(p) !== prio) s.setProperty(p, v, prio);
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s.item(i);
    if (!want.has(p) && !ORBIT_PROP.test(p)) s.removeProperty(p);
  }
  if (!s.length && el.getAttribute('style') === '') el.removeAttribute('style');
}

function patchAttributes(el: Element, next: Element) {
  for (const { name, value } of [...next.attributes]) {
    if (name === 'style') patchStyle(el as HTMLElement, value);
    else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }
  for (const { name } of [...el.attributes]) {
    if (next.hasAttribute(name) || keep(el, name)) continue;
    if (name === 'style') patchStyle(el as HTMLElement, '');
    else el.removeAttribute(name);
  }
}

const same = (a: Node, b: Node) => a.nodeType === b.nodeType && (a.nodeType !== 1
  || ((a as Element).localName === (b as Element).localName && (a as Element).namespaceURI === (b as Element).namespaceURI && keyOf(a) === keyOf(b)));

function patch(node: Node, next: Node) {
  if (node.nodeType !== 1) { if (node.nodeValue !== next.nodeValue) node.nodeValue = next.nodeValue; return; }
  const el = node as Element;
  if (el.hasAttribute('data-own') && el.getAttribute('data-own') === (next as Element).getAttribute('data-own')) return;
  patchAttributes(el, next as Element);
  // A box ticked by hand no longer follows its attribute: the markup says what is on.
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) el.checked = el.hasAttribute('checked');
  // A canvas draws on its own.
  if (el.localName === 'canvas') return;
  patchChildren(node, next);
}

function patchChildren(parent: Node, next: Node) {
  const keyed = new Map<string, Node>();
  for (const c of parent.childNodes) { const k = keyOf(c); if (k != null) keyed.set(k, c); }
  let cur = parent.firstChild;
  // Everything before `cur` is placed; what is left from it on at the end goes.
  for (const w of [...next.childNodes]) {
    const k = keyOf(w);
    let match: Node | null = null;
    if (k != null) { const m = keyed.get(k); if (m && same(m, w)) { match = m; keyed.delete(k); } }
    else if (cur && keyOf(cur) == null && same(cur, w)) match = cur;
    if (!match) { parent.insertBefore(w, cur); continue; }
    if (match === cur) cur = cur.nextSibling;
    else parent.insertBefore(match, cur);
    patch(match, w);
  }
  while (cur) { const n = cur.nextSibling; parent.removeChild(cur); cur = n; }
}

// Makes `el`'s content the markup, keeping what is already right.
export function morph(el: Element, html: string) {
  const t = document.createElement('template');
  t.innerHTML = html;
  patchChildren(el, t.content);
}
