/* =====================================================================
   JSW SEED Monthly tracking Dashboard  -  app.js
   One file for BOTH pages:
     login.html  (data-page="login")      -> email + password sign-in
     index.html  (data-page="dashboard")  -> the dashboard
   Data comes from dashboard_data.json (same folder as index.html).
   ===================================================================== */
(function () {
  'use strict';

  /* ===================================================================
     1.  LOGIN SETTINGS  (edit here)
     -------------------------------------------------------------------
     Passwords are NOT stored in plain text. Each user has a SHA-256 hash
     of   JSW-SEED-v1:<email in lowercase>:<password>
     To add a user: open login.html, press F12 -> Console, type
         makeHash('name@jsw.in','TheirPassword')
     and paste the result below.

     DEMO LOGIN  ->  seed.admin@jsw.in   /   JSWseed@2026   (CHANGE IT!)

     IMPORTANT: this is a front-end only login. It keeps casual visitors
     out, but anyone who can open the files can read this list. For real
     protection put the site behind your company SSO / a server login.
     =================================================================== */
  const AUTH = {
    salt: 'JSW-SEED-v1',
    allowedEmailDomain: '',            // e.g. 'jsw.in'   ('' = any domain)
    sessionHours: 12,
    users: [
      { email: 'seed.admin@jsw.in', hash: '51a3ea4d962150edbcadcf8a4b0e8e012695e576b52c6f8f917a778f0700f49e' }
    ]
  };
  const SESSION_KEY = 'jsw_seed_session';

  async function sha256Hex(text) {
    if (!(window.crypto && crypto.subtle)) {
      throw new Error('Secure context needed. Open the site via http://localhost (not by double-clicking the file).');
    }
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  window.makeHash = async function (email, password) {
    const h = await sha256Hex(`${AUTH.salt}:${String(email).trim().toLowerCase()}:${password}`);
    console.log(h); return h;
  };

  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.email || Date.now() > s.expires) { clearSession(); return null; }
      return s;
    } catch (e) { return null; }
  }
  function saveSession(email, keep) {
    const s = { email, expires: Date.now() + AUTH.sessionHours * 3600 * 1000 };
    clearSession();
    (keep ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(s));
  }
  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }

  /* ===================================================================
     2.  LOGIN PAGE
     =================================================================== */
  function initLogin() {
    if (getSession()) { location.replace('index.html'); return; }
    const form = document.getElementById('loginForm');
    const err = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');
    const pw = document.getElementById('password');
    document.getElementById('togglePw').addEventListener('click', function () {
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      this.textContent = show ? 'Hide' : 'Show';
    });
    const showErr = m => { err.textContent = m; err.style.display = 'block'; };

    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      err.style.display = 'none';
      const email = document.getElementById('email').value.trim().toLowerCase();
      const password = pw.value;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showErr('Please enter a valid email ID.');
      if (!password) return showErr('Please enter your password.');
      if (AUTH.allowedEmailDomain && !email.endsWith('@' + AUTH.allowedEmailDomain.toLowerCase())) {
        return showErr('Please use your @' + AUTH.allowedEmailDomain + ' email ID.');
      }
      btn.disabled = true; btn.textContent = 'Signing in…';
      try {
        const h = await sha256Hex(`${AUTH.salt}:${email}:${password}`);
        const ok = AUTH.users.some(u => u.email.toLowerCase() === email && u.hash === h);
        if (!ok) { showErr('Incorrect email ID or password.'); }
        else { saveSession(email, document.getElementById('remember').checked); location.replace('index.html'); return; }
      } catch (e) { showErr(e.message); }
      btn.disabled = false; btn.textContent = 'Sign in';
    });
  }

  /* ===================================================================
     3.  DASHBOARD
     =================================================================== */
  const COL = { navy: '#1b2a41', teal: '#0e7c86', red: '#c0392b', green: '#1e8449', blue: '#2e86c1', blueDark: '#1b4f72', blueLight: '#a9cce3', redBar: '#e74c3c', greenBar: '#27ae60' };
  const PLANT_COLORS = ['#1b4f72', '#2e86c1', '#48c9b0', '#f5b041', '#af7ac5', '#e67e22', '#7f8c8d', '#c0392b'];
  let D = null;                 // loaded JSON
  const S = { year: null, plant: 'ALL', month: 0, kpi: 'SolidFuel' };
  const charts = {};

  /* ---------- small helpers ---------- */
  const $ = id => document.getElementById(id);
  const sum = a => a.reduce((x, y) => x + (y || 0), 0);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n, d = 1) => (n == null || isNaN(n)) ? '–' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const sgn = (n, d = 1) => { if (n == null || isNaN(n)) return '–'; const r = Number(n.toFixed(d)); return r === 0 ? num(0, d) : (r > 0 ? '+' : '-') + num(Math.abs(r), d); };
  const pct = (n, d = 1) => (n == null || isNaN(n)) ? '–' : (n > 0 ? '+' : n < 0 ? '-' : '') + (Math.abs(n) * 100).toFixed(d) + '%';
  const pctPlain = (n, d = 0) => (n * 100).toFixed(d) + '%';
  const cls = (v, eps = 0.05) => v > eps ? 'bad' : v < -eps ? 'good' : '';
  const CO2 = 'CO₂';

  /* ---------- model ---------- */
  const yearObj = () => D.years.find(y => y.id === S.year);
  const plantKeys = () => Object.keys(yearObj().plants);
  const selPlants = () => (S.plant === 'ALL' ? plantKeys() : [S.plant]);
  const plantTitle = () => (S.plant === 'ALL' ? 'All Plants (' + plantKeys().join(', ') + ')' : S.plant);

  /* aggregate one month for a set of plants (weighted by tonnes, like the Excel) */
  function agg(plants, mi) {
    const y = yearObj();
    const o = { net: 0, plan: 0, c: {}, t: {} };
    D.contributors.forEach(k => { o.c[k.key] = 0; o.t[k.key] = 0; });
    plants.forEach(p => {
      const P = y.plants[p];
      const plan = P.plan[mi] || 0;
      o.plan += plan;
      D.contributors.forEach(k => { o.t[k.key] += (P.targets.co2[k.key] || 0) * plan / 1000; });
      const n = P.net[mi];
      if (n > 0) { o.net += n; D.contributors.forEach(k => { o.c[k.key] += P.co2[k.key][mi] || 0; }); }
    });
    o.has = o.net > 0;
    o.co2 = sum(Object.values(o.c));
    o.tgtCo2 = sum(Object.values(o.t));
    o.int = o.has ? o.co2 / o.net * 1000 : 0;
    o.tgt = o.plan > 0 ? o.tgtCo2 / o.plan * 1000 : 0;
    return o;
  }
  function ytd(plants, mi) {
    const r = { net: 0, plan: 0, co2: 0, tgtCo2: 0 };
    for (let i = 0; i <= mi; i++) {
      const a = agg(plants, i);
      if (a.has) { r.net += a.net; r.plan += a.plan; r.co2 += a.co2; r.tgtCo2 += a.tgtCo2; }
    }
    r.has = r.net > 0;
    r.int = r.has ? r.co2 / r.net * 1000 : 0;
    r.tgt = r.plan > 0 ? r.tgtCo2 / r.plan * 1000 : 0;
    r.gap = r.has ? r.int - r.tgt : 0;
    r.excess = r.gap * r.net / 1000;
    return r;
  }
  function kpiAt(plants, key, mi) {
    const y = yearObj(); let w = 0, s = 0;
    plants.forEach(p => { const P = y.plants[p]; const v = P.kpi[key][mi]; const n = P.net[mi]; if (v != null && n > 0) { s += v * n; w += n; } });
    return w > 0 ? s / w : 0;
  }
  function kpiTarget(plants, key) {
    const y = yearObj();
    if (plants.length === 1) return y.plants[plants[0]].targets.kpi[key] || 0;
    let s = 0, w = 0;
    plants.forEach(p => { const P = y.plants[p]; const t = P.targets.kpi[key]; if (t != null) { const pl = sum(P.plan); s += t * pl; w += pl; } });
    return w > 0 ? s / w : 0;
  }
  const latestMonth = () => {
    const y = yearObj(); let last = 0;
    y.months.forEach((m, i) => { if (agg(plantKeys(), i).has) last = i; });
    return last;
  };

  /* ---------- the big calculation (everything the dashboard shows) ---------- */
  function calc() {
    const y = yearObj(), plants = selPlants(), mi = S.month, pi = mi - 1;
    const A = agg(plants, mi);
    const B = pi >= 0 ? agg(plants, pi) : null;
    const hasPrev = !!(A.has && B && B.has);
    const Y = ytd(plants, mi);
    const prevLabel = pi >= 0 ? y.months[pi] : 'n/a';
    const M = {
      y, plants, mi, pi, A, B, Y, hasPrev, prevLabel, label: y.months[mi],
      gap: A.has ? A.int - A.tgt : 0,
      dPrev: hasPrev ? A.int - B.int : 0,
      prodPlan: A.plan > 0 ? A.net / A.plan : 0,
      prodChg: hasPrev && B.net > 0 ? A.net / B.net - 1 : 0,
      co2Chg: hasPrev ? A.co2 - B.co2 : 0
    };
    M.gapPct = A.tgt > 0 ? M.gap / A.tgt : 0;
    M.dPrevPct = hasPrev && B.int > 0 ? M.dPrev / B.int : 0;
    M.co2ChgPct = hasPrev && B.co2 > 0 ? M.co2Chg / B.co2 : 0;
    M.excess = M.gap * A.net / 1000;

    /* KPI table */
    M.kpis = D.kpis.map(k => {
      const cur = kpiAt(plants, k.key, mi), prev = pi >= 0 ? kpiAt(plants, k.key, pi) : 0, tgt = kpiTarget(plants, k.key);
      const hasT = tgt > 0, hasC = cur > 0;
      const gap = hasC && hasT ? cur - tgt : 0;
      const dir = k.better === 'higher' ? 1 : -1;
      let status = 'n/a';
      if (hasC && hasT) status = (dir * gap >= 0) ? 'On target' : 'Off target';
      return { k, cur, prev, tgt, hasC, hasT, gap, gapPct: hasC && hasT ? gap / tgt : 0, status };
    });
    const kv = key => M.kpis.find(x => x.k.key === key);

    /* contributor / gap rows */
    M.rows = D.contributors.map(c => {
      const cur = A.has ? A.c[c.key] / A.net * 1000 : 0;
      const prev = hasPrev ? B.c[c.key] / B.net * 1000 : 0;
      const tgt = A.plan > 0 ? A.t[c.key] / A.plan * 1000 : 0;
      const d = hasPrev ? cur - prev : 0;
      const g = A.has ? cur - tgt : 0;
      const row = { c, cur, prev, tgt, d, g, drv: null, expl: '' };
      if (c.driver) {
        const kk = kv(c.driver);
        const dcur = kk.cur, dprev = kk.prev;
        row.drv = { k: kk.k, cur: dcur, prev: dprev, tgt: kk.tgt, ok: dcur > 0 && dprev > 0, chg: dcur > 0 && dprev > 0 ? dcur / dprev - 1 : 0 };
      }
      row.expl = explain(row, M, kv);
      return row;
    });
    M.rowsTotal = {
      cur: sum(M.rows.map(r => r.cur)), prev: sum(M.rows.map(r => r.prev)), tgt: sum(M.rows.map(r => r.tgt)),
      d: sum(M.rows.map(r => r.d)), g: sum(M.rows.map(r => r.g))
    };
    M.narr = narratives(M);

    /* monthly series for charts */
    M.series = y.months.map((m, i) => {
      const a = agg(plants, i);
      return { m, has: a.has, net: a.net, plan: a.plan, co2: a.co2, int: a.has ? a.int : null, tgt: a.tgt, atTgt: a.has ? a.tgt * a.net / 1000 : null,
        c: D.contributors.map(c => a.has ? a.c[c.key] / a.net * 1000 : null) };
    });
    M.kpiSeries = y.months.map((m, i) => { const v = kpiAt(plants, S.kpi, i); return v > 0 ? v : null; });
    M.kpiSel = kv(S.kpi);

    /* all plants table */
    const pk = plantKeys();
    const fyPlan = sum(pk.map(p => sum(y.plants[p].plan)));
    const build = (label, ps) => {
      const a = agg(ps, mi), b = pi >= 0 ? agg(ps, pi) : null, yy = ytd(ps, mi);
      const prevYear = sum(ps.map(p => (y.plants[p].prevYear || 0) * sum(y.plants[p].plan))) / (sum(ps.map(p => sum(y.plants[p].plan))) || 1);
      return { label, a, yy, gap: a.has ? a.int - a.tgt : 0, d: a.has && b && b.has ? a.int - b.int : null, prevYear, key: ps.length === 1 ? ps[0] : 'ALL' };
    };
    M.plantRows = pk.map(p => build(p, [p]));
    M.plantTotal = build('Total', pk);
    M.plantRows.forEach(r => { r.share = M.plantTotal.a.co2 > 0 ? r.a.co2 / M.plantTotal.a.co2 : 0; });
    M.plantTotal.share = M.plantTotal.a.has ? 1 : 0;
    M.plantMonthCo2 = pk.map(p => y.months.map((m, i) => { const n = y.plants[p].net[i]; return n > 0 ? sum(D.contributors.map(c => y.plants[p].co2[c.key][i])) : null; }));
    M.fyPlan = fyPlan;
    return M;
  }

  /* ---------- auto explanations ---------- */
  function explain(row, M, kv) {
    const { A, B, hasPrev, mi } = M;
    if (!A.has) return 'No data for this month.';
    if (mi === 0) return 'First month of the year - no earlier month to compare.';
    if (!B || !B.has) return 'No data for previous month.';
    const d = row.d;
    if (Math.abs(d) < 0.3) return `No material change (${sgn(d)} kg/t).`;
    let s = d > 0 ? `${CO2} UP ${num(d)} kg/t` : `${CO2} DOWN ${num(-d)} kg/t`;
    const dv = row.drv;
    if (dv && dv.ok) {
      const dec = dv.k.dec;
      const consistent = dv.k.better === 'lower' ? ((d > 0) === (dv.cur > dv.prev)) : ((d > 0) === (dv.cur < dv.prev));
      if (consistent) {
        s += ` because ${dv.k.name} ${dv.cur > dv.prev ? 'rose' : 'fell'} from ${num(dv.prev, dec)} to ${num(dv.cur, dec)} ${dv.k.uom} (${pct(dv.chg)}).`;
      } else {
        s += `. ${dv.k.name} moved ${num(dv.prev, dec)} to ${num(dv.cur, dec)} ${dv.k.uom} (${pct(dv.chg)}) but other effects (material mix, emission factor) outweighed it.`;
      }
    } else {
      s += ' (fixed sinter-output credit / no driver KPI).';
    }
    if ((row.c.key === 'Power' || row.c.key === 'Gas') && d > 0 && M.prodChg < -0.03) {
      s += ` Lower production (${pct(M.prodChg, 0)} vs last month) spreads the fixed energy load over fewer tonnes.`;
    }
    if (row.c.key === 'IBRM') {
      const k = kv('IBRM');
      if (k.cur > 0 && k.prev > 0) s += ` Total IBRM rate: ${num(k.prev, 0)} to ${num(k.cur, 0)} kg/t (micro-pellets carry most of the carbon).`;
    }
    return s;
  }
  function narratives(M) {
    const { A, hasPrev, mi } = M, t = plantTitle();
    let n1, n2 = '';
    const byD = [...M.rows].sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const byG = [...M.rows].sort((a, b) => Math.abs(b.g) - Math.abs(a.g));
    const lastData = yearObj().months[latestMonth()];
    if (!A.has) n1 = `No data available yet for ${M.label} - please pick an earlier month (data runs up to ${lastData}).`;
    else if (mi === 0) n1 = 'First month of the year - nothing earlier to compare with; see the target comparison below.';
    else if (!M.B || !M.B.has) n1 = `No data for ${M.prevLabel}, so no month-on-month comparison is possible.`;
    else {
      const ch = M.dPrev;
      if (Math.abs(ch) < 0.05) n1 = `${t} ${CO2} intensity was UNCHANGED vs ${M.prevLabel}.`;
      else {
        n1 = `${t} ${CO2} intensity ${ch > 0 ? 'INCREASED ▲ by' : 'DECREASED ▼ by'} ${num(Math.abs(ch))} kg/t (${pct(M.dPrevPct)}) vs ${M.prevLabel}, mainly because of ${byD[0].c.short} (${sgn(byD[0].d)} kg/t)`;
        if (Math.abs(byD[1].d) >= 0.5) n1 += ` and ${byD[1].c.short} (${sgn(byD[1].d)} kg/t)`;
        n1 += '.';
      }
    }
    if (A.has) {
      n2 = `Against the FY target of ${num(A.tgt)} kg/t, ${t} is ${num(Math.abs(M.gap))} kg/t (${num(Math.abs(M.gapPct) * 100)}%) ${M.gap > 0 ? 'ABOVE target' : 'BELOW target'}`;
      if (Math.abs(M.gap) >= 0.05) n2 += `${M.gap > 0 ? ' - biggest overshoot: ' : ' - biggest saving: '}${byG[0].c.short} (${sgn(byG[0].g)} kg/t)`;
      n2 += `. Production is ${pctPlain(M.prodPlan)} of plan${hasPrev ? ' and ' + pct(M.prodChg) + ' vs ' + M.prevLabel : ''}.`;
    }
    return { n1, n2 };
  }

  /* ===================================================================
     RENDERING
     =================================================================== */
  function render() {
    const M = calc();
    renderHeader(M); renderCards(M); renderCharts(M); renderGap(M); renderKpi(M); renderPlants(M);
  }

  function renderHeader(M) {
    const lastData = M.y.months[latestMonth()];
    const st = $('statusLine');
    if (!M.A.has) { st.className = 'status-line warn'; st.textContent = `⚠ No actual data for ${M.label} yet - cards and charts show blanks. Data available up to ${lastData}.`; }
    else { st.className = 'status-line'; st.textContent = `Showing: ${plantTitle()}  |  ${M.label}  |  actual data available up to ${lastData}`; }
    const t = plantTitle() + '  ·  ' + M.label;
    $('h1').textContent = '1  ·  HEADLINE NUMBERS  –  ' + t;
    $('h2').textContent = '2  ·  ' + CO2 + ' TREND  –  ' + plantTitle() + '  (every month of ' + yearObj().label + ')';
    $('h3').textContent = '3  ·  WHERE DOES THE ' + CO2 + ' COME FROM?  –  ' + plantTitle();
    $('h4').textContent = '4  ·  GAP ANALYSIS  –  WHY DID ' + CO2 + ' GO UP OR DOWN?  –  ' + t;
    $('h5').textContent = '5  ·  OPERATING KPIs THAT DRIVE ' + CO2 + '  –  ' + t;
    $('h6').textContent = '6  ·  EACH PLANT SIDE BY SIDE  –  ' + M.label + '  (not affected by the plant selector)';
  }

  function renderCards(M) {
    const { A, Y, hasPrev } = M, has = A.has;
    const arrow = v => (v > 0 ? '▲ ' : '▼ ');
    const cards = [
      { l: CO2 + ' INTENSITY', v: has ? num(A.int) : '–', u: 'kg ' + CO2 + ' per tonne sinter', bad: M.gap > 0,
        s: has ? `Target ${num(A.tgt)}  ·  ${arrow(M.gap)}${num(Math.abs(M.gap))}${M.gap > 0 ? ' above' : ' below'}` : '' },
      { l: 'TOTAL ' + CO2 + ' EMITTED', v: has ? num(A.co2, 0) : '–', u: 'tonnes ' + CO2 + ' in the month', bad: M.co2Chg > 0,
        s: hasPrev ? `${arrow(M.co2Chg)}${num(Math.abs(M.co2ChgPct) * 100)}% vs ${M.prevLabel} (${sgn(M.co2Chg, 0)} t)` : '' },
      { l: 'NET SINTER PRODUCED', v: has ? num(A.net, 0) : '–', u: 'tonnes in the month', bad: M.prodPlan < 0.95, neutralSub: true,
        s: has ? `${pctPlain(M.prodPlan)} of plan (${num(A.plan, 0)} t)` : '' },
      { l: 'CHANGE vs LAST MONTH', v: hasPrev ? sgn(M.dPrev) : '–', u: 'kg ' + CO2 + '/t vs previous month', bad: M.dPrev > 0,
        s: hasPrev ? (M.dPrev > 0.0 ? '▲ INCREASED vs ' : M.dPrev < 0 ? '▼ DECREASED vs ' : '= unchanged vs ') + M.prevLabel : 'no earlier month to compare' },
      { l: 'YEAR-TO-DATE INTENSITY', v: Y.has ? num(Y.int) : '–', u: 'kg ' + CO2 + '/t, Apr to selected month', bad: Y.gap > 0,
        s: Y.has ? `YTD target ${num(Y.tgt)}  ·  ${arrow(Y.gap)}${num(Math.abs(Y.gap))}${Y.gap > 0 ? ' above' : ' below'}` : '' },
      { l: 'YEAR-TO-DATE ' + CO2, v: Y.has ? num(Y.co2, 0) : '–', u: 'tonnes ' + CO2 + ', Apr to selected month', bad: Y.excess > 0,
        s: Y.has ? `${arrow(Y.excess)}${num(Math.abs(Y.excess), 0)} t ${Y.excess > 0 ? 'above' : 'below'} target level` : '' }
    ];
    $('cards').innerHTML = cards.map(c => {
      const valCls = c.v === '–' ? '' : (c.bad ? 'bad' : 'good');
      const subCls = c.neutralSub ? '' : (c.s.startsWith('▲') || /▲/.test(c.s.slice(0, 2)) ? 'bad' : c.s.startsWith('▼') ? 'good' : '');
      return `<div class="card"><div class="lbl">${c.l}</div><div class="val ${valCls}">${c.v}</div><div class="unit">${c.u}</div><div class="sub ${subCls}">${esc(c.s)}</div></div>`;
    }).join('');
  }

  /* ---------- charts ---------- */
  const valueLabels = {
    id: 'valueLabels',
    afterDatasetsDraw(chart, args, opts) {
      if (!opts || !opts.fmt) return;
      const { ctx } = chart, horiz = chart.options.indexAxis === 'y';
      ctx.save(); ctx.font = '600 10px "Segoe UI", Arial'; ctx.fillStyle = '#333';
      chart.data.datasets.forEach((ds, di) => {
        if (ds.type === 'line' || chart.getDatasetMeta(di).hidden) return;
        chart.getDatasetMeta(di).data.forEach((el, i) => {
          const v = ds.data[i]; if (v == null || (opts.skipZero !== false && Math.abs(v) < 0.05)) return;
          const t = opts.fmt(v);
          if (horiz) { ctx.textAlign = v >= 0 ? 'left' : 'right'; ctx.textBaseline = 'middle'; ctx.fillText(t, el.x + (v >= 0 ? 5 : -5), el.y); }
          else { ctx.textAlign = 'center'; ctx.textBaseline = v >= 0 ? 'bottom' : 'top'; ctx.fillText(t, el.x, el.y + (v >= 0 ? -3 : 3)); }
        });
      });
      ctx.restore();
    }
  };
  function mk(id, cfg) {
    if (charts[id]) charts[id].destroy();
    cfg.plugins = (cfg.plugins || []).concat([valueLabels]);
    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: 350 } }, cfg.options || {});
    cfg.options.plugins = Object.assign({ legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }, cfg.options.plugins || {});
    charts[id] = new Chart($(id).getContext('2d'), cfg);
  }
  const axisMin = (vals, pad = 15) => { const v = vals.filter(x => x != null && x > 0); return v.length ? Math.floor((Math.min(...v) - pad) / 10) * 10 : 0; };
  const grid = { color: '#e3e7ec' };
  const ytitle = t => ({ display: true, text: t, font: { size: 11 } });

  function renderCharts(M) {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.font.family = '"Segoe UI", Arial, sans-serif';
    const months = M.y.months, sel = M.mi;
    const hi = (base, hiCol) => months.map((_, i) => i === sel ? hiCol : base);

    /* intensity vs target */
    const intVals = M.series.map(s => s.int), tgtVals = M.series.map(s => s.tgt);
    mk('chIntensity', {
      data: { labels: months, datasets: [
        { type: 'bar', label: 'Actual ' + CO2 + ' intensity (kg/t)', data: intVals, backgroundColor: hi(COL.blue, COL.blueDark), borderRadius: 3 },
        { type: 'line', label: 'FY target (kg/t)', data: tgtVals, borderColor: COL.red, borderDash: [6, 5], borderWidth: 2.5, pointRadius: 0, tension: 0 }] },
      options: { scales: { y: { min: axisMin(intVals.concat(tgtVals)), grid, title: ytitle('kg ' + CO2 + ' per tonne sinter (axis zoomed)') }, x: { grid: { display: false } } }, plugins: { valueLabels: { fmt: v => num(v) } } }
    });

    /* total CO2 */
    mk('chTotal', {
      type: 'bar',
      data: { labels: months, datasets: [
        { label: 'Actual total ' + CO2 + ' (t)', data: M.series.map(s => s.has ? s.co2 : null), backgroundColor: hi(COL.blueDark, COL.navy), borderRadius: 3 },
        { label: CO2 + ' if target intensity was met (t)', data: M.series.map(s => s.atTgt), backgroundColor: COL.blueLight, borderRadius: 3 }] },
      options: { scales: { y: { beginAtZero: true, grid, title: ytitle('tonnes ' + CO2), ticks: { callback: v => num(v, 0) } }, x: { grid: { display: false } } } }
    });

    /* year on year */
    renderYoy(M);

    /* stacked by source */
    mk('chStack', {
      type: 'bar',
      data: { labels: months, datasets: D.contributors.map((c, i) => ({ label: c.short, data: M.series.map(s => s.c[i]), backgroundColor: c.color, stack: 's' })) },
      options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, grid, title: ytitle('kg ' + CO2 + ' per tonne sinter') } },
        plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${num(ctx.parsed.y)} kg/t` } } } }
    });

    /* doughnut: positive sources in selected month */
    const pos = M.rows.filter(r => r.cur > 0);
    const tot = sum(pos.map(r => r.cur));
    mk('chPie', {
      type: 'doughnut',
      data: { labels: pos.map(r => `${r.c.short}  ${tot > 0 ? (r.cur / tot * 100).toFixed(0) : 0}%`), datasets: [{ data: pos.map(r => r.cur), backgroundColor: pos.map(r => r.c.color), borderColor: '#fff', borderWidth: 2 }] },
      options: { cutout: '52%', plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 12 } } }, tooltip: { callbacks: { label: ctx => ` ${num(ctx.parsed)} kg/t` } } } }
    });

    /* diverging bars */
    const div = (id, vals) => mk(id, {
      type: 'bar',
      data: { labels: M.rows.map(r => r.c.short), datasets: [{ label: CO2 + ' change (kg/t)', data: vals, backgroundColor: vals.map(v => v > 0 ? COL.redBar : COL.greenBar), borderRadius: 3 }] },
      options: { indexAxis: 'y', layout: { padding: { right: 28, left: 8 } }, scales: { x: { grace: '18%', grid, title: ytitle('kg ' + CO2 + ' per tonne sinter'), ticks: { callback: v => (v > 0 ? '+' : '') + v } }, y: { grid: { display: false } } },
        plugins: { legend: { display: false }, valueLabels: { fmt: v => sgn(v) }, tooltip: { callbacks: { label: ctx => ` ${sgn(ctx.parsed.x)} kg/t ${ctx.parsed.x > 0 ? '(adds ' + CO2 + ')' : '(saves ' + CO2 + ')'}` } } } }
    });
    div('chDelta', M.rows.map(r => +r.d.toFixed(2)));
    div('chGap', M.rows.map(r => +r.g.toFixed(2)));

    /* KPI trend */
    const k = M.kpiSel, dec = k.k.dec;
    const tgtLine = months.map(() => k.tgt > 0 ? k.tgt : null);
    mk('chKpi', {
      data: { labels: months, datasets: [
        { type: 'bar', label: k.k.name + ' (' + k.k.uom + ')', data: M.kpiSeries, backgroundColor: hi(COL.blue, COL.blueDark), borderRadius: 3 },
        { type: 'line', label: 'FY target', data: tgtLine, borderColor: COL.red, borderDash: [6, 5], borderWidth: 2.5, pointRadius: 0 }] },
      options: { scales: { y: { beginAtZero: false, grid, title: ytitle(k.k.name + ' (' + k.k.uom + ')'), ticks: { callback: v => num(v, dec) } }, x: { grid: { display: false } } },
        plugins: { valueLabels: { fmt: v => num(v, dec) } } }
    });
    const kv = M.kpiSeries.concat(tgtLine).filter(v => v != null);
    if (kv.length) { const lo = Math.min(...kv), hi2 = Math.max(...kv), pad = (hi2 - lo) * 0.6 || hi2 * 0.05; charts.chKpi.options.scales.y.min = Math.max(0, lo - pad); charts.chKpi.options.scales.y.max = hi2 + pad * 0.5; charts.chKpi.update(); }

    /* plants */
    const pk = Object.keys(M.y.plants);
    mk('chPlantStack', {
      type: 'bar',
      data: { labels: months, datasets: pk.map((p, i) => ({ label: p, data: M.plantMonthCo2[i], backgroundColor: PLANT_COLORS[i % PLANT_COLORS.length], stack: 's' })) },
      options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, grid, title: ytitle('tonnes ' + CO2), ticks: { callback: v => num(v, 0) } } },
        plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${num(ctx.parsed.y, 0)} t` } } } }
    });
    const pAct = M.plantRows.map(r => r.a.has ? r.a.int : null), pTgt = M.plantRows.map(r => r.a.tgt || null);
    mk('chPlantInt', {
      type: 'bar',
      data: { labels: pk, datasets: [
        { label: 'Actual kg/t', data: pAct, backgroundColor: pk.map(p => p === S.plant ? COL.blueDark : COL.blue), borderRadius: 3 },
        { label: 'Target kg/t', data: pTgt, backgroundColor: '#f1948a', borderRadius: 3 }] },
      options: { scales: { y: { min: axisMin(pAct.concat(pTgt)), grid, title: ytitle('kg ' + CO2 + ' per tonne (axis zoomed)') }, x: { grid: { display: false } } }, plugins: { valueLabels: { fmt: v => num(v) } } }
    });
  }

  function renderYoy(M) {
    const y = M.y, plants = M.plants;
    const yrs = Array.from(new Set(plants.flatMap(p => Object.keys(y.plants[p].history || {})))).sort();
    const vals = yrs.map(h => {
      let s = 0, w = 0;
      plants.forEach(p => { const v = (y.plants[p].history || {})[h]; if (v != null) { const wt = sum(y.plants[p].plan); s += v * wt; w += wt; } });
      return w > 0 ? s / w : null;
    });
    const labels = yrs.concat(['YTD ' + y.label.replace('FY ', 'FY')]);
    vals.push(M.Y.has ? M.Y.int : null);
    const tgt = labels.map(() => M.Y.tgt || M.A.tgt || null);
    $('yoyTitle').textContent = 'Year-on-year ' + CO2 + ' intensity – ' + plantTitle() + ' (kg/t)';
    $('yoyNote').textContent = (plants.length > 1 ? 'All-plants history is a plan-weighted average of the plants that existed in each year. ' : '') + 'Bars = actual intensity of each year; dashed line = current year target.';
    mk('chYoy', {
      data: { labels, datasets: [
        { type: 'bar', label: 'Actual intensity (kg/t)', data: vals, backgroundColor: vals.map((v, i) => i === vals.length - 1 ? COL.blueDark : COL.blue), borderRadius: 3 },
        { type: 'line', label: 'Current-year target', data: tgt, borderColor: COL.red, borderDash: [6, 5], borderWidth: 2.5, pointRadius: 0 }] },
      options: { scales: { y: { min: axisMin(vals.concat(tgt), 12), grid, title: ytitle('kg ' + CO2 + ' per tonne (axis zoomed)') }, x: { grid: { display: false } } }, plugins: { valueLabels: { fmt: v => num(v) } } }
    });
  }

  /* ---------- gap table + remarks ---------- */
  function renderGap(M) {
    $('narr1').textContent = M.narr.n1;
    $('narr2').textContent = M.narr.n2; $('narr2').style.display = M.narr.n2 ? '' : 'none';
    $('narr1').className = 'narr main' + (M.hasPrev ? (M.dPrev > 0.05 ? ' up' : M.dPrev < -0.05 ? ' down' : '') : '');
    $('narr2').className = 'narr' + (M.A.has ? (M.gap > 0.05 ? ' up' : ' down') : '');

    const th = ['Source of ' + CO2, 'Last month', 'This month', 'Change', 'Target', 'Gap vs target', 'What drives it (KPI)', 'KPI last month', 'KPI this month', 'KPI change', 'Why did it change? (auto-explained)'];
    let h = '<thead><tr>' + th.map((t, i) => `<th class="${i === 0 || i === 6 || i === 10 ? 'left' : ''}">${t}</th>`).join('') + '</tr></thead><tbody>';
    M.rows.forEach(r => {
      const dv = r.drv, dec = dv ? dv.k.dec : 1;
      h += `<tr><td class="src">${esc(r.c.long)}</td><td>${num(r.prev)}</td><td>${num(r.cur)}</td>
        <td class="${cls(r.d)}">${sgn(r.d)}</td><td>${num(r.tgt)}</td><td class="${cls(r.g)}">${sgn(r.g)}</td>
        <td class="left">${dv ? esc(dv.k.name) + ' (' + esc(dv.k.uom) + ')' : '-'}</td>
        <td>${dv && dv.prev > 0 ? num(dv.prev, dec) : '–'}</td><td>${dv && dv.cur > 0 ? num(dv.cur, dec) : '–'}</td>
        <td><b>${dv && dv.ok ? pct(dv.chg) : '–'}</b></td><td class="expl">${esc(r.expl)}</td></tr>`;
    });
    const T = M.rowsTotal;
    h += `<tr class="total"><td class="src" style="color:#fff">TOTAL ${CO2} INTENSITY</td><td>${num(T.prev)}</td><td>${num(T.cur)}</td><td>${sgn(T.d)}</td><td>${num(T.tgt)}</td><td>${sgn(T.g)}</td>
      <td colspan="5" class="left" style="font-weight:400">Sum of all sources above = total kg ${CO2} per tonne of sinter. Net change vs last month: ${sgn(T.d)} kg/t | Gap vs target: ${sgn(T.g)} kg/t</td></tr></tbody>`;
    $('gapTable').innerHTML = h;

    /* plant team remarks */
    const box = $('remarks');
    if (S.plant === 'ALL') {
      box.innerHTML = '<div class="remark-row"><div class="p">All plants</div><div class="t empty">Select a single plant (SP1–SP5) to see the plant team’s remarks.</div></div>';
      return;
    }
    const rem = (M.y.plants[S.plant].remarks || {})[M.label] || {};
    box.innerHTML = D.contributors.filter(c => c.remark).map(c => {
      const r = rem[c.remark];
      let body = '';
      if (r && r.right) body += `<div><span class="plus">(+)</span> ${esc(r.right)}</div>`;
      if (r && r.wrong) body += `<div><span class="minus">(–)</span> ${esc(r.wrong)}</div>`;
      return `<div class="remark-row"><div class="p">${esc(c.short)}</div><div class="t ${body ? '' : 'empty'}">${body || '- no remark entered by plant team -'}</div></div>`;
    }).join('');
  }

  /* ---------- KPI table ---------- */
  function renderKpi(M) {
    const th = ['KPI', 'Unit', 'Last month', 'This month', 'Target', 'Gap', 'Gap %', 'Status'];
    let h = '<thead><tr>' + th.map((t, i) => `<th class="${i === 0 ? 'left' : ''}">${t}</th>`).join('') + '</tr></thead><tbody>';
    M.kpis.forEach(r => {
      const d = r.k.dec, good = r.status === 'On target', bad = r.status === 'Off target';
      h += `<tr><td class="src" style="min-width:140px">${esc(r.k.name)}</td><td>${esc(r.k.uom)}</td>
        <td>${r.prev > 0 ? num(r.prev, d) : '–'}</td><td><b>${r.hasC ? num(r.cur, d) : '–'}</b></td><td>${r.hasT ? num(r.tgt, d) : '–'}</td>
        <td>${r.hasC && r.hasT ? sgn(r.gap, d) : '–'}</td><td>${r.hasC && r.hasT ? pct(r.gapPct) : '–'}</td>
        <td class="dot ${good ? 'good' : bad ? 'bad' : ''}">${r.status === 'n/a' ? 'n/a' : '● ' + r.status}</td></tr>`;
    });
    $('kpiTable').innerHTML = h + '</tbody>';
  }

  /* ---------- all plants table ---------- */
  function renderPlants(M) {
    const th = ['Plant', 'Net sinter (t)', '% of plan', 'Total ' + CO2 + ' (t)', 'Share of total', CO2 + ' kg/t', 'Target kg/t', 'Gap kg/t', 'Change vs last month', 'YTD kg/t', 'YTD target', 'YTD gap', 'Last FY avg kg/t', 'Verdict', 'YTD ' + CO2 + ' (t)'];
    let h = '<thead><tr>' + th.map(t => `<th>${t}</th>`).join('') + '</tr></thead><tbody>';
    const row = (r, tot) => {
      const a = r.a, has = a.has, sel = !tot && S.plant === r.key;
      const verdict = !has ? 'No data' : (r.gap > 0.05 ? '▲ Above target' : '▼ On / below target');
      return `<tr class="${tot ? 'totalrow' : ''}" ${sel ? 'style="outline:2px solid #0e7c86; outline-offset:-2px"' : ''}>
        <td><b>${esc(r.label)}</b></td><td>${has ? num(a.net, 0) : '–'}</td><td>${has ? pctPlain(a.net / a.plan) : '–'}</td>
        <td>${has ? num(a.co2, 0) : '–'}</td><td>${has ? (r.share * 100).toFixed(1) + '%' : '–'}</td><td><b>${has ? num(a.int) : '–'}</b></td>
        <td>${has ? num(a.tgt) : '–'}</td><td class="${cls(r.gap)}">${has ? sgn(r.gap) : '–'}</td>
        <td class="${r.d != null ? cls(r.d) : ''}">${r.d != null ? sgn(r.d) : '–'}</td>
        <td>${r.yy.has ? num(r.yy.int) : '–'}</td><td>${r.yy.has ? num(r.yy.tgt) : '–'}</td><td class="${cls(r.yy.gap)}">${r.yy.has ? sgn(r.yy.gap) : '–'}</td>
        <td>${r.prevYear > 0 ? num(r.prevYear) : '–'}</td><td class="${!has ? '' : r.gap > 0.05 ? 'bad' : 'good'}" style="white-space:nowrap">${verdict}</td>
        <td>${r.yy.has ? num(r.yy.co2, 0) : '–'}</td></tr>`;
    };
    M.plantRows.forEach(r => { h += row(r, false); });
    h += row(M.plantTotal, true);
    $('plantTable').innerHTML = h + '</tbody>';
  }

  /* ===================================================================
     SELECTORS + START
     =================================================================== */
  function fillSelectors() {
    $('selYear').innerHTML = D.years.map(y => `<option value="${esc(y.id)}">${esc(y.label)}</option>`).join('');
    $('selYear').value = S.year;
    $('selKpi').innerHTML = D.kpis.map(k => `<option value="${esc(k.key)}">${esc(k.name)}</option>`).join('');
    $('selKpi').value = S.kpi;
    fillYearDependent();
  }
  function fillYearDependent() {
    const y = yearObj();
    $('selPlant').innerHTML = '<option value="ALL">All Plants</option>' + Object.keys(y.plants).map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    if (S.plant !== 'ALL' && !y.plants[S.plant]) S.plant = 'ALL';
    $('selPlant').value = S.plant;
    $('selMonth').innerHTML = y.months.map((m, i) => `<option value="${i}">${esc(m)}${agg(Object.keys(y.plants), i).has ? '' : '  (no data yet)'}</option>`).join('');
    $('selMonth').value = String(S.month);
  }

  async function initDashboard() {
    const sess = getSession();
    if (!sess) { location.replace('login.html'); return; }
    $('userEmail').textContent = sess.email;
    $('avatar').textContent = sess.email.charAt(0);
    $('logoutBtn').addEventListener('click', () => { clearSession(); location.replace('login.html'); });
    try {
      const res = await fetch('dashboard_data.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      D = await res.json();
    } catch (e) {
      $('app').innerHTML = `<div class="fatal"><h3 style="margin-top:0">Could not load dashboard_data.json</h3>
        <p>${esc(e.message)}</p><p>Open the site through a web server (for example run <code>python -m http.server 8000</code> in this folder and visit <code>http://localhost:8000/login.html</code>) – browsers block data files when a page is opened by double-clicking it.</p></div>`;
      return;
    }
    if (D.meta) {
      if (D.meta.subtitle) $('subtitle').textContent = D.meta.subtitle + ' · ' + CO2 + ' intensity = kg ' + CO2 + ' per tonne of net sinter · Lower is better';
      $('footer').textContent = 'Source: ' + (D.meta.source || '') + (D.meta.updated ? '  ·  Data updated ' + D.meta.updated : '');
    }
    S.year = D.years[D.years.length - 1].id;
    S.month = latestMonth();
    fillSelectors();
    $('selYear').addEventListener('change', e => { S.year = e.target.value; S.month = Math.min(S.month, yearObj().months.length - 1); fillYearDependent(); S.month = latestMonth(); $('selMonth').value = String(S.month); render(); });
    $('selPlant').addEventListener('change', e => { S.plant = e.target.value; render(); });
    $('selMonth').addEventListener('change', e => { S.month = +e.target.value; render(); });
    $('selKpi').addEventListener('change', e => { S.kpi = e.target.value; render(); });
    render();
  }

  document.addEventListener('DOMContentLoaded', function () {
    const page = document.body.getAttribute('data-page');
    if (page === 'login') initLogin();
    else if (page === 'dashboard') initDashboard();
  });
})();
