// A phone's keypad, for an action that asks for a code before it goes.

import { t } from '../i18n.ts';
import { esc, icon } from './markup.ts';

export type Keypad = {
  name: string;                        // the channel ("Alarm")
  title: string;                       // what the code is for ("Away", "Disarm")
  verb: string;                        // the key that sends it
  format: 'number' | 'text' | 'words'; // digits; anything: an input as well; words: the input alone, in the open
  value: string;                       // what was entered so far
  wrong: boolean;                      // the last code was refused
  glyph: string;
  level?: 1 | 2;                       // the alert the code answers, if one
  hint?: string;                       // what to say, for words ("Ask anything about your home")
};

// A phone's keypad over the object: what the code is for, the code so far
// (masked), three by four round keys (1 to 9; delete, 0 and the key that
// sends it, in the action's color). A text code gets an input instead of the
// dots: the keys still type digits into it, the keyboard the rest. The host's
// refusal paints it wrong until the next key. Words are not a code: an input
// in the open with the action's hint, and two keys, cancel and send.
export function keypad(k: Keypad) {
  if (k.format === 'words') return words(k);
  const key = (d: string) => `<button class="key" data-key="${d}">${d}</button>`;
  const entered = k.format === 'text'
    ? `<input class="code-input" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(k.value)}" data-code="input" aria-label="${esc(t.codeAria(k.title))}">`
    : `<span class="code-dots${k.value ? '' : ' is-empty'}" role="status" aria-label="${esc(t.nDigits(k.value.length))}">${k.value ? '•'.repeat(k.value.length) : t.codeEmpty}</span>`;
  return `<div class="keypad${k.wrong ? ' is-wrong' : ''}" role="group" aria-label="${esc(t.keypadAria(k.title))}">
    <p class="keypad-title">${icon(k.glyph, 16)} ${esc(`${k.name} · ${k.title}`)}</p>
    ${entered}
    <p class="keypad-hint">${k.wrong ? esc(t.codeWrong) : esc(t.enterCode)}</p>
    <div class="keys">${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(key).join('')}
      <button class="key key-plain" data-code="delete" aria-label="${esc(t.deleteDigit)}"${k.value ? '' : ' disabled'}>⌫</button>
      ${key('0')}
      <button class="key key-send${k.level ? ` level-${k.level}` : ''}" data-code="enter"${k.value ? '' : ' disabled'}>${esc(k.verb)}</button>
    </div></div>`;
}

function words(k: Keypad) {
  const verb = k.verb.replace(/…$/, '');
  return `<div class="keypad is-words${k.wrong ? ' is-wrong' : ''}" role="group" aria-label="${esc(k.title)}">
    <p class="keypad-title">${icon(k.glyph, 16)} ${esc(`${k.name} · ${k.title}`)}</p>
    <input class="code-input is-words" type="text" autocomplete="off" autocapitalize="sentences" enterkeyhint="send" value="${esc(k.value)}" placeholder="${esc(k.hint ?? k.title)}" data-code="input" aria-label="${esc(k.hint ?? k.title)}">
    <p class="keypad-hint">${k.wrong ? esc(t.wordsWrong) : esc(t.enterWords)}</p>
    <div class="keys keys-words">
      <button class="key key-plain key-wide" data-code="cancel">${esc(t.cancel)}</button>
      <button class="key key-send key-wide${k.level ? ` level-${k.level}` : ''}" data-code="enter"${k.value.trim() ? '' : ' disabled'}>${esc(verb)}</button>
    </div></div>`;
}
