import { expect, test, type Page } from '@playwright/test';
import { PROMETHEUS } from '../playwright.config.ts';

// The Prometheus app without a server: the connect panel, and the recorded
// hosts (twenty-four on five jobs, two targets down, a disk nearly full, a hot
// CPU, three alerts firing, a silence taken in the browser). A real server is
// not part of the suite.

const current = (page: Page) => page.locator('.z-view.is-current-view');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('pulse-prometheus-settings')) localStorage.setItem('pulse-prometheus-settings', '{"calm":"open"}'); });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  (page as Page & { errors?: string[] }).errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { errors?: string[] }).errors).toEqual([]);
});

test('with no Prometheus answering, the app says so and offers the demo', async ({ page }) => {
  await page.goto(`${PROMETHEUS}?server=http://127.0.0.1:5999`);
  await expect(page.locator('.connect h1')).toHaveText('Pulse');
  await expect(page.locator('.connect .error')).toContainText('Prometheus did not answer at http://127.0.0.1:5999');
  await expect(page.locator('.connect input[name="url"]')).toHaveValue('http://127.0.0.1:5999');
  await page.locator('[data-demo]').click();
  await expect(page).toHaveURL(/demo=1/);
  await expect(page.locator('.connect')).toBeHidden();
  await expect(page.locator('.conn')).toContainText('Demo · 24 hosts, recorded · live');
});

test('the recorded fleet fills six systems from the configuration; each channel a swarm of hosts', async ({ page }) => {
  await page.goto(`${PROMETHEUS}?demo`);
  await expect(page.locator('.tile[data-system]')).toHaveCount(6);
  await expect(page.locator('.tile[data-system="targets"] .tile-big')).toHaveText('2 down');
  await expect(page.locator('.tile[data-system="cpu"] .tile-big')).toHaveText('1 critical');
  await expect(page.locator('.tile[data-system="disk"] .tile-big')).toHaveText('1 critical');
  await expect(page.locator('.tile[data-system="alerts"] .tile-big')).toHaveText('3 firing');
  await expect(page.locator('.tile[data-system="cpu"] .swarm-ring')).toHaveAttribute('data-count', '22');
  await page.locator('.tile[data-system="cpu"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Usage');
  await expect(front.locator('.swarm-tick.is-fail')).toHaveCount(1);
  await expect(current(page).locator('.strip')).toContainText('1 host with CPU usage over 95%: api-03 97%');
  await front.locator('.disc').click();
  await expect(current(page).locator('.detail h1')).toContainText('Usage');
  await expect(current(page).locator('.scroll-list')).toContainText('api-03 · 97%');
});

test('a firing alert is silenced for an hour from the ring, and comes out dim', async ({ page }) => {
  await page.goto(`${PROMETHEUS}?demo`);
  await page.locator('.tile[data-system="alerts"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Firing');
  await expect(front.locator('.face-big')).toHaveText('3 firing');
  await expect(current(page).locator('.strip')).toContainText('3 alerts firing: DiskAlmostFull on web-05');
  await expect(current(page).locator('.strip [data-resolve]')).toHaveText('Silence for an hour');
  // Four segments: three firing (switches with an action), one already silenced.
  await expect(front.locator('o-arc[data-seg]')).toHaveCount(3);
  await current(page).locator('.strip [data-resolve]').click();
  await expect(front.locator('.face-big')).toHaveText('2 firing');
  await expect(current(page).locator('.strip')).toContainText('2 alerts firing: TargetDown on worker-04 and HighCPU on api-03');
});

test('on the groups axis each host is an object with the channels as bands and its day in the detail', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pulse-prometheus-settings', '{"calm":"open","axis":"groups","groups":["api-03:9100","web-05:9100","worker-04:9100"]}'); });
  await page.goto(`${PROMETHEUS}?demo`);
  await expect(page.locator('.tile[data-system]')).toHaveCount(3);
  await expect(page.locator('.tile[data-system="host:api-03:9100"] .tile-title')).toHaveText('api-03');
  await expect(page.locator('.tile[data-system="host:worker-04:9100"] .tile-big')).toHaveText('Down');
  await page.locator('.tile[data-system="host:api-03:9100"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Usage');
  await expect(front.locator('.face-big')).toHaveText('97%');
  await expect(current(page).locator('.strip')).toContainText('api-03: CPU usage at 97%');
  await front.locator('.disc').click();
  await expect(current(page).locator('.detail h1')).toContainText('Usage');
  await expect(current(page).locator('.time-ring')).toBeVisible();
  await expect(current(page).locator('.time-ring .time-big')).toHaveText(/%$/);
});
