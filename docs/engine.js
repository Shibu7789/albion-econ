/* Moteur de calcul de l'économie Albion — sans DOM, testable sous Node.
 *
 * Règles (cf. rapport « Économie d'Albion Online — fonctionnement complet ») :
 *  - RRR = B / (1 + B)  (formule vérifiée)
 *  - coût de focus = base × 0,5^(FCE / 10 000)  (donnée officielle)
 *  - FCE = Σ niveau(nœud) × points par niveau  (Destiny Board officiel)
 *  - taxe de vente 8 % (4 % Premium), frais d'ordre 2,5 % (officiel ; 4 % Premium = source tierce)
 *  - revenu calculé sur la qualité Normale uniquement (plancher) ; le bonus de qualité est affiché à part
 *  - frais de station : valeur d'objet × 0,1125 × prix/100 (HYPOTHÈSE à confirmer)
 * Aucune valeur de jeu n'est écrite ici : tout vient de ALBION_DATA ou du profil.
 */
(function (root) {
  'use strict';

  const KIND_LABEL = ['Craft', 'Raffinage', 'Transmutation', 'Amélioration', 'Revente', 'Recyclage'];
  const CITIES = ['Thetford', 'Lymhurst', 'Bridgewatch', 'Martlock', 'Fort Sterling', 'Caerleon', 'Brecilien'];

  function createEngine(DATA) {
    const items = DATA.items;
    const index = new Map(items.map((it, i) => [it.id, i]));
    const C = DATA.consts;

    /* ---------- Spécialisation ---------- */
    function fce(itemIdx, specs, type) {
      const b = DATA.bonus[itemIdx];
      if (!b) return 0;
      let s = 0;
      for (const [ni, pts, t] of b) {
        if (t !== type) continue;
        const lvl = specs[DATA.nodes[ni].id] || 0;
        s += lvl * pts;
      }
      return s;
    }
    function focusCost(base, fcePoints) { return base * Math.pow(0.5, fcePoints / 10000); }

    /* ---------- Retour de ressources ---------- */
    function rrr(bonus) { return bonus > 0 ? bonus / (1 + bonus) : 0; }
    function productionBonus(item, kind, city, useFocus, dailyBonus) {
      const c = DATA.cities[city];
      if (!c) return 0;
      if (kind === 2 || kind === 3) return 0;               // transmutation, amélioration : aucun retour
      let b = kind === 1 ? c.raff : c.craft;
      if (item.cc && c.spe[item.cc]) b += c.spe[item.cc];
      if (useFocus) b += C.focusBonus;
      // bonus du jour : { pct, cat } — ne s'applique qu'à la catégorie annoncée en jeu pour cette ville
      if (dailyBonus && dailyBonus.pct && (!dailyBonus.cat || dailyBonus.cat === item.cc)) b += dailyBonus.pct;
      return b;
    }

    /* ---------- Prix ---------- */
    // prices : { [id]: { [city]: { sell, sellAge, buy, buyAge, q: {2: sell, ...} } } }   (âges en heures)
    function priceOf(prices, id, city, side, maxAge) {
      const p = prices[id] && prices[id][city];
      if (!p) return null;
      if (side === 'sell') return p.sell > 0 && p.sellAge <= maxAge ? p.sell : null;
      return p.buy > 0 && p.buyAge <= maxAge ? p.buy : null;
    }
    // Prix payé pour acquérir 1 ingrédient
    function acquire(prices, id, city, prof) {
      if (prof.mode === 'orders') {
        const b = priceOf(prices, id, city, 'buy', prof.maxAge);
        return b == null ? null : b * (1 + C.setupFee);
      }
      return priceOf(prices, id, city, 'sell', prof.maxAge);
    }
    function salesTax(prof) { return prof.premium ? C.salesTax / 2 : C.salesTax; }
    // Argent net reçu pour 1 unité vendue
    function dispose(prices, id, city, prof) {
      const tax = salesTax(prof);
      // le Black Market n'accepte pas d'ordres de vente : on lui vend toujours directement
      if (prof.mode === 'orders' && city !== 'Black Market') {
        const s = priceOf(prices, id, city, 'sell', prof.maxAge);
        return s == null ? null : s * (1 - tax - C.setupFee);
      }
      const b = priceOf(prices, id, city, 'buy', prof.maxAge);
      return b == null ? null : b * (1 - tax);
    }

    /* ---------- Villes d'achat et de vente ---------- */
    // multiCity : acheter chaque ingrédient dans la ville la moins chère et vendre dans la meilleure,
    // en payant le transport (Travel Planner) au taux du profil sur la marchandise déplacée.
    // Le Travel Planner ne relie que les 5 villes royales : Caerleon et Brecilien se rejoignent à pied (zones risquées).
    // Hors sortie hebdomadaire, une marchandise ne voyage donc qu'entre villes royales.
    const ROYAL = new Set(['Thetford', 'Lymhurst', 'Bridgewatch', 'Martlock', 'Fort Sterling']);
    function linked(a, b, prof) {
      if (a === b) return true;
      if (b === 'Black Market') return a === 'Caerleon' || prof.blackMarket === 'only';
      return ROYAL.has(a) && ROYAL.has(b);
    }
    function buyCities(craftCity, prof) { return prof.multiCity ? prof.cities.filter(c => linked(c, craftCity, prof)) : [craftCity]; }
    // prof.blackMarket : true (par défaut), false (exclu), 'only' (sortie Black Market de la semaine)
    function withBM(list, prof) {
      const bmOk = prof.blackMarket !== false && ((prof.cities || CITIES).includes('Caerleon') || list.includes('Caerleon'));
      if (prof.blackMarket === 'only') return bmOk ? ['Black Market'] : [];
      return bmOk ? list.concat('Black Market') : list;
    }
    function sellVenues(craftCity, prof) {
      return withBM(prof.multiCity ? prof.cities.slice() : [craftCity], prof).filter(v => linked(craftCity, v, prof));
    }
    // Coût du Travel Planner par unité transportée (formule publiée par Albion Free Market, attributs officiels) :
    // arrondi_sup(poids × facteur de voyage × 150 × multiplicateur serveur) × distance
    // distance = 1 entre villes royales voisines, 2 sinon. Multiplicateur serveur : inconnu pour l'Europe (profil, défaut 1).
    const ADJ = new Set(['Thetford|Fort Sterling', 'Fort Sterling|Lymhurst', 'Lymhurst|Bridgewatch', 'Bridgewatch|Martlock', 'Martlock|Thetford']);
    function tcost(id, a, b, prof) {
      if (!a || !b || a === b || a === 'Île' || b === 'Île') return 0;
      if (!(ROYAL.has(a) && ROYAL.has(b))) return 0;              // trajet à pied (sortie hebdomadaire) : pas de frais
      const it = items[index.get(id)]; if (!it) return 0;
      const dist = ADJ.has(a + '|' + b) || ADJ.has(b + '|' + a) ? 1 : 2;
      const mult = prof.travelMult != null ? prof.travelMult : 1;
      return Math.ceil((it.w || 0) * (it.ft || 1) * 150 * mult) * dist;
    }
    function bestBuy(prices, id, craftCity, prof) {
      let best = null;
      for (const c of buyCities(craftCity, prof)) {
        const p = acquire(prices, id, c, prof);
        if (p == null) continue;
        const eff = p + tcost(id, c, craftCity, prof);
        if (!best || eff < best.price) best = { price: eff, city: c, raw: p };
      }
      return best;
    }
    function bestSell(prices, id, craftCity, prof) {
      let best = null;
      for (const v of sellVenues(craftCity, prof)) {
        const n = dispose(prices, id, v, prof);
        if (n == null) continue;
        const eff = n - tcost(id, craftCity, v, prof);
        if (!best || eff > best.net) best = { venue: v, net: eff };
      }
      return best;
    }

    /* ---------- Chaînes de production : fabriquer un ingrédient au lieu de l'acheter ---------- */
    // makeCost : coût par unité d'un ingrédient produit soi-même dans la ville de craft (raffinage, transmutation, craft),
    // ses propres ingrédients étant eux-mêmes achetés ou produits (3 niveaux au plus), sans focus (prudent).
    let MEMO = null, MEMO_KEY = null;
    function memo(prices, prof) {
      if (MEMO_KEY !== prices || MEMO_PROF !== prof) { MEMO = new Map(); MEMO_KEY = prices; MEMO_PROF = prof; }
      return MEMO;
    }
    let MEMO_PROF = null;
    function unitCost(prices, ii, city, prof, depth, withFocus) {
      // prix imposé (ex. récolte de l'île au coût des graines) : traité comme un achat « sur l'île »
      const ov = prof.override && prof.override[items[ii].id];
      if (ov != null) return { cost: ov, buy: { price: ov, raw: ov, city: 'Île' } };
      const b = bestBuy(prices, items[ii].id, city, prof);
      const m = prof.chains === false ? null : makeCost(prices, ii, city, prof, depth, withFocus);
      if (m && (!b || m.cost < b.price)) return m;
      return b ? { cost: b.price, buy: b } : null;
    }
    function makeCost(prices, idx, city, prof, depth, withFocus) {
      if (depth > 3) return null;
      const M = memo(prices, prof), key = idx + '|' + city + '|' + depth + '|' + (withFocus ? 1 : 0);
      if (M.has(key)) return M.get(key);
      M.set(key, null);                                   // garde-fou contre les boucles
      const item = items[idx];
      let best = null;
      for (const rec of item.r || []) {
        const kind = rec[3];
        // raffinage, transmutation et craft d'ingrédients (extraits, sauces, alcool, pain, beurre, viande…)
        const [silver, focusBase, amount, , ings] = rec;
        const f = withFocus && focusBase > 0;
        const R = rrr(productionBonus(item, kind, city, f, prof.dailyBonus && prof.dailyBonus[city]));
        let cost = silver || 0, focus = f ? focusCost(focusBase, fce(idx, prof.specs, 'f')) : 0;
        const leaves = [], steps = [];
        let ok = true;
        for (const [ii, qty, noret] of ings) {
          const eff = noret ? qty : qty * (1 - R);
          const u = unitCost(prices, ii, city, prof, depth + 1, withFocus);
          if (!u) { ok = false; break; }
          cost += eff * u.cost;
          focus += eff * (u.focus || 0);
          if (u.buy) leaves.push({ id: items[ii].id, name: items[ii].n, price: u.buy.raw, city: u.buy.city, effQty: eff });
          else {
            u.leaves.forEach(l => leaves.push(Object.assign({}, l, { effQty: l.effQty * eff })));
            u.steps.forEach(st => steps.push(Object.assign({}, st, { qty: st.qty * eff })));
          }
        }
        if (!ok) continue;
        cost += stationFee(item, amount, city, prof);
        const per = cost / amount;
        if (!best || per < best.cost) {
          best = { cost: per, focus: focus / amount,
            leaves: leaves.map(l => Object.assign({}, l, { effQty: l.effQty / amount })),
            steps: steps.map(st => Object.assign({}, st, { qty: st.qty / amount }))
              .concat([{ id: item.id, name: item.n, tier: item.t, ench: item.e, kind, kindLabel: KIND_LABEL[kind], qty: 1, focus: f }]) };
        }
      }
      M.set(key, best);
      return best;
    }

    // regroupe les achats identiques (même objet, même ville) et les étapes identiques
    function mergeLines(lines) {
      const m = new Map();
      for (const l of lines) { const k = l.id + '|' + l.city; const x = m.get(k); if (x) { x.effQty += l.effQty; x.qty += l.qty; } else m.set(k, Object.assign({}, l)); }
      return [...m.values()];
    }
    function mergeSteps(steps) {
      const m = new Map();
      for (const st of steps) { const x = m.get(st.id); if (x) x.qty += st.qty; else m.set(st.id, Object.assign({}, st)); }
      return [...m.values()].sort((a, b) => a.tier - b.tier || a.ench - b.ench);
    }

    /* ---------- Évaluation d'une recette dans une ville ---------- */
    function stationFee(item, amount, city, prof) {
      // prix saisi par le joueur, sinon le plafond officiel (maxuseagefee) : estimation prudente
      const saisi = prof.stationFee && prof.stationFee[city];
      const per100 = saisi != null ? saisi : C.maxStationFee;
      if (!item.v || !per100) return 0;
      return item.v * amount * C.nutritionFactor * per100 / 100;
    }

    function evaluate(prices, itemIdx, recipe, kind, city, useFocus, prof) {
      const item = items[itemIdx];
      const [silver, focusBase, amount, , ings] = recipe;
      if (useFocus && !(focusBase > 0)) return null;
      const B = productionBonus(item, kind, city, useFocus, prof.dailyBonus && prof.dailyBonus[city]);
      const R = rrr(B);
      let cost = silver || 0;
      const lines = [];
      const chain = [];
      let chainFocus = 0;
      for (const [ii, qty, noret] of ings) {
        const ing = items[ii];
        const eff = noret ? qty : qty * (1 - R);
        const u = unitCost(prices, ii, city, prof, 1, useFocus === 'all');
        if (!u) return null;
        cost += eff * u.cost;
        chainFocus += eff * (u.focus || 0);
        if (u.buy) lines.push({ id: ing.id, name: ing.n, qty, price: u.buy.raw, city: u.buy.city, effQty: eff });
        else {
          u.leaves.forEach(l => lines.push(Object.assign({}, l, { qty: l.effQty * eff, effQty: l.effQty * eff })));
          u.steps.forEach(st => chain.push(Object.assign({}, st, { qty: st.qty * eff })));
        }
      }
      cost += stationFee(item, amount, city, prof);
      const best = bestSell(prices, item.id, city, prof);
      if (!best) return null;
      const revenue = best.net * amount;
      const fpts = useFocus ? fce(itemIdx, prof.specs, 'f') : 0;
      const focus = (useFocus ? focusCost(focusBase, fpts) : 0) + chainFocus;
      if (useFocus === 'all' && !(chainFocus > 0)) return null;    // rien à focaliser en amont : doublon de « final »
      return {
        itemIdx, id: item.id, name: item.n, tier: item.t, ench: item.e, kind, kindLabel: KIND_LABEL[kind],
        city, sellVenue: best.venue, useFocus, amount, rrr: R, cost, revenue, profit: revenue - cost,
        margin: cost > 0 ? (revenue - cost) / cost : 0, focus, ingredients: mergeLines(lines), chain: mergeSteps(chain),
        unitSell: best.net, quality: item.q > 1,
      };
    }

    function evaluateUpgrade(prices, itemIdx, city, prof) {
      const item = items[itemIdx];
      if (!item.up) return null;
      const [fromIdx, ings] = item.up;
      const from = items[fromIdx];
      const bf = bestBuy(prices, from.id, city, prof);
      if (!bf) return null;
      let cost = bf.price;
      const lines = [{ id: from.id, name: from.n, qty: 1, price: bf.raw, city: bf.city, effQty: 1 }];
      for (const [ii, qty] of ings) {
        const b = bestBuy(prices, items[ii].id, city, prof);
        if (!b) return null;
        cost += qty * b.price;
        lines.push({ id: items[ii].id, name: items[ii].n, qty, price: b.raw, city: b.city, effQty: qty });
      }
      const bs = bestSell(prices, item.id, city, prof);
      if (!bs) return null;
      const net = bs.net;
      return {
        itemIdx, id: item.id, name: item.n, tier: item.t, ench: item.e, kind: 3, kindLabel: KIND_LABEL[3],
        city, sellVenue: bs.venue, useFocus: false, amount: 1, rrr: 0, cost, revenue: net, profit: net - cost,
        margin: (net - cost) / cost, focus: 0, ingredients: lines, unitSell: net, quality: item.q > 1,
      };
    }

    /* ---------- Trajets : villes à visiter en plus de la ville de craft ---------- */
    function withTrips(o, prof) {
      const c = new Set();
      for (const l of o.ingredients) if (l.city && l.city !== o.city && l.city !== 'Île') c.add(l.city);
      for (const v of (o.outputs ? o.outputs.map(x => x.venue) : [o.sellVenue]))
        if (v && v !== o.city && !(v === 'Black Market' && o.city === 'Caerleon')) c.add(v);
      o.trips = [...c];
      o.minutes = (prof.minutesPerLine || 5) + (prof.travelMinutes != null ? prof.travelMinutes : 5) * c.size;
      return o;
    }

    /* ---------- Toutes les opportunités ---------- */
    function opportunities(prices, prof, filter) {
      const out = [];
      const profLocal = Object.assign({}, prof, { multiCity: false });
      const cities = prof.cities && prof.cities.length ? prof.cities : CITIES;
      items.forEach((item, idx) => {
        if (!item.tr) return;
        if (filter && !filter(item)) return;
        for (const city of cities) {
          if (item.r) {
            for (const rec of item.r) {
              const kind = rec[3];
              // deux versions : tout sur place, et achats/vente répartis entre villes reliées
              for (const pv of prof.multiCity ? [profLocal, prof] : [profLocal]) {
                for (const f of kind === 2 ? [false] : [false, true, 'all']) {
                  const o = evaluate(prices, idx, rec, kind, city, f, pv);
                  // une variante au focus inaccessible avec le focus du jour est inutile
                  if (o && f && !(o.focus <= (prof.focus || 0))) continue;
                  if (!o || !(o.profit > 0) || o.margin < prof.minMargin) continue;
                  withTrips(o, prof);
                  if (pv === profLocal) o.local = true; else if (!o.trips.length) continue;   // doublon de la version sur place
                  out.push(o);
                }
              }
            }
          }
          if (item.up) {
            const o = evaluateUpgrade(prices, idx, city, prof);
            if (o && o.profit > 0 && o.margin >= prof.minMargin) out.push(withTrips(o, prof));
          }
        }
      });
      return out;
    }

    /* ---------- Îles : rentabilité d'une parcelle ---------- */
    // Pour une culture : récolte par parcelle et par jour, coût des graines (moins celles récupérées),
    // puis meilleur usage : vente brute, ou ingrédient d'une chaîne jusqu'au produit fini.
    // params : { seedPrice: {tier: prix}, seedsPerPlot, baseYield, premiumFactor, islandCities: [...] }
    const usedBy = new Map();
    items.forEach((it, idx) => (it.r || []).forEach(r => r[4].forEach(([ii]) => {
      if (!usedBy.has(ii)) usedBy.set(ii, new Set()); usedBy.get(ii).add(idx); })));
    function usersOf(ii, depth) {
      const out = new Set(); let front = [ii];
      for (let d = 0; d < depth; d++) {
        const next = [];
        for (const x of front) for (const u of usedBy.get(x) || []) if (!out.has(u)) { out.add(u); next.push(u); }
        front = next;
      }
      return [...out];
    }
    function plotValue(prices, volumes, prof, params) {
      const rows = [];
      for (const pl of DATA.farm.filter(f => f.type === 'plant')) {
        const crop = pl.recolte && pl.recolte[0]; if (!crop) continue;
        const cropIdx = index.get(crop.id); if (cropIdx == null) continue;
        const seedPrice = params.seedPrice[pl.tier];
        if (!(seedPrice > 0)) continue;
        for (const isle of params.islandCities) {
          const fb = (DATA.farmBonus.find(b => b.lieu === isle && b.objet === pl.id) || {}).bonus_ile || 0;
          const perSeed = params.baseYield * (1 + fb) * params.premiumFactor;          // récolte par graine
          const perPlotDay = params.seedsPerPlot * perSeed;                            // récolte par parcelle et par jour
          const seedCostDay = params.seedsPerPlot * seedPrice * (1 - (pl.retour_graine_chance || 0));
          const grow = seedCostDay / perPlotDay;                                       // coût d'une unité récoltée
          const pOv = Object.assign({}, prof, { override: { [crop.id]: grow } });
          // usage 1 : vente brute (meilleure ville autorisée)
          const raw = bestSell(prices, crop.id, prof.cities[0], Object.assign({}, prof, { multiCity: true }));
          let best = raw ? { label: 'Vendre la récolte brute', venue: raw.venue, perUnit: raw.net - grow, unitsDay: Infinity } : null;
          // usage 2 : meilleure recette (jusqu'à 3 niveaux) qui consomme la récolte
          for (const u of usersOf(cropIdx, 3)) {
            const it = items[u]; if (!it.tr || !it.r) continue;
            for (const city of prof.cities) for (const rec of it.r) {
              const o = evaluate(prices, u, rec, rec[3], city, false, pOv);
              if (!o || !(o.profit > 0)) continue;
              const leaf = o.ingredients.find(l => l.id === crop.id && l.city === 'Île');
              if (!leaf || !(leaf.effQty > 0)) continue;
              const perUnit = o.profit / leaf.effQty;
              const h = volumes[o.id] && volumes[o.id][o.sellVenue];
              const sold = h ? (typeof h === 'object' ? h.n : h) : 0;
              const unitsDay = sold * prof.liqShare / o.amount * leaf.effQty;           // récolte absorbable par le marché du produit
              if (unitsDay <= 0) continue;
              if (!best || perUnit > best.perUnit)
                best = { label: `${KIND_LABEL[o.kind]} ${o.name}${o.ench ? ' .' + o.ench : ''}`, venue: o.sellVenue, city, perUnit, unitsDay, opp: o };
            }
          }
          if (!best) continue;
          rows.push({ seed: pl.id, crop: crop.id, cropName: items[cropIdx].n, tier: pl.tier, isle, perPlotDay, grow,
            use: best.label, venue: best.venue, craftCity: best.city, perUnit: best.perUnit,
            perPlotDayNet: perPlotDay * best.perUnit,
            maxPlots: isFinite(best.unitsDay) ? best.unitsDay / perPlotDay : Infinity, opp: best.opp });
        }
      }
      return rows.sort((a, b) => b.perPlotDayNet - a.perPlotDayNet);
    }

    /* ---------- Revente entre villes (sans craft) ---------- */
    // Acheter un objet dans une ville, le revendre dans une autre (ou au Black Market depuis Caerleon).
    // city = ville d'achat ; le transport est compté sur la marchandise déplacée.
    function flips(prices, prof, filter) {
      const out = [];
      const cities = prof.cities && prof.cities.length ? prof.cities : CITIES;
      items.forEach((item, idx) => {
        if (!item.tr || (filter && !filter(item)) || !prices[item.id]) return;
        for (const city of cities) {
          const buy = acquire(prices, item.id, city, prof);
          if (buy == null) continue;
          let best = null;
          for (const v of withBM(cities.filter(c => c !== city), prof).filter(v => linked(city, v, prof))) {
            const n = dispose(prices, item.id, v, Object.assign({}, prof));
            if (n == null) continue;
            const net = n - tcost(item.id, city, v, prof);
            if (!best || net > best.net) best = { venue: v, net };
          }
          if (!best) continue;
          const profit = best.net - buy;
          if (profit <= 0 || profit / buy < prof.minMargin) continue;
          out.push({ itemIdx: idx, id: item.id, name: item.n, tier: item.t, ench: item.e, kind: 4, kindLabel: KIND_LABEL[4],
            city, sellVenue: best.venue, useFocus: false, amount: 1, rrr: 0, cost: buy, revenue: best.net, profit,
            margin: profit / buy, focus: 0, unitSell: best.net, quality: item.q > 1, flip: true,
            ingredients: [{ id: item.id, name: item.n, qty: 1, price: buy, city, effQty: 1 }] });
          withTrips(out[out.length - 1], prof);
        }
      });
      return out;
    }

    /* ---------- Recyclage ---------- */
    // Acheter un objet recyclable et revendre ce que le recyclage rend : 20 % de chaque ingrédient de la recette
    // (réglage officiel), × facteur propre à l'objet. L'argent rendu en plus n'est pas compté (formule inconnue).
    // Arrondi : 'exact' (fraction moyenne, prudent) ou 'ceil' (arrondi supérieur, si constaté en jeu).
    function salvageUnits(qty, f, amount, prof) {
      const u = qty * C.salvageResource * f / (amount || 1);
      return prof.salvageRound === 'ceil' ? Math.ceil(u - 1e-9) : u;
    }
    function salvageEval(prices, idx, city, prof) {
      const item = items[idx];
      const [f, amount, ings] = item.sv;
      const buy = acquire(prices, item.id, city, prof);
      if (buy == null) return null;
      let revenue = 0; const outputs = [];
      for (const [ii, qty, noret] of ings) {
        if (noret) continue;                            // artefacts, cœurs… : non comptés (prudence)
        const units = salvageUnits(qty, f, amount, prof);
        if (units <= 0) continue;
        const b = bestSell(prices, items[ii].id, city, prof);
        if (!b) continue;
        revenue += units * b.net;
        outputs.push({ id: items[ii].id, name: items[ii].n, units, venue: b.venue, net: b.net });
      }
      if (!outputs.length) return null;
      const profit = revenue - buy;
      return { itemIdx: idx, id: item.id, name: item.n, tier: item.t, ench: item.e, kind: 5, kindLabel: KIND_LABEL[5],
        city, sellVenue: outputs[0].venue, useFocus: false, amount: 1, rrr: 0, cost: buy, revenue, profit,
        margin: profit / buy, focus: 0, unitSell: revenue, quality: false, salvage: true, outputs,
        ingredients: [{ id: item.id, name: item.n, qty: 1, price: buy, city, effQty: 1 }] };
    }
    function salvages(prices, prof) {
      const out = [];
      const cities = prof.cities && prof.cities.length ? prof.cities : CITIES;
      items.forEach((item, idx) => {
        if (!item.tr || !item.sv || !prices[item.id]) return;
        for (const city of cities) {
          const o = salvageEval(prices, idx, city, prof);
          if (o && o.profit > 0 && o.margin >= prof.minMargin) out.push(withTrips(o, prof));
        }
      });
      return out;
    }

    /* ---------- Garde-fou : prix de vente plafonné au prix moyen payé sur 7 jours ---------- */
    // Un ordre de vente isolé très au-dessus du marché (ou un vieux relevé) ne doit pas créer une fausse opportunité.
    const volN = v => v == null ? 0 : (typeof v === 'object' ? v.n : v);
    // Pour chaque opportunité : on refait le choix des villes avec l'historique des 7 jours.
    //  - vente : dans la ville où le prix (plafonné au prix moyen payé) est le meilleur, s'il s'y vend quelque chose ;
    //  - achat : chaque ingrédient dans la ville la moins chère où il s'échange réellement.
    function applyHistory(opps, volumes, prices, prof) {
      const out = [];
      const fees = salesTax(prof) + (prof.mode === 'orders' ? C.setupFee : 0);
      const H = (id, c) => { const h = volumes[id] && volumes[id][c]; return h && typeof h === 'object' ? h : null; };
      for (const o of opps) {
        if (o.salvage) {
          // achat : l'objet doit s'échanger dans la ville ; ventes : chaque matière plafonnée à son prix moyen payé
          const hb = H(o.id, o.city);
          if (!hb || !(hb.n > 0)) continue;
          let revenue = 0, capped = false;
          const outs = [];
          for (const x of o.outputs) {
            const h = H(x.id, x.venue);
            if (!h || !(h.n > 0) || !(h.p > 0)) continue;
            const f = x.venue === 'Black Market' ? salesTax(prof) : fees;
            const cap = h.p * (1 - f) - tcost(x.id, o.city, x.venue, prof);
            const net = Math.min(x.net, cap); if (net < x.net) capped = true;
            revenue += x.units * net; outs.push(Object.assign({}, x, { net }));
          }
          const profit = revenue - o.cost;
          if (outs.length && profit > 0 && profit / o.cost >= prof.minMargin)
            out.push(withTrips(Object.assign({}, o, { outputs: outs, revenue, unitSell: revenue, profit, margin: profit / o.cost, capped }), prof));
          continue;
        }
        // vente
        let best = null;
        const pv = o.local ? Object.assign({}, prof, { multiCity: false }) : prof;
        const venues = o.flip ? withBM(prof.cities.filter(v => v !== o.city), prof).filter(v => linked(o.city, v, prof)) : sellVenues(o.city, pv);
        for (const v of venues) {
          const h = H(o.id, v);
          if (!h || !(h.n > 0) || !(h.p > 0)) continue;
          const cur = dispose(prices, o.id, v, prof);
          if (cur == null) continue;
          const f = v === 'Black Market' ? salesTax(prof) : fees;
          const net = Math.min(cur, h.p * (1 - f)) - tcost(o.id, o.city, v, prof);
          if (!best || net > best.net) best = { venue: v, net, capped: cur > h.p * (1 - f) };
        }
        if (!best) continue;
        // achat
        const it = items[o.itemIdx];
        const R = o.rrr;
        let cost = o.cost, ok = true;
        const lines = o.ingredients.map(l => {
          let b = null;
          for (const c of (o.flip || o.local ? [o.city] : buyCities(o.city, prof))) {
            const h = H(l.id, c);
            if (!h || !(h.n > 0)) continue;
            const p = acquire(prices, l.id, c, prof);
            if (p == null) continue;
            const eff = p + tcost(l.id, c, o.city, prof);
            if (!b || eff < b.eff) b = { eff, raw: p, city: c };
          }
          if (!b) { ok = false; return l; }
          const prevEff = l.price + tcost(l.id, l.city || o.city, o.city, prof);
          cost += l.effQty * (b.eff - prevEff);
          return Object.assign({}, l, { price: b.raw, city: b.city });
        });
        if (!ok) continue;
        const revenue = best.net * o.amount, profit = revenue - cost;
        if (profit > 0 && profit / cost >= prof.minMargin)
          out.push(withTrips(Object.assign({}, o, { sellVenue: best.venue, unitSell: best.net, revenue, cost, profit,
            margin: profit / cost, ingredients: lines, capped: best.capped }), prof));
      }
      return out;
    }

    /* ---------- Liquidité : nombre maximal de crafts ---------- */
    // volumes : { [id]: { [city]: ventes moyennes par jour } }
    function maxCrafts(o, volumes, prof) {
      const vol = (id, c) => volN(volumes[id] && volumes[id][c]);
      let n = o.salvage ? Infinity : Math.floor(vol(o.id, o.sellVenue) * prof.liqShare / o.amount);
      if (o.salvage) for (const x of o.outputs) n = Math.min(n, Math.floor(vol(x.id, x.venue) * prof.liqShare / x.units));
      for (const l of o.ingredients) {
        if (l.effQty <= 0) continue;
        n = Math.min(n, Math.floor(vol(l.id, l.city || o.city) * prof.liqShare / l.effQty));
      }
      return Math.max(0, n);
    }

    /* ---------- Planificateur ---------- */
    // Choisit les lignes du jour sous contraintes : capital, focus, temps, diversification.
    // Planificateur : la session se construit ligne par ligne, comme une tournée.
    //  - temps d'une ligne = temps de base + un trajet par ville PAS ENCORE visitée dans la session ;
    //  - pour chaque objet, la meilleure version faisable (sur place / multi-villes, avec ou sans focus) ;
    //  - classement par profit rapporté à la ressource la plus consommée (temps ou capital) : quand le temps
    //    limite, c'est l'argent par minute qui décide ; le focus n'est qu'une limite (il se recharge chaque jour).
    function plan(opps, volumes, prof) {
      let capital = prof.capital, focus = prof.focus, minutes = prof.minutes;
      const capCap = prof.capital * prof.maxShare;
      const travel = prof.travelMinutes != null ? prof.travelMinutes : 5;
      const byItem = new Map();
      for (const o of opps) {
        const nMax = maxCrafts(o, volumes, prof);
        if (nMax <= 0) continue;
        if (!byItem.has(o.id)) byItem.set(o.id, []);
        byItem.get(o.id).push({ o, nMax });
      }
      const chosen = [], left = {}, visited = new Set();
      const leftOf = (id, c) => { const k = id + '|' + c; if (!(k in left)) left[k] = volN(volumes[id] && volumes[id][c]) * prof.liqShare; return k; };
      function size(o, nMax) {
        let n = nMax;
        for (const l of o.ingredients) {
          if (l.effQty <= 0 || l.city === 'Île') continue;
          n = Math.min(n, Math.floor(left[leftOf(l.id, l.city || o.city)] / l.effQty));
        }
        n = Math.min(n, Math.floor(Math.min(capital, capCap) / o.cost));
        if (o.useFocus) n = Math.min(n, o.focus > 0 ? Math.floor(focus / o.focus) : n);
        return Math.max(0, n);
      }
      function minutesOf(o) {
        const need = new Set([o.city, ...(o.trips || [])]);
        let fresh = 0; for (const c of need) if (!visited.has(c)) fresh++;
        if (!visited.size) fresh = Math.max(0, fresh - 1);           // la première ville de la session est gratuite
        return (prof.minutesPerLine || 5) + travel * fresh;
      }
      for (;;) {
        let pick = null;
        for (const [id, vars] of byItem) {
          let bestV = null;
          for (const { o, nMax } of vars) {
            const n = size(o, nMax); if (n <= 0) continue;
            const P = n * o.profit; if (P < prof.minLineProfit) continue;
            const mins = minutesOf(o); if (mins > minutes) continue;
            const score = P / Math.max(mins / Math.max(1, prof.minutes), (n * o.cost) / Math.max(1, prof.capital));
            if (!bestV || score > bestV.score) bestV = { o, n, P, mins, score };
          }
          if (!bestV) continue;
          if (!pick || bestV.score > pick.score) pick = Object.assign(bestV, { id });
        }
        if (!pick) break;
        const { o, n, mins } = pick;
        for (const l of o.ingredients) if (l.city !== 'Île') left[leftOf(l.id, l.city || o.city)] -= l.effQty * n;
        chosen.push(Object.assign({}, o, { n, totalCost: n * o.cost, totalProfit: n * o.profit, totalFocus: n * o.focus,
          minutes: mins, perMinute: n * o.profit / mins }));
        visited.add(o.city); (o.trips || []).forEach(c => visited.add(c));
        capital -= n * o.cost; focus -= n * o.focus; minutes -= mins;
        byItem.delete(pick.id);
      }
      const total = chosen.reduce((s, l) => s + l.totalProfit, 0);
      return { lines: chosen, totalProfit: total, capitalUsed: prof.capital - capital, focusUsed: prof.focus - focus,
               minutesUsed: prof.minutes - minutes, route: [...visited] };
    }

    /* ---------- Travailleurs ---------- */
    // Valeur espérée du butin d'un carnet plein, au prix du jour (quantité de base du jeu).
    function journalValue(prices, journalId, city, prof) {
      const j = DATA.journals.find(x => x.id === journalId);
      if (!j) return null;
      const tot = j.butin.reduce((s, b) => s + (b.poids || 0), 0);
      let v = 0;
      for (const b of j.butin) {
        const w = (b.poids || 0) / tot;
        if (b.argent) { v += w * b.argent; continue; }
        const p = dispose(prices, b.id, city, prof);
        if (p == null) return null;
        v += w * (b.qte || 1) * p;
      }
      return b_amount(j) * v;
    }
    function b_amount(j) { return j.butin.some(b => b.argent) ? 1 : j.quantite_base; }

    return { items, index, fce, focusCost, rrr, productionBonus, evaluate, evaluateUpgrade, opportunities,
             maxCrafts, plan, applyHistory, tcost, plotValue, flips, salvages, salvageEval, journalValue, acquire, dispose, bestBuy, bestSell, salesTax, CITIES, KIND_LABEL };
  }

  const api = { createEngine, CITIES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AlbionEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
