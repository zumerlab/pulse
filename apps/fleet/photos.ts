// A vehicle's picture, from Wikimedia Commons. The number HSL's feed names a
// vehicle by is the one painted on its side, and Commons names many of its
// photos by it ("HKL HST Artic 405, Mannerheimintie"). A tram's or a metro
// train's number also tells its model, so a photo of the model stands in when
// the vehicle has none of its own; a bus's number is only its operator's
// count, so a bus shows a photo of itself or none. Asked once per vehicle,
// one question at a time, from the browser (Commons answers any origin).
// Every photo carries its author and its license: the reading shows both.

import type { Vehicle } from './source.ts';

export type Photo = { src: string; page: string; author: string; license: string; own: boolean };
export type Model = { name: string; long: string; category: string; file: string };

// The models by their numbers, and for each the Commons category its photos
// are in and one photo of it, chosen by hand: the vehicle seen whole.
const MODELS: { mode: string; from: number; to: number; model: Model }[] = [
  { mode: 'tram', from: 31, to: 70, model: { name: 'Nr I', long: 'Valmet Nr I', category: 'Valmet Nr I', file: '11-07-29-helsinki-by-RalfR-300.jpg' } },
  { mode: 'tram', from: 71, to: 112, model: { name: 'Nr II', long: 'Valmet Nr II', category: 'Valmet Nr II', file: '11-07-29-helsinki-by-RalfR-164.jpg' } },
  { mode: 'tram', from: 401, to: 499, model: { name: 'Artic', long: 'Škoda Artic', category: 'Škoda Artic in Helsinki', file: 'Artic (tram) in Helsinki 20170130.jpg' } },
  { mode: 'tram', from: 601, to: 699, model: { name: 'Artic X54', long: 'Škoda Artic X54', category: 'Škoda Artic X54', file: 'Helsinki light rail line 15 train arriving at Itäkeskus.jpg' } },
  { mode: 'metro', from: 100, to: 199, model: { name: 'M100', long: 'Strömberg M100', category: 'HKL Class M100', file: '2011-07-30-helsinki-wv-by-RalfR-001.jpg' } },
  { mode: 'metro', from: 200, to: 299, model: { name: 'M200', long: 'Alstom M200', category: 'HKL Class M200', file: '2011-07-30-helsinki-wv-by-RalfR-052.jpg' } },
  { mode: 'metro', from: 300, to: 399, model: { name: 'M300', long: 'Siemens M300', category: 'HKL Class M300', file: 'M300 approaching Vuosaari.jpg' } },
];
export const modelOf = (v: Vehicle) => MODELS.find((m) => m.mode === v.mode && v.veh >= m.from && v.veh <= m.to)?.model;

// The operators as HSL's feed numbers them (its documentation's table), by
// the names their vehicles carry and photographers write.
export const OPERATORS: Record<number, string> = {
  6: 'Pohjolan Liikenne', 12: 'Koiviston Auto', 17: 'Tammelundin Liikenne', 18: 'Pohjolan Liikenne', 20: 'Åbergin Linja', 21: 'Reissu Ruoti',
  22: 'Nobina', 30: 'Savonlinja', 36: 'Nurmijärven Linja', 40: 'Kaupunkiliikenne', 47: 'Taksikuljetus', 50: 'Kaupunkiliikenne', 51: 'Korsisaari',
  54: 'V-S Bussipalvelut', 58: 'Koillisen Liikennepalvelut', 59: 'Tilausliikenne Nikkanen', 60: 'Suomenlinnan Liikenne', 64: 'Harri Vuolle', 89: 'Metropolia', 90: 'VR',
};

const API = 'https://commons.wikimedia.org/w/api.php';
// A bus of the same name and number elsewhere (Nobina runs buses in Sweden
// too) is not this one: a photo of a bus counts only when its title or a
// category says here (a city, a square of the center, "on line" in Finnish).
const HERE = /Helsin|Espoo|Vantaa|Kauniainen|Kerava|Sipoo|Kirkkonummi|Tuusula|Uusimaa|Finland|Suomi|HSL|Rautatientori|Kamppi|Elielinaukio|Pasila|Itäkeskus|Tapiola|Matinkylä|Tikkurila|linjalla/i;
// The inside of a vehicle is not a picture of it.
const INSIDE = /interior|cab\b|ohjaamo|sisä/i;
const LICENSES: Record<string, string> = { FAL: 'Free Art License', 'Public domain': 'public domain' };

