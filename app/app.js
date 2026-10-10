/* Interface de l'outil. Dépend de ALBION_DATA (data.js), AlbionEngine (engine.js), AlbionMarket (market.js). */
(function () {
  'use strict';
  const DATA = window.ALBION_DATA;
  const E = AlbionEngine.createEngine(DATA);
  const M = AlbionMarket;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const fmt = n => (n == null || !isFinite(n)) ? '—' : Math.round(n).toLocaleString('fr-FR');
  const fmtK = n => { if (n == null || !isFinite(n)) return '—'; const a = Math.abs(n);
    return a >= 1e6 ? (n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' M'
      : a >= 1e4 ? Math.round(n / 1e3).toLocaleString('fr-FR') + ' k' : fmt(n); };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } },
  };

  /* ---------- Familles d'activité ---------- */
  const FAMILIES = [
    { key: 'raff', label: 'Raffinage', test: it => it.r && it.r.some(r => r[3] === 1) },
    { key: 'trans', label: 'Transmutation', test: it => it.r && it.r.some(r => r[3] === 2) },
    { key: 'weap', label: 'Armes', test: it => it.cat === 'weapons' },
    { key: 'arm', label: 'Armures', test: it => ['armors', 'head', 'shoes'].includes(it.cat) },
    { key: 'off', label: 'Mains gauches', test: it => it.cat === 'offhands' },
    { key: 'pot', label: 'Potions', test: it => it.sc === 'potions' || it.cat === 'crafting' && it.sc === 'alchemy' },
    { key: 'food', label: 'Nourriture', test: it => it.sc === 'food' || it.cat === 'farming' },
    { key: 'gear', label: 'Sacs, capes, outils', test: it => ['bags', 'capes', 'tools', 'gatherergear'].includes(it.cat) || it.cc === 'gatherergear' || it.cc === 'tools' },
    { key: 'mount', label: 'Montures', test: it => it.cat === 'mounts' },
    { key: 'up', label: 'Amélioration (runes, âmes, reliques)', test: it => !!it.up },
    { key: 'flip', label: 'Revente entre villes (sans craft)', test: () => false },
    { key: 'salv', label: 'Recyclage (acheter, recycler, revendre les matières)', test: () => false },
    { key: 'other', label: 'Autres (artefacts, cartes…)', test: it => ['artefacts', 'other', 'crafting', 'gathering'].includes(it.cat) },
  ];
  function familyOf(it) { const f = FAMILIES.find(f => f.key !== 'up' && f.key !== 'raff' && f.key !== 'trans' && f.test(it)); return f ? f.key : 'other'; }

  /* Catégories de production (clés officielles des bonus de ville) */
  const CAT_LABEL = { fiber: 'Raffinage : tissu', ore: 'Raffinage : barres', hide: 'Raffinage : cuir', wood: 'Raffinage : planches',
    rock: 'Raffinage : blocs de pierre', sword: 'Épées', axe: 'Haches', mace: 'Masses', hammer: 'Marteaux', crossbow: 'Arbalètes',
    knuckles: 'Gants de guerre', bow: 'Arcs', spear: 'Lances', naturestaff: 'Bâtons de nature', dagger: 'Dagues',
    quarterstaff: 'Bâtons de combat', shapeshifterstaff: 'Bâtons de métamorphose', firestaff: 'Bâtons de feu',
    froststaff: 'Bâtons de givre', arcanestaff: 'Bâtons arcaniques', cursestaff: 'Bâtons damnés', holystaff: 'Bâtons sacrés',
    plate_helmet: 'Casques de plaques', plate_armor: 'Armures de plaques', plate_shoes: 'Bottes de plaques',
    leather_helmet: 'Capuches de cuir', leather_armor: 'Vestes de cuir', leather_shoes: 'Chaussures de cuir',
    cloth_helmet: 'Capuchons de tissu', cloth_armor: 'Robes de tissu', cloth_shoes: 'Sandales de tissu', offhand: 'Mains gauches',
    bag: 'Sacs', cape: 'Capes', tools: 'Outils', gatherergear: 'Équipement de récolte', potion: 'Potions', food: 'Nourriture',
    meat_pig: 'Boucher : porc', meat_goose: 'Boucher : oie', meat_goat: 'Boucher : chèvre', meat_cow: 'Boucher : vache',
    meat_chicken: 'Boucher : poulet', meat_sheep: 'Boucher : mouton' };

  /* ---------- Profils ---------- */
  const DEFAULT_PROFILE = {
    name: 'Principal', premium: false, focus: 0, bank: 0, reserve: 10000000,
    cities: ['Thetford', 'Lymhurst', 'Bridgewatch', 'Martlock', 'Fort Sterling', 'Caerleon', 'Brecilien'],
    multiCity: true, riskyOuting: false, travelMult: 1, travelMinutes: 5, mode: 'mixed', goalPerDay: 5000000, progressShare: 0.05, families: ['raff', 'pot', 'food', 'weap', 'arm', 'off', 'gear', 'up', 'trans', 'flip', 'salv'],
    maxAge: 12, liqShare: 0.15, maxShare: 0.25, minMargin: 0.05, minutes: 45, minutesPerLine: 5,
    minLineProfit: 10000, stationFee: {}, dailyBonus: {}, specs: {},
  };
  let profiles = store.get('ae.profiles', null);
  if (!profiles) profiles = { active: 'Principal', list: { Principal: JSON.parse(JSON.stringify(DEFAULT_PROFILE)) } };
  // Spés pré-renseignées (preset.js) : ajoutées une fois à chaque profil, sans écraser ce qui est déjà saisi
  if (window.ALBION_PRESET) {
    for (const pr of Object.values(profiles.list)) {
      if (pr.presetApplied) continue;
      pr.specs = Object.assign({}, window.ALBION_PRESET.specs, pr.specs || {});
      pr.presetApplied = true;
    }
    store.set('ae.profiles', profiles);
  }
  // Nouvelle activité « Revente » : activée une fois dans les profils existants
  for (const pr of Object.values(profiles.list)) {
    if (pr.families && !pr.flipAdded) { if (!pr.families.includes('flip')) pr.families.push('flip'); pr.flipAdded = true; }
    if (!pr.mixedMode) { if (pr.mode === 'orders' || !pr.mode) pr.mode = 'mixed'; pr.mixedMode = true; }   // la tournée se fait d'une traite
    if (pr.families && !pr.salvAdded) { if (!pr.families.includes('salv')) pr.families.push('salv'); pr.salvAdded = true; }
  }
  store.set('ae.profiles', profiles);
  const prof = () => Object.assign({}, DEFAULT_PROFILE, profiles.list[profiles.active]);
  const saveProfiles = () => store.set('ae.profiles', profiles);
  function updateProf(patch) { Object.assign(profiles.list[profiles.active], patch); saveProfiles(); }

  /* ---------- Onglets ---------- */
  function showTab(name) {
    $$('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === name ? 'true' : 'false'));
    $$('.panel').forEach(p => { p.hidden = p.id !== 'p-' + name; });
    store.set('ae.tab', name);
  }

  /* ---------- Analyse du jour ---------- */
  let lastPlan = null, lastPrices = null, lastVolumes = null;
  // Argent des lignes mises en vente APRÈS la dernière saisie de la banque : déjà dépensé, pas encore revenu.
  // (Celles d'avant sont déjà sorties du solde que tu as saisi : pas de double comptage.)
  function lockedSinceBank(p) {
    const since = p.bankAt ? Date.parse(p.bankAt) : 0;
    return store.get('ae.log.' + profiles.active, []).filter(r => r.status === 'en vente' && Date.parse(r.date) > since)
      .reduce((s, r) => s + (r.cost || 0), 0);
  }
  function engineProfile(p) {
    return Object.assign({}, p, { capital: Math.max(0, (p.bank || 0) - (p.reserve || 0) - lockedSinceBank(p)) });
  }
  function itemFilter(p) {
    const fams = new Set(p.families);
    return it => {
      if (fams.has('up') && it.up) return true;
      if (it.r && it.r.some(r => r[3] === 1)) return fams.has('raff');
      if (it.r && it.r.some(r => r[3] === 2) && !it.r.some(r => r[3] === 0)) return fams.has('trans');
      return fams.has(familyOf(it));
    };
  }
  function setStatus(msg, kind) { const s = $('#status'); s.textContent = msg; s.dataset.kind = kind || ''; }

  async function analyze() {
    const p = engineProfile(prof());
    if (!p.cities.length) return setStatus('Choisis au moins une ville dans le profil.', 'warn');
    if (p.capital <= 0) return setStatus('Capital investissable nul : indique ta banque dans le profil (elle doit dépasser la réserve).', 'warn');
    $('#run').disabled = true;
    $('#plan').innerHTML = '<div class="empty"><p>Analyse en cours : lecture des prix et calcul de chaque recette…</p></div>'; $('#kpis').hidden = true;
    try {
      const filt = itemFilter(p);
      const doFlip = p.families.includes('flip'), doSalv = p.families.includes('salv');
      const need = new Set();
      DATA.items.forEach(it => {
        if (it.tr && doFlip && (it.t >= 4 || it.cat === 'treasures')) need.add(it.id);
        if (it.tr && doSalv && it.sv) { need.add(it.id); it.sv[2].forEach(([ii]) => need.add(DATA.items[ii].id)); }
        if (!it.tr || !filt(it)) return;
        need.add(it.id);
        const jj = DATA.jmap && DATA.jmap[it.id.split('@')[0]];
        if (jj && p.journals !== false) { need.add(jj[0] + '_FULL'); need.add(jj[0] + '_EMPTY'); }
        (it.r || []).forEach(r => r[4].forEach(([ii]) => need.add(DATA.items[ii].id)));
        if (it.up) { need.add(DATA.items[it.up[0]].id); it.up[1].forEach(([ii]) => need.add(DATA.items[ii].id)); }
      });
      // Priorité : sans risque. Liste du jour = 5 villes royales seulement (reliées par le Travel Planner).
      // Caerleon et le Black Market = option « sortie risquée », hors capital et hors objectifs du jour.
      const ROYALS = ['Thetford', 'Lymhurst', 'Bridgewatch', 'Martlock', 'Fort Sterling', 'Brecilien'];   // Brecilien : accès par une brume en zone jaune, sans risque (sur place seulement)
      const risky = !!p.riskyOuting;
      const riskyCities = risky ? p.cities.filter(c => !ROYALS.includes(c)) : [];
      const locs = p.cities.filter(c => ROYALS.includes(c)).concat(riskyCities, riskyCities.includes('Caerleon') ? ['Black Market'] : []);
      setStatus(`Lecture des prix : ${need.size} objets, ${locs.length} marchés…`);
      const prices = await M.fetchPrices([...need], locs, { onProgress: (d, t) => setStatus(`Lecture des prix… ${d}/${t}`) });
      // Liste du jour sans Black Market (trajet risqué) ; le Black Market a sa propre liste, pour une sortie par semaine
      const pDay = Object.assign({}, p, { blackMarket: false, cities: p.cities.filter(c => ROYALS.includes(c)) });
      const pBM = Object.assign({}, p, { blackMarket: 'only' });
      const pSite = Object.assign({}, p, { blackMarket: false, cities: riskyCities });
      const opps = E.opportunities(prices, pDay, filt).concat(doFlip ? E.flips(prices, pDay) : [], doSalv ? E.salvages(prices, pDay) : []);
      const oppsBM = !risky ? [] : (riskyCities.includes('Caerleon') ? E.opportunities(prices, pBM, filt).concat(doFlip ? E.flips(prices, pBM) : []) : [])
        .concat(riskyCities.length ? E.opportunities(prices, pSite, filt) : []);
      opps.sort((a, b) => b.profit - a.profit);
      // les 1 000 objets les plus prometteurs (toutes villes de craft confondues) passent au contrôle par l'historique
      oppsBM.sort((a, b) => b.profit - a.profit);
      const keep = new Set(), keepBM = new Set();
      for (const o of opps) { if (keep.size >= 1000) break; keep.add(o.id); }
      // Le tri par profit unitaire écarte les produits bon marché à gros volume (raffinage, transmutation…) :
      // chaque famille garde aussi ses 150 meilleurs objets, et tout le raffinage passe au contrôle par les ventes.
      const famKey = o => o.flip ? 'flip' : o.salvage ? 'salv' : o.kind === 1 ? 'raff' : o.kind === 2 ? 'trans' : o.kind === 3 ? 'up' : familyOf(DATA.items[o.itemIdx]);
      // Deux classements par famille (runage, recyclage, revente, crafts…) : profit unitaire ET marge,
      // pour que les objets bon marché à forte marge (souvent les plus vendus) arrivent jusqu'aux volumes.
      const perFam = {}, perFamM = {};
      for (const o of opps) {
        const k = famKey(o); const set = perFam[k] || (perFam[k] = new Set());
        if (k === 'raff' || set.size < 150 || set.has(o.id)) { set.add(o.id); keep.add(o.id); }
      }
      for (const o of opps.slice().sort((a, b) => b.margin - a.margin)) {
        const k = famKey(o); const set = perFamM[k] || (perFamM[k] = new Set());
        if (set.size < 150 || set.has(o.id)) { set.add(o.id); keep.add(o.id); }
      }
      for (const o of oppsBM) { if (keepBM.size >= 300) break; keepBM.add(o.id); }
      const top = opps.filter(o => keep.has(o.id)), topBM = oppsBM.filter(o => keepBM.has(o.id));
      // Progression des spés : crafts sans focus, part du capital (profil)
      const progC = (p.progressShare || 0) > 0 ? E.progressionCandidates(prices, pDay, 150) : [];
      const vNeed = new Set();
      top.concat(topBM, progC).forEach(o => { vNeed.add(o.id); o.ingredients.forEach(l => vNeed.add(l.id)); (o.outputs || []).forEach(x => vNeed.add(x.id)); });
      setStatus(`Lecture des ventes des 7 derniers jours : ${vNeed.size} objets…`);
      const volumes = await M.fetchVolumes([...vNeed], locs, { onProgress: (d, t) => setStatus(`Lecture des ventes des 7 derniers jours… ${d}/${t}`) });
      lastPrices = prices; lastVolumes = volumes;
      const checked = E.applyHistory(top, volumes, prices, pDay).sort((a, b) => b.profit - a.profit);
      const prog = E.progressionPick(progC, volumes, pDay, pDay.capital * (p.progressShare || 0));
      const progCost = prog.reduce((s, l) => s + l.totalCost, 0);
      const progMin = prog.length * (p.minutesPerLine || 5);
      lastPlan = E.plan(checked, volumes, Object.assign({}, pDay, { capital: Math.max(0, pDay.capital - progCost), minutes: Math.max(0, pDay.minutes - progMin) }));
      lastPlan.lines = lastPlan.lines.concat(prog);
      lastPlan.totalProfit += prog.reduce((s, l) => s + l.totalProfit, 0);
      lastPlan.capitalUsed += progCost; lastPlan.minutesUsed += progMin;
      lastPlan.progCount = prog.length;
      const checkedBM = E.applyHistory(topBM, volumes, prices, pBM).sort((a, b) => b.profit - a.profit);
      // sortie hebdomadaire : quantités sur 7 jours de volume, pas de limite de temps de session
      // calcul à part : n'entame ni le capital ni le focus ni le temps de la liste du jour
      lastPlan.bm = E.plan(checkedBM, volumes, Object.assign({}, pBM, { liqShare: pBM.liqShare * 7, minutes: 1e6, focus: 0 }));
      const volOf = (id, c) => { const h = volumes[id] && volumes[id][c]; return h ? (typeof h === 'object' ? h.n : h) : 0; };
      for (const l of lastPlan.lines.concat(lastPlan.bm.lines)) l.dailyVol = l.salvage ? 0 : volOf(l.id, l.sellVenue);
      lastPlan.diag = { found: opps.length, checked: checked.length };
      lastPlan.capitalAvail = p.capital;
      lastPlan.lockedDeducted = lockedSinceBank(p);
      lastPlan.at = new Date().toISOString();
      lastPlan.considered = opps.length;
      store.set('ae.lastPlan.' + profiles.active, lastPlan);
      renderPlan(lastPlan);
      setStatus(`Analyse terminée : ${opps.length} recettes rentables aux prix affichés, ${checked.length} confirmées par les ventes réelles, ${lastPlan.lines.length} retenues.`, 'ok');
    } catch (e) {
      setStatus('Échec de la lecture des prix : ' + e.message + '. Vérifie ta connexion puis relance.', 'err');
    } finally { $('#run').disabled = false; }
  }

  function renderPlan(pl) {
    const box = $('#plan');
    if (!pl || !pl.lines.length) {
      const d = pl && pl.diag;
      box.innerHTML = `<div class="empty"><p>${pl ? (d ? `${fmt(d.found)} recettes rentables aux prix affichés, ${fmt(d.checked)} confirmées par les ventes des 7 derniers jours, aucune ne tient dans ton capital, ton focus et le profit minimal par ligne.` : 'Aucune ligne ne passe les filtres du jour.') : 'Lance l\'analyse pour obtenir ta liste du jour.'}</p>
        <p class="muted">L'outil lit les prix en direct, calcule chaque recette dans tes villes et garde les meilleures lignes que tu peux faire en ${fmt(prof().minutes)} minutes.</p></div>`;
      $('#kpis').hidden = true; return;
    }
    $('#kpis').hidden = false;
    $('#k-profit').textContent = fmtK(pl.totalProfit);
    $('#k-capital').textContent = fmtK(pl.capitalUsed);
    $('#k-capital-of').textContent = 'sur ' + fmtK(pl.capitalAvail) + ' disponibles' + (pl.lockedDeducted > 0 ? ` (${fmtK(pl.lockedDeducted)} en vente déduits)` : '');
    $('#k-focus').textContent = fmt(pl.focusUsed);
    $('#k-time').textContent = fmt(pl.minutesUsed) + ' min';
    $('#k-route').textContent = pl.route && pl.route.length ? 'Tournée : ' + pl.route.join(' → ') + ' · ' + fmtK(pl.totalProfit / Math.max(1, pl.minutesUsed)) + ' par minute' : '';
    $('#k-at').textContent = new Date(pl.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    const byCity = {};
    pl.lines.forEach((l, i) => { const g = (l.prog ? 'Progression des spés — crafter à ' : l.flip ? 'Revente — acheter à ' : l.salvage ? 'Recyclage — acheter à ' : 'Crafter à ') + l.city; (byCity[g] = byCity[g] || []).push([l, i]); });
    const p = prof();
    const bm = p.riskyOuting && pl.bm && pl.bm.lines.length ? `<details class="city risky"><summary><h3 style="display:inline">Option : sortie risquée <span class="muted">Caerleon, Black Market · en groupe, une fois par semaine</span></h3></summary>
      <p class="muted small">Hors liste du jour : ces lignes ne comptent ni dans ton capital engagé, ni dans ton profit prévu. Ne les fais qu'avec l'argent qui reste après ta liste du jour. Quantités calculées sur une semaine de ventes. Seraient engagés : ${fmtK(pl.bm.capitalUsed)} pour ${fmtK(pl.bm.totalProfit)} prévus.</p>
      ${pl.bm.lines.map((l, k) => lineHTML(l, 'bm' + k, p)).join('')}</details>` : '';
    box.innerHTML = tourHTML(pl, p) + `<details class="detail"><summary><h3 style="display:inline">Détail de chaque ligne</h3> <span class="muted">calculs, investissement, volumes</span></summary>` +
      Object.entries(byCity).map(([city, ls]) => `
      <section class="city"><h3>${esc(city)} <span class="muted">${ls.length} ligne${ls.length > 1 ? 's' : ''}</span></h3>
      ${ls.map(([l, i]) => lineHTML(l, i, p)).join('')}</section>`).join('') + `</details>` + bm;
  }

  // Tournée : une liste de tâches par ville, dans l'ordre qui évite les allers-retours
  const tierOf = id => { const it = DATA.items[E.index.get(id)]; return it ? ` <span class="tier">T${it.t}${it.e ? '.' + it.e : ''}</span>` : ''; };
  const JTYPE = { WARRIOR: 'Guerrier (forgeron)', HUNTER: 'Chasseur (archer-fabricant)', MAGE: 'Mage (enchanteur)', TOOLMAKER: 'Outilleur' };
  const journalName = id => { const m = /^T(\d)_JOURNAL_(\w+)$/.exec(id); return m ? `journal ${JTYPE[m[2]] || m[2]} T${m[1]}` : id; };
  const journalTxt = l => l.journal ? `prends <b>${fmt(Math.ceil(l.journal.share * l.n))}</b> ${journalName(l.journal.id)} vide${l.journal.share * l.n > 1 ? 's' : ''} (≈ ${fmt(l.journal.empty)}) et revends-les pleins (≈ ${fmt(l.journal.full)}) : +${fmtK(l.journal.value * l.n)}` : '';
  const signK = v => (v >= 0 ? '+' : '−') + fmtK(Math.abs(v));
  const sellPrice = (l, p) => l.unitSell / (1 - E.salesTax(p) - (E.sellByOrder(p) && l.sellVenue !== 'Black Market' ? DATA.consts.setupFee : 0));
  const ORDER = { buy: 0, make: 1, salvage: 1, sell: 2 };
  function tourHTML(pl, p) {
    const r = E.route(pl.lines, p);
    if (!r.stops.length) return '';
    const buyVerb = E.buyByOrder(p) ? 'Poser un ordre d\'achat' : 'Acheter';
    const name = l => `${esc(l.name)}${l.ench ? ' <span class="tier">T' + l.tier + '.' + l.ench + '</span>' : ' <span class="tier">T' + l.tier + '</span>'}`;
    const act = a => {
      const l = pl.lines[a.line], i = a.line;
      if (a.type === 'buy') return '';                         // regroupés par objet (voir buyRows)
      if (a.type === 'salvage') return `<li><b>Recycler</b> <span class="q">${fmt(l.n)}</span> ${name(l)} <span class="gainmini">+${fmtK(l.totalProfit)}</span> <button class="ghost real small" data-start="${i}">Mis en vente</button></li>`;
      if (a.type === 'make') {
        const pre = l.chain && l.chain.length ? l.chain.map(st => `${st.kind === 2 ? 'Transmuter' : st.kind === 1 ? 'Raffiner' : 'Crafter'} <span class="q">${fmt(Math.ceil(st.qty * l.n + (st.start || 0) - 1e-9))}</span> ${esc(st.name)} <span class="tier">T${st.tier}${st.ench ? '.' + st.ench : ''}</span>${st.focus ? ' au focus' : ''}`).join(', puis ') + ', puis ' : '';
        const verb = l.kind === 3 ? 'Améliorer' : l.kind === 2 ? 'Transmuter' : l.kind === 1 ? 'Raffiner' : 'Crafter';
        return `<li>${pre ? '<span class="muted">' + pre + '</span>' : ''}<b>${verb}</b> <span class="q">${fmt(l.n)}</span> × ${name(l)}${l.useFocus ? ` <span class="pill focus">focus ${fmt(l.totalFocus)}</span>` : ''}${l.prog ? ` <span class="muted">· sans focus, monte ${esc(l.levels[0].name)}</span>` : ''}${l.journal ? `<br><span class="muted">Journaux : ${journalTxt(l)}</span>` : ''}</li>`;
      }
      const bm = a.city === 'Black Market';
      const verb = E.sellByOrder(p) && !bm ? 'Poser un ordre de vente' : 'Vendre directement';
      if (a.outputs) return '';                                // regroupés par objet (voir outRows)
      return `<li><b>${verb}</b> <span class="q">${fmt(l.n * l.amount)}</span> × ${name(l)} <span class="muted">à ${fmt(sellPrice(l, p))}</span> <span class="gainmini${l.totalProfit < 0 ? ' neg' : ''}">${signK(l.totalProfit)}</span>${l.prog ? ' <span class="pill">progression</span>' : ''} <button class="ghost real small" data-start="${i}">Mis en vente</button></li>`;
    };
    // achats d'un même objet pour plusieurs lignes : une seule ligne, quantité totale, prix max le plus bas
    function buyRows(st) {
      const m = new Map();
      for (const a of st.actions) if (a.type === 'buy') {
        const l = pl.lines[a.line];
        for (const g of a.items) {
          const x = m.get(g.id) || { g, q: 0, price: Infinity, uses: [] };
          x.q += E.buyQty(g, l.n); x.price = Math.min(x.price, g.price);
          x.uses.push(l.salvage ? 'à recycler' : l.flip ? 'à revendre' : l.id === g.id ? '' : 'pour ' + esc(l.name));
          m.set(g.id, x);
        }
      }
      return [...m.values()].map(x => { const u = [...new Set(x.uses.filter(Boolean))];
        return `<li><b>${buyVerb}</b> <span class="q">${fmt(x.q)}</span> ${esc(x.g.name)}${tierOf(x.g.id)} <span class="muted">à ${fmt(x.price)} max${u.length ? ' · ' + (u.length > 2 ? u.length + ' lignes' : u.join(', ')) : ''}</span></li>`; }).join('');
    }
    // matières issues du recyclage : une ligne par objet
    function outRows(st) {
      const m = new Map();
      for (const a of st.actions) if (a.type === 'sell' && a.outputs) {
        const l = pl.lines[a.line];
        for (const x of a.outputs) { const y = m.get(x.id) || { x, q: 0 }; y.q += x.units * l.n; m.set(x.id, y); }
      }
      return [...m.values()].map(({ x, q }) => `<li><b>Vendre</b> <span class="q">${fmt(q)}</span> ${esc(x.name)}${tierOf(x.id)} <span class="muted">· issu du recyclage</span></li>`).join('');
    }
    return `<section class="tour"><h3>Ta tournée <span class="muted">${r.stops.length} arrêt${r.stops.length > 1 ? 's' : ''} · ${fmt(r.minutes)} min de trajets</span></h3>
      <ol class="stops">${r.stops.map((st, k) => `<li class="stop"><h4>${esc(st.city === 'Black Market' ? 'Black Market (Caerleon)' : st.city)}</h4>
        <ul class="tasks">${buyRows(st)}${st.actions.slice().sort((a, b) => ORDER[a.type] - ORDER[b.type]).map(act).join('')}${outRows(st)}</ul>
        ${st.next ? `<p class="go">→ Aller à <b>${esc(st.next.city)}</b> <span class="muted">≈ ${fmt(st.next.minutes)} min${st.next.city === 'Brecilien' || st.city === 'Brecilien' ? ' · par une brume en zone jaune' : ' · Travel Planner, voyage gratuit (ou téléportation si une ligne l\'indique)'}</span></p>` : ''}</li>`).join('')}</ol></section>`;
  }

  // Travel Planner : voyage gratuit (temps de trajet) ou téléportation instantanée payée au poids
  function moveHTML(l, p) {
    if (l.transport === 'tp') return `<li><b>Téléporter</b> avec la marchandise (Travel Planner) <span class="muted">instantané · frais ≈ ${fmt(l.tpTotal || 0)} argent</span></li>`;
    if (l.transport === 'voyage') return `<li><b>Voyager</b> avec la marchandise (Travel Planner, gratuit) <span class="muted">≈ ${fmt(p.travelMinutes ?? 5)} min par trajet</span></li>`;
    return '';
  }

  function lineHTML(l, i, p) {
    const buyVerb = E.buyByOrder(p) ? 'Poser un ordre d\'achat' : 'Acheter';
    const bm = l.sellVenue === 'Black Market';
    const sellVerb = E.sellByOrder(p) && !bm ? 'Poser un ordre de vente' : 'Vendre directement';
    const ench = l.ench ? '.' + l.ench : '';
    const ings = l.ingredients.map(g => `<li><span class="q">${fmt(E.buyQty(g, l.n))}</span> ${esc(g.name)} <span class="muted">à ${fmt(g.price)} max${g.city && g.city !== l.city ? ' · <b>' + esc(g.city) + '</b>' : ''}</span></li>`).join('');
    return `<article class="line" data-i="${i}">
      <header><label class="chk"><input type="checkbox" id="done-${i}"> <span class="kind">${esc(l.kindLabel)}</span></label>
        <h4>${esc(l.name)} <span class="tier">T${l.tier}${ench}</span></h4>
        <div class="gain"><b class="${l.totalProfit < 0 ? 'neg' : ''}">${signK(l.totalProfit)}</b><span class="muted">${l.perMinute ? fmtK(l.perMinute) + ' / min · ' : ''}marge ${Math.round(l.margin * 100)} %</span></div></header>
      ${l.prog ? `<p class="muted small">Sans focus, pour monter : ${l.levels.slice(0, 3).map(x => esc(x.name) + ' (niv. ' + x.level + ')').join(', ')}. ${l.totalProfit < 0 ? 'Coût de la progression : ' + fmtK(-l.totalProfit) + '.' : 'Rentable en plus.'}</p>` : ''}
      <ol class="steps">
        <li><b>${buyVerb}</b><ul>${ings}</ul></li>
        ${l.chain && l.chain.length ? `<li><b>Préparer d'abord</b> <span class="muted">moins cher que d'acheter</span><ul>${l.chain.map(st => `<li>${st.kind === 2 ? 'Transmuter' : st.kind === 1 ? 'Raffiner' : 'Crafter'}${st.focus ? ' <b>au focus</b>' : ''} <span class="q">${fmt(Math.ceil(st.qty * l.n + (st.start || 0) - 1e-9))}</span> ${esc(st.name)} <span class="tier">T${st.tier}${st.ench ? '.' + st.ench : ''}</span></li>`).join('')}</ul></li>` : ''}
        ${l.kind === 5 ? `<li><b>Recycler</b> ${fmt(l.n)} objet${l.n > 1 ? 's' : ''}</li>
          <li><b>Vendre les matières</b><ul>${l.outputs.map(x => `<li><span class="q">${fmt(x.units * l.n)}</span> ${esc(x.name)} <span class="muted">${x.venue !== l.city ? '· <b>' + esc(x.venue) + '</b>' : ''}</span></li>`).join('')}</ul></li>`
          : l.kind === 4 ? (l.sellVenue === 'Black Market' ? `<li><b>Transporter</b> vers le Black Market (Caerleon)</li>` : '')
          : l.kind === 3 ? `<li><b>Améliorer</b> ${fmt(l.n)} fois à la station de la pièce</li>`
          : `<li><b>${l.kind === 2 ? 'Transmuter' : l.kind === 1 ? 'Raffiner' : 'Crafter'}</b> ${fmt(l.n)} fois${l.useFocus ? ` <span class="pill focus">focus ${fmt(l.totalFocus)}${l.useFocus === 'all' ? ', toute la chaîne' : ''}</span>` : ''}
          ${l.rrr ? `<span class="muted">retour de ressources ${Math.round(l.rrr * 1000) / 10} %</span>` : ''}${l.journal ? `<br><span class="muted">Journaux : ${journalTxt(l)} (renommée ${fmt(l.journal.fame)} par craft, compte la renommée de base, sans Premium)</span>` : ''}</li>`}
        ${moveHTML(l, p)}
        ${l.salvage ? '' : `<li><b>${sellVerb}</b> ${fmt(l.n * l.amount)} × à ${fmt(l.unitSell / (1 - E.salesTax(p) - (E.sellByOrder(p) && !bm ? DATA.consts.setupFee : 0)))} <span class="muted">${l.sellVenue === 'Black Market' ? 'au Black Market (Caerleon)' : l.sellVenue !== l.city ? '<b>à ' + esc(l.sellVenue) + '</b>' : ''}</span>${l.capped ? ' <span class="pill">prix ramené à la moyenne des 7 jours</span>' : ''}${l.quality ? ' <span class="pill">bonus si meilleure qualité</span>' : ''}</li>`}
      </ol>
      <footer><span class="muted">Investissement ${fmtK(l.totalCost)}${l.stockCost > 0 ? ` (dont ${fmtK(l.stockCost)} de stock de départ : le retour de ressources arrive après chaque craft, ce stock te reste à la fin)` : ''} · ${fmt(l.minutes || p.minutesPerLine)} min dans ta tournée${l.trips && l.trips.length ? ' · villes : ' + [l.city].concat(l.trips).map(esc).join(', ') : ''}</span>
        ${l.dailyVol ? `<span class="muted">Il s'en vend ${fmt(l.dailyVol)} par jour à ${esc(l.sellVenue)} : ta quantité = ${Math.max(1, Math.round(l.n * l.amount / l.dailyVol * 100))} % d'une journée de ventes</span>` : ''}
        <button class="ghost real" data-start="${i}">Mis en vente</button></footer></article>`;
  }

  /* ---------- Journal des résultats ---------- */
  const logKey = () => 'ae.log.' + profiles.active;
  function startLine(i) {
    const l = lastPlan && (String(i).startsWith('bm') ? lastPlan.bm && lastPlan.bm.lines[+String(i).slice(2)] : lastPlan.lines[i]); if (!l) return;
    const log = store.get(logKey(), []);
    log.push({ id: Date.now().toString(36), status: 'en vente', date: new Date().toISOString(), item: l.name + (l.ench ? ' .' + l.ench : ''),
      city: l.city, venue: l.sellVenue, kind: l.kindLabel, n: l.n, qty: l.n * l.amount, cost: l.totalCost - (l.stockCost || 0), expected: l.totalProfit, focus: l.totalFocus });
    store.set(logKey(), log);
    $('#done-' + i).checked = true;
    const b = $(`[data-start="${i}"]`); if (b) { b.disabled = true; b.textContent = 'En vente : suivi dans Résultats'; }
    renderLog();
  }
  function sellEntry(id) {
    const log = store.get(logKey(), []);
    const r = log.find(x => x.id === id); if (!r) return;
    const v = $('#recv-' + id).value;
    if (v === '') { $('#log-msg').textContent = 'Indique l\'argent reçu au total pour cette ligne.'; return; }
    r.received = +v; r.real = r.received - r.cost; r.status = 'vendu'; r.soldAt = new Date().toISOString();
    r.delayH = (Date.parse(r.soldAt) - Date.parse(r.date)) / 3.6e6;
    store.set(logKey(), log); $('#log-msg').textContent = ''; renderLog();
  }
  function renderLog() {
    const log = store.get(logKey(), []);
    const box = $('#log');
    const open = log.filter(r => r.status === 'en vente');
    const sold = log.filter(r => r.status !== 'en vente' && r.real != null)
      .map(r => Object.assign({ soldAt: r.date, delayH: 0 }, r));   // anciennes entrées notées en une fois
    const locked = open.reduce((s, r) => s + r.cost, 0);
    $('#k-locked') && ($('#k-locked').textContent = locked ? `${fmtK(locked)} bloqués dans ${open.length} vente${open.length > 1 ? 's' : ''} en cours` : '');
    if (!log.length) { $('#progress').innerHTML = ''; box.innerHTML = '<p class="muted">Rien en cours. Quand tu as acheté et mis en vente une ligne, clique « Mis en vente » : elle apparaît ici. Quand tout est vendu, indique l\'argent reçu : l\'outil mesure ton profit réel et ton délai de vente.</p>'; $('#log-sum').textContent = ''; return; }
    let sum = '';
    const caps = store.get('ae.capital.' + profiles.active, []);
    if (sold.length) {
      const days = new Set(sold.map(r => r.soldAt.slice(0, 10))).size;
      const real = sold.reduce((s, r) => s + r.real, 0), exp = sold.reduce((s, r) => s + r.expected, 0);
      const delay = sold.reduce((s, r) => s + r.delayH, 0) / sold.length;
      sum = `<b>${fmtK(real / days)}</b> de profit réel par jour (${days} jour${days > 1 ? 's' : ''} de ventes) · réalisé ${exp ? Math.round(real / exp * 100) : 0} % du prévu · délai de vente moyen <b>${delay < 24 ? Math.round(delay) + ' h' : (delay / 24).toFixed(1).replace('.', ',') + ' j'}</b>`;
      // Rendement réel et capital cible pour l'objectif quotidien (donnée du joueur, profil)
      const p = prof(), goal = p.goalPerDay || 0;
      const capVals = caps.map(c => Math.max(0, c.v - (p.reserve || 0))).filter(v => v > 0);
      const capBase = capVals.length ? capVals.reduce((a, b) => a + b, 0) / capVals.length : Math.max(0, (p.bank || 0) - (p.reserve || 0));
      const r = capBase > 0 ? real / days / capBase : 0;
      if (goal > 0 && r > 0 && days >= 3) {
        const target = goal / r, cur = Math.max(0, (p.bank || 0) - (p.reserve || 0));
        let eta = '';
        if (caps.length >= 2) {
          const d0 = Date.parse(caps[0].d), d1 = Date.parse(caps[caps.length - 1].d), wks = (d1 - d0) / (7 * 864e5);
          const g = wks >= 1 ? (caps[caps.length - 1].v - caps[0].v) / wks : 0;
          eta = target > cur ? (g > 0 ? ` · à ton rythme actuel (+${fmtK(g)} par semaine) : environ <b>${Math.ceil((target - cur) / g)} semaine(s)</b>` : ' · ton argent ne progresse pas encore d\'une semaine sur l\'autre') : ' · <b>objectif atteignable avec ton capital actuel</b>';
        }
        sum += `<br>Rendement réel <b>${(r * 100).toFixed(1).replace('.', ',')} % par jour</b> · pour ${fmtK(goal)} par jour il faudrait environ <b>${fmtK(target)}</b> de capital (tu as ${fmtK(cur)})${eta}. <span class="muted">Le rendement baisse souvent quand le capital grossit : la cible se recale chaque semaine.</span>`;
      } else if (goal > 0) sum += `<br><span class="muted">Rendement réel et capital cible : affichés après 3 jours de ventes notées.</span>`;
    }
    // Progression semaine par semaine (argent disponible relevé dans le profil + ce qui est en vente)
    const wk = d => { const t = new Date(d + 'T00:00:00Z'); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day); return t.toISOString().slice(0, 10); };
    const weeks = {};
    caps.forEach(c => { const w = wk(c.d); (weeks[w] = weeks[w] || { first: c.v, last: c.v }); weeks[w].last = c.v; });
    sold.forEach(r => { const w = wk(r.soldAt.slice(0, 10)); (weeks[w] = weeks[w] || {}); weeks[w].profit = (weeks[w].profit || 0) + r.real; });
    const wks = Object.keys(weeks).sort().reverse();
    $('#progress').innerHTML = wks.length ? `<h3>Progression par semaine</h3><div class="scroll"><table><thead><tr><th>Semaine du</th><th class="r">Argent début</th><th class="r">Argent fin</th><th class="r">Évolution</th><th class="r">Profit éco réel</th></tr></thead><tbody>
      ${wks.map(w => { const x = weeks[w]; const ev = x.first != null ? x.last - x.first : null;
        return `<tr><td>${new Date(w).toLocaleDateString('fr-FR')}</td><td class="r">${fmtK(x.first)}</td><td class="r">${fmtK(x.last)}</td><td class="r ${ev > 0 ? 'pos' : ev < 0 ? 'neg' : ''}">${ev == null ? '—' : (ev > 0 ? '+' : '') + fmtK(ev)}</td><td class="r">${fmtK(x.profit || 0)}</td></tr>`; }).join('')}
      </tbody></table></div><p class="muted small">L'évolution compte tout (éco, stuff perdu, ventes d'objets). Mets à jour ton argent disponible dans le profil à chaque session pour suivre la courbe.</p>` : '';
    $('#log-sum').innerHTML = (sum ? sum + '<br>' : '') + (locked ? `${fmtK(locked)} bloqués dans ${open.length} vente${open.length > 1 ? 's' : ''} en cours` : '');
    const ago = d => { const h = (Date.now() - Date.parse(d)) / 3.6e6; return h < 24 ? Math.round(h) + ' h' : (h / 24).toFixed(1).replace('.', ',') + ' j'; };
    box.innerHTML = (open.length ? `<h3>En vente</h3><div class="scroll"><table><thead><tr><th>Depuis</th><th>Objet</th><th>Vente à</th><th class="r">Investi</th><th class="r">Prévu</th><th>Argent reçu au total</th><th></th></tr></thead><tbody>
      ${open.map(r => `<tr><td>${ago(r.date)}</td><td>${esc(r.item)} × ${fmt(r.qty)}</td><td>${esc(r.venue || r.city)}</td><td class="r">${fmtK(r.cost)}</td><td class="r">+${fmtK(r.expected)}</td>
        <td><input type="number" id="recv-${r.id}" placeholder="argent reçu"></td><td><button class="ghost" data-sold="${r.id}">Vendu</button></td></tr>`).join('')}
      </tbody></table></div><p id="log-msg" class="warn small"></p>` : '<p id="log-msg"></p>')
      + (sold.length ? `<h3>Vendu</h3><div class="scroll"><table><thead><tr><th>Vendu le</th><th>Objet</th><th class="r">Délai</th><th class="r">Prévu</th><th class="r">Réel</th></tr></thead><tbody>
      ${sold.slice().reverse().map(r => `<tr><td>${new Date(r.soldAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td><td>${esc(r.item)}</td><td class="r">${r.delayH < 24 ? Math.round(r.delayH) + ' h' : (r.delayH / 24).toFixed(1).replace('.', ',') + ' j'}</td><td class="r">${fmtK(r.expected)}</td><td class="r ${r.real >= r.expected ? 'pos' : 'neg'}">${fmtK(r.real)}</td></tr>`).join('')}
      </tbody></table></div>` : '');
  }

  /* ---------- Profil : formulaire ---------- */
  function renderProfile() {
    const p = prof();
    $('#pf-select').innerHTML = Object.keys(profiles.list).map(n => `<option ${n === profiles.active ? 'selected' : ''}>${esc(n)}</option>`).join('');
    $('#pf-premium').checked = !!p.premium;
    $('#pf-focus').value = p.focus; $('#pf-bank').value = p.bank; $('#pf-reserve').value = p.reserve;
    $('#pf-mode').value = p.mode; $('#pf-minutes').value = p.minutes; $('#pf-goal').value = p.goalPerDay ?? ''; $('#pf-prog').value = Math.round((p.progressShare ?? 0) * 100);
    $('#pf-multi').checked = !!p.multiCity; $('#pf-risky').checked = !!p.riskyOuting; $('#pf-travelmin').value = p.travelMinutes ?? 5; $('#pf-brecmin').value = p.brecilienMinutes ?? ''; $('#pf-salvround').value = p.salvageRound || 'exact'; $('#pf-travel').value = p.travelMult ?? 1;
    $('#pf-cities').innerHTML = E.CITIES.map(c => `<label class="chip"><input type="checkbox" value="${c}" ${p.cities.includes(c) ? 'checked' : ''}> ${c}</label>`).join('');
    $('#pf-families').innerHTML = FAMILIES.map(f => `<label class="chip"><input type="checkbox" value="${f.key}" ${p.families.includes(f.key) ? 'checked' : ''}> ${f.label}</label>`).join('');
    $('#pf-fees').innerHTML = E.CITIES.map(c => `<label class="field"><span>${c}</span><input type="number" data-fee="${c}" value="${p.stationFee[c] ?? ''}" placeholder="1000"></label>`).join('');
    const catOpts = sel => '<option value="">Catégorie…</option>' + Object.entries(CAT_LABEL).map(([k, l]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${l}</option>`).join('');
    $('#pf-daily').innerHTML = E.CITIES.map(c => { const d = p.dailyBonus[c] || {};
      return `<div class="field"><span>${c}</span><div class="row"><input type="number" step="1" data-daily="${c}" value="${d.pct ? Math.round(d.pct * 100) : ''}" placeholder="%" style="width:5em"><select data-dailycat="${c}" style="flex:1">${catOpts(d.cat)}</select></div></div>`; }).join('');
    ['maxAge', 'liqShare', 'maxShare', 'minMargin', 'minutesPerLine', 'minLineProfit'].forEach(k => {
      const el = $('#pf-' + k); const pct = ['liqShare', 'maxShare', 'minMargin'].includes(k);
      el.value = pct ? Math.round(p[k] * 100) : p[k];
    });
    renderSpecs();
  }
  // Relevé quotidien de l'argent disponible (un point par jour, le dernier saisi) : sert au suivi de progression
  function snapCapital(bank) {
    const k = 'ae.capital.' + profiles.active, h = store.get(k, []), d = new Date().toISOString().slice(0, 10);
    const last = h[h.length - 1];
    if (last && last.d === d) last.v = bank; else h.push({ d, v: bank });
    store.set(k, h);
  }
  function readProfileForm() {
    const prevBank = prof().bank;
    updateProf({
      premium: $('#pf-premium').checked, focus: +$('#pf-focus').value || 0, bank: +$('#pf-bank').value || 0,
      reserve: +$('#pf-reserve').value || 0, mode: $('#pf-mode').value,
      multiCity: $('#pf-multi').checked, riskyOuting: $('#pf-risky').checked, salvageRound: $('#pf-salvround').value,
      travelMinutes: $('#pf-travelmin').value === '' ? 5 : +$('#pf-travelmin').value, brecilienMinutes: $('#pf-brecmin').value === '' ? null : +$('#pf-brecmin').value, travelMult: $('#pf-travel').value === '' ? 1 : +$('#pf-travel').value, minutes: +$('#pf-minutes').value || 45, goalPerDay: +$('#pf-goal').value || 0, progressShare: Math.max(0, Math.min(50, +$('#pf-prog').value || 0)) / 100,
      cities: $$('#pf-cities input:checked').map(i => i.value), families: $$('#pf-families input:checked').map(i => i.value),
      stationFee: Object.fromEntries($$('[data-fee]').filter(i => i.value !== '').map(i => [i.dataset.fee, +i.value])),
      dailyBonus: Object.fromEntries($$('[data-daily]').filter(i => i.value !== '' && +i.value > 0)
        .map(i => [i.dataset.daily, { pct: +i.value / 100, cat: $(`[data-dailycat="${i.dataset.daily}"]`).value || null }])),
      maxAge: +$('#pf-maxAge').value || 12, liqShare: (+$('#pf-liqShare').value || 15) / 100,
      maxShare: (+$('#pf-maxShare').value || 25) / 100, minMargin: (+$('#pf-minMargin').value || 0) / 100,
      minutesPerLine: +$('#pf-minutesPerLine').value || 5, minLineProfit: +$('#pf-minLineProfit').value || 0,
    });
    if (prof().bank !== prevBank) updateProf({ bankAt: new Date().toISOString() });
    if (prof().bank !== prevBank && prof().bank > 0) { snapCapital(prof().bank); renderLog(); }
    feeWarning();
  }

  /* Destiny Board : nœuds de craft et d'agriculture, regroupés sous leur maîtrise */
  function renderSpecs() {
    const p = prof(); const q = ($('#spec-search').value || '').toLowerCase();
    const groups = {};
    DATA.nodes.forEach(n => { (groups[n.grp] = groups[n.grp] || { name: n.gn, ns: [] }).ns.push(n); });
    const html = Object.values(groups).map(({ name, ns }) => {
      const vis = ns.filter(n => !q || n.n.toLowerCase().includes(q) || name.toLowerCase().includes(q));
      if (!vis.length) return '';
      const filled = ns.filter(n => p.specs[n.id]).length;
      return `<details ${q ? 'open' : ''}><summary>${esc(name)} <span class="muted">${filled ? filled + ' investi' + (filled > 1 ? 's' : '') + ' sur ' + ns.length : 'tout à 0'}</span></summary>
        <div class="specgrid">${vis.map(n => `<label class="field"><span>${esc(n.n)}</span><input type="number" min="0" max="100" data-spec="${n.id}" value="${p.specs[n.id] ?? 0}"></label>`).join('')}</div></details>`;
    }).join('');
    $('#specs').innerHTML = html || '<p class="muted">Aucun nœud ne correspond.</p>';
  }

  function feeWarning() {
    const p = prof(); const miss = p.cities.filter(c => !(c in p.stationFee));
    $('#fee-warn').hidden = !miss.length;
    $('#fee-warn').hidden = true;
  }

  /* Import / export d'un profil (code à coller) */
  function exportProfile() {
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(profiles.list[profiles.active]))));
    $('#pf-code').value = code; $('#pf-code').select();
    navigator.clipboard && navigator.clipboard.writeText(code).then(() => setStatus('Code du profil copié.', 'ok'), () => {});
  }
  function importProfile() {
    const msg = t => { $('#pf-msg').textContent = t; };
    try {
      const obj = JSON.parse(decodeURIComponent(escape(atob($('#pf-code').value.replace(/\s+/g, '')))));
      const cur = profiles.list[profiles.active];
      delete obj.name;
      Object.assign(cur, obj, { specs: Object.assign({}, cur.specs, obj.specs || {}) });
      saveProfiles(); renderProfile();
      msg(`Profil « ${profiles.active} » mis à jour : ${Object.keys(obj.specs || {}).length} spés importées.`);
    } catch (e) { msg('Code illisible : recopie-le en entier, sans rien ajouter.'); }
  }

  /* ---------- Îles : rentabilité des parcelles ---------- */
  // Prix des graines au PNJ relevés par Shibu le 22/08/2026 (ils suivent le cours de l'or : à mettre à jour)
  const DEFAULT_SEED = { 1: 2312, 2: 3468, 3: 5780, 4: 8670, 5: 11580, 6: 17340, 7: 26010, 8: 34680 };
  function renderPlotForm() {
    const p = prof(); const sp = p.seedPrice || DEFAULT_SEED;
    $('#plot-seeds').innerHTML = [1, 2, 3, 4, 5, 6, 7, 8].map(t => `<label class="field"><span>Graine T${t}</span><input type="number" data-seed="${t}" value="${sp[t] ?? ''}"></label>`).join('');
    const isl = p.islandCities || ['Bridgewatch', 'Thetford', 'Fort Sterling', 'Martlock', 'Lymhurst'];
    $('#plot-isles').innerHTML = E.CITIES.filter(c => c !== 'Caerleon').map(c => `<label class="chip"><input type="checkbox" value="${c}" ${isl.includes(c) ? 'checked' : ''}> Île de ${c}</label>`).join('');
  }
  async function analyzePlots() {
    const p0 = engineProfile(prof());
    const seedPrice = Object.fromEntries($$('[data-seed]').filter(i => i.value !== '').map(i => [i.dataset.seed, +i.value]));
    const islandCities = $$('#plot-isles input:checked').map(i => i.value);
    updateProf({ seedPrice, islandCities });
    const p = Object.assign({}, p0, { blackMarket: false });
    const out = $('#plot-out'); $('#plot-run').disabled = true;
    try {
      let prices = lastPrices, volumes = lastVolumes;
      // sans analyse du jour : lecture ciblée (cultures, produits qui les utilisent, leurs ingrédients)
      const cropIdx = DATA.farm.filter(f => f.type === 'plant').map(f => E.index.get(f.recolte[0].id)).filter(i => i != null);
      const ids = new Set();
      for (const ci of cropIdx) {
        ids.add(DATA.items[ci].id);
        for (const u of usersDeep(ci)) { const it = DATA.items[u]; ids.add(it.id); (it.r || []).forEach(r => r[4].forEach(([ii]) => ids.add(DATA.items[ii].id))); }
      }
      const missing = !prices ? [...ids] : [...ids].filter(id => !prices[id]);
      if (missing.length) {
        out.innerHTML = `<p class="muted">Lecture des prix de ${missing.length} objets…</p>`;
        prices = Object.assign({}, prices || {}, await M.fetchPrices(missing, p.cities));
      }
      const vMissing = [...ids].filter(id => !(volumes && volumes[id]));
      if (vMissing.length) {
        out.innerHTML = `<p class="muted">Lecture des ventes des 7 derniers jours pour ${vMissing.length} objets…</p>`;
        volumes = Object.assign({}, volumes || {}, await M.fetchVolumes(vMissing, p.cities));
      }
      const rows = E.plotValue(prices, volumes, p, { seedPrice, seedsPerPlot: 9, baseYield: 4.5, premiumFactor: p.premium ? 2 : 1, islandCities });
      const bestPerCrop = []; const seen = new Set();
      for (const r of rows) { const k = r.crop; if (seen.has(k)) continue; seen.add(k); bestPerCrop.push(r); }
      out.innerHTML = bestPerCrop.length ? `<div class="scroll"><table><thead><tr><th>Culture</th><th>Meilleure île</th><th class="r">Récolte / parcelle / jour</th><th>Meilleur usage</th><th class="r">Gain net / parcelle / jour</th><th class="r">Par semaine</th><th class="r">Parcelles absorbées par le marché</th></tr></thead><tbody>
        ${bestPerCrop.map(r => `<tr><td>${esc(r.cropName)} <span class="tier">T${r.tier}</span></td><td>${esc(r.isle)}</td><td class="r">${fmt(r.perPlotDay)}</td>
          <td>${esc(r.use)}${r.craftCity ? ' <span class="muted">à ' + esc(r.craftCity) + '</span>' : ''}${r.venue && r.venue !== r.craftCity ? ' <span class="muted">· vente ' + esc(r.venue) + '</span>' : ''}</td>
          <td class="r ${r.perPlotDayNet > 0 ? 'pos' : 'neg'}">${fmtK(r.perPlotDayNet)}</td><td class="r">${fmtK(r.perPlotDayNet * 7)}</td><td class="r">${isFinite(r.maxPlots) ? fmt(Math.floor(r.maxPlots)) : '—'}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="muted small">Récolte : 9 graines par parcelle × 4,5 en moyenne (3 à 6)${p.premium ? ' × 2 avec Premium (selon le wiki, à vérifier sur ta prochaine récolte)' : ''}, + bonus de la ville de l'île. Sans arrosage au focus. Le gain d'un usage en chaîne compte tous les autres ingrédients au prix du marché et les étapes de craft ; il est limité par ce que le marché du produit fini absorbe chaque jour.</p>`
        : '<p class="muted">Aucune culture rentable avec ces prix.</p>';
    } catch (e) { out.innerHTML = `<p class="err">Échec de la lecture des prix : ${esc(e.message)}</p>`; }
    finally { $('#plot-run').disabled = false; }
  }
  function usersDeep(ci) {
    const out = new Set(); let front = [ci];
    for (let d = 0; d < 3; d++) { const next = [];
      DATA.items.forEach((it, idx) => { if (!out.has(idx) && (it.r || []).some(r => r[4].some(([ii]) => front.includes(ii)))) { out.add(idx); next.push(idx); } });
      front = next; }
    return [...out];
  }

  /* ---------- Îles : travailleurs ---------- */
  async function analyzeLaborers() {
    const p = engineProfile(prof());
    const city = $('#lab-city').value; const tier = +$('#lab-tier').value;
    const js = DATA.journals.filter(j => j.tier === tier && !j.id.includes('TROPHY') && j.butin.length);
    const ids = new Set();
    js.forEach(j => { ids.add(j.id + '_FULL'); ids.add(j.id + '_EMPTY'); j.butin.forEach(b => b.id && ids.add(b.id)); });
    $('#lab-run').disabled = true; $('#lab-out').innerHTML = '<p class="muted">Lecture des prix…</p>';
    try {
      const prices = await M.fetchPrices([...ids], [city]);
      const rows = js.map(j => {
        const val = E.journalValue(prices, j.id, city, p);
        const full = E.acquire(prices, j.id + '_FULL', city, p);
        const empty = E.dispose(prices, j.id + '_EMPTY', city, p);
        return { j, val, full, empty, buyFull: val != null && full != null ? val - full : null };
      }).sort((a, b) => (b.buyFull ?? -1e18) - (a.buyFull ?? -1e18));
      $('#lab-out').innerHTML = `<div class="scroll"><table><thead><tr><th>Carnet T${tier}</th><th class="r">Valeur du butin</th><th class="r">Carnet plein (achat)</th><th class="r">Gain en achetant le carnet plein</th><th class="r">Carnet vide (revente)</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${esc(DATA.items.find(i => i.id === r.j.id)?.n || r.j.id)}</td><td class="r">${fmt(r.val)}</td><td class="r">${fmt(r.full)}</td><td class="r ${r.buyFull > 0 ? 'pos' : 'neg'}">${fmt(r.buyFull)}</td><td class="r">${fmt(r.empty)}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="muted small">Valeur du butin = quantité de base du jeu × prix du jour, chances d'enchantement officielles. Le rendement réel dépend du bonheur et de la maison (non publié) : note tes premiers cycles dans Résultats pour le mesurer.</p>`;
    } catch (e) { $('#lab-out').innerHTML = `<p class="err">Échec de la lecture des prix : ${esc(e.message)}</p>`; }
    finally { $('#lab-run').disabled = false; }
  }

  /* ---------- Démarrage ---------- */
  function init() {
    $$('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
    showTab(store.get('ae.tab', 'today'));
    $('#run').addEventListener('click', analyze);
    $('#plan').addEventListener('click', e => { const b = e.target.closest('[data-start]'); if (b) startLine(b.dataset.start.startsWith('bm') ? b.dataset.start : +b.dataset.start); });
    $('#log').addEventListener('click', e => { const b = e.target.closest('[data-sold]'); if (b) sellEntry(b.dataset.sold); });
    $('#p-profile').addEventListener('change', e => { if (e.target.dataset.spec !== undefined) {
      const v = e.target.value; const s = Object.assign({}, prof().specs);
      if (v === '' || +v === 0) delete s[e.target.dataset.spec]; else s[e.target.dataset.spec] = Math.max(0, Math.min(100, +v));
      updateProf({ specs: s }); return; }
      if (e.target.id === 'pf-select') { profiles.active = e.target.value; saveProfiles(); renderProfile(); renderLog(); renderPlan(store.get('ae.lastPlan.' + profiles.active, null)); return; }
      if (e.target.closest('form')) readProfileForm(); });
    $('#spec-search').addEventListener('input', renderSpecs);
    $('#pf-new').addEventListener('click', () => {
      const name = ($('#pf-newname').value || '').trim();
      if (!name) { setStatus('Donne un nom au nouveau personnage.', 'warn'); return; }
      profiles.list[name] = Object.assign(JSON.parse(JSON.stringify(DEFAULT_PROFILE)), { name, presetApplied: true,
        specs: Object.assign({}, (window.ALBION_PRESET || {}).specs) });
      profiles.active = name; saveProfiles(); $('#pf-newname').value = ''; renderProfile();
    });
    $('#pf-export').addEventListener('click', exportProfile);
    $('#pf-import').addEventListener('click', importProfile);
    $('#lab-city').innerHTML = E.CITIES.map(c => `<option>${c}</option>`).join('');
    $('#lab-run').addEventListener('click', analyzeLaborers);
    $('#plot-run').addEventListener('click', analyzePlots);
    renderPlotForm();
    $('#log-clear').addEventListener('click', () => { const b = $('#log-clear');
      if (b.dataset.arm) { store.set(logKey(), []); renderLog(); delete b.dataset.arm; b.textContent = 'Effacer le journal'; }
      else { b.dataset.arm = '1'; b.textContent = 'Confirmer l\'effacement'; setTimeout(() => { delete b.dataset.arm; b.textContent = 'Effacer le journal'; }, 4000); } });
    $('#data-version').textContent = `${fmt(DATA.items.length)} objets · ${fmt(DATA.items.filter(i => i.r).length)} recettes · ${DATA.nodes.length} nœuds du Destiny Board · données du ${DATA.version.date || 'jeu'}`;
    renderProfile(); feeWarning(); renderLog();
    lastPlan = store.get('ae.lastPlan.' + profiles.active, null);
    renderPlan(lastPlan);
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
