// Imports the built package in Node, with no page: what a server does when it renders
// an app that mounts Pulse in the browser. Nothing may touch the page on load (a media
// query, an element to extend, the root's style); the board itself still needs a browser.
// Part of `npm run check`, after the compile it reads: node scripts/node-import.mjs
import assert from 'node:assert/strict';

for (const name of ['window', 'document', 'matchMedia', 'HTMLElement', 'customElements']) {
  assert.equal(typeof globalThis[name], 'undefined', `${name} exists here: this is not a server`);
}

const pulse = await import('../dist/index.js');

const functions = ['mountBoard', 'applyTheme', 'applyColors', 'setLocale', 'num', 'listOf', 'hourly', 'changesOf', 'spansOf',
  'ring', 'face', 'backLayer', 'layerIndex', 'keypad', 'timeRing', 'timeline', 'monthRing', 'colorWheel', 'radialList', 'videoMarkup', 'setTune'];
for (const name of functions) assert.equal(typeof pulse[name], 'function', `${name} is not exported as a function`);
for (const name of ['THEMES', 'THEME_NAMES', 'BOARD_MODES', 'AXES', 'DEFAULTS', 'tune', 't']) assert.equal(typeof pulse[name], 'object', `${name} is not exported`);

// With no screen to measure, the measures are a desktop's.
assert.equal(pulse.PHONE, false);
assert.deepEqual(pulse.SIZE.length, 3);
assert.deepEqual(pulse.tune, pulse.DEFAULTS);
// What only writes text works here too.
assert.equal(pulse.num(1.25), '1.3');
assert.match(pulse.videoMarkup({ src: 'a.m3u8', poster: 'a.jpg', alt: 'A', cls: 'v' }), /^<pulse-video /);

console.log(`dist/index.js imports in Node: ${Object.keys(pulse).length} exports`);
