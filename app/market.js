/* Lecture des prix et volumes depuis l'Albion Online Data Project (serveur Europe).
 * Fonctionne depuis un navigateur (l'API autorise les appels d'autres sites).
 * Les prix sont des relevés partagés par les joueurs : leur âge est conservé et affiché.
 */
(function (root) {
  'use strict';
  const BASE = 'https://europe.albion-online-data.com/api/v2/stats';
  const MAX_URL = 3800;

  function ageHours(dateStr, now) {
    if (!dateStr || dateStr.startsWith('0001')) return Infinity;
    const t = Date.parse(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
    return isNaN(t) ? Infinity : (now - t) / 3.6e6;
  }

  function batches(ids, prefix, suffix) {
    const out = []; let cur = [];
    let len = prefix.length + suffix.length;
    for (const id of ids) {
      const add = encodeURIComponent(id).length + 1;
      if (cur.length && len + add > MAX_URL) { out.push(cur); cur = []; len = prefix.length + suffix.length; }
      cur.push(id); len += add;
    }
    if (cur.length) out.push(cur);
    return out;
  }

  async function getJSON(url, fetchImpl, tries = 4) {
    for (let k = 0; k < tries; k++) {
      const r = await fetchImpl(url);
      if (r.status === 429) { await new Promise(s => setTimeout(s, 4000 * (k + 1))); continue; }
      if (!r.ok) throw new Error('API ' + r.status);
      return r.json();
    }
    throw new Error('API saturée (trop de requêtes), réessaie dans quelques minutes');
  }

  async function runPool(tasks, conc, onProgress) {
    let done = 0, i = 0; const res = new Array(tasks.length);
    async function worker() {
      while (i < tasks.length) { const k = i++; res[k] = await tasks[k](); done++; onProgress && onProgress(done, tasks.length); }
    }
    await Promise.all(Array.from({ length: Math.min(conc, tasks.length) }, worker));
    return res;
  }

  // -> { [id]: { [city]: {sell, sellAge, buy, buyAge, q:{2..5: sell}} } }
  async function fetchPrices(ids, cities, opts = {}) {
    const f = opts.fetch || root.fetch.bind(root);
    const now = opts.now || Date.now();
    const loc = encodeURIComponent(cities.join(','));
    const suffix = `.json?locations=${loc}&qualities=${opts.qualities || '1'}`;
    const prefix = BASE + '/prices/';
    const tasks = batches(ids, prefix, suffix).map(b => () => getJSON(prefix + b.map(encodeURIComponent).join(',') + suffix, f));
    const results = await runPool(tasks, 3, opts.onProgress);
    const out = {};
    for (const arr of results) for (const r of arr) {
      const o = (out[r.item_id] = out[r.item_id] || {});
      const c = (o[r.city] = o[r.city] || { sell: 0, sellAge: Infinity, buy: 0, buyAge: Infinity, q: {} });
      if (r.quality === 1 || !r.quality) {
        c.sell = r.sell_price_min; c.sellAge = ageHours(r.sell_price_min_date, now);
        c.buy = r.buy_price_max; c.buyAge = ageHours(r.buy_price_max_date, now);
      } else if (r.sell_price_min > 0) {
        c.q[r.quality] = { sell: r.sell_price_min, age: ageHours(r.sell_price_min_date, now) };
      }
    }
    return out;
  }

  // -> { [id]: { [city]: { n: ventes moyennes par jour, p: prix moyen payé } } }  (7 derniers jours)
  async function fetchVolumes(ids, cities, opts = {}) {
    const f = opts.fetch || root.fetch.bind(root);
    const loc = encodeURIComponent(cities.join(','));
    const suffix = `.json?locations=${loc}&time-scale=24&qualities=1`;
    const prefix = BASE + '/history/';
    const tasks = batches(ids, prefix, suffix).map(b => () => getJSON(prefix + b.map(encodeURIComponent).join(',') + suffix, f));
    const results = await runPool(tasks, 2, opts.onProgress);
    const out = {};
    for (const arr of results) for (const r of arr) {
      const d = (r.data || []).slice(-7);
      if (!d.length) continue;
      const cnt = d.reduce((s, x) => s + (x.item_count || 0), 0);
      const val = d.reduce((s, x) => s + (x.item_count || 0) * (x.avg_price || 0), 0);
      // n = ventes moyennes par jour ; p = prix moyen réellement payé sur 7 jours
      (out[r.item_id] = out[r.item_id] || {})[r.location] = { n: cnt / 7, p: cnt ? val / cnt : 0 };
    }
    return out;
  }

  const api = { fetchPrices, fetchVolumes, ageHours, batches };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AlbionMarket = api;
})(typeof window !== 'undefined' ? window : globalThis);
