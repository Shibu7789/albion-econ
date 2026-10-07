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

  const KIND_LABEL = ['Craft', 'Raffinage', 'Transmutation', 'Amélioration'];
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
      if (prof.mode === 'orders') {
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
    function sellVenues(craftCity, prof) {
      const base = prof.multiCity ? prof.cities.slice() : [craftCity];
      if (base.includes('Caerleon')) base.push('Black Market');
      return base;
    }
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
      for (const [ii, qty, noret] of ings) {
        const ing = items[ii];
        const b = bestBuy(prices, ing.id, city, prof);
        if (!b) return null;
        const eff = noret ? qty : qty * (1 - R);
        cost += eff * b.price;
        lines.push({ id: ing.id, name: ing.n, qty, price: b.raw, city: b.city, effQty: eff });
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
        margin: cost > 0 ? (revenue - cost) / cost : 0, focus, ingredients: lines,
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

    /* ---------- Liquidité : nombre maximal de crafts ---------- */
    // volumes : { [id]: { [city]: ventes moyennes par jour } }
    function maxCrafts(o, volumes, prof) {
      const vol = (id, c) => (volumes[id] && volumes[id][c]) || 0;
      let n = Math.floor(vol(o.id, o.sellVenue) * prof.liqShare / o.amount);
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
      cand.sort((a, b) => b.o.profit * b.nMax - a.o.profit * a.nMax);
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
          if (!(k in left)) left[k] = ((volumes[l.id] && volumes[l.id][bc]) || 0) * prof.liqShare;
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
             maxCrafts, plan, journalValue, acquire, dispose, bestBuy, bestSell, salesTax, CITIES, KIND_LABEL };
  }

  const api = { createEngine, CITIES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AlbionEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
