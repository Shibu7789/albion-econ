// Test de bout en bout : la vraie page (docs/index.html) dans Chromium, API des prix simulée.
// Vérifie : chargement sans erreur, analyse, liste du jour cohérente, journal, pas de débordement en largeur téléphone.
// Lancer : node tests/e2e.test.js   (Playwright doit être installé : npm i -g playwright, navigateurs déjà présents)
const assert = require('assert');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('playwright-core')); }

global.window = {};
require(path.join(__dirname, '..', 'docs', 'data.js'));
const DATA = window.ALBION_DATA;
const value = new Map(DATA.items.map(i => [i.id, i.v || 1]));

// Prix simulés proportionnels à la valeur d'objet : assez pour que des recettes soient rentables.
function fakePrices(url) {
  const u = new URL(url);
  const ids = decodeURIComponent(u.pathname.split('/prices/')[1].replace('.json', '')).split(',');
  const locs = u.searchParams.get('locations').split(',');
  const now = new Date(Date.now() - 3600e3).toISOString().slice(0, 19);
  const out = [];
  for (const id of ids) for (const city of locs) {
    const v = value.get(id) || 1;
    out.push({ item_id: id, city, quality: 1, sell_price_min: Math.round(v * 10), sell_price_min_date: now,
      sell_price_max: Math.round(v * 12), buy_price_min: 1, buy_price_max: Math.round(v * 9.6), buy_price_max_date: now });
  }
  return out;
}
function fakeHistory(url) {
  const u = new URL(url);
  const ids = decodeURIComponent(u.pathname.split('/history/')[1].replace('.json', '')).split(',');
  const locs = u.searchParams.get('locations').split(',');
  const out = [];
  for (const id of ids) for (const location of locs)
    out.push({ item_id: id, location, quality: 1, data: Array.from({ length: 7 }, (_, k) => ({ item_count: 2000, avg_price: (value.get(id) || 1) * 11, timestamp: '' })) });
  return out;
}

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  let calls = 0;
  await page.route('https://europe.albion-online-data.com/**', route => {
    calls++;
    const url = route.request().url();
    const body = url.includes('/history/') ? fakeHistory(url) : fakePrices(url);
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('file://' + path.join(__dirname, '..', 'docs', 'index.html'));

  // Spés pré-renseignées appliquées au profil dès le chargement
  const nSpecs = await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('ae.profiles')); return Object.keys(p.list[p.active].specs).length; });
  assert.ok(nSpecs >= 100, 'spés pré-renseignées : ' + nSpecs);
  console.log('OK spés pré-renseignées :', nSpecs);

  // Profil : banque 60 M, réserve 10 M, focus 10 000, Lymhurst + Caerleon
  await page.click('[data-tab="profile"]');
  await page.fill('#pf-bank', '60000000'); await page.dispatchEvent('#pf-bank', 'change');
  await page.fill('#pf-focus', '10000'); await page.dispatchEvent('#pf-focus', 'change');
  for (const c of ['Thetford', 'Bridgewatch', 'Martlock', 'Fort Sterling', 'Brecilien']) {
    await page.uncheck(`#pf-cities input[value="${c}"]`);
  }
  await page.fill('#spec-search', 'fibres');
  const specInput = page.locator('[data-spec="CRAFT_REFINE_FIBER_T5"]');
  await specInput.fill('100'); await specInput.dispatchEvent('change');

  await page.click('[data-tab="today"]');
  await page.click('#run');
  await page.waitForFunction(() => /Analyse terminée|Échec/.test(document.querySelector('#status').textContent), null, { timeout: 120000 });
  const status = await page.textContent('#status');
  assert.ok(/Analyse terminée/.test(status), 'statut : ' + status);
  const lines = await page.locator('.line').count();
  assert.ok(lines > 0, 'au moins une ligne');
  const cities = await page.locator('.city h3').allTextContents();
  assert.ok(cities.every(t => /Lymhurst|Caerleon/.test(t)), 'uniquement les villes choisies : ' + cities);
  const profit = await page.textContent('#k-profit');
  assert.ok(profit && profit !== '—', 'profit affiché');
  console.log(`OK analyse : ${lines} lignes, profit prévu ${profit}, ${calls} appels API simulés`);

  // Journal
  await page.fill('#real-0', '1000000');
  await page.click('[data-log="0"]');
  await page.click('[data-tab="log"]');
  assert.ok((await page.locator('#log table tbody tr').count()) >= 1, 'ligne de journal');
  console.log('OK journal');

  // Largeur téléphone : pas de défilement horizontal
  await page.setViewportSize({ width: 390, height: 800 });
  for (const tab of ['today', 'islands', 'log', 'profile', 'about']) {
    await page.click(`[data-tab="${tab}"]`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 1, `débordement horizontal sur ${tab} : ${over}px`);
  }
  console.log('OK largeur téléphone');
  await page.click('[data-tab="today"]');
  await page.setViewportSize({ width: 1200, height: 900 });
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: false });
  assert.deepStrictEqual(errors, [], 'erreurs JavaScript : ' + errors.join(' | '));
  console.log('OK aucune erreur JavaScript');
  await browser.close();
})().catch(e => { console.error('ÉCHEC', e.message); process.exit(1); });