type Page = { title: string; categories?: { title: string }[];
  imageinfo?: { thumburl?: string; descriptionurl: string; width: number; height: number; extmetadata?: Record<string, { value: string } | undefined> }[] };

// The text of the author's credit, which Commons writes as HTML (a link to a user page).
const textOf = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
function photoOf(p: Page, own: boolean): Photo | null {
  const i = p.imageinfo?.[0];
  if (!i?.thumburl) return null;
  const license = i.extmetadata?.LicenseShortName?.value ?? '';
  return { src: i.thumburl, page: i.descriptionurl, author: textOf(i.extmetadata?.Artist?.value ?? '') || 'Wikimedia Commons', license: LICENSES[license] ?? license, own };
}
// A title that names this number as a word of its own, not a part of a longer one.
const names = (title: string, n: number) => new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(title.replace(/\.[a-z]+$/i, ''));

async function ask(params: Record<string, string>): Promise<Page[]> {
  const q = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', prop: 'imageinfo|categories',
    iiprop: 'url|size|extmetadata', iiurlwidth: '640', iiextmetadatafilter: 'Artist|LicenseShortName', cllimit: 'max', clshow: '!hidden', ...params });
  const res = await fetch(`${API}?${q}`, { headers: { 'Api-User-Agent': 'Pulse fleet (github.com/zumerlab/pulse)' } });
  if (!res.ok) throw new Error(`Commons answered ${res.status}`);
  return ((await res.json()) as { query?: { pages?: Page[] } }).query?.pages ?? [];
}

// The vehicle's own photo: in its model's category, or for a bus by its
// operator's name, with its number in the title; the widest of them.
async function ownPhoto(v: Vehicle): Promise<Photo | null> {
  const model = modelOf(v), operator = OPERATORS[v.oper];
  if (!model && !operator) return null;
  const pages = await ask({ generator: 'search', gsrnamespace: '6', gsrlimit: '20',
    gsrsearch: model ? `incategory:"${model.category}" intitle:"${v.veh}"` : `intitle:"${operator}" intitle:"${v.veh}"` });
  const fits = pages.filter((p) => names(p.title, v.veh) && !INSIDE.test(p.title) && (model || HERE.test(p.title) || p.categories?.some((c) => HERE.test(c.title))));
  const wide = fits.filter((p) => (p.imageinfo?.[0]?.width ?? 0) > (p.imageinfo?.[0]?.height ?? 0));
  const best = (wide.length ? wide : fits).sort((a, b) => (b.imageinfo?.[0]?.width ?? 0) - (a.imageinfo?.[0]?.width ?? 0))[0];
  return best ? photoOf(best, true) : null;
}
async function modelPhoto(model: Model): Promise<Photo | null> {
  const [page] = await ask({ titles: `File:${model.file}`, redirects: '1' });
  return page ? photoOf(page, false) : null;
}

// What is known of each vehicle's photo: a photo, none (null), or not yet
// (absent: asked for, or about to be). An answer tells `changed` the
// vehicle's id; a failure is asked again after a while.
export class Photos {
  private got = new Map<string, Photo | null>();
  private models = new Map<string, Promise<Photo | null>>();
  private asked = new Set<string>();
  private queue: Promise<unknown> = Promise.resolve();
  private changed: (id: string) => void;

  constructor(changed: (id: string) => void) { this.changed = changed; }

  of(v: Vehicle): Photo | null | undefined {
    if (this.got.has(v.id)) return this.got.get(v.id);
    if (!this.asked.has(v.id)) {
      this.asked.add(v.id);
      // One question at a time: Commons asks its clients not to run them in parallel.
      this.queue = this.queue.then(() => this.look(v));
    }
    return undefined;
  }

  private async look(v: Vehicle) {
    try {
      const model = modelOf(v);
      let photo = await ownPhoto(v);
      if (!photo && model) {
        if (!this.models.has(model.name)) this.models.set(model.name, modelPhoto(model));
        photo = await this.models.get(model.name)!;
      }
      this.got.set(v.id, photo);
    } catch {
      // Offline or refused: nothing for now, and the question again in five minutes.
      if (modelOf(v)) this.models.delete(modelOf(v)!.name);
      this.got.set(v.id, null);
      setTimeout(() => { this.got.delete(v.id); this.asked.delete(v.id); }, 5 * 60_000);
    }
    this.changed(v.id);
  }
}
