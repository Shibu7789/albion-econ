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
    multiCity: true, travelPct: 0.05, mode: 'instant', families: ['raff', 'pot', 'food', 'weap', 'arm', 'off', 'gear', 'up', 'trans'],
    maxAge: 12, liqShare: 0.15, maxShare: 0.25, minMargin: 0.05, minutes: 45, minutesPerLine: 5,
    minLineProfit: 10000, stationFee: {}, dailyBonus: {}, specs: {},
  };
  let profiles = store.get('ae.profiles', null);
  if (!profiles) profiles = { active: 'Principal', list: { Principal: JSON.parse(JSON.stringify(DEFAULT_PROFILE)) } };
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
  let lastPlan = null;
  function engineProfile(p) {
    return Object.assign({}, p, { capital: Math.max(0, (p.bank || 0) - (p.reserve || 0)) });
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
    try {
      const filt = itemFilter(p);
      const need = new Set();
      DATA.items.forEach(it => {
        if (!it.tr || !filt(it)) return;
        need.add(it.id);
        (it.r || []).forEach(r => r[4].forEach(([ii]) => need.add(DATA.items[ii].id)));
        if (it.up) { need.add(DATA.items[it.up[0]].id); it.up[1].forEach(([ii]) => need.add(DATA.items[ii].id)); }
      });
      const locs = p.cities.includes('Caerleon') ? p.cities.concat('Black Market') : p.cities.slice();
      setStatus(`Lecture des prix : ${need.size} objets, ${locs.length} marchés…`);
      const prices = await M.fetchPrices([...need], locs, { onProgress: (d, t) => setStatus(`Lecture des prix… ${d}/${t}`) });
      const opps = E.opportunities(prices, p, filt);
      opps.sort((a, b) => b.profit - a.profit);
      const top = opps.slice(0, 400);
      const vNeed = new Set();
      top.forEach(o => { vNeed.add(o.id); o.ingredients.forEach(l => vNeed.add(l.id)); });
      setStatus(`Lecture des volumes de vente : ${vNeed.size} objets…`);
      const volumes = await M.fetchVolumes([...vNeed], locs, { onProgress: (d, t) => setStatus(`Lecture des volumes… ${d}/${t}`) });
      lastPlan = E.plan(top, volumes, p);
      lastPlan.at = new Date().toISOString();
      lastPlan.considered = opps.length;
      store.set('ae.lastPlan.' + profiles.active, lastPlan);
      renderPlan(lastPlan);
      setStatus(`Analyse terminée : ${opps.length} opportunités rentables trouvées, ${lastPlan.lines.length} retenues.`, 'ok');
    } catch (e) {
      setStatus('Échec de la lecture des prix : ' + e.message + '. Vérifie ta connexion puis relance.', 'err');
    } finally { $('#run').disabled = false; }
  }

  function renderPlan(pl) {
    const box = $('#plan');
    if (!pl || !pl.lines.length) {
      box.innerHTML = `<div class="empty"><p>${pl ? 'Aucune ligne ne passe les filtres du jour (marge, liquidité, capital).' : 'Lance l\'analyse pour obtenir ta liste du jour.'}</p>
        <p class="muted">L'outil lit les prix en direct, calcule chaque recette dans tes villes et garde les meilleures lignes que tu peux faire en ${fmt(prof().minutes)} minutes.</p></div>`;
      $('#kpis').hidden = true; return;
    }
    $('#kpis').hidden = false;
    $('#k-profit').textContent = fmtK(pl.totalProfit);
    $('#k-capital').textContent = fmtK(pl.capitalUsed);
    $('#k-focus').textContent = fmt(pl.focusUsed);
    $('#k-time').textContent = fmt(pl.minutesUsed) + ' min';
    $('#k-at').textContent = new Date(pl.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    const byCity = {};
    pl.lines.forEach((l, i) => { (byCity[l.city] = byCity[l.city] || []).push([l, i]); });
    const p = prof();
    box.innerHTML = Object.entries(byCity).map(([city, ls]) => `
      <section class="city"><h3>Crafter à ${esc(city)} <span class="muted">${ls.length} ligne${ls.length > 1 ? 's' : ''}</span></h3>
      ${ls.map(([l, i]) => lineHTML(l, i, p)).join('')}</section>`).join('');
  }

  function lineHTML(l, i, p) {
    const buyVerb = p.mode === 'orders' ? 'Poser un ordre d\'achat' : 'Acheter';
    const sellVerb = p.mode === 'orders' ? 'Poser un ordre de vente' : 'Vendre directement';
    const ench = l.ench ? '.' + l.ench : '';
    const ings = l.ingredients.map(g => `<li><span class="q">${fmt(Math.ceil(g.effQty * l.n))}</span> ${esc(g.name)} <span class="muted">à ${fmt(g.price)} max${g.city && g.city !== l.city ? ' · <b>' + esc(g.city) + '</b>' : ''}</span></li>`).join('');
    return `<article class="line" data-i="${i}">
      <header><label class="chk"><input type="checkbox" id="done-${i}"> <span class="kind">${esc(l.kindLabel)}</span></label>
        <h4>${esc(l.name)} <span class="tier">T${l.tier}${ench}</span></h4>
        <div class="gain"><b>+${fmtK(l.totalProfit)}</b><span class="muted">marge ${Math.round(l.margin * 100)} %</span></div></header>
      <ol class="steps">
        <li><b>${buyVerb}</b><ul>${ings}</ul></li>
        ${l.kind === 3 ? `<li><b>Améliorer</b> ${fmt(l.n)} fois à la station de la pièce</li>`
          : `<li><b>${l.kind === 2 ? 'Transmuter' : l.kind === 1 ? 'Raffiner' : 'Crafter'}</b> ${fmt(l.n)} fois${l.useFocus ? ` <span class="pill focus">focus ${fmt(l.totalFocus)}</span>` : ''}
          ${l.rrr ? `<span class="muted">retour de ressources ${Math.round(l.rrr * 1000) / 10} %</span>` : ''}</li>`}
        <li><b>${sellVerb}</b> ${fmt(l.n * l.amount)} × à ${fmt(l.unitSell / (1 - E.salesTax(p) - (p.mode === 'orders' ? DATA.consts.setupFee : 0)))} <span class="muted">${l.sellVenue === 'Black Market' ? 'au Black Market (Caerleon)' : l.sellVenue !== l.city ? '<b>à ' + esc(l.sellVenue) + '</b>' : ''}</span>${l.quality ? ' <span class="pill">bonus si meilleure qualité</span>' : ''}</li>
      </ol>
      <footer><span class="muted">Investissement ${fmtK(l.totalCost)}</span>
        <label class="real">Encaissé réel <input type="number" inputmode="numeric" id="real-${i}" placeholder="argent reçu"></label>
        <button class="ghost" data-log="${i}">Noter</button></footer></article>`;
  }

  /* ---------- Journal des résultats ---------- */
  const logKey = () => 'ae.log.' + profiles.active;
  function logLine(i) {
    const l = lastPlan && lastPlan.lines[i]; if (!l) return;
    const v = +$('#real-' + i).value;
    if (!$('#real-' + i).value) { setStatus('Indique l\'argent réellement reçu avant de noter.', 'warn'); return; }
    const log = store.get(logKey(), []);
    log.push({ date: new Date().toISOString(), item: l.name + (l.ench ? ' .' + l.ench : ''), city: l.city, kind: l.kindLabel,
      n: l.n, cost: l.totalCost, expected: l.totalProfit, real: v - l.totalCost, received: v, focus: l.totalFocus });
    store.set(logKey(), log);
    $('#done-' + i).checked = true;
    setStatus('Résultat noté.', 'ok'); renderLog();
  }
  function renderLog() {
    const log = store.get(logKey(), []);
    const box = $('#log');
    if (!log.length) { box.innerHTML = '<p class="muted">Aucun résultat noté. Après chaque ligne faite, indique l\'argent reçu dans « Encaissé réel » : l\'outil compare alors le prévu et le réel.</p>'; $('#log-sum').textContent = ''; return; }
    const days = {};
    log.forEach(r => { const d = r.date.slice(0, 10); (days[d] = days[d] || { real: 0, exp: 0, n: 0 }); days[d].real += r.real; days[d].exp += r.expected; days[d].n++; });
    const dk = Object.keys(days).sort().reverse();
    const avg = dk.reduce((s, d) => s + days[d].real, 0) / dk.length;
    const tot = log.reduce((s, r) => ({ real: s.real + r.real, exp: s.exp + r.expected }), { real: 0, exp: 0 });
    $('#log-sum').innerHTML = `<b>${fmtK(avg)}</b> de profit réel par jour en moyenne sur ${dk.length} jour${dk.length > 1 ? 's' : ''} · réalisé ${tot.exp ? Math.round(tot.real / tot.exp * 100) : 0} % du prévu`;
    box.innerHTML = `<div class="scroll"><table><thead><tr><th>Jour</th><th>Lignes</th><th class="r">Prévu</th><th class="r">Réel</th><th class="r">Écart</th></tr></thead><tbody>
      ${dk.map(d => `<tr><td>${new Date(d).toLocaleDateString('fr-FR')}</td><td>${days[d].n}</td><td class="r">${fmtK(days[d].exp)}</td><td class="r">${fmtK(days[d].real)}</td><td class="r ${days[d].real >= days[d].exp ? 'pos' : 'neg'}">${fmtK(days[d].real - days[d].exp)}</td></tr>`).join('')}
      </tbody></table></div>
      <details><summary>Détail des lignes (${log.length})</summary><div class="scroll"><table><thead><tr><th>Date</th><th>Objet</th><th>Ville</th><th class="r">Prévu</th><th class="r">Réel</th></tr></thead><tbody>
      ${log.slice().reverse().map(r => `<tr><td>${new Date(r.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td><td>${esc(r.item)}</td><td>${esc(r.city)}</td><td class="r">${fmtK(r.expected)}</td><td class="r">${fmtK(r.real)}</td></tr>`).join('')}
      </tbody></table></div></details>`;
  }

  /* ---------- Profil : formulaire ---------- */
  function renderProfile() {
    const p = prof();
    $('#pf-select').innerHTML = Object.keys(profiles.list).map(n => `<option ${n === profiles.active ? 'selected' : ''}>${esc(n)}</option>`).join('');
    $('#pf-premium').checked = !!p.premium;
    $('#pf-focus').value = p.focus; $('#pf-bank').value = p.bank; $('#pf-reserve').value = p.reserve;
    $('#pf-mode').value = p.mode; $('#pf-minutes').value = p.minutes;
    $('#pf-multi').checked = !!p.multiCity; $('#pf-travel').value = Math.round((p.travelPct || 0) * 1000) / 10;
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
  function readProfileForm() {
    updateProf({
      premium: $('#pf-premium').checked, focus: +$('#pf-focus').value || 0, bank: +$('#pf-bank').value || 0,
      reserve: +$('#pf-reserve').value || 0, mode: $('#pf-mode').value,
      multiCity: $('#pf-multi').checked, travelPct: (+$('#pf-travel').value || 0) / 100, minutes: +$('#pf-minutes').value || 45,
      cities: $$('#pf-cities input:checked').map(i => i.value), families: $$('#pf-families input:checked').map(i => i.value),
      stationFee: Object.fromEntries($$('[data-fee]').filter(i => i.value !== '').map(i => [i.dataset.fee, +i.value])),
      dailyBonus: Object.fromEntries($$('[data-daily]').filter(i => i.value !== '' && +i.value > 0)
        .map(i => [i.dataset.daily, { pct: +i.value / 100, cat: $(`[data-dailycat="${i.dataset.daily}"]`).value || null }])),
      maxAge: +$('#pf-maxAge').value || 12, liqShare: (+$('#pf-liqShare').value || 15) / 100,
      maxShare: (+$('#pf-maxShare').value || 25) / 100, minMargin: (+$('#pf-minMargin').value || 0) / 100,
      minutesPerLine: +$('#pf-minutesPerLine').value || 5, minLineProfit: +$('#pf-minLineProfit').value || 0,
    });
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
      return `<details ${q ? 'open' : ''}><summary>${esc(name)} <span class="muted">${filled}/${ns.length} renseignés</span></summary>
        <div class="specgrid">${vis.map(n => `<label class="field"><span>${esc(n.n)}</span><input type="number" min="0" max="100" data-spec="${n.id}" value="${p.specs[n.id] ?? ''}" placeholder="0"></label>`).join('')}</div></details>`;
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
    try {
      const obj = JSON.parse(decodeURIComponent(escape(atob($('#pf-code').value.trim()))));
      const name = obj.name || profiles.active;
      profiles.list[name] = Object.assign(JSON.parse(JSON.stringify(DEFAULT_PROFILE)), obj);
      profiles.active = name; saveProfiles(); renderProfile(); feeWarning();
      setStatus(`Profil « ${name} » importé.`, 'ok');
    } catch (e) { setStatus('Code de profil illisible : recopie-le en entier.', 'err'); }
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
    $('#plan').addEventListener('click', e => { const b = e.target.closest('[data-log]'); if (b) logLine(+b.dataset.log); });
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
      profiles.list[name] = Object.assign(JSON.parse(JSON.stringify(DEFAULT_PROFILE)), { name });
      profiles.active = name; saveProfiles(); $('#pf-newname').value = ''; renderProfile();
    });
    $('#pf-export').addEventListener('click', exportProfile);
    $('#pf-import').addEventListener('click', importProfile);
    $('#lab-city').innerHTML = E.CITIES.map(c => `<option>${c}</option>`).join('');
    $('#lab-run').addEventListener('click', analyzeLaborers);
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
