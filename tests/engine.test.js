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
t('multi-villes : ingrédient acheté ailleurs (voyage gratuit), vente dans la meilleure ville', () => {
  const pr = { T5_FIBER: { Lymhurst: P(5000, 4900), Martlock: P(50, 45) }, T4_CLOTH: { Lymhurst: P(200, 180) },
    T5_CLOTH: { Lymhurst: P(650, 600), Martlock: P(90000, 80000) } };
  const pm = Object.assign({}, prof, { cities: ['Lymhurst', 'Martlock'], multiCity: true, travelMult: 1 });
  const o = E.evaluate(pr, i5, rec, 1, 'Lymhurst', false, pm);
  const fib = o.ingredients.find(g => g.id === 'T5_FIBER');
  assert.strictEqual(fib.city, 'Martlock');
  near(o.cost, (3 * 50 + 200) / 1.58, 1e-6, 'coût (voyage gratuit)');
  assert.strictEqual(o.sellVenue, 'Martlock');
  near(o.revenue, 80000 * 0.92, 1e-6, 'revenu');
  const tf = E.tcost('T5_FIBER', 'Martlock', 'Lymhurst', pm), tc = E.tcost('T5_CLOTH', 'Lymhurst', 'Martlock', pm);
  near(E.tpCost(o, pm), 3 / 1.58 * tf + tc, 1e-6, 'frais de téléportation d\'un cycle');
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
t('garde-fou : prix de vente aberrant ramené au prix moyen des 7 jours', () => {
  const o = E.evaluate(prices, i5, rec, 1, 'Lymhurst', false, prof);       // vente à 600
  const H = (p) => ({ T5_CLOTH: { Lymhurst: { n: 100, p } }, T5_FIBER: { Lymhurst: { n: 1e4, p: 100 } }, T4_CLOTH: { Lymhurst: { n: 1e4, p: 200 } } });
  const kept = E.applyHistory([o], H(400), prices, prof);
  assert.strictEqual(kept.length, 1); near(kept[0].unitSell, 400 * 0.92, 1e-9, 'plafonné'); assert.ok(kept[0].capped);
  const gone = E.applyHistory([o], H(300), prices, prof);
  assert.strictEqual(gone.length, 0, 'plus rentable une fois plafonné');
  assert.strictEqual(E.applyHistory([o], {}, prices, prof).length, 0, 'sans historique : écarté');
});
t('garde-fou multi-villes : une ville au prix aberrant cède la place à une ville au prix normal', () => {
  const pr = { T5_FIBER: { Lymhurst: P(100, 90) }, T4_CLOTH: { Lymhurst: P(200, 180) },
    T5_CLOTH: { Lymhurst: P(650, 600), Martlock: P(99999, 50000) } };
  const pm = Object.assign({}, prof, { cities: ['Lymhurst', 'Martlock'], multiCity: true, travelMult: 1 });
  const o = E.evaluate(pr, i5, rec, 1, 'Lymhurst', false, pm);
  assert.strictEqual(o.sellVenue, 'Martlock');                     // aux prix affichés : la ville aberrante
  const vol = { T5_CLOTH: { Lymhurst: { n: 500, p: 610 }, Martlock: { n: 1, p: 500 } },
    T5_FIBER: { Lymhurst: { n: 1e4, p: 100 } }, T4_CLOTH: { Lymhurst: { n: 1e4, p: 200 } } };
  const [c] = E.applyHistory([o], vol, pr, pm);
  assert.strictEqual(c.sellVenue, 'Lymhurst'); near(c.unitSell, 600 * 0.92, 1e-9, 'prix normal');
});
t('revente : achat dans une ville, vente directe dans une autre', () => {
  const pr = { T5_CLOTH: { Lymhurst: P(500, 450), Martlock: P(9000, 8000) } };
  const pm = Object.assign({}, prof, { cities: ['Lymhurst', 'Martlock'], multiCity: true, travelMult: 1 });
  const f = E.flips(pr, pm, it => it.id === 'T5_CLOTH');
  const o = f.find(x => x.city === 'Lymhurst');
  assert.strictEqual(o.sellVenue, 'Martlock'); near(o.cost, 500, 1e-9, 'achat');
  near(o.revenue, 8000 * 0.92, 1e-9, 'vente nette'); assert.ok(!f.some(x => x.city === 'Martlock'), 'pas de revente perdante');
  const vol = { T5_CLOTH: { Lymhurst: { n: 1000, p: 520 }, Martlock: { n: 1000, p: 8500 } } };
  const [c] = E.applyHistory([o], vol, pr, pm);
  assert.strictEqual(c.sellVenue, 'Martlock'); assert.strictEqual(c.ingredients[0].city, 'Lymhurst');
});
t('Black Market : toujours vente directe, sans frais d\'ordre', () => {
  const pr = { X: { 'Black Market': P(0, 1000) } };
  near(E.dispose(pr, 'X', 'Black Market', Object.assign({}, prof, { mode: 'orders' })), 920, 1e-9, 'vente directe');
});
t('Black Market : exclu de la liste du jour, seul dans la sortie hebdomadaire', () => {
  const ix = E.index.get('T4_MAIN_CURSEDSTAFF'); const r = DATA.items[ix].r[0];
  const pr = { T4_PLANKS: { Caerleon: P(10, 9) }, T4_METALBAR: { Caerleon: P(10, 9) },
    T4_MAIN_CURSEDSTAFF: { Caerleon: P(900, 500), 'Black Market': P(0, 800) } };
  const pc = Object.assign({}, prof, { cities: ['Caerleon'] });
  assert.strictEqual(E.evaluate(pr, ix, r, 0, 'Caerleon', false, Object.assign({}, pc, { blackMarket: false })).sellVenue, 'Caerleon');
  assert.strictEqual(E.evaluate(pr, ix, r, 0, 'Caerleon', false, Object.assign({}, pc, { blackMarket: 'only' })).sellVenue, 'Black Market');
});
t('planificateur : avec peu de capital, le rendement par argent investi passe avant le profit brut', () => {
  const mk = (id, profit, cost) => ({ id, city: 'X', useFocus: false, profit, focus: 0, cost, amount: 1, sellVenue: 'X', ingredients: [] });
  // Gros : 100 000 de profit pour 2,9 M investis ; Petits : 60 000 pour 300 000 chacun
  const opps = [mk('GROS', 100000, 2.9e6), mk('P1', 60000, 3e5), mk('P2', 60000, 3e5), mk('P3', 60000, 3e5)];
  const vol = { GROS: { X: 100 }, P1: { X: 100 }, P2: { X: 100 }, P3: { X: 100 } };
  const pl = E.plan(opps, vol, Object.assign({}, prof, { capital: 3e6, maxShare: 1, liqShare: 0.01, minutes: 45, minutesPerLine: 5 }));
  const ids = pl.lines.map(l => l.id);
  assert.ok(!ids.includes('GROS') && ids.length === 3, 'les trois petites lignes : ' + ids);
  near(pl.totalProfit, 180000, 1e-6, 'profit');
});
t('recyclage : carte d\'expédition D1 → 20 % de 2 sceaux, exact ou arrondi', () => {
  const ix = E.index.get('QUESTITEM_EXP_TOKEN_D1_T6_EXP_HRD_UNDEAD_RECRUITMENT');
  const pr = { QUESTITEM_EXP_TOKEN_D1_T6_EXP_HRD_UNDEAD_RECRUITMENT: { Lymhurst: P(15000, 14000) }, QUESTITEM_TOKEN_ROYAL_T6: { Lymhurst: P(50000, 47000) } };
  const ex = E.salvageEval(pr, ix, 'Lymhurst', prof);
  near(ex.revenue, 0.4 * 47000 * 0.92, 1e-6, 'exact'); near(ex.cost, 15000, 1e-9, 'achat');
  const ce = E.salvageEval(pr, ix, 'Lymhurst', Object.assign({}, prof, { salvageRound: 'ceil' }));
  near(ce.revenue, 1 * 47000 * 0.92, 1e-6, 'arrondi'); assert.ok(ce.profit > 0);
});
t('chaîne : le tissu T4 produit soi-même s\'il revient moins cher que son prix de marché', () => {
  const pr = { T5_FIBER: { Lymhurst: P(100, 90) }, T4_FIBER: { Lymhurst: P(20, 18) }, T3_CLOTH: { Lymhurst: P(30, 25) },
    T4_CLOTH: { Lymhurst: P(500, 450) }, T5_CLOTH: { Lymhurst: P(900, 850) } };
  const o = E.evaluate(pr, i5, rec, 1, 'Lymhurst', false, prof);
  const R = 0.58 / 1.58;
  const t4 = (2 * 20 + 30) * (1 - R) + DATA.items[E.index.get('T4_CLOTH')].v * 0.1125 * 0 ;   // frais de station à 0 dans ce profil
  near(o.cost, (3 * 100 + t4) * (1 - R), 1e-6, 'coût avec T4 fabriqué');
  assert.ok(o.chain.some(st => st.id === 'T4_CLOTH'), 'étape : raffiner le T4');
  assert.ok(o.ingredients.some(l => l.id === 'T4_FIBER') && !o.ingredients.some(l => l.id === 'T4_CLOTH'), 'achats : fibre T4, pas de tissu T4');
  const sans = E.evaluate(pr, i5, rec, 1, 'Lymhurst', false, Object.assign({}, prof, { chains: false }));
  near(sans.cost, (3 * 100 + 500) * (1 - R), 1e-6, 'sans chaîne');
});
t('chaîne au focus : focus aussi sur l\'étape intermédiaire, coût plus bas, focus additionné', () => {
  const pr = { T5_FIBER: { Lymhurst: P(100, 90) }, T4_FIBER: { Lymhurst: P(20, 18) }, T3_CLOTH: { Lymhurst: P(30, 25) },
    T4_CLOTH: { Lymhurst: P(500, 450) }, T5_CLOTH: { Lymhurst: P(900, 850) } };
  const fin = E.evaluate(pr, i5, rec, 1, 'Lymhurst', true, prof);
  const all = E.evaluate(pr, i5, rec, 1, 'Lymhurst', 'all', prof);
  const Rf = 1.17 / 2.17, R = 0.58 / 1.58;
  near(fin.cost, (3 * 100 + (2 * 20 + 30) * (1 - R)) * (1 - Rf), 1e-6, 'focus final seulement');
  near(all.cost, (3 * 100 + (2 * 20 + 30) * (1 - Rf)) * (1 - Rf), 1e-6, 'focus sur toute la chaîne');
  const ix4 = E.index.get('T4_CLOTH');
  const f4 = E.focusCost(DATA.items[ix4].r[0][1], E.fce(ix4, specs, 'f'));
  near(all.focus, fin.focus + (1 - Rf) * f4, 1e-6, 'focus additionné');
});
t('îles : valeur d\'une parcelle de choux (graines, retour, vente brute)', () => {
  const pr = { T5_CABBAGE: { Lymhurst: P(300, 250) } };
  const pm = Object.assign({}, prof, { cities: ['Lymhurst'] });
  const rows = E.plotValue(pr, {}, pm, { seedPrice: { 5: 11580 }, seedsPerPlot: 9, baseYield: 4.5, premiumFactor: 1, islandCities: ['Martlock'] });
  const r = rows.find(x => x.crop === 'T5_CABBAGE');
  near(r.perPlotDay, 9 * 4.5, 1e-9, 'récolte');
  near(r.grow, 9 * 11580 * (1 - 0.8) / (9 * 4.5), 1e-6, 'coût par chou');
  near(r.perPlotDayNet, 9 * 4.5 * (250 * 0.92 - r.grow), 1e-6, 'gain par parcelle');
});
t('transport : jamais entre une ville royale et Caerleon ou Brecilien (hors sortie hebdomadaire)', () => {
  const pr = { T5_CLOTH: { Lymhurst: P(500, 450), Caerleon: P(5000, 4000), Brecilien: P(5000, 4000), Martlock: P(700, 650) } };
  const pm = Object.assign({}, prof, { cities: ['Lymhurst', 'Caerleon', 'Brecilien', 'Martlock'], multiCity: true, travelMult: 0, blackMarket: false });
  const f = E.flips(pr, pm, it => it.id === 'T5_CLOTH');
  const fromLym = f.find(x => x.city === 'Lymhurst');
  assert.strictEqual(fromLym.sellVenue, 'Martlock', 'reste entre villes royales');
  assert.ok(!f.some(x => x.city === 'Caerleon' || x.city === 'Brecilien'), 'rien ne part de Caerleon/Brecilien');
  const o = E.evaluate({ T5_FIBER: { Lymhurst: P(100, 90), Caerleon: P(10, 9) }, T4_CLOTH: { Lymhurst: P(200, 180) },
    T5_CLOTH: { Lymhurst: P(650, 600), Caerleon: P(9000, 8000) } }, i5, rec, 1, 'Lymhurst', false, pm);
  assert.strictEqual(o.sellVenue, 'Lymhurst'); assert.ok(o.ingredients.every(g => g.city === 'Lymhurst'));
});
t('trajets : chaque ville en plus coûte du temps ; version sur place proposée aussi', () => {
  const pr = { T5_FIBER: { Lymhurst: P(100, 90), Martlock: P(98, 88) }, T4_CLOTH: { Lymhurst: P(200, 180) },
    T5_CLOTH: { Lymhurst: P(650, 600) } };
  const pm = Object.assign({}, prof, { cities: ['Lymhurst', 'Martlock'], multiCity: true, travelMult: 0, teleport: false, travelMinutes: 5, minutesPerLine: 5, focus: 0 });
  const opps = E.opportunities(pr, pm, it => it.id === 'T5_CLOTH').filter(o => o.city === 'Lymhurst');
  const local = opps.find(o => o.local), multi = opps.find(o => !o.local);
  assert.ok(local && local.minutes === 5, 'sur place : 5 min');
  assert.ok(multi && multi.minutes === 10 && multi.trips[0] === 'Martlock', 'avec trajet : 10 min');
  const vol = { T5_CLOTH: { Lymhurst: 1000 }, T5_FIBER: { Lymhurst: 1e5, Martlock: 1e5 }, T4_CLOTH: { Lymhurst: 1e5 } };
  const pl = E.plan(opps, vol, Object.assign({}, pm, { capital: 1e6, maxShare: 1, minutes: 45 }));
  assert.ok(pl.lines[0].local, 'gain minime : la version sur place gagne');
});
t('temps d\'abord : une ligne de 5 min à 140k passe devant une ligne de 20 min à 280k', () => {
  const mk = (id, profit, city, trips) => ({ id, city, useFocus: false, profit, focus: 0, cost: 1000, amount: 1, sellVenue: city,
    ingredients: [], trips });
  const opps = [mk('LONG', 280000, 'Martlock', ['Thetford', 'Lymhurst', 'Fort Sterling']), mk('COURT', 140000, 'Lymhurst', [])];
  const vol = { LONG: { Martlock: 1e4 }, COURT: { Lymhurst: 1e4 } };
  const pl = E.plan(opps, vol, Object.assign({}, prof, { capital: 1e9, maxShare: 1, liqShare: 0.0001, minutes: 20, minutesPerLine: 5, travelMinutes: 5, teleport: false }));
  assert.strictEqual(pl.lines[0].id, 'COURT');
  near(pl.lines[0].minutes, 5, 1e-9, 'sur place');
});
t('tournée : une ville déjà visitée ne coûte plus de trajet', () => {
  const mk = (id, city, trips) => ({ id, city, useFocus: false, profit: 100000, focus: 0, cost: 1000, amount: 1, sellVenue: city, ingredients: [], trips });
  const opps = [mk('A', 'Lymhurst', []), mk('B', 'Martlock', []), mk('C', 'Lymhurst', ['Martlock'])];
  const vol = { A: { Lymhurst: 1e4 }, B: { Martlock: 1e4 }, C: { Lymhurst: 1e4 } };
  const pl = E.plan(opps, vol, Object.assign({}, prof, { capital: 1e9, maxShare: 1, liqShare: 0.0001, minutes: 100, minutesPerLine: 5, travelMinutes: 5, teleport: false }));
  const mins = pl.lines.reduce((s, l) => s + l.minutes, 0);
  near(mins, 5 + 10 + 5, 1e-9, 'Lymhurst gratuit, Martlock une fois, C sans trajet en plus');
});
t('Travel Planner : poids × facteur × 150, ×2 entre villes non voisines', () => {
  const it = DATA.items[E.index.get('T8_METALBAR')];
  assert.strictEqual(it.ft, 32);
  const one = Math.ceil(it.w * 32 * 150);
  assert.strictEqual(E.tcost('T8_METALBAR', 'Thetford', 'Fort Sterling', prof), one, 'voisines');
  assert.strictEqual(E.tcost('T8_METALBAR', 'Thetford', 'Lymhurst', prof), 2 * one, 'non voisines');
  assert.strictEqual(E.tcost('T8_METALBAR', 'Caerleon', 'Caerleon', prof), 0);
});
t('Travel Planner : voyage gratuit (temps) ou téléportation (frais au poids), le plus rentable par minute', () => {
  const it = DATA.items[E.index.get('T8_METALBAR')];
  const fee = Math.ceil(it.w * it.ft * 150);                                   // Thetford → Fort Sterling, voisines
  const mk = (profit) => ({ id: 'T8_METALBAR', city: 'Thetford', useFocus: false, profit, focus: 0, cost: 1000, amount: 1,
    sellVenue: 'Fort Sterling', ingredients: [], trips: ['Fort Sterling'] });
  const vol = { T8_METALBAR: { 'Fort Sterling': 1e4 } };
  const base = Object.assign({}, prof, { capital: 1e9, maxShare: 1, liqShare: 0.001, minutes: 100, minutesPerLine: 5, travelMinutes: 5, minLineProfit: 0 });
  const big = E.plan([mk(fee * 10)], vol, base).lines[0];                      // frais faibles : téléporter (5 min au lieu de 10)
  assert.strictEqual(big.transport, 'tp'); near(big.minutes, 5, 1e-9); near(big.totalProfit, 10 * (fee * 10 - fee), 1e-6, 'frais déduits');
  const thin = E.plan([mk(fee * 1.5)], vol, base).lines[0];                    // frais qui mangent la marge : voyager
  assert.strictEqual(thin.transport, 'voyage'); near(thin.minutes, 10, 1e-9, 'un trajet');
  near(thin.totalProfit, 10 * fee * 1.5, 1e-6, 'voyage sans frais');
  const no = E.plan([mk(fee * 10)], vol, Object.assign({}, base, { teleport: false })).lines[0];
  assert.strictEqual(no.transport, 'voyage');
});
t('retour de ressources : il faut le stock complet du 1er craft, le retour arrive après', () => {
  const o = E.evaluate(prices, i5, rec, 1, 'Lymhurst', false, prof);
  const fib = o.ingredients.find(g => g.id === 'T5_FIBER'), R = o.rrr;
  near(fib.start, 3 * R, 1e-9, 'part rendue d\'un craft');
  assert.strictEqual(E.buyQty(fib, 1), 3, 'un craft : la recette entière');
  assert.strictEqual(E.buyQty(fib, 8), Math.ceil(3 + 7 * 3 * (1 - R) - 1e-9), '8 crafts : 1er complet, puis net');
  const pl = E.plan([o], { T5_CLOTH: { Lymhurst: 1e4 }, T5_FIBER: { Lymhurst: 1e5 }, T4_CLOTH: { Lymhurst: 1e5 } },
    Object.assign({}, prof, { capital: 1e9, maxShare: 1, liqShare: 0.001, minutes: 45, minLineProfit: 0 }));
  const l = pl.lines[0];
  near(l.totalCost, l.n * o.cost + E.startCapital(o), 1e-6, 'capital : stock de départ compris');
  assert.ok(l.stockCost > 0);
});
t('tournée : actions groupées par ville, ordre au plus court, achats avant craft avant vente', () => {
  const A = { id: 'A', name: 'A', city: 'Lymhurst', sellVenue: 'Lymhurst', n: 1, amount: 1, kind: 0,
    ingredients: [{ id: 'X', name: 'X', city: 'Martlock', effQty: 1 }] };
  const B = { id: 'B', name: 'B', city: 'Lymhurst', sellVenue: 'Martlock', n: 1, amount: 1, kind: 4, flip: true,
    ingredients: [{ id: 'B', name: 'B', city: 'Lymhurst', effQty: 1 }] };
  const r = E.route([A, B], Object.assign({}, prof, { travelMinutes: 5 }));
  near(r.minutes, 10, 1e-9, 'deux trajets');
  assert.strictEqual(r.stops.length, 3, 'trois arrêts');
  const order = r.stops.flatMap(s => s.actions.map(a => a.line + a.type));
  assert.ok(order.indexOf('0buy') < order.indexOf('0make') && order.indexOf('0make') < order.indexOf('0sell'), 'A dans l\'ordre');
  assert.ok(order.indexOf('1buy') < order.indexOf('1sell'), 'B dans l\'ordre');
  assert.ok(r.stops.every(s => s.actions.every(a => a.city === s.city)), 'chaque action dans sa ville');
});
t('progression : tier débloqué par le nœud de base (table UnlockTier officielle)', () => {
  const tab = DATA.unlock.CRAFT_BASE;
  assert.deepStrictEqual(tab.map(x => x[1]), [4, 5, 6, 7, 8]);
  const idx = E.index.get('T8_MAIN_CURSEDSTAFF'), idx6 = E.index.get('T6_MAIN_CURSEDSTAFF');
  const base = DATA.nodes.find(nd => nd.id === 'CRAFT_CURSEDSTAFFS');
  assert.strictEqual(base.m, 'CRAFT_BASE');
  const lvl30 = tab.find(x => x[1] === 6)[0];
  assert.strictEqual(E.tierCap(idx6, { specs: { CRAFT_CURSEDSTAFFS: lvl30 } }), 6);
  assert.strictEqual(E.tierCap(idx6, { specs: { CRAFT_CURSEDSTAFFS: lvl30 - 1 } }), 5);
  assert.strictEqual(E.tierCap(idx, { specs: { CRAFT_CURSEDSTAFFS: 100 } }), 8);
});
t('progression : budget respecté, objets vendus seulement, nœuds non maximaux', () => {
  const lv = E.nodesToLevel(E.index.get('T6_MAIN_CURSEDSTAFF'), { specs: { CRAFT_CURSEDSTAFFS: 100, CRAFT_CURSEDSTAFFS_CURSED: 40 } });
  assert.ok(lv.some(x => x.id === 'CRAFT_CURSEDSTAFFS_CURSED') && !lv.some(x => x.id === 'CRAFT_CURSEDSTAFFS'));
  const o = { id: 'P', city: 'Lymhurst', sellVenue: 'Lymhurst', amount: 1, cost: 1000, profit: -100, fameValue: 50,
    ingredients: [{ id: 'I', city: 'Lymhurst', effQty: 2, start: 0, price: 500 }] };
  const vol = { P: { Lymhurst: { n: 1000, p: 900 } }, I: { Lymhurst: { n: 1e5, p: 500 } } };
  const pick = E.progressionPick([o], vol, Object.assign({}, prof, { liqShare: 0.15 }), 50000);
  assert.strictEqual(pick[0].n, 50, 'budget 50 000 / 1 000');
  assert.strictEqual(E.progressionPick([o], { I: vol.I }, prof, 50000).length, 0, 'sans ventes : écarté');
});
t('journaux : renommée de craft et valeur ajoutée au profit (journal plein − vide)', () => {
  const idx = E.index.get('T6_ARMOR_PLATE_SET1'); const it = DATA.items[idx];
  const rec = it.r.find(r => r[3] === 0);
  near(E.craftFame(it, rec), 16 * 270, 1e-9, '16 barres T6 × 270');
  const j = DATA.jmap.T6_ARMOR_PLATE_SET1; assert.strictEqual(j[0], 'T6_JOURNAL_WARRIOR'); assert.strictEqual(j[1], 4800);
  const pr = { T6_JOURNAL_WARRIOR_FULL: { Martlock: P(30000, 28000) }, T6_JOURNAL_WARRIOR_EMPTY: { Martlock: P(9000, 8000) } };
  const g = E.journalGain(pr, it, rec, 'Martlock', prof);
  near(g.share, 4320 / 4800, 1e-9); near(g.value, 4320 / 4800 * (28000 * 0.92 - 9000), 1e-6);
  const big = Object.assign({}, it, { e: 2 });
  near(E.journalGain(pr, big, rec, 'Martlock', prof).share, 4 * 4320 / 4800, 1e-9, '.2 : renommée ×4, 3,6 journaux');
});
console.log(n, 'tests OK');
