// Turns the site's screenshots into WebP with Chromium's own encoder, through Playwright,
// so the repo needs no image library: node scripts/webp.mjs docs/images/foo.png [more…]
// Each picture becomes foo.webp at its size and, from 1600 px wide, a half-size
// foo-<width>.webp for phones (the pages' srcset); the original goes once both are written.
// tutorial-shots.mjs writes its screens through writeWebp.
/* global Image, document */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

// Encodes one picture (a PNG or JPEG buffer) in the page given, lossy, a touch finer on
// small pictures, where a ring is a few pixels wide.
export async function encodeWebp(page, buffer, type = 'image/png') {
  const src = `data:${type};base64,${buffer.toString('base64')}`;
  const out = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const { naturalWidth: w, naturalHeight: h } = img;
    const quality = w >= 1200 ? 0.85 : 0.9;
    const encode = (width, height) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      return canvas.toDataURL('image/webp', quality).split(',')[1];
    };
    const half = w >= 1600 ? { width: Math.round(w / 2), data: encode(Math.round(w / 2), Math.round(h / 2)) } : null;
    return { w, h, full: encode(w, h), half };
  }, src);
  const bytes = (b64) => Buffer.from(b64, 'base64');
  return { width: out.w, height: out.h, full: bytes(out.full), half: out.half && { width: out.half.width, data: bytes(out.half.data) } };
}

// Writes base.webp and, where there is one, base-<width>.webp; returns a line to log.
export async function writeWebp(page, buffer, base, type) {
  const { width, height, full, half } = await encodeWebp(page, buffer, type);
  const kb = (b) => `${(b.length / 1024).toFixed(0)} KB`;
  writeFileSync(`${base}.webp`, full);
  if (half) writeFileSync(`${base}-${half.width}.webp`, half.data);
  return `${base}.webp ${width}×${height} ${kb(full)}${half ? ` · ${base}-${half.width}.webp ${kb(half.data)}` : ''}`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('usage: node scripts/webp.mjs <image…>');
    process.exit(1);
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const file of files) {
    const ext = extname(file);
    const type = ext.toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
    console.log(await writeWebp(page, readFileSync(file), file.slice(0, -ext.length), type));
    unlinkSync(file);
  }
  await browser.close();
}
