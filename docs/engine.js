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
    function buyCities(craftCity, prof) { return prof.multiCity ? prof.cities : [craftCity]; }
    // prof.blackMarket : true (par défaut), false (exclu), 'only' (sortie Black Market de la semaine)
    function withBM(list, prof) {
      const bmOk = prof.blackMarket !== false && ((prof.cities || CITIES).includes('Caerleon') || list.includes('Caerleon'));
      if (prof.blackMarket === 'only') return bmOk ? ['Black Market'] : [];
      return bmOk ? list.concat('Black Market') : list;
    }
    function sellVenues(craftCity, prof) { return withBM(prof.multiCity ? prof.cities.slice() : [craftCity], prof); }
    const travelOf = (where, craftCity, prof) => (where === craftCity || (where === 'Black Market' && craftCity === 'Caerleon')) ? 0 : (prof.travelPct || 0);
    function bestBuy(prices, id, craftCity, prof) {
      let best = null;
      for (const c of buyCities(craftCity, prof)) {
        const p = acquire(prices, id, c, prof);
        if (p == null) continue;
        const eff = p * (1 + travelOf(c, craftCity, prof));
        if (!best || eff < best.price) best = { price: eff, city: c, raw: p };
      }
      return best;
    }
    function bestSell(prices, id, craftCity, prof) {
      let best = null;
      for (const v of sellVenues(craftCity, prof)) {
        const n = dispose(prices, id, v, prof);
        if (n == null) continue;
        const eff = n * (1 - travelOf(v, craftCity, prof));
        if (!best || eff > best.net) best = { venue: v, net: eff };
      }
      return best;
    }

    /* ---------- Chaînes de production : fabriquer un ingrédient au lieu de l'acheter ---------- */
    // makeCost : coût par unité d'un matériau produit soi-même dans la ville de craft (raffinage, transmutation),
    // ses propres ingrédients étant eux-mêmes achetés ou produits (3 niveaux au plus), sans focus (prudent).
    let MEMO = null, MEMO_KEY = null;
    function memo(prices, prof) {
      if (MEMO_KEY !== prices || MEMO_PROF !== prof) { MEMO = new Map(); MEMO_KEY = prices; MEMO_PROF = prof; }
      return MEMO;
    }
    let MEMO_PROF = null;
    function unitCost(prices, ii, city, prof, depth) {
      const b = bestBuy(prices, items[ii].id, city, prof);
      const m = prof.chains === false ? null : makeCost(prices, ii, city, prof, depth);
      if (m && (!b || m.cost < b.price)) return m;
      return b ? { cost: b.price, buy: b } : null;
    }
    function makeCost(prices, idx, city, prof, depth) {
      if (depth > 3) return null;
      const M = memo(prices, prof), key = idx + '|' + city + '|' + depth;
      if (M.has(key)) return M.get(key);
      M.set(key, null);                                   // garde-fou contre les boucles
      const item = items[idx];
      let best = null;
      for (const rec of item.r || []) {
        const kind = rec[3];
        if (kind !== 1 && kind !== 2) continue;           // seulement raffinage et transmutation
        const [silver, , amount, , ings] = rec;
        const R = rrr(productionBonus(item, kind, city, false, prof.dailyBonus && prof.dailyBonus[city]));
        let cost = silver || 0; const leaves = [], steps = [];
        let ok = true;
        for (const [ii, qty, noret] of ings) {
          const eff = noret ? qty : qty * (1 - R);
          const u = unitCost(prices, ii, city, prof, depth + 1);
          if (!u) { ok = false; break; }
          cost += eff * u.cost;
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
          best = { cost: per,
            leaves: leaves.map(l => Object.assign({}, l, { effQty: l.effQty / amount })),
            steps: steps.map(st => Object.assign({}, st, { qty: st.qty / amount }))
              .concat([{ id: item.id, name: item.n, tier: item.t, ench: item.e, kind, kindLabel: KIND_LABEL[kind], qty: 1 }]) };
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
      for (const [ii, qty, noret] of ings) {
        const ing = items[ii];
        const eff = noret ? qty : qty * (1 - R);
        const u = unitCost(prices, ii, city, prof, 1);
        if (!u) return null;
        cost += eff * u.cost;
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
      const focus = useFocus ? focusCost(focusBase, fpts) : 0;
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

    /* ---------- Toutes les opportunités ---------- */
    function opportunities(prices, prof, filter) {
      const out = [];
      const cities = prof.cities && prof.cities.length ? prof.cities : CITIES;
      items.forEach((item, idx) => {
        if (!item.tr) return;
        if (filter && !filter(item)) return;
        for (const city of cities) {
          if (item.r) {
            for (const rec of item.r) {
              const kind = rec[3];
              for (const f of kind === 2 ? [false] : [false, true]) {
                const o = evaluate(prices, idx, rec, kind, city, f, prof);
                // une variante au focus inaccessible avec le focus du jour est inutile
                if (o && f && !(o.focus <= (prof.focus || 0))) continue;
                if (o && o.profit > 0 && o.margin >= prof.minMargin) out.push(o);
              }
            }
          }
          if (item.up) {
            const o = evaluateUpgrade(prices, idx, city, prof);
            if (o && o.profit > 0 && o.margin >= prof.minMargin) out.push(o);
          }
        }
      });
      return out;
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
          for (const v of withBM(cities.filter(c => c !== city), prof)) {
            const n = dispose(prices, item.id, v, Object.assign({}, prof));
            if (n == null) continue;
            const net = n * (1 - travelOf(v, city, prof));
            if (!best || net > best.net) best = { venue: v, net };
          }
          if (!best) continue;
          const profit = best.net - buy;
          if (profit <= 0 || profit / buy < prof.minMargin) continue;
          out.push({ itemIdx: idx, id: item.id, name: item.n, tier: item.t, ench: item.e, kind: 4, kindLabel: KIND_LABEL[4],
            city, sellVenue: best.venue, useFocus: false, amount: 1, rrr: 0, cost: buy, revenue: best.net, profit,
            margin: profit / buy, focus: 0, unitSell: best.net, quality: item.q > 1, flip: true,
            ingredients: [{ id: item.id, name: item.n, qty: 1, price: buy, city, effQty: 1 }] });
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
          if (o && o.profit > 0 && o.margin >= prof.minMargin) out.push(o);
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
            const cap = h.p * (1 - f) * (1 - travelOf(x.venue, o.city, prof));
            const net = Math.min(x.net, cap); if (net < x.net) capped = true;
            revenue += x.units * net; outs.push(Object.assign({}, x, { net }));
          }
          const profit = revenue - o.cost;
          if (outs.length && profit > 0 && profit / o.cost >= prof.minMargin)
            out.push(Object.assign({}, o, { outputs: outs, revenue, unitSell: revenue, profit, margin: profit / o.cost, capped }));
          continue;
        }
        // vente
        let best = null;
        const venues = o.flip ? withBM(prof.cities.filter(v => v !== o.city), prof) : sellVenues(o.city, prof);
        for (const v of venues) {
          const h = H(o.id, v);
          if (!h || !(h.n > 0) || !(h.p > 0)) continue;
          const cur = dispose(prices, o.id, v, prof);
          if (cur == null) continue;
          const t = 1 - travelOf(v, o.city, prof);
          const f = v === 'Black Market' ? salesTax(prof) : fees;
          const net = Math.min(cur, h.p * (1 - f)) * t;
          if (!best || net > best.net) best = { venue: v, net, capped: cur > h.p * (1 - f) };
        }
        if (!best) continue;
        // achat
        const it = items[o.itemIdx];
        const R = o.rrr;
        let cost = o.cost, ok = true;
        const lines = o.ingredients.map(l => {
          let b = null;
          for (const c of (o.flip ? [o.city] : buyCities(o.city, prof))) {
            const h = H(l.id, c);
            if (!h || !(h.n > 0)) continue;
            const p = acquire(prices, l.id, c, prof);
            if (p == null) continue;
            const eff = p * (1 + travelOf(c, o.city, prof));
            if (!b || eff < b.eff) b = { eff, raw: p, city: c };
          }
          if (!b) { ok = false; return l; }
          const prevEff = l.price * (1 + travelOf(l.city || o.city, o.city, prof));
          cost += l.effQty * (b.eff - prevEff);
          return Object.assign({}, l, { price: b.raw, city: b.city });
        });
        if (!ok) continue;
        const revenue = best.net * o.amount, profit = revenue - cost;
        if (profit > 0 && profit / cost >= prof.minMargin)
          out.push(Object.assign({}, o, { sellVenue: best.venue, unitSell: best.net, revenue, cost, profit,
            margin: profit / cost, ingredients: lines, capped: best.capped }));
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
    function plan(opps, volumes, prof) {
      let capital = prof.capital, focus = prof.focus, minutes = prof.minutes;
      const capCap = prof.capital * prof.maxShare;
      const cand = [];
      for (const o of opps) {
        const n = maxCrafts(o, volumes, prof);
        if (n <= 0) continue;
        cand.push({ o, nMax: n });
      }
      // Le focus va d'abord là où il rapporte le plus PAR POINT, en gain par rapport à la même recette sans focus ;
      // ensuite le reste du temps et du capital va aux lignes sans focus les plus rentables.
      const noFocus = {};
      for (const c of cand) if (!c.o.useFocus) {
        const k = c.o.id + '|' + c.o.city;
        noFocus[k] = Math.max(noFocus[k] || 0, c.o.profit);
      }
      for (const c of cand) c.perFocus = c.o.useFocus ? (c.o.profit - (noFocus[c.o.id + '|' + c.o.city] || 0)) / c.o.focus : 0;
      const focusCand = cand.filter(c => c.o.useFocus && c.perFocus > 0).sort((a, b) => b.perFocus - a.perFocus);
      // Lignes sans focus : classées par profit rapporté à la part de capital ET de temps de session qu'elles consomment.
      // Avec peu de capital, une ligne qui rapporte beaucoup par argent investi passe devant une grosse ligne gourmande.
      const slots = Math.max(1, Math.floor(prof.minutes / prof.minutesPerLine));
      const capCapPlan = prof.capital * prof.maxShare;
      for (const c of cand) {
        const n0 = Math.max(0, Math.min(c.nMax, Math.floor(capCapPlan / c.o.cost)));
        c.score = n0 > 0 ? (n0 * c.o.profit) / ((n0 * c.o.cost) / Math.max(1, prof.capital) + 1 / slots) : 0;
      }
      const plainCand = cand.filter(c => !c.o.useFocus && c.score > 0).sort((a, b) => b.score - a.score);
      cand.length = 0; cand.push(...focusCand, ...plainCand);
      const chosen = [], usedKey = new Set(), left = {};
      for (const { o, nMax } of cand) {
        if (minutes < prof.minutesPerLine) break;
        const key = o.id;   // un objet = une seule ligne, dans sa meilleure ville
        if (usedKey.has(key)) continue;
        let n = nMax;
        // les ingrédients partagés entre plusieurs lignes se partagent aussi le volume du marché
        for (const l of o.ingredients) {
          if (l.effQty <= 0) continue;
          const bc = l.city || o.city, k = l.id + '|' + bc;
          if (!(k in left)) left[k] = volN(volumes[l.id] && volumes[l.id][bc]) * prof.liqShare;
          n = Math.min(n, Math.floor(left[k] / l.effQty));
        }
        n = Math.min(n, Math.floor(Math.min(capital, capCap) / o.cost));
        if (o.useFocus) n = Math.min(n, o.focus > 0 ? Math.floor(focus / o.focus) : n);
        if (n <= 0) continue;
        const line = Object.assign({}, o, { n, totalCost: n * o.cost, totalProfit: n * o.profit, totalFocus: n * o.focus });
        if (line.totalProfit < prof.minLineProfit) continue;
        for (const l of o.ingredients) left[l.id + '|' + (l.city || o.city)] -= l.effQty * n;
        chosen.push(line);
        usedKey.add(key);
        capital -= line.totalCost; focus -= line.totalFocus; minutes -= prof.minutesPerLine;
      }
      const total = chosen.reduce((s, l) => s + l.totalProfit, 0);
      return { lines: chosen, totalProfit: total, capitalUsed: prof.capital - capital, focusUsed: prof.focus - focus,
               minutesUsed: prof.minutes - minutes };
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
             maxCrafts, plan, applyHistory, flips, salvages, salvageEval, journalValue, acquire, dispose, bestBuy, bestSell, salesTax, CITIES, KIND_LABEL };
  }

  const api = { createEngine, CITIES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AlbionEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
