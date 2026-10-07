// Tests du moteur : valeurs recalculées à la main (cf. rapport). Lancer : node tests/engine.test.js
const assert = require('assert');
global.window = {};
require('../docs/data.js');
const DATA = window.ALBION_DATA;
const { createEngine } = require('../app/engine.js');
const E = createEngine(DATA);
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} ≠ ${b}`);
let n = 0; const t = (name, f) => { f(); n++; console.log('OK', name); };

const specs = {
  CRAFT_REFINE_FIBER_T4: 100, CRAFT_REFINE_FIBER_T5: 100, CRAFT_REFINE_FIBER_T6: 100,
  CRAFT_REFINE_FIBER_T7: 100, CRAFT_REFINE_FIBER_T8: 70,
};
const prof = { mode: 'instant', premium: false, maxAge: 24, specs, minMargin: 0, cities: ['Lymhurst'],
  stationFee: { Lymhurst: 0, Martlock: 0, Caerleon: 0 }, dailyBonus: {}, liqShare: 0.2, capital: 1e7, maxShare: 0.5, focus: 10000, minutes: 45,
  minutesPerLine: 5, minLineProfit: 0 };
const P = (sell, buy) => ({ sell, sellAge: 1, buy, buyAge: 1 });
const prices = {
  T5_FIBER: { Lymhurst: P(100, 90) }, T4_CLOTH: { Lymhurst: P(200, 180) }, T5_CLOTH: { Lymhurst: P(650, 600) },
};
const i5 = E.index.get('T5_CLOTH');
const rec = DATA.items[i5].r.find(r => r[4].length === 2);   // recette sans Cœur

t('RRR = B/(1+B) (valeurs du wiki)', () => {
  near(E.rrr(0.58), 0.367, 0.0005, 'spé raffinage'); near(E.rrr(1.17), 0.539, 0.0005, 'spé + focus');
  near(E.rrr(0.18), 0.1525, 0.0005, 'ville'); near(E.rrr(0.59), 0.371, 0.0005, 'île + focus');
});
t('bonus de production Lymhurst fibre', () => {
  near(E.productionBonus(DATA.items[i5], 1, 'Lymhurst', false), 0.58, 1e-9, 'sans focus');
  near(E.productionBonus(DATA.items[i5], 1, 'Lymhurst', true), 1.17, 1e-9, 'avec focus');
  near(E.productionBonus(DATA.items[i5], 1, 'Martlock', false), 0.18, 1e-9, 'hors spé');
});
t('FCE tissu T5 = 25 000 + 30 × 470', () => near(E.fce(i5, specs, 'f'), 39100, 1e-6, 'fce'));
t('recette officielle tissu T5', () => {
  assert.strictEqual(rec[1], 94); assert.deepStrictEqual(rec[4].map(x => [DATA.items[x[0]].id, x[1]]), [['T5_FIBER', 3], ['T4_CLOTH', 1]]);
});
t('évaluation sans focus (achat direct, vente directe)', () => {
  const o = E.evaluate(prices, i5, rec, 1, 'Lymhurst', false, prof);
  near(o.cost, 500 * (1 - 0.58 / 1.58), 1e-6, 'coût'); near(o.revenue, 600 * 0.92, 1e-6, 'revenu');
  near(o.profit, 552 - 500 / 1.58, 1e-6, 'profit');
});
t('évaluation avec focus', () => {
  const o = E.evaluate(prices, i5, rec, 1, 'Lymhurst', true, prof);
  near(o.cost, 500 / 2.17, 1e-6, 'coût'); near(o.focus, 94 * Math.pow(0.5, 3.91), 1e-6, 'focus');
});
t('mode ordres : frais 2,5 % + taxe', () => {
  const o = E.evaluate(prices, i5, rec, 1, 'Lymhurst', false, Object.assign({}, prof, { mode: 'orders' }));
  near(o.revenue, 650 * (1 - 0.08 - 0.025), 1e-6, 'revenu'); near(o.cost, (3 * 90 + 180) * 1.025 / 1.58, 1e-6, 'coût');
});
t('Premium : taxe 4 %', () => {
  const o = E.evaluate(prices, i5, rec, 1, 'Lymhurst', false, Object.assign({}, prof, { premium: true }));
  near(o.revenue, 600 * 0.96, 1e-6, 'revenu');
});
t('prix trop vieux ignoré', () => {
  const old = JSON.parse(JSON.stringify(prices)); old.T5_FIBER.Lymhurst.sellAge = 48;
  assert.strictEqual(E.evaluate(old, i5, rec, 1, 'Lymhurst', false, prof), null);
});
t('ingrédient sans retour (artefact) payé en entier', () => {
  const ix = E.index.get('T4_MAIN_CURSEDSTAFF_AVALON@4');
  const r = DATA.items[ix].r[0];
  const art = r[4].find(x => x[2] === 1);
  assert.ok(art, 'artefact marqué sans retour');
});
t('transmutation : frais officiel, aucun retour, pas de focus', () => {
  const ix = E.index.get('T5_ORE_LEVEL1@1');
  const r = DATA.items[ix].r.find(x => x[3] === 2 && DATA.items[x[4][0][0]].id === 'T5_ORE');
  assert.strictEqual(r[0], 2000);
  const pr = { T5_ORE: { Martlock: P(100, 90) }, 'T5_ORE_LEVEL1@1': { Martlock: P(3000, 2500) } };
  const o = E.evaluate(pr, ix, r, 2, 'Martlock', false, Object.assign({}, prof, { cities: ['Martlock'] }));
  near(o.cost, 2100, 1e-9, 'coût'); assert.strictEqual(E.evaluate(pr, ix, r, 2, 'Martlock', true, prof), null);
});
t('amélioration rune : 288 runes pour une arme à une main', () => {
  const ix = E.index.get('T4_MAIN_CURSEDSTAFF@1');
  assert.strictEqual(DATA.items[ix].up[1][0][1], 288);
});
t('Black Market proposé seulement à Caerleon', () => {
  const ix = E.index.get('T4_MAIN_CURSEDSTAFF');
  const r = DATA.items[ix].r[0];
  const pr = { T4_PLANKS: { Caerleon: P(10, 9) }, T4_METALBAR: { Caerleon: P(10, 9) },
    T4_MAIN_CURSEDSTAFF: { Caerleon: P(900, 500), 'Black Market': P(0, 800) } };
  const o = E.evaluate(pr, ix, r, 0, 'Caerleon', false, prof);
  assert.strictEqual(o.sellVenue, 'Black Market');
});
t('planificateur : respecte capital, focus, temps et liquidité', () => {
  const opps = E.opportunities(prices, prof, it => it.id === 'T5_CLOTH');
  const vol = { T5_CLOTH: { Lymhurst: 1000 }, T5_FIBER: { Lymhurst: 1e5 }, T4_CLOTH: { Lymhurst: 1e5 } };
  const p = E.plan(opps, vol, prof);
  assert.strictEqual(p.lines.length, 1);                  // un seul objet × ville
  const l = p.lines[0];
  assert.ok(l.n <= 200, 'liquidité 20 % de 1000');
  assert.ok(p.capitalUsed <= prof.capital * prof.maxShare + 1e-6);
  assert.ok(p.focusUsed <= prof.focus + 1e-6);
});
t('focus de soin des cultures : 1000 → 125 à 100/100', () => {
  const ix = E.index.get('T5_FARM_CABBAGE_SEED');
  near(E.focusCost(1000, E.fce(ix, { FARM_CROPS: 100, FARM_CROPS_CABBAGE: 100 }, 'a')), 125, 1e-9, 'focus');
});
t('travailleur : valeur du carnet bois T6 = 32 × prix moyen pondéré', () => {
  const pr = { T6_WOOD: { Martlock: P(0, 100) }, 'T6_WOOD_LEVEL1@1': { Martlock: P(0, 200) },
    'T6_WOOD_LEVEL2@2': { Martlock: P(0, 400) }, 'T6_WOOD_LEVEL3@3': { Martlock: P(0, 800) } };
  const v = E.journalValue(pr, 'T6_JOURNAL_WOOD', 'Martlock', prof);
  const e = (1889 * 100 + 100 * 200 + 10 * 400 + 1 * 800) / 2000 * 0.92 * 32;
  near(v, e, 1e-6, 'valeur');
});
t('planificateur : volume d\'un ingrédient partagé entre lignes', () => {
  const P2 = {}; const V2 = {};
  for (const id of ['T8_2H_ARCANESTAFF@4', 'T8_2H_CLAYMORE@4', 'T8_PLANKS_LEVEL4@4', 'T8_METALBAR_LEVEL4@4', 'T8_CLOTH_LEVEL4@4', 'T8_LEATHER_LEVEL4@4']) {
    P2[id] = { Lymhurst: P(id.startsWith('T8_2H') ? 2e6 : 1000, id.startsWith('T8_2H') ? 1.9e6 : 900) };
    V2[id] = { Lymhurst: id.startsWith('T8_2H') ? 1000 : 100 };
  }
  const pr = Object.assign({}, prof, { focus: 0, capital: 1e10, maxShare: 1 });
  const opps = E.opportunities(P2, pr, it => /^T8_2H_(ARCANESTAFF|CLAYMORE)@4$/.test(it.id));
  const pl = E.plan(opps, V2, pr);
  const used = {};
  pl.lines.forEach(l => l.ingredients.forEach(g => { used[g.id] = (used[g.id] || 0) + g.effQty * l.n; }));
  Object.entries(used).forEach(([id, q]) => assert.ok(q <= 100 * 0.2 + 1e-9, `${id} ${q} > 20`));
});
t('frais de station : plafond officiel 1000 si non saisi', () => {
  assert.strictEqual(DATA.consts.maxStationFee, 1000);
  const o0 = E.evaluate(prices, i5, rec, 1, 'Lymhurst', false, prof);
  const o1 = E.evaluate(prices, i5, rec, 1, 'Lymhurst', false, Object.assign({}, prof, { stationFee: {} }));
  near(o1.cost - o0.cost, DATA.items[i5].v * 1 * 0.1125 * 1000 / 100, 1e-6, 'frais');
});
t('multi-villes : ingrédient acheté ailleurs avec transport, vente dans la meilleure ville', () => {
  const pr = { T5_FIBER: { Lymhurst: P(100, 90), Martlock: P(50, 45) }, T4_CLOTH: { Lymhurst: P(200, 180) },
    T5_CLOTH: { Lymhurst: P(650, 600), Martlock: P(900, 800) } };
  const pm = Object.assign({}, prof, { cities: ['Lymhurst', 'Martlock'], multiCity: true, travelPct: 0.1 });
  const o = E.evaluate(pr, i5, rec, 1, 'Lymhurst', false, pm);
  const fib = o.ingredients.find(g => g.id === 'T5_FIBER');
  assert.strictEqual(fib.city, 'Martlock');
  near(o.cost, (3 * 50 * 1.1 + 200) / 1.58, 1e-6, 'coût avec transport');
  assert.strictEqual(o.sellVenue, 'Martlock');
  near(o.revenue, 800 * 0.92 * 0.9, 1e-6, 'revenu avec transport');
  const single = E.evaluate(pr, i5, rec, 1, 'Lymhurst', false, Object.assign({}, pm, { multiCity: false }));
  assert.strictEqual(single.ingredients.find(g => g.id === 'T5_FIBER').city, 'Lymhurst');
});
t('bonus du jour : seulement sur sa catégorie', () => {
  const it = DATA.items[i5];
  near(E.productionBonus(it, 1, 'Lymhurst', false, { pct: 0.1, cat: 'fiber' }), 0.68, 1e-9, 'tissu bonifié');
  near(E.productionBonus(it, 1, 'Lymhurst', false, { pct: 0.1, cat: 'ore' }), 0.58, 1e-9, 'autre catégorie');
});
t('planificateur : le focus va à la meilleure rentabilité par point', () => {
  const mk = (id, profit, focus, f) => ({ id, city: 'X', useFocus: f, profit, focus, cost: 100, amount: 1, sellVenue: 'X', ingredients: [] });
  const opps = [mk('A', 1000, 0, false), mk('A', 1100, 1000, true),   // +100 pour 1000 focus
                mk('B', 500, 0, false), mk('B', 900, 100, true)];    // +400 pour 100 focus
  const vol = { A: { X: 1000 }, B: { X: 1000 } };
  const pl = E.plan(opps, vol, Object.assign({}, prof, { focus: 1000, capital: 1e9, maxShare: 1, liqShare: 0.01 }));
  const b = pl.lines.find(l => l.id === 'B'); const a = pl.lines.find(l => l.id === 'A');
  assert.ok(b.useFocus, 'B au focus'); assert.ok(!a.useFocus, 'A sans focus (focus épuisé par B)');
});
console.log(n, 'tests OK');
