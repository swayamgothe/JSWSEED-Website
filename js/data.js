/* Loads the dashboard data from Supabase and rebuilds the same structure that
   dashboard_data.json had, so app.js needs no other change. */
(function () {
  'use strict';
  const by = (a, b) => (a.sort || 0) - (b.sort || 0);

  /* pure function: Supabase rows -> dashboard data object */
  function buildD(t) {
    const z = t.zones[0];
    if (!z) throw new Error('Zone not found in Supabase');
    const D = {
      meta: { title: z.title, subtitle: z.subtitle, unit: z.unit, prodWord: z.prod_word, prodName: z.prod_name, source: z.source, updated: z.updated },
      contributors: t.contributors.slice().sort(by).map(c => ({ key: c.key, short: c.short, long: c.long_name, driver: c.driver, remark: c.remark, color: c.color })),
      extraRemarks: z.extra_remarks || [],
      kpis: t.kpis.slice().sort(by).map(k => ({ key: k.key, name: k.name, uom: k.uom, better: k.better, dec: k.dec })),
      years: []
    };
    t.fiscal_years.slice().sort(by).forEach(fy => {
      const y = { id: fy.id, label: fy.label, months: fy.months, plants: {} };
      if (fy.annual) y.annual = true;
      if (fy.note) y.note = fy.note;
      const n = fy.months.length;
      t.plants.filter(p => p.year_id === fy.id).sort(by).forEach(p => {
        y.plants[p.key] = { name: p.name, group: p.grp, net: Array(n).fill(null), plan: Array(n).fill(0), co2: {}, kpi: {},
          targets: p.targets, prevYear: p.prev_year, history: p.history || {}, remarks: {} };
      });
      t.monthly.filter(r => r.year_id === fy.id).forEach(r => {
        const P = y.plants[r.plant]; if (!P) return;
        P.net[r.month_idx] = r.net; P.plan[r.month_idx] = r.plan;
        Object.keys(r.co2 || {}).forEach(c => { (P.co2[c] = P.co2[c] || Array(n).fill(null))[r.month_idx] = r.co2[c]; });
        Object.keys(r.kpi || {}).forEach(k => { (P.kpi[k] = P.kpi[k] || Array(n).fill(null))[r.month_idx] = r.kpi[k]; });
      });
      t.remarks.filter(r => r.year_id === fy.id).forEach(r => {
        const P = y.plants[r.plant]; if (!P) return;
        ((P.remarks[r.month_label] = P.remarks[r.month_label] || {})[r.param]) = { right: r.right_txt || '', wrong: r.wrong_txt || '' };
      });
      D.years.push(y);
    });
    return D;
  }

  async function getAll(cfg, table, zone) {           // pages of 1000 rows
    const out = []; let from = 0;
    for (;;) {
      const q = table === 'zones' ? `id=eq.${encodeURIComponent(zone)}` : `zone=eq.${encodeURIComponent(zone)}`;
      const res = await fetch(`${cfg.url}/rest/v1/${table}?${q}&select=*`, {
        headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey, Range: `${from}-${from + 999}` } });
      if (!res.ok) throw new Error(`Supabase ${table}: HTTP ${res.status} ${await res.text()}`);
      const rows = await res.json(); out.push(...rows);
      if (rows.length < 1000) return out; from += 1000;
    }
  }

  window.loadDashboardData = async function () {
    const cfg = window.SUPABASE_CONFIG || {};
    if (!cfg.url || !cfg.anonKey) {                    // not configured -> old behaviour (local JSON file)
      const res = await fetch('dashboard_data.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }
    const zone = new URLSearchParams(location.search).get('zone') || cfg.zone;
    const names = ['zones', 'contributors', 'kpis', 'fiscal_years', 'plants', 'monthly', 'remarks'];
    const rows = await Promise.all(names.map(n => getAll(cfg, n, zone)));
    const t = {}; names.forEach((n, i) => { t[n] = rows[i]; });
    return buildD(t);
  };
  window.__buildD = buildD;                            // for testing
})();
