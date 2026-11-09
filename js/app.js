(function () {
  'use strict';
  var DATA = DATA_DEMO;

  /* ------------------------------------------------------------------ i18n */
  var UNITS = { en: { h: 'h', d: 'd' }, uk: { h: 'год', d: 'д' }, de: { h: 'Std.', d: 'T' }, fr: { h: 'h', d: 'j' } };
  var LOCALES = { en: 'en-US', uk: 'uk-UA', de: 'de-DE', fr: 'fr-FR' };

  /* --------------------------------------------------------------- helpers */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };
  var KEYS = ['mp.spam', 'mp.done', 'mp.agents', 'mp.removed', 'mp.data', 'mp.ov'];
  /* Browser database (IndexedDB) for user data, with localStorage fallback. Replace this object to use a server database. */
  var db = (function () {
    var cache = {}, idb = null, NAME = 'leaddesk', STORE = 'kv';
    function fallback() { idb = null; KEYS.forEach(function (k) { var v = store.get(k); if (v != null) cache[k] = v; }); }
    function write(k, v) {
      return new Promise(function (res) {
        if (!idb) { res(store.set(k, v)); return; }
        try { var tx = idb.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(v, k); tx.oncomplete = function () { res(true); }; tx.onerror = tx.onabort = function () { res(false); }; } catch (e) { res(false); }
      });
    }
    function migrate() { KEYS.forEach(function (k) { if (cache[k] == null) { var v = store.get(k); if (v != null) { cache[k] = v; write(k, v); } } }); }
    function open() {
      return new Promise(function (resolve) {
        var done = false;
        function finish() { if (!done) { done = true; resolve(); } }
        setTimeout(function () { if (!done) { fallback(); finish(); } }, 1500);
        try {
          if (!window.indexedDB) { fallback(); finish(); return; }
          var req = window.indexedDB.open(NAME, 1);
          req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
          req.onerror = function () { if (!done) { fallback(); finish(); } };
          req.onsuccess = function () {
            if (done) return;
            idb = req.result;
            try {
              var cur = idb.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
              cur.onsuccess = function (e) { var c = e.target.result; if (c) { cache[c.key] = c.value; c.continue(); } else { migrate(); finish(); } };
              cur.onerror = function () { fallback(); finish(); };
            } catch (e) { fallback(); finish(); }
          };
        } catch (e) { fallback(); finish(); }
      });
    }
    return { open: open, get: function (k) { return cache[k] == null ? null : cache[k]; }, set: function (k, v) { cache[k] = v; return write(k, v); } };
  })();
  function readJSON(k, fallback) { try { var v = KEYS.indexOf(k) >= 0 ? db.get(k) : store.get(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } }
  function sum(a, f) { var s = 0; for (var i = 0; i < a.length; i++) s += f(a[i]); return s; }
  function avg(a, f) { return a.length ? sum(a, f) / a.length : 0; }

  var DEPT = '__dept';
  var PRI = ['Critical', 'High', 'Normal', 'Low'];
  var RANK = { Critical: 0, High: 1, Normal: 2, Low: 3 };
  var QUALS = ['Warm', 'Cold', 'Spam', 'Duplicate'];
  var STATUSES = ['New', 'In Progress', 'Waiting for Brief', 'Proposal', 'Won'];
  var DELAYS = [[0, 'd_any'], [4, 'd_4'], [24, 'd_24'], [72, 'd_72'], [168, 'd_168']];

  var S = {
    lang: 'en', theme: 'light',
    agent: '', pri: '', qual: '', delay: 0, seg: '', ind: '', src: '', repeat: false, paid: false, q: '', limit: {},
    merged: false, mdim: 'source', sel: DEPT, moves: {}, simSel: '', wsAgent: '',
    spam: {}, spamTab: 'pending', spamLimit: 12, done: {},
    extra: [], removed: [], ov: {}
  };
  function loadState() {
    var ovv = readJSON('mp.ov', {});
    S.ov = ovv && typeof ovv === 'object' && !Array.isArray(ovv) ? ovv : {};
    var sp = readJSON('mp.spam', {}), dn = readJSON('mp.done', {}), ex = readJSON('mp.agents', []), rm = readJSON('mp.removed', []);
    S.spam = sp && typeof sp === 'object' && !Array.isArray(sp) ? sp : {};
    S.done = dn && typeof dn === 'object' && !Array.isArray(dn) ? dn : {};
    S.extra = (Array.isArray(ex) ? ex : []).filter(function (x) { return x && typeof x.name === 'string' && x.name && typeof x.capacity === 'number'; });
    S.removed = (Array.isArray(rm) ? rm : []).filter(function (x) { return typeof x === 'string'; });
  }
  function saveTeam() { db.set('mp.agents', JSON.stringify(S.extra)); db.set('mp.removed', JSON.stringify(S.removed)); }

  function t(key, vars) {
    var s = (I18N[S.lang] && I18N[S.lang][key]);
    if (s == null) s = I18N.en[key];
    if (s == null) s = key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }
  function tHtml(key, vars) {
    var s = t(key);
    return esc(s).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? '<b>' + esc(vars[k]) + '</b>' : m; });
  }
  var nf, df;
  function setLocale() { nf = new Intl.NumberFormat(LOCALES[S.lang]); df = new Intl.DateTimeFormat(LOCALES[S.lang], { day: '2-digit', month: '2-digit', timeZone: 'UTC' }); }
  function fmt(n) { return nf.format(Math.round(n)); }
  function pct(v) { return v == null ? '—' : Math.round(v * 100) + '%'; }
  function hrs(v) { if (v == null) return '—'; var u = UNITS[S.lang]; return v < 72 ? Math.round(v) + ' ' + u.h : (v / 24).toFixed(1).replace('.', S.lang === 'en' ? '.' : ',') + ' ' + u.d; }
  function ageTxt(h) { var u = UNITS[S.lang]; return h < 1 ? '<1 ' + u.h : h < 24 ? Math.round(h) + ' ' + u.h : h < 72 ? Math.floor(h / 24) + ' ' + u.d + ' ' + Math.round(h % 24) + ' ' + u.h : Math.round(h / 24) + ' ' + u.d; }
  function dShort(s) { return df.format(new Date(s + 'T00:00:00Z')); }
  function usd(v) { return '$' + (v >= 1e6 ? (v / 1e6).toFixed(1).replace('.', S.lang === 'en' ? '.' : ',') + 'M' : v >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v)); }
  function whoLabel(a) { return a === DEPT ? t('dept') : a; }

  /* ------------------------------------------------------------------ data */
  var base = DATA.leads;
  var DEMO = [];
  var AGENTS = [];
  function computeAgents() { AGENTS = DEMO.concat(S.extra.map(function (x) { return x.name; })).filter(function (a) { return S.removed.indexOf(a) < 0; }); }
  computeAgents();
  function hasHist(a) { return DEMO.indexOf(a) >= 0; }
  function isExtra(a) { return a !== DEPT && !hasHist(a); }
  function capOf(a) {
    if (hasHist(a)) { var r = DATA.agents.filter(function (x) { return x.agent === a && x.date === LAST; })[0]; return r ? r.capacity : 0; }
    var e = S.extra.filter(function (x) { return x.name === a; })[0]; return e ? e.capacity : 0;
  }
  function agMsg(s) { $('#ag-msg').textContent = s; }
  var DAYS = [], LAST = '', byId = {}, dupCounts = {};
  function applyData(d) {
    DATA = d; base = d.leads; DEMO = []; DAYS = []; byId = {}; dupCounts = {};
    base.forEach(function (r) { byId[r.id] = r; if (r.qual === 'Duplicate' && r.dup_of) dupCounts[r.dup_of] = (dupCounts[r.dup_of] || 0) + 1; });
    d.agents.forEach(function (r) { if (DEMO.indexOf(r.agent) < 0) DEMO.push(r.agent); if (DAYS.indexOf(r.date) < 0) DAYS.push(r.date); });
    DAYS.sort(); LAST = DAYS[DAYS.length - 1];
    S.extra = S.extra.filter(function (x) { return DEMO.indexOf(x.name) < 0; });
    S.removed = S.removed.filter(function (a) { return DEMO.indexOf(a) >= 0; });
  }
  applyData(DATA);
  var leads = [], origs = {};
  function effective(r) {
    var x = r, o = S.ov[r.id];
    if (S.spam[r.id] === 'restored') x = Object.assign({}, r, { qual: 'Cold', priority: r.paid ? 'Critical' : 'Normal' });
    if (o) {
      if (x === r) x = Object.assign({}, r);
      if (o.status) { x.status = o.status; x.status_since_h = Math.max(0, (Date.now() - o.movedAt) / 36e5); }
      if (o.priority) x.priority = o.priority;
      if (o.agent !== undefined) x.agent = o.agent;
    }
    if (x.agent && x.status !== 'Won' && AGENTS.indexOf(x.agent) < 0) { if (x === r) x = Object.assign({}, r); x.agent = ''; }
    return x;
  }
  function leadById(id) { return byId[id] ? effective(byId[id]) : null; }
  function rebuild() {
    computeAgents();
    leads = base.filter(function (r) { return S.spam[r.id] !== 'archived'; }).map(effective);
    origs = {};
    leads.forEach(function (r) { if (r.qual === 'Duplicate') origs[r.dup_of] = true; });
  }
  function pri(r) { return (S.merged && origs[r.id] && RANK[r.priority] > 1) ? 'High' : r.priority; }
  function isHigh(r) { var p = pri(r); return p === 'Critical' || p === 'High'; }
  function byUrgency(a, b) { return RANK[pri(a)] - RANK[pri(b)] || b.age_h - a.age_h; }
  function rowsOf(a) { return DATA.agents.filter(function (r) { return AGENTS.indexOf(r.agent) >= 0 && (a === DEPT || r.agent === a); }); }

  function summaryFor(name) {
    var rows = rowsOf(name), week = DAYS.slice(-7), hist = name === DEPT || hasHist(name);
    var today = rows.filter(function (r) { return r.date === LAST; });
    var wk = rows.filter(function (r) { return week.indexOf(r.date) >= 0; });
    var cap = name === DEPT ? sum(AGENTS, capOf) : capOf(name), done = sum(today, function (r) { return r.done; });
    var ct = sum(rows, function (r) { return r.critical_total; }), cok = sum(rows, function (r) { return r.critical_in_sla; });
    var open = leads.filter(function (r) { return r.status !== 'Won' && (name === DEPT || r.agent === name); });
    var won = leads.filter(function (r) { return r.status === 'Won' && (name === DEPT || r.agent === name); });
    return {
      agent: name, hist: hist, capacity: cap, taken: sum(today, function (r) { return r.assigned; }), done: done, kpi: hist && cap ? done / cap : null,
      lead: hist ? avg(wk, function (r) { return r.lead_time_h; }) : null, cycle: hist ? avg(wk, function (r) { return r.cycle_time_h; }) : null,
      sla: hist && ct ? cok / ct : null, open: open.length,
      over: open.filter(function (r) { return r.priority === 'Critical' && r.age_h > 24; }).length,
      wonN: won.length, wonSum: sum(won, function (r) { return r.budget; }), wonAvg: won.length ? sum(won, function (r) { return r.budget; }) / won.length : 0
    };
  }
  function allSummaries() { return [DEPT].concat(AGENTS).map(summaryFor); }
  function statusMedian(st) {
    var v = leads.filter(function (r) { return r.status === st; }).map(function (r) { return r.status_since_h; }).sort(function (a, b) { return a - b; });
    return v.length ? v[Math.floor(v.length / 2)] : 0;
  }
  function staffing() {
    var wk = DAYS.slice(-7), act = DATA.agents.filter(function (r) { return AGENTS.indexOf(r.agent) >= 0; });
    var histN = AGENTS.filter(hasHist).length;
    var doneAvg = sum(act.filter(function (r) { return wk.indexOf(r.date) >= 0; }), function (r) { return r.done; }) / Math.max(1, wk.length);
    var inf = DATA.inflow.filter(function (r) { return wk.indexOf(r.date) >= 0; }); if (!inf.length) inf = DATA.inflow;
    var inflowAvg = avg(inf, function (r) { return r.new_leads; });
    var cap = sum(AGENTS, capOf), n = AGENTS.length, per = histN ? doneAvg / histN : 0;
    var spare = cap - inflowAvg;
    var pool = leads.filter(function (r) { return r.status === 'New' && r.qual !== 'Spam' && r.qual !== 'Duplicate'; }).length;
    return { noInflow: !DATA.inflow.length, inflow: inflowAvg, done: doneAvg, cap: cap, agents: n, per: per, now: per ? Math.ceil(inflowAvg / per) : 0, capn: cap ? Math.ceil(inflowAvg / (cap / n)) : 0, pool: pool, days: spare > 0 ? Math.ceil(pool / spare) : 0 };
  }
  function simulate() {
    var norm = Math.max(1, Number($('#sim-norm').value) || 1), cap = Math.max(0, Number($('#sim-hi').value) || 0);
    var pool = leads.filter(function (r) { return r.status === 'New' && r.qual !== 'Spam' && r.qual !== 'Duplicate'; }).sort(byUrgency);
    var plan = {}, hi = {}, left = [], ai = 0;
    AGENTS.forEach(function (a) { plan[a] = []; hi[a] = 0; });
    function place(r, needHi) {
      for (var k = 0; k < AGENTS.length; k++) {
        var a = AGENTS[(ai + k) % AGENTS.length];
        if (plan[a].length < norm && (!needHi || hi[a] < cap)) { plan[a].push(r); if (needHi) hi[a]++; ai = (ai + k + 1) % AGENTS.length; return true; }
      }
      return false;
    }
    pool.filter(isHigh).forEach(function (r) { if (!place(r, true)) left.push(r); });
    ai = 0;
    pool.filter(function (r) { return !isHigh(r); }).sort(function (a, b) { return b.age_h - a.age_h; }).forEach(function (r) { if (!place(r, false)) left.push(r); });
    Object.keys(S.moves).forEach(function (id) {
      var to = S.moves[id];
      for (var i = 0; i < AGENTS.length; i++) {
        var a = AGENTS[i], idx = plan[a].findIndex(function (r) { return r.id === id; });
        if (idx >= 0) { if (a !== to && plan[to]) plan[to].push(plan[a].splice(idx, 1)[0]); break; }
      }
    });
    return { plan: plan, left: left, norm: norm, total: pool.length };
  }

  /* --------------------------------------------------------------- tooltip */
  var tip = $('#tip');
  function showTip(ev, title, items) {
    tip.textContent = '';
    tip.appendChild(el('div', 'tt', title));
    items.forEach(function (i) {
      var d = el('div');
      if (i.c) { var s = el('i', 'sw'); s.style.background = i.c; d.appendChild(s); }
      d.appendChild(document.createTextNode(i.t)); tip.appendChild(d);
    });
    tip.style.display = 'block';
    var x = Math.min(ev.clientX + 14, window.innerWidth - tip.offsetWidth - 8), y = Math.min(ev.clientY + 14, window.innerHeight - tip.offsetHeight - 8);
    tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px';
  }
  function hideTip() { tip.style.display = 'none'; }

  /* ---------------------------------------------------------------- static */
  function applyStatic() {
    document.documentElement.lang = S.lang;
    $$('[data-i18n]').forEach(function (e) { e.textContent = t(e.getAttribute('data-i18n')); });
    $$('[data-i18n-ph]').forEach(function (e) { e.setAttribute('placeholder', t(e.getAttribute('data-i18n-ph'))); });
    $$('[data-i18n-aria]').forEach(function (e) { e.setAttribute('aria-label', t(e.getAttribute('data-i18n-aria'))); });
    $('#theme').textContent = S.theme === 'dark' ? t('theme_light') : t('theme_dark');
    $('#lang').value = S.lang;
    var n = $('#notes'); n.textContent = '';
    [['n_lead', 'n_lead_d'], ['n_cycle', 'n_cycle_d'], ['n_cap', 'n_cap_d'], ['n_kpi', 'n_kpi_d'], ['n_sla', 'n_sla_d'], ['n_stat', 'n_stat_d']].forEach(function (p) { n.appendChild(el('dt', null, t(p[0]))); n.appendChild(el('dd', null, t(p[1]))); });
    var h = $('#agthead'); h.textContent = '';
    [['th_agent', 0], ['th_cap', 1], ['th_taken', 1], ['th_done', 1], ['th_kpi', 1], ['th_lead', 1], ['th_cycle', 1], ['th_sla', 1], ['th_open', 1], ['th_over', 1], ['th_won', 1], ['th_wonsum', 1], ['th_avg', 1], ['th_actions', 1]].forEach(function (p) { h.appendChild(el('th', p[1] ? 'num' : null, t(p[0]))); });
  }

  /* ------------------------------------------------------------------ hero */
  function renderHero() {
    var nw = leads.filter(function (r) { return r.status === 'New'; });
    var k = {
      nw: nw.length,
      crit: nw.filter(function (r) { return r.priority === 'Critical' && r.age_h > 24; }).length,
      rep: nw.filter(function (r) { return r.repeats > 0; }).length,
      junk: nw.filter(function (r) { return r.qual === 'Spam' || r.qual === 'Duplicate'; }).length,
      work: leads.filter(function (r) { return r.status === 'In Progress'; }).length
    };
    $('#take').innerHTML = tHtml('take', { new: fmt(k.nw), crit: fmt(k.crit), work: fmt(k.work) });
    var box = $('#herotiles'); box.textContent = '';
    [['kpi_new', k.nw, 'kpi_new_n', false], ['kpi_crit', k.crit, 'kpi_crit_n', true], ['kpi_rep', k.rep, 'kpi_rep_n', false], ['kpi_junk', k.junk, 'kpi_junk_n', false]].forEach(function (x) {
      var b = el('div', 'box');
      b.appendChild(el('div', 'tl', t(x[0]))); b.appendChild(el('div', 'tv' + (x[3] ? ' bad' : ''), fmt(x[1]))); b.appendChild(el('div', 'tn', t(x[2])));
      box.appendChild(b);
    });
  }

  /* --------------------------------------------------------------- filters */
  function fillSelect(sel, items, value) {
    sel.textContent = '';
    items.forEach(function (it) { var o = el('option', null, it[1]); o.value = it[0]; sel.appendChild(o); });
    sel.value = String(value);
  }
  function uniq(k) { var o = {}; base.forEach(function (r) { o[r[k]] = 1; }); return Object.keys(o).sort(); }
  function renderFilters() {
    fillSelect($('#f-agent'), [['', t('all')], ['__none', t('none')]].concat(AGENTS.map(function (a) { return [a, a]; })), S.agent);
    fillSelect($('#f-pri'), [['', t('all')]].concat(PRI.map(function (p) { return [p, t('p_' + p)]; })), S.pri);
    fillSelect($('#f-qual'), [['', t('all')]].concat(QUALS.map(function (q) { return [q, t('q_' + q)]; })), S.qual);
    fillSelect($('#f-delay'), DELAYS.map(function (d) { return [String(d[0]), t(d[1])]; }), S.delay);
    fillSelect($('#f-seg'), [['', t('all')]].concat(uniq('segment').map(function (s) { return [s, s]; })), S.seg);
    fillSelect($('#f-ind'), [['', t('all')]].concat(uniq('industry').map(function (s) { return [s, s]; })), S.ind);
    fillSelect($('#f-src'), [['', t('all')]].concat(uniq('source').map(function (s) { return [s, s]; })), S.src);
  }
  function passes(r) {
    if (S.agent === '__none') { if (r.agent !== '') return false; } else if (S.agent && r.agent !== S.agent) return false;
    if (S.pri && pri(r) !== S.pri) return false;
    if (S.qual && r.qual !== S.qual) return false;
    if (S.delay > 0 && (r.status === 'Won' || r.status_since_h <= S.delay)) return false;
    if (S.merged && r.qual === 'Duplicate') return false;
    if (S.seg && r.segment !== S.seg) return false;
    if (S.ind && r.industry !== S.ind) return false;
    if (S.src && r.source !== S.src) return false;
    if (S.repeat && !(r.repeats > 0)) return false;
    if (S.paid && !r.paid) return false;
    if (S.q && (r.name + ' ' + r.request + ' ' + r.id).toLowerCase().indexOf(S.q) < 0) return false;
    return true;
  }

  /* ----------------------------------------------------------------- board */
  function card(r) {
    var P = pri(r), c = el('div', 'card pri-' + P);
    c.setAttribute('data-lead', r.id); c.setAttribute('data-status', r.status); c.tabIndex = 0; c.setAttribute('role', 'button'); c.setAttribute('aria-label', r.name + ' ' + r.id);
    var top = el('div', 'ctop'), grip = el('span', 'grip', '⠿'); grip.title = t('dd_grip'); grip.setAttribute('aria-hidden', 'true');
    top.appendChild(grip); top.appendChild(el('span', 'name', r.name)); top.appendChild(el('span', 'mid', r.id));
    c.appendChild(top); c.appendChild(el('div', 'req', r.request));
    c.appendChild(el('div', 'meta', r.source + ' · ' + (r.agent || t('no_owner'))));
    var tags = el('div', 'tags');
    tags.appendChild(el('span', 'tag', r.segment));
    tags.appendChild(el('span', 'tag ' + (P === 'Critical' ? 'bad' : P === 'High' ? 'warn' : ''), t('p_' + P)));
    tags.appendChild(el('span', 'tag', r.industry));
    if (r.budget) tags.appendChild(el('span', 'tag', usd(r.budget)));
    if (r.qual === 'Spam' || r.qual === 'Duplicate') tags.appendChild(el('span', 'tag', t('q_' + r.qual)));
    if (r.repeats > 0) tags.appendChild(el('span', 'tag warn', t('tag_repeat', { n: r.repeats })));
    if (r.paid) tags.appendChild(el('span', 'tag ok', t('tag_paid')));
    c.appendChild(tags);
    if (r.status !== 'Won') {
      var lvl = r.status_since_h > 72 ? 'bad' : r.status_since_h > 24 ? 'warn' : 'ok';
      var a = el('div', 'age'), bar = el('div', 'agebar lvl-' + lvl), i = el('i');
      i.style.width = Math.max(4, Math.min(100, r.status_since_h / 168 * 100)) + '%'; bar.appendChild(i);
      a.appendChild(bar); a.appendChild(el('span', null, t('in_status', { a: ageTxt(r.status_since_h), b: ageTxt(r.age_h) })));
      c.appendChild(a);
    }
    return c;
  }
  function renderBoard() {
    var rows = leads.filter(passes), box = $('#boardcols');
    box.textContent = '';
    if (!rows.length) {
      var be = el('div', 'board-empty');
      be.appendChild(emptyState('search', t('em_filter_t'), t('em_filter_x'), filtersActive() ? t('em_filter_b') : null, function () { resetFilters(); renderFilters(); renderBoard(); }));
      box.appendChild(be);
      $('#shown').textContent = t('shown', { n: fmt(0), m: fmt(leads.length) });
      return;
    }
    STATUSES.forEach(function (st) {
      var list = rows.filter(function (r) { return r.status === st; }).sort(byUrgency);
      var total = leads.filter(function (r) { return r.status === st; }).length;
      var col = el('div', 'col'), h = el('div', 'colh');
      col.setAttribute('data-status', st);
      h.appendChild(el('div', null, st === 'Won' ? t('won') : st));
      h.appendChild(el('span', null, list.length === total ? fmt(list.length) : t('col_of', { a: fmt(list.length), b: fmt(total) })));
      col.appendChild(h);
      col.appendChild(el('div', 'colsub', t('col_median', { v: hrs(statusMedian(st)) })));
      var lim = S.limit[st] || 8;
      list.slice(0, lim).forEach(function (r) { col.appendChild(card(r)); });
      if (!list.length) col.appendChild(emptyState('inbox', filtersActive() ? t('col_empty') : t('em_col'), null, null, null, true));
      if (list.length > lim) {
        var b = el('button', 'more', t('col_more', { n: Math.min(8, list.length - lim), m: fmt(list.length - lim) }));
        b.type = 'button';
        b.addEventListener('click', function () { S.limit[st] = lim + 8; renderBoard(); });
        col.appendChild(b);
      }
      box.appendChild(col);
    });
    $('#shown').textContent = t('shown', { n: fmt(rows.length), m: fmt(leads.length) }) + (S.merged ? t('shown_merged') : '');
  }
  function barRow(label, segs, max, valTxt) {
    var row = el('div', 'brow'), tr = el('div', 'btrack');
    segs.forEach(function (s) { var i = el('i'); i.style.width = (s.v / max * 100) + '%'; i.style.background = s.c; tr.appendChild(i); });
    row.appendChild(el('div', null, label)); row.appendChild(tr); row.appendChild(el('div', 'bval', valTxt));
    return row;
  }
  function renderBars() {
    var nw = leads.filter(function (r) { return r.status === 'New'; });
    var q = $('#qualbars'); q.textContent = '';
    var qc = { Warm: 'var(--accent)', Cold: 'var(--accent2)', Spam: 'var(--chartmuted)', Duplicate: 'var(--chartmuted)' };
    var cnt = QUALS.map(function (k) { return nw.filter(function (r) { return r.qual === k; }).length; });
    var qmax = Math.max.apply(null, cnt.concat([1]));
    QUALS.forEach(function (k, i) { q.appendChild(barRow(t('q_' + k), [{ v: cnt[i], c: qc[k] }], qmax, fmt(cnt[i]) + (k === 'Spam' || k === 'Duplicate' ? ' · ' + t('to_archive') : ''))); });
    var a = $('#agebars'); a.textContent = '';
    var B = [['b1', 0, 4], ['b2', 4, 24], ['b3', 24, 72], ['b4', 72, 168], ['b5', 168, 1e9]];
    var st = B.map(function (b) { var g = nw.filter(function (r) { return r.age_h >= b[1] && r.age_h < b[2]; }); return { l: t(b[0]), n: g.length, u: g.filter(isHigh).length }; });
    var amax = Math.max.apply(null, st.map(function (s) { return s.n; }).concat([1]));
    st.forEach(function (s) { a.appendChild(barRow(s.l, [{ v: s.u, c: 'var(--bad)' }, { v: s.n - s.u, c: 'var(--chartmuted)' }], amax, t('urgent_n', { n: fmt(s.n), u: fmt(s.u) }))); });
    var leg = el('div', 'leg');
    [['var(--bad)', t('leg_urgent')], ['var(--chartmuted)', t('leg_other')]].forEach(function (x) { var s = el('span'), w = el('i', 'sw'); w.style.background = x[0]; s.appendChild(w); s.appendChild(document.createTextNode(x[1])); leg.appendChild(s); });
    a.appendChild(leg);
  }
  function renderDups() {
    var dups = leads.filter(function (r) { return r.qual === 'Duplicate'; }).sort(function (a, b) { return b.repeats - a.repeats || b.age_h - a.age_h; }).slice(0, 10);
    var tb = $('#duptable tbody'); tb.textContent = '';
    if (!dups.length) { var etr = el('tr'), etd = el('td'); etd.colSpan = 5; etd.appendChild(emptyState('check', t('em_dup_t'), t('em_dup_x'), null, null, true)); etr.appendChild(etd); tb.appendChild(etr); }
    dups.forEach(function (r) {
      var tr = el('tr', 'click'); tr.setAttribute('data-lead', r.id); tr.tabIndex = 0;
      [r.id, r.name, r.dup_of, String(r.repeats), usd(r.budget)].forEach(function (v, i) { tr.appendChild(el('td', i > 2 ? 'num' : null, v)); });
      tb.appendChild(tr);
    });
    $('#f-merge').textContent = S.merged ? t('dup_btn_undo') : t('dup_btn');
    $('#mergenote').textContent = S.merged ? t('dup_note_on') : t('dup_note_off');
  }

  /* ------------------------------------------------------------------ spam */
  function spamItems(tab) {
    var sp = base.filter(function (r) { return r.qual === 'Spam'; });
    if (tab === 'pending') return sp.filter(function (r) { return !S.spam[r.id]; }).sort(function (a, b) { return a.conf - b.conf; });
    return sp.filter(function (r) { return S.spam[r.id] === (tab === 'archived' ? 'archived' : 'restored'); });
  }
  function saveSpam() { db.set('mp.spam', JSON.stringify(S.spam)); }
  function decide(id, v) {
    var prev = S.spam[id];
    if (v) S.spam[id] = v; else delete S.spam[id];
    saveSpam(); refreshData();
    var undo = function () { if (prev) S.spam[id] = prev; else delete S.spam[id]; saveSpam(); refreshData(); };
    if (v === 'archived') toast(t('tt_spam_archived'), { undo: undo }); else if (v === 'restored') toast(t('tt_spam_returned'), { undo: undo }); else toast(t('tt_spam_undone'));
  }
  function renderSpam() {
    var counts = { pending: spamItems('pending').length, archived: spamItems('archived').length, restored: spamItems('restored').length };
    $('#spamstats').textContent = t('spam_stats', { p: fmt(counts.pending), a: fmt(counts.archived), r: fmt(counts.restored) }) + (counts.restored ? '. ' + t('returned_note') : '');
    var tabs = $('#spamtabs'); tabs.textContent = '';
    ['pending', 'archived', 'restored'].forEach(function (k) {
      var b = el('button', 'tab', t('tab_' + k) + ' (' + fmt(counts[k]) + ')');
      b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(S.spamTab === k));
      b.addEventListener('click', function () { S.spamTab = k; S.spamLimit = 12; renderSpam(); });
      tabs.appendChild(b);
    });
    var acts = $('#spamacts'); acts.textContent = '';
    if (S.spamTab === 'pending') {
      var hiConf = spamItems('pending').filter(function (r) { return r.conf >= 0.9; });
      var bulk = el('button', 'btn primary', t('btn_bulk') + ' (' + fmt(hiConf.length) + ')'); bulk.type = 'button'; bulk.disabled = !hiConf.length;
      bulk.addEventListener('click', function () { var ids = hiConf.map(function (r) { return r.id; }); ids.forEach(function (id) { S.spam[id] = 'archived'; }); saveSpam(); refreshData(); toast(t('tt_bulk', { n: fmt(ids.length) }), { undo: function () { ids.forEach(function (id) { delete S.spam[id]; }); saveSpam(); refreshData(); } }); });
      acts.appendChild(bulk);
    }
    var rs = el('button', 'btn', t('btn_spam_reset')); rs.type = 'button';
    rs.addEventListener('click', function () { var snap = JSON.parse(JSON.stringify(S.spam)); S.spam = {}; saveSpam(); refreshData(); toast(t('tt_spam_reset'), { undo: function () { S.spam = snap; saveSpam(); refreshData(); } }); });
    acts.appendChild(rs);
    var box = $('#spamlist'); box.textContent = '';
    var items = spamItems(S.spamTab);
    if (!items.length) {
      var sk = S.spamTab === 'pending' ? ['check', 'em_sp_t', 'em_sp_x'] : S.spamTab === 'archived' ? ['inbox', 'em_arch_t', 'em_arch_x'] : ['inbox', 'em_ret_t', 'em_ret_x'];
      var se = el('div', 'board-empty'); se.style.gridColumn = '1 / -1'; se.appendChild(emptyState(sk[0], t(sk[1]), t(sk[2]))); box.appendChild(se);
    }
    items.slice(0, S.spamLimit).forEach(function (r) {
      var c = el('div', 'sp'), top = el('div', 'ctop');
      c.setAttribute('data-lead', r.id); c.tabIndex = 0;
      top.appendChild(el('span', 'name', r.name)); top.appendChild(el('span', 'mid', r.id));
      c.appendChild(top);
      c.appendChild(el('div', 'req', r.request + ' · ' + r.source));
      c.appendChild(el('div', 'why', t('r_' + (r.spam_reason || 'unknown')) + ' · ' + t('conf', { p: Math.round(r.conf * 100) })));
      var cf = el('div', 'conf'), i = el('i'); i.style.width = Math.round(r.conf * 100) + '%'; cf.appendChild(i); c.appendChild(cf);
      var a = el('div', 'acts');
      function btn(label, cls, val) { var b = el('button', 'btn ' + cls, label); b.type = 'button'; b.addEventListener('click', function () { decide(r.id, val); }); a.appendChild(b); }
      if (S.spamTab === 'pending') { btn(t('btn_confirm'), 'primary', 'archived'); btn(t('btn_notspam'), '', 'restored'); } else btn(t('btn_undo'), '', null);
      c.appendChild(a); box.appendChild(c);
    });
    if (items.length > S.spamLimit) {
      var m = el('button', 'btn', t('spam_more') + ' (' + fmt(items.length - S.spamLimit) + ')'); m.type = 'button';
      m.addEventListener('click', function () { S.spamLimit += 12; renderSpam(); });
      box.appendChild(m);
    }
  }

  /* ---------------------------------------------------------------- charts */
  var SVGNS = 'http://www.w3.org/2000/svg';
  function sv(name, attrs, style) {
    var e = document.createElementNS(SVGNS, name);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (style) Object.keys(style).forEach(function (k) { e.style.setProperty(k, style[k]); });
    return e;
  }
  function niceScale(max, count) {
    if (!(max > 0)) max = 1;
    var raw = max / count, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p, n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10, step = n * p;
    var top = Math.ceil(max / step) * step, ticks = [];
    for (var v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
    return { max: top, ticks: ticks };
  }
  function chartBase(box, H) {
    box.textContent = '';
    var W = Math.max(280, box.clientWidth), svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img' });
    svg.style.display = 'block'; box.appendChild(svg);
    return { svg: svg, W: W, H: H };
  }
  function textW(svg, txt) { var e = sv('text', { class: 'tick' }); e.textContent = txt; svg.appendChild(e); var w = e.getComputedTextLength ? e.getComputedTextLength() : txt.length * 6.5; svg.removeChild(e); return w; }
  function axisY(c, sc, ml, mr, yOf) {
    sc.ticks.forEach(function (tk) {
      c.svg.appendChild(sv('line', { x1: ml, x2: c.W - mr, y1: yOf(tk), y2: yOf(tk) }, { stroke: 'var(--line)' }));
      var tx = sv('text', { class: 'tick', x: ml - 6, y: yOf(tk) + 3, 'text-anchor': 'end' }); tx.textContent = tk; c.svg.appendChild(tx);
    });
  }
  function axisX(c, labels, xOf, band) {
    var step = Math.max(1, Math.ceil(48 / band));
    labels.forEach(function (d, i) { if (i % step) return; var tx = sv('text', { class: 'tick', x: xOf(i), y: c.H - 8, 'text-anchor': 'middle' }); tx.textContent = dShort(d); c.svg.appendChild(tx); });
  }
  function noHistory(box) { box.textContent = ''; box.appendChild(el('div', 'empty', t('no_history'))); }
  function drawDone(box) {
    if (S.sel !== DEPT && !hasHist(S.sel)) { noHistory(box); return; }
    var rows = rowsOf(S.sel), extraCap = S.sel === DEPT ? sum(AGENTS.filter(isExtra), capOf) : 0;
    var pts = DAYS.map(function (d) { var rs = rows.filter(function (r) { return r.date === d; }); return { d: d, done: sum(rs, function (r) { return r.done; }), cap: sum(rs, function (r) { return r.capacity; }) + extraCap }; });
    var c = chartBase(box, 240), sc = niceScale(Math.max.apply(null, pts.map(function (p) { return Math.max(p.done, p.cap); })) * 1.05, 5);
    var ml = Math.max.apply(null, sc.ticks.map(function (x) { return textW(c.svg, String(x)); })) + 12, mr = textW(c.svg, t('cap')) + 12;
    var yOf = function (v) { return 8 + (c.H - 34) * (1 - v / sc.max); }, band = (c.W - ml - mr) / pts.length;
    var xC = function (i) { return ml + band * i + band / 2; };
    axisY(c, sc, ml, mr, yOf); axisX(c, DAYS, xC, band);
    var bw = Math.min(band * 0.7, 32);
    pts.forEach(function (p, i) { c.svg.appendChild(sv('rect', { x: xC(i) - bw / 2, y: yOf(p.done), width: bw, height: Math.max(0, yOf(0) - yOf(p.done)), rx: 3 }, { fill: 'var(--accent)' })); });
    c.svg.appendChild(sv('polyline', { points: pts.map(function (p, i) { return xC(i) + ',' + yOf(p.cap); }).join(' '), fill: 'none', 'stroke-width': 2, 'stroke-dasharray': '5 4' }, { stroke: 'var(--muted)' }));
    var lab = sv('text', { class: 'tick', x: c.W - mr + 6, y: yOf(pts[pts.length - 1].cap) + 3 }); lab.textContent = t('cap'); c.svg.appendChild(lab);
    pts.forEach(function (p, i) {
      var r = sv('rect', { x: ml + band * i, y: 0, width: band, height: c.H }, { fill: 'transparent', 'touch-action': 'pan-y' });
      var show = function (ev) { showTip(ev, dShort(p.d), [{ c: 'var(--accent)', t: t('done') + ': ' + fmt(p.done) }, { t: t('cap') + ': ' + fmt(p.cap) }, { t: t('kpi') + ': ' + pct(p.cap ? p.done / p.cap : null) }]); };
      r.addEventListener('pointermove', show); r.addEventListener('pointerdown', show);
      r.addEventListener('pointerleave', hideTip); c.svg.appendChild(r);
    });
  }
  function drawTime(box) {
    if (S.sel !== DEPT && !hasHist(S.sel)) { noHistory(box); return; }
    var rows = rowsOf(S.sel);
    var pts = DAYS.map(function (d) { var rs = rows.filter(function (r) { return r.date === d; }); return { d: d, lead: avg(rs, function (r) { return r.lead_time_h; }), cyc: avg(rs, function (r) { return r.cycle_time_h; }) }; });
    var c = chartBase(box, 240), sc = niceScale(Math.max.apply(null, pts.map(function (p) { return p.lead; })) * 1.15, 5);
    var ml = Math.max.apply(null, sc.ticks.map(function (x) { return textW(c.svg, String(x)); })) + 12, mr = 14;
    var yOf = function (v) { return 8 + (c.H - 34) * (1 - v / sc.max); }, step = (c.W - ml - mr - 12) / (pts.length - 1);
    var xOf = function (i) { return ml + 6 + step * i; };
    axisY(c, sc, ml, mr, yOf); axisX(c, DAYS, xOf, step);
    var S2 = [['lead', 'lead', 'var(--accent)'], ['cycle', 'cyc', 'var(--accent2)']];
    S2.forEach(function (s) {
      c.svg.appendChild(sv('polyline', { points: pts.map(function (p, i) { return xOf(i) + ',' + yOf(p[s[1]]); }).join(' '), fill: 'none', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, { stroke: s[2] }));
      var last = pts[pts.length - 1], tx = sv('text', { class: 'tick', x: c.W - mr, y: yOf(last[s[1]]) - 8, 'text-anchor': 'end' });
      tx.textContent = t(s[0]) + ' · ' + hrs(last[s[1]]); tx.style.stroke = 'var(--panel)'; tx.style.strokeWidth = '4px'; tx.style.paintOrder = 'stroke'; c.svg.appendChild(tx);
    });
    var rule = sv('line', { y1: 8, y2: c.H - 26 }, { stroke: 'var(--muted)', display: 'none' }); c.svg.appendChild(rule);
    var dots = S2.map(function (s) { var d = sv('circle', { r: 4 }, { fill: s[2], display: 'none' }); c.svg.appendChild(d); return d; });
    var ov = sv('rect', { x: ml, y: 0, width: c.W - ml - mr, height: c.H - 26 }, { fill: 'transparent', 'touch-action': 'pan-y' });
    var moveTime = function (ev) {
      var bb = c.svg.getBoundingClientRect(), px = (ev.clientX - bb.left) * (c.W / bb.width);
      var i = Math.max(0, Math.min(pts.length - 1, Math.round((px - ml - 6) / step))), p = pts[i];
      rule.setAttribute('x1', xOf(i)); rule.setAttribute('x2', xOf(i)); rule.style.display = '';
      dots.forEach(function (d, k) { d.setAttribute('cx', xOf(i)); d.setAttribute('cy', yOf(p[S2[k][1]])); d.style.display = ''; });
      showTip(ev, dShort(p.d), S2.map(function (s) { return { c: s[2], t: t(s[0]) + ': ' + hrs(p[s[1]]) }; }));
    };
    ov.addEventListener('pointermove', moveTime); ov.addEventListener('pointerdown', moveTime);
    ov.addEventListener('pointerleave', function () { hideTip(); rule.style.display = 'none'; dots.forEach(function (d) { d.style.display = 'none'; }); });
    c.svg.appendChild(ov);
  }

  /* ----------------------------------------------------------------- agents */
  function tile(label, valueNodes, note, bad) {
    var b = el('div', 'box'), v = el('div', 'tv' + (bad ? ' bad' : ''));
    b.appendChild(el('div', 'tl', label));
    valueNodes.forEach(function (n) { v.appendChild(typeof n === 'string' ? document.createTextNode(n) : n); });
    b.appendChild(v); b.appendChild(el('div', 'tn', note)); return b;
  }
  function slash() { return el('span', 'slash', ' / '); }
  function renderAgents() {
    if (S.sel !== DEPT && AGENTS.indexOf(S.sel) < 0) S.sel = DEPT;
    var sums = allSummaries(), cur = sums.filter(function (s) { return s.agent === S.sel; })[0];
    var chips = $('#chips'); chips.textContent = '';
    sums.forEach(function (s) {
      var b = el('button', 'chip', whoLabel(s.agent)); b.type = 'button'; b.setAttribute('aria-pressed', String(s.agent === S.sel));
      b.addEventListener('click', function () { S.sel = s.agent; renderAgents(); });
      chips.appendChild(b);
    });
    var tiles = $('#agtiles'); tiles.textContent = '';
    tiles.appendChild(tile(t('t_done', { d: dShort(LAST) }), [cur.hist ? fmt(cur.done) : '—', slash(), fmt(cur.capacity)], t('t_kpi', { v: pct(cur.kpi) })));
    tiles.appendChild(tile(t('t_lead'), [hrs(cur.lead)], t('t_lead_n')));
    tiles.appendChild(tile(t('t_cycle'), [hrs(cur.cycle)], t('t_cycle_n')));
    tiles.appendChild(tile(t('t_sla', { n: DAYS.length }), [pct(cur.sla)], t('t_sla_n')));
    var ov = el('span', 'bad', fmt(cur.over));
    tiles.appendChild(tile(t('t_open'), [fmt(cur.open), slash(), ov], t('t_open_n')));
    $('#donesub').textContent = t('ch_done_sub', { who: whoLabel(S.sel), n: DAYS.length });
    drawDone($('#chart-done')); drawTime($('#chart-time'));

    var st = staffing();
    if (st.noInflow) $('#staffing').textContent = t('no_inflow'); else $('#staffing').innerHTML = tHtml('st_text', { inflow: fmt(st.inflow), done: fmt(st.done), cap: fmt(st.cap), agents: fmt(st.agents), now: fmt(st.now), capn: fmt(st.capn), pool: fmt(st.pool), days: st.days > 0 ? t('days_unit', { n: st.days }) : t('never') });
    $('#verdict').textContent = st.noInflow ? '' : (st.per ? st.now > st.agents : st.capn > st.agents) ? t('verdict_short') : t('verdict_ok');

    var lb = $('#loadbars'); lb.textContent = '';
    var open = leads.filter(function (r) { return r.status !== 'Won'; });
    var rows = AGENTS.map(function (a) { var g = open.filter(function (r) { return r.agent === a; }); return { a: a, n: g.length, u: g.filter(isHigh).length }; }).sort(function (x, y) { return y.n - x.n; });
    var none = open.filter(function (r) { return r.agent === ''; });
    $('#loadsub').textContent = t('load_sub', { n: fmt(none.length), u: fmt(none.filter(isHigh).length) });
    var mx = Math.max.apply(null, rows.map(function (r) { return r.n; }).concat([1]));
    rows.forEach(function (s) { lb.appendChild(barRow(s.a, [{ v: s.u, c: 'var(--bad)' }, { v: s.n - s.u, c: 'var(--chartmuted)' }], mx, t('urgent_n', { n: fmt(s.n), u: fmt(s.u) }))); });

    var tb = $('#agtable tbody'); tb.textContent = '';
    sums.forEach(function (s) {
      var tr = el('tr', 'click' + (s.agent === S.sel ? ' sel' : '')); tr.tabIndex = 0;
      var H = function (v) { return s.hist ? v : '—'; };
      [whoLabel(s.agent), fmt(s.capacity), H(fmt(s.taken)), H(fmt(s.done)), pct(s.kpi), hrs(s.lead), hrs(s.cycle), pct(s.sla), fmt(s.open), fmt(s.over), fmt(s.wonN), usd(s.wonSum), usd(s.wonAvg)].forEach(function (v, i) {
        var td = el('td', i ? 'num' : null, v);
        if (i === 0 && isExtra(s.agent)) { td.appendChild(document.createTextNode(' ')); td.appendChild(el('span', 'tag ok', t('ag_new'))); }
        tr.appendChild(td);
      });
      var act = el('td', 'num');
      if (s.agent !== DEPT) {
        var rb = el('button', 'btn sm', '×'); rb.type = 'button'; rb.title = t('ag_remove'); rb.setAttribute('aria-label', t('ag_remove_aria', { a: s.agent }));
        rb.addEventListener('click', function (e) { e.stopPropagation(); removeAgent(s.agent); }); act.appendChild(rb);
      }
      tr.appendChild(act);
      var pick = function () { S.sel = s.agent; renderAgents(); };
      tr.addEventListener('click', pick); tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target === tr) pick(); });
      tb.appendChild(tr);
    });

    var rest = leads.filter(function (r) { return r.status === 'New' && r.qual !== 'Spam' && r.qual !== 'Duplicate'; }).sort(byUrgency);
    var cap = st.cap, carry = rest.slice(cap);
    $('#planprev').innerHTML = tHtml('plan_text', { cap: fmt(cap), pool: fmt(rest.length), planned: fmt(Math.min(cap, rest.length)), carry: fmt(carry.length), ch: fmt(carry.filter(isHigh).length), days: st.days > 0 ? t('days_unit', { n: Math.ceil(rest.length / cap) }) : t('never') });

    var dept = S.sel === DEPT;
    $('#worktitle').textContent = dept ? t('wl_dept_title') : t('wl_agent_title', { a: S.sel });
    $('#worksub').textContent = dept ? t('wl_dept_sub') : t('wl_agent_sub');
    var list = leads.filter(function (r) { return dept ? (r.status === 'New' && r.agent === '' && isHigh(r)) : (r.agent === S.sel && r.status !== 'Won'); }).sort(byUrgency).slice(0, 12);
    var wb = $('#worktable tbody'); wb.textContent = '';
    if (!list.length) { var wtr = el('tr'), wtd = el('td'); wtd.colSpan = 5; wtd.appendChild(emptyState('inbox', t('em_work_t'), t('em_work_x'), null, null, true)); wtr.appendChild(wtd); wb.appendChild(wtr); }
    list.forEach(function (r) {
      var tr = el('tr', 'click'); tr.setAttribute('data-lead', r.id); tr.tabIndex = 0;
      [r.id, r.name, t('p_' + pri(r)), r.status, ageTxt(r.age_h)].forEach(function (v, i) { tr.appendChild(el('td', i === 4 ? 'num' : null, v)); });
      wb.appendChild(tr);
    });
    renderSim(); renderWorkspace();
  }
  function renderSim() {
    var sim = simulate(), out = $('#simout'); out.textContent = '';
    if (!S.simSel || AGENTS.indexOf(S.simSel) < 0) S.simSel = AGENTS[0];
    var placed = sum(AGENTS, function (a) { return sim.plan[a].length; }), lh = sim.left.filter(isHigh).length;
    var p = el('p', 'p'); p.innerHTML = tHtml('sim_sum', { p: fmt(placed), t: fmt(sim.total), l: fmt(sim.left.length), h: fmt(lh) }) + (lh ? esc(t('sim_sum_h')) : ''); out.appendChild(p);
    var grid = el('div', 'simgrid');
    AGENTS.forEach(function (a) {
      var L = sim.plan[a], b = el('button', 'simcard'); b.type = 'button'; b.setAttribute('aria-pressed', String(a === S.simSel));
      b.appendChild(el('b', null, a));
      b.appendChild(el('span', null, t('sim_card', { n: fmt(L.length), h: fmt(L.filter(isHigh).length) })));
      b.appendChild(el('span', null, t('sim_age', { v: L.length ? ageTxt(avg(L, function (r) { return r.age_h; })) : '—' })));
      b.appendChild(el('span', null, t('sim_budget', { v: usd(sum(L, function (r) { return r.budget; })) })));
      b.addEventListener('click', function () { S.simSel = a; renderSim(); });
      grid.appendChild(b);
    });
    out.appendChild(grid);
    out.appendChild(el('p', 'subt', t('sim_list', { a: S.simSel })));
    sim.plan[S.simSel].slice().sort(byUrgency).slice(0, 10).forEach(function (r) {
      var row = el('div', 'simrow'), sel = el('select', 'sel');
      AGENTS.forEach(function (a) { var o = el('option', null, a === S.simSel ? t('sim_transfer') : a); o.value = a; sel.appendChild(o); });
      sel.value = S.simSel;
      sel.addEventListener('change', function () {
        var prev = S.moves[r.id], to = sel.value;
        S.moves[r.id] = to; renderSim(); renderWorkspace(); renderMetrics();
        toast(t('tt_transfer', { n: r.name, a: to }), { undo: function () { if (prev === undefined) delete S.moves[r.id]; else S.moves[r.id] = prev; renderSim(); renderWorkspace(); renderMetrics(); } });
      });
      row.setAttribute('data-lead', r.id); row.tabIndex = 0;
      row.appendChild(el('span', null, r.id)); row.appendChild(el('span', null, r.name + ' · ' + r.request));
      row.appendChild(el('span', null, t('p_' + pri(r)) + ' · ' + usd(r.budget))); row.appendChild(sel);
      out.appendChild(row);
    });
  }

  /* --------------------------------------------------------------- metrics */
  function isJunk(r) { return r.qual === 'Spam' || r.qual === 'Duplicate'; }
  function filled(v) { return v != null && String(v).trim() !== '' && v !== '—'; }
  function plainBar(label, v, color, valTxt) { return barRow(label, [{ v: v * 100, c: color }], 100, valTxt); }
  function renderMetrics() {
    var act = leads.filter(function (r) { return r.status === 'New' && !isJunk(r); });
    var waiting = act.filter(function (r) { return r.status_since_h > 24; });
    var openL = leads.filter(function (r) { return r.status !== 'Won' && !isJunk(r); });
    var spamAll = base.filter(function (r) { return r.qual === 'Spam'; });
    var arch = spamAll.filter(function (r) { return S.spam[r.id] === 'archived'; }).length, ret = spamAll.filter(function (r) { return S.spam[r.id] === 'restored'; }).length;
    var sim = simulate(), placed = sum(AGENTS, function (a) { return sim.plan[a].length; });
    var moved = Object.keys(S.moves).filter(function (id) { return AGENTS.some(function (a) { return sim.plan[a].some(function (r) { return r.id === id; }); }); }).length;
    var loads = AGENTS.map(function (a) { return openL.filter(function (r) { return r.agent === a; }).length; });
    var mx = loads.length ? Math.max.apply(null, loads) : 0, mn = loads.length ? Math.min.apply(null, loads) : 0;
    var nonSpam = leads.filter(function (r) { return r.qual !== 'Spam'; });
    var fInd = leads.filter(function (r) { return filled(r.industry); }).length, fSrc = leads.filter(function (r) { return filled(r.source); }).length, fBud = nonSpam.filter(function (r) { return r.budget > 0; }).length;
    var checks = leads.length * 2 + nonSpam.length;

    var tiles = $('#mttiles'); tiles.textContent = '';
    tiles.appendChild(tile(t('mt_money'), [usd(sum(waiting, function (r) { return r.budget; }))], t('mt_money_n', { n: fmt(act.length) }), true));
    tiles.appendChild(tile(t('mt_pipe'), [usd(sum(openL, function (r) { return r.budget; }))], t('mt_pipe_n', { n: fmt(openL.length) })));
    tiles.appendChild(tile(t('mt_prec'), [arch + ret ? pct(arch / (arch + ret)) : '—'], arch + ret ? t('mt_prec_n', { a: fmt(arch), r: fmt(ret) }) : t('mt_prec_none')));
    tiles.appendChild(tile(t('mt_manual'), [placed ? pct(moved / placed) : '—'], t('mt_manual_n', { m: fmt(moved), p: fmt(placed) })));
    tiles.appendChild(tile(t('mt_spread'), [fmt(mx - mn)], t('mt_spread_n', { a: fmt(mx), b: fmt(mn) })));
    tiles.appendChild(tile(t('mt_data'), [checks ? pct((fInd + fSrc + fBud) / checks) : '—'], t('mt_data_n')));

    var wb = $('#mtwait'); wb.textContent = '';
    var B = [['b1', 0, 4], ['b2', 4, 24], ['b3', 24, 72], ['b4', 72, 168], ['b5', 168, 1e9]];
    var ws = B.map(function (b) { var g = act.filter(function (r) { return r.status_since_h >= b[1] && r.status_since_h < b[2]; }); var u = sum(g.filter(isHigh), function (r) { return r.budget; }), all = sum(g, function (r) { return r.budget; }); return { l: t(b[0]), all: all, u: u }; });
    var wmax = Math.max.apply(null, ws.map(function (s) { return s.all; }).concat([1]));
    ws.forEach(function (s) { wb.appendChild(barRow(s.l, [{ v: s.u, c: 'var(--bad)' }, { v: s.all - s.u, c: 'var(--chartmuted)' }], wmax, t('mt_wait_val', { v: usd(s.all), u: usd(s.u) }))); });
    var leg = el('div', 'leg');
    [['var(--bad)', t('leg_urgent')], ['var(--chartmuted)', t('leg_other')]].forEach(function (x) { var s = el('span'), w = el('i', 'sw'); w.style.background = x[0]; s.appendChild(w); s.appendChild(document.createTextNode(x[1])); leg.appendChild(s); });
    wb.appendChild(leg);

    var target = Math.min(100, Math.max(1, Number($('#kpi-target').value) || 70)), wk = DAYS.slice(-7);
    var items = AGENTS.filter(hasHist).map(function (a) {
      var rs = DATA.agents.filter(function (r) { return r.agent === a && wk.indexOf(r.date) >= 0; }), c = sum(rs, function (r) { return r.capacity; });
      return { a: a, k: c ? sum(rs, function (r) { return r.done; }) / c : 0 };
    }).sort(function (x, y) { return y.k - x.k; });
    var meeting = items.filter(function (i) { return i.k * 100 >= target; }).length;
    $('#mtkpisub').textContent = t('mt_kpi_sub', { m: fmt(meeting), n: fmt(items.length), t: target });
    var kb = $('#mtkpi'); kb.textContent = '';
    var kmax = Math.max.apply(null, items.map(function (i) { return i.k * 100; }).concat([target, 100]));
    items.forEach(function (i) {
      var row = el('div', 'brow'), wrap = el('div', 'tgtw'), tr = el('div', 'btrack'), bar = el('i');
      bar.style.width = (i.k * 100 / kmax * 100) + '%'; bar.style.background = i.k * 100 >= target ? 'var(--accent)' : 'var(--chartmuted)'; tr.appendChild(bar);
      var mk = el('div', 'tgt'); mk.style.left = (target / kmax * 100) + '%'; wrap.appendChild(tr); wrap.appendChild(mk);
      row.appendChild(el('div', null, i.a)); row.appendChild(wrap); row.appendChild(el('div', 'bval', pct(i.k))); kb.appendChild(row);
    });

    var chips = $('#mtchips'); chips.textContent = '';
    [['source', 'mt_dim_source'], ['industry', 'mt_dim_industry'], ['segment', 'mt_dim_segment']].forEach(function (d) {
      var b = el('button', 'chip', t(d[1])); b.type = 'button'; b.setAttribute('aria-pressed', String(S.mdim === d[0]));
      b.addEventListener('click', function () { S.mdim = d[0]; renderMetrics(); }); chips.appendChild(b);
    });
    var hd = $('#mtdimhead'); hd.textContent = '';
    [[S.mdim === 'source' ? 'mt_dim_source' : S.mdim === 'industry' ? 'mt_dim_industry' : 'mt_dim_segment', 0], ['mt_c_leads', 1], ['mt_c_urgent', 1], ['mt_c_junk', 1], ['mt_c_past', 1], ['mt_c_avg', 1], ['mt_c_rep', 1]].forEach(function (c) { hd.appendChild(el('th', c[1] ? 'num' : null, t(c[0]))); });
    var groups = {};
    leads.forEach(function (r) { var k = r[S.mdim] || '—'; (groups[k] = groups[k] || []).push(r); });
    var rows = Object.keys(groups).map(function (k) {
      var g = groups[k], withB = g.filter(function (r) { return r.budget > 0; });
      return { k: k, n: g.length, u: g.filter(isHigh).length / g.length, j: g.filter(isJunk).length / g.length, p: g.filter(function (r) { return r.status !== 'New'; }).length / g.length, a: withB.length ? sum(withB, function (r) { return r.budget; }) / withB.length : 0, r: g.filter(function (r) { return r.repeats > 0; }).length / g.length };
    }).sort(function (x, y) { return y.n - x.n; });
    var tb = $('#mtdim tbody'); tb.textContent = '';
    rows.forEach(function (r) { var tr = el('tr');[r.k, fmt(r.n), pct(r.u), pct(r.j), pct(r.p), usd(r.a), pct(r.r)].forEach(function (v, i) { tr.appendChild(el('td', i ? 'num' : null, v)); }); tb.appendChild(tr); });

    var ah = $('#mtaihead'); ah.textContent = '';
    [['mt_ai_band', 0], ['mt_ai_rev', 1], ['mt_ai_conf', 1], ['mt_ai_ret', 1], ['mt_ai_prec', 1]].forEach(function (c) { ah.appendChild(el('th', c[1] ? 'num' : null, t(c[0]))); });
    var bands = [['≥ 90%', 0.9, 1.01], ['75–89%', 0.75, 0.9], ['< 75%', 0, 0.75]], ab = $('#mtai tbody'); ab.textContent = '';
    var tot = { rev: 0, c: 0, r: 0 };
    bands.forEach(function (b) {
      var g = spamAll.filter(function (r) { return r.conf >= b[1] && r.conf < b[2] && S.spam[r.id]; }), c = g.filter(function (r) { return S.spam[r.id] === 'archived'; }).length;
      tot.rev += g.length; tot.c += c; tot.r += g.length - c;
      var tr = el('tr');[b[0], fmt(g.length), fmt(c), fmt(g.length - c), g.length ? pct(c / g.length) : '—'].forEach(function (v, i) { tr.appendChild(el('td', i ? 'num' : null, v)); }); ab.appendChild(tr);
    });
    var trt = el('tr');[t('mt_ai_total'), fmt(tot.rev), fmt(tot.c), fmt(tot.r), tot.rev ? pct(tot.c / tot.rev) : '—'].forEach(function (v, i) { var td = el('td', i ? 'num' : null, v); td.style.fontWeight = '600'; trt.appendChild(td); }); ab.appendChild(trt);
    $('#mtaiempty').textContent = tot.rev ? '' : t('mt_ai_empty');

    var fl = $('#mtfill'); fl.textContent = '';
    [['mt_f_industry', leads.length ? fInd / leads.length : 0], ['mt_f_budget', nonSpam.length ? fBud / nonSpam.length : 0], ['mt_f_source', leads.length ? fSrc / leads.length : 0]].forEach(function (x) { fl.appendChild(plainBar(t(x[0]), x[1], 'var(--accent2)', pct(x[1]))); });
    var rp = $('#mtrep'); rp.textContent = '';
    STATUSES.forEach(function (st) { var g = leads.filter(function (r) { return r.status === st; }), v = g.length ? g.filter(function (r) { return r.repeats > 0; }).length / g.length : 0; rp.appendChild(plainBar(st === 'Won' ? t('won') : st, v, 'var(--warn)', pct(v))); });

    var nd = $('#mtneed'); nd.textContent = '';
    for (var i = 1; i <= 8; i++) nd.appendChild(el('li', null, t('mt_nd' + i)));
  }

  /* -------------------------------------------------------------- workspace */
  function renderWorkspace() {
    var sel = $('#ws-agent');
    if (!S.wsAgent || AGENTS.indexOf(S.wsAgent) < 0) S.wsAgent = AGENTS[0];
    fillSelect(sel, AGENTS.map(function (a) { return [a, a]; }), S.wsAgent);
    var sim = simulate(), plan = sim.plan[S.wsAgent].slice().sort(byUrgency);
    var doneN = plan.filter(function (r) { return S.done[r.id]; }).length, total = plan.length, frac = total ? doneN / total : 0;
    var ring = $('#wsring'); ring.textContent = '';
    var svg = sv('svg', { viewBox: '0 0 120 120', width: 120, height: 120, class: 'ring', role: 'img' });
    svg.appendChild(sv('circle', { cx: 60, cy: 60, r: 50, fill: 'none', 'stroke-width': 10 }, { stroke: 'var(--soft)' }));
    var circ = 2 * Math.PI * 50;
    svg.appendChild(sv('circle', { cx: 60, cy: 60, r: 50, fill: 'none', 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-dasharray': (circ * frac) + ' ' + circ, transform: 'rotate(-90 60 60)' }, { stroke: 'var(--accent)' }));
    var tx = sv('text', { x: 60, y: 67, 'text-anchor': 'middle' }, { fill: 'var(--fg)', 'font-size': '22px', 'font-weight': '600', 'font-family': 'inherit' }); tx.textContent = pct(frac); svg.appendChild(tx);
    ring.appendChild(svg);
    $('#wsprogress').textContent = t('ws_progress_n', { d: fmt(doneN), p: fmt(total) });
    $('#wsplansub').textContent = t('ws_plan_sub');
    var pl = $('#wsplan'); pl.textContent = '';
    if (!plan.length) pl.appendChild(emptyState('inbox', t('em_ws_t'), t('em_ws_x'), t('em_ws_b'), function () { var n = $('#sim-norm'); n.scrollIntoView({ block: 'center' }); n.focus(); }, true));
    plan.forEach(function (r) {
      var row = el('div', 'planrow' + (S.done[r.id] ? ' done' : '')), cb = el('input'); cb.type = 'checkbox'; cb.checked = !!S.done[r.id];
      cb.setAttribute('aria-label', t('done') + ' ' + r.id);
      cb.addEventListener('change', function () { if (cb.checked) S.done[r.id] = true; else delete S.done[r.id]; db.set('mp.done', JSON.stringify(S.done)); renderWorkspace(); });
      var nm = el('span', 'clk', r.name + ' · ' + r.request); nm.setAttribute('data-lead', r.id); nm.tabIndex = 0;
      row.appendChild(cb); row.appendChild(el('span', 'mid', r.id)); row.appendChild(nm);
      var tg = el('span', 'tag ' + (pri(r) === 'Critical' ? 'bad' : pri(r) === 'High' ? 'warn' : ''), t('p_' + pri(r))); row.appendChild(tg);
      pl.appendChild(row);
    });
    var al = $('#wsalerts'); al.textContent = '';
    var crit = leads.filter(function (r) { return r.agent === S.wsAgent && r.status !== 'Won' && r.priority === 'Critical' && r.age_h > 24; }).sort(byUrgency);
    if (!crit.length) al.appendChild(emptyState('check', t('em_alert_t'), null, null, null, true));
    crit.forEach(function (r) { var ar = el('div', 'alert', r.id + ' · ' + r.name + ' · ' + r.status + ' · ' + t('in_status', { a: ageTxt(r.status_since_h), b: ageTxt(r.age_h) })); ar.setAttribute('data-lead', r.id); ar.tabIndex = 0; al.appendChild(ar); });
    var me = summaryFor(S.wsAgent), dp = summaryFor(DEPT), cm = $('#wscmp'); cm.textContent = '';
    [['lead', me.lead, dp.lead, hrs], ['cycle', me.cycle, dp.cycle, hrs], ['t_sla', me.sla, dp.sla, pct], ['kpi', me.kpi, dp.kpi, pct]].forEach(function (m) {
      cm.appendChild(el('div', 'lab', t(m[0] === 't_sla' ? 'th_sla' : m[0] === 'kpi' ? 'th_kpi' : m[0])));
      var mx = Math.max(m[1] == null ? 0 : m[1], m[2], 1e-9);
      [[t('ws_you'), m[1], 'var(--accent)'], [t('ws_dept'), m[2], 'var(--chartmuted)']].forEach(function (x) {
        var row = el('div', 'row'), bar = el('div', 'bar'), i = el('i'); i.style.width = ((x[1] == null ? 0 : x[1]) / mx * 100) + '%'; i.style.background = x[2]; bar.appendChild(i);
        row.appendChild(el('span', null, x[0])); row.appendChild(bar); row.appendChild(el('span', null, m[3](x[1]))); cm.appendChild(row);
      });
    });
  }

  /* ----------------------------------------------------------- interactions */
  function icon(name) {
    var paths = {
      search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
      check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
      inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>'
    };
    var s = sv('svg', { viewBox: '0 0 24 24', width: 34, height: 34, fill: 'none', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, { stroke: 'currentColor' });
    s.innerHTML = paths[name]; return s;
  }
  function emptyState(ic, title, text, btnLabel, btnFn, compact) {
    var d = el('div', 'estate' + (compact ? ' compact' : ''));
    d.appendChild(icon(ic)); d.appendChild(el('b', null, title)); if (text) d.appendChild(el('span', null, text));
    if (btnLabel && btnFn) { var b = el('button', 'btn sm', btnLabel); b.type = 'button'; b.addEventListener('click', btnFn); d.appendChild(b); }
    return d;
  }
  function filtersActive() { return !!(S.agent || S.pri || S.qual || S.delay || S.seg || S.ind || S.src || S.repeat || S.paid || S.q); }
  function toast(msg, o) {
    o = o || {};
    var box = $('#toasts'), d = el('div', 'toast'), timer = null;
    function close() { clearTimeout(timer); if (d.parentNode) d.parentNode.removeChild(d); }
    d.appendChild(el('span', null, msg));
    if (o.undo) { var b = el('button', 'toast-btn', t('tt_undo')); b.type = 'button'; b.addEventListener('click', function () { close(); o.undo(); }); d.appendChild(b); }
    var x = el('button', 'toast-x', '×'); x.type = 'button'; x.setAttribute('aria-label', t('md_close')); x.addEventListener('click', close); d.appendChild(x);
    box.appendChild(d);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    timer = setTimeout(close, o.ms || 5500);
    return close;
  }
  function showSkeletons() {
    var tile = function () { var b = el('div', 'box'); b.appendChild(el('div', 'skel sk-l')); b.appendChild(el('div', 'skel sk-v')); b.appendChild(el('div', 'skel sk-l short')); return b; };
    [['#herotiles', 4], ['#agtiles', 5], ['#mttiles', 6]].forEach(function (x) { var c = $(x[0]); c.textContent = ''; c.setAttribute('aria-busy', 'true'); for (var i = 0; i < x[1]; i++) c.appendChild(tile()); });
    var bd = $('#boardcols'); bd.textContent = ''; bd.setAttribute('aria-busy', 'true');
    for (var i = 0; i < 5; i++) { var col = el('div', 'col'); col.appendChild(el('div', 'skel sk-h')); for (var j = 0; j < 3; j++) col.appendChild(el('div', 'skel sk-card')); bd.appendChild(col); }
    ['#chart-done', '#chart-time'].forEach(function (s) { var c = $(s); c.textContent = ''; c.appendChild(el('div', 'skel sk-chart')); });
    ['#qualbars', '#agebars', '#mtwait', '#mtkpi'].forEach(function (s) { var c = $(s); c.textContent = ''; for (var k = 0; k < 5; k++) c.appendChild(el('div', 'skel sk-row')); });
  }

  /* lead edits (moves, priority, owner, notes) are kept as overrides on top of the data */
  function saveOv() { db.set('mp.ov', JSON.stringify(S.ov)); }
  function ovFor(id) { if (!S.ov[id]) S.ov[id] = { notes: [], ev: [] }; return S.ov[id]; }
  function snapOv(id) { return S.ov[id] ? JSON.parse(JSON.stringify(S.ov[id])) : null; }
  function restoreOv(id, snap) { if (snap) S.ov[id] = snap; else delete S.ov[id]; saveOv(); refreshData(); }
  function moveLead(id, to) {
    var r = leadById(id); if (!r || r.status === to) return;
    var snap = snapOv(id), o = ovFor(id), now = Date.now();
    o.ev.push({ t: now, k: 'moved', a: r.status, b: to }); o.status = to; o.movedAt = now;
    saveOv(); refreshData();
    revealCard(id, to);
    toast(t('tt_moved', { n: r.name, s: to }), { undo: function () { restoreOv(id, snap); } });
  }
  function revealCard(id, status) {
    var list = leads.filter(passes).filter(function (r) { return r.status === status; }).sort(byUrgency);
    var idx = list.findIndex(function (r) { return r.id === id; });
    if (idx < 0) return;
    if (idx >= (S.limit[status] || 8)) { S.limit[status] = Math.ceil((idx + 1) / 8) * 8; renderBoard(); }
    var c = $('#boardcols .card[data-lead="' + id + '"]');
    if (c) { c.classList.add('flash'); setTimeout(function () { c.classList.remove('flash'); }, 1600); }
  }
  function setPriority(id, p) {
    var r = leadById(id); if (!r || r.priority === p) return;
    var snap = snapOv(id), o = ovFor(id);
    o.ev.push({ t: Date.now(), k: 'prio', p: p }); o.priority = p; saveOv(); refreshData();
    toast(t('tt_prio', { n: r.name, p: t('p_' + p) }), { undo: function () { restoreOv(id, snap); } });
  }
  function setOwner(id, a) {
    var r = leadById(id); if (!r || r.agent === a) return;
    var snap = snapOv(id), o = ovFor(id);
    o.ev.push({ t: Date.now(), k: 'owner', a: a }); o.agent = a; saveOv(); refreshData();
    toast(t('tt_owner', { n: r.name, a: a || t('none') }), { undo: function () { restoreOv(id, snap); } });
  }
  function addNote(id, text) {
    text = String(text || '').trim(); if (!text) return;
    var snap = snapOv(id), o = ovFor(id);
    o.notes.unshift({ t: Date.now(), x: text.slice(0, 2000) }); o.ev.push({ t: Date.now(), k: 'note' });
    saveOv(); noteDraft = ''; refreshData(); toast(t('tt_note_added'), { undo: function () { restoreOv(id, snap); } });
  }
  function deleteNote(id, idx) {
    var snap = snapOv(id), o = ovFor(id); o.notes.splice(idx, 1); saveOv(); refreshData();
    toast(t('tt_note_deleted'), { undo: function () { restoreOv(id, snap); } });
  }

  /* lead modal */
  var modalId = null, modalOpener = null, noteDraft = '';
  function openLead(id, opener) {
    if (!byId[id]) return;
    modalId = id; modalOpener = opener || null; noteDraft = '';
    $('#mdl').hidden = false; document.body.classList.add('lock');
    renderModal(); $('#mdl-close').focus();
  }
  function closeModal() {
    if (!modalId) return;
    modalId = null; $('#mdl').hidden = true; document.body.classList.remove('lock');
    if (modalOpener && document.body.contains(modalOpener)) { try { modalOpener.focus(); } catch (e) { /* ignore */ } }
    modalOpener = null;
  }
  function buildTimeline(b, o) {
    var ev = [];
    ev.push({ h: b.age_h, text: t('md_tl_arrived', { s: b.source }) });
    for (var i = 1; i <= b.repeats; i++) ev.push({ h: b.age_h * (1 - i / (b.repeats + 1)), text: t('md_tl_repeat') });
    if (b.paid) ev.push({ h: Math.max(0, b.age_h - 0.2), text: t('md_tl_paid') });
    if (b.qual === 'Spam') ev.push({ h: Math.max(0, b.age_h - 0.1), text: t('md_tl_spam', { r: t('r_' + (b.spam_reason || 'unknown')), p: Math.round(b.conf * 100) }) });
    if (b.qual === 'Duplicate' && b.dup_of) ev.push({ h: Math.max(0, b.age_h - 0.1), text: t('md_tl_dup', { id: b.dup_of }) });
    if (b.status !== 'New') {
      if (b.agent) ev.push({ h: b.status_since_h, text: t('md_tl_assigned', { a: b.agent }) });
      ev.push({ h: b.status_since_h, text: t('md_tl_moved', { s: b.status }) });
    }
    (o.ev || []).forEach(function (e) {
      var text = e.k === 'moved' ? t('md_tl_u_moved', { a: e.a, b: e.b }) : e.k === 'prio' ? t('md_tl_u_prio', { p: t('p_' + e.p) }) : e.k === 'owner' ? t('md_tl_u_owner', { a: e.a || t('none') }) : t('md_tl_u_note');
      ev.push({ h: (Date.now() - e.t) / 36e5, text: text, real: e.t });
    });
    ev.sort(function (x, y) { return y.h - x.h; });
    return ev;
  }
  function renderModal() {
    if (!modalId) return;
    var b0 = byId[modalId], r = leadById(modalId), o = S.ov[modalId] || { notes: [], ev: [] };
    var active = document.activeElement && document.activeElement.id, loc = LOCALES[S.lang];
    $('#mdl-title').textContent = r.name;
    var sub = $('#mdl-sub'); sub.textContent = '';
    sub.appendChild(el('span', 'mid', r.id));
    sub.appendChild(el('span', 'tag ' + (r.priority === 'Critical' ? 'bad' : r.priority === 'High' ? 'warn' : ''), t('p_' + r.priority)));
    sub.appendChild(el('span', 'tag', r.status)); sub.appendChild(el('span', 'tag', t('q_' + r.qual)));
    var body = $('#mdl-body'); body.textContent = '';
    if (S.spam[r.id] === 'archived') {
      var bn = el('div', 'mdl-banner'); bn.appendChild(el('span', null, t('md_archived')));
      var ub = el('button', 'btn sm', t('md_undo_archive')); ub.type = 'button'; ub.addEventListener('click', function () { decide(r.id, null); }); bn.appendChild(ub); body.appendChild(bn);
    }
    var dl = el('dl', 'mdl-dl');
    function row(k, v) { var d = el('div'); d.appendChild(el('dt', null, t(k))); var dd = el('dd'); if (typeof v === 'string') dd.textContent = v; else dd.appendChild(v); d.appendChild(dd); dl.appendChild(d); }
    row('md_request', r.request || '—'); row('md_source', r.source); row('md_segment', r.segment); row('md_industry', r.industry);
    row('md_budget', r.budget ? usd(r.budget) : '—'); row('md_owner', r.agent || t('no_owner'));
    row('md_instatus', ageTxt(r.status_since_h)); row('md_age', ageTxt(r.age_h)); row('md_repeats', fmt(r.repeats));
    row('md_paid', r.paid ? t('md_yes') : t('md_no'));
    if (r.qual === 'Duplicate' && r.dup_of) { var lk = el('button', 'lnk', r.dup_of); lk.type = 'button'; lk.addEventListener('click', function () { openLead(r.dup_of, modalOpener); }); row('md_dupof', byId[r.dup_of] ? lk : r.dup_of); }
    if (dupCounts[r.id]) row('md_hasdup', fmt(dupCounts[r.id]));
    if (b0.qual === 'Spam') row('md_ai', t('r_' + (b0.spam_reason || 'unknown')) + ' · ' + t('conf', { p: Math.round(b0.conf * 100) }));
    body.appendChild(dl);

    var acts = el('div', 'mdl-sec'); acts.appendChild(el('h3', null, t('md_actions')));
    var grid = el('div', 'mdl-actions');
    function ctl(label, id, items, value, onChange) {
      var l = el('label', 'f'); l.appendChild(el('span', null, label));
      var s = el('select', 'sel'); s.id = id;
      items.forEach(function (it) { var op = el('option', null, it[1]); op.value = it[0]; s.appendChild(op); });
      s.value = value; s.addEventListener('change', function () { onChange(s.value); }); l.appendChild(s); grid.appendChild(l);
    }
    ctl(t('md_move'), 'md-status', STATUSES.map(function (s) { return [s, s]; }), r.status, function (v) { moveLead(r.id, v); });
    ctl(t('md_prio'), 'md-prio', PRI.map(function (p) { return [p, t('p_' + p)]; }), r.priority, function (v) { setPriority(r.id, v); });
    ctl(t('md_owner'), 'md-owner', [['', t('none')]].concat(AGENTS.map(function (a) { return [a, a]; })), r.agent, function (v) { setOwner(r.id, v); });
    acts.appendChild(grid); body.appendChild(acts);

    var ns = el('div', 'mdl-sec mdl-note'); ns.appendChild(el('h3', null, t('md_notes')));
    var ta = el('textarea'); ta.id = 'md-note'; ta.maxLength = 2000; ta.placeholder = t('md_note_ph'); ta.value = noteDraft;
    ta.setAttribute('aria-label', t('md_notes')); ta.addEventListener('input', function () { noteDraft = ta.value; });
    ns.appendChild(ta);
    var nb = el('button', 'btn sm primary', t('md_note_add')); nb.type = 'button'; nb.style.marginTop = '8px'; nb.addEventListener('click', function () { addNote(r.id, ta.value); }); ns.appendChild(nb);
    var nl = el('div'); nl.style.marginTop = '8px';
    if (!o.notes.length) nl.appendChild(el('div', 'subt', t('md_note_none')));
    o.notes.forEach(function (n, i) {
      var d = el('div', 'nt'), left = el('div');
      left.appendChild(el('span', 'tm', new Date(n.t).toLocaleString(loc))); left.appendChild(el('span', 'tx', n.x)); d.appendChild(left);
      var x = el('button', 'btn sm', '×'); x.type = 'button'; x.setAttribute('aria-label', t('tt_note_deleted')); x.addEventListener('click', function () { deleteNote(r.id, i); }); d.appendChild(x); nl.appendChild(d);
    });
    ns.appendChild(nl); body.appendChild(ns);

    var tl = el('div', 'mdl-sec'); tl.appendChild(el('h3', null, t('md_timeline')));
    var ul = el('ul', 'tlist');
    buildTimeline(b0, o).forEach(function (e) {
      var li = el('li', e.real ? 'real' : ''); li.appendChild(document.createTextNode(e.text));
      li.appendChild(el('span', 'tm', e.real ? new Date(e.real).toLocaleString(loc) : t('md_ago', { v: ageTxt(e.h) }))); ul.appendChild(li);
    });
    tl.appendChild(ul); tl.appendChild(el('p', 'subt', t('md_tl_note'))); body.appendChild(tl);
    if (active) { var back = document.getElementById(active); if (back && $('#mdl').contains(back)) back.focus(); }
  }

  /* drag and drop between board columns */
  var drag = null, suppressClickUntil = 0;
  function initDnD() {
    $('#boardcols').addEventListener('pointerdown', function (e) {
      if (drag) return;
      var card = e.target.closest('.card[data-lead]');
      if (!card || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (e.target.closest('button, select, input, a')) return;
      var grip = e.target.closest('.grip');
      if (e.pointerType !== 'mouse' && !grip) return;
      drag = { id: card.getAttribute('data-lead'), status: card.getAttribute('data-status'), card: card, x0: e.clientX, y0: e.clientY, px: e.clientX, py: e.clientY, active: false, pid: e.pointerId, ghost: null, over: null, raf: 0, ox: 0, oy: 0 };
      document.addEventListener('pointermove', onDragMove);
      document.addEventListener('pointerup', onDragEnd);
      document.addEventListener('pointercancel', onDragCancel);
      document.addEventListener('keydown', onDragKey);
    });
  }
  function startDrag() {
    var d = drag, r = d.card.getBoundingClientRect();
    d.active = true; d.ox = d.x0 - r.left; d.oy = d.y0 - r.top;
    var g = d.card.cloneNode(true); g.classList.add('ghost'); g.removeAttribute('tabindex'); g.style.width = r.width + 'px';
    document.body.appendChild(g); d.ghost = g;
    d.card.classList.add('dragging'); document.body.classList.add('is-dragging');
    d.raf = requestAnimationFrame(dragLoop);
  }
  function onDragMove(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    drag.px = e.clientX; drag.py = e.clientY;
    if (!drag.active) { if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return; startDrag(); }
    if (e.cancelable) e.preventDefault();
    drag.ghost.style.transform = 'translate(' + (e.clientX - drag.ox) + 'px,' + (e.clientY - drag.oy) + 'px) rotate(1.5deg)';
    var under = document.elementFromPoint(e.clientX, e.clientY), col = under && under.closest ? under.closest('.col[data-status]') : null;
    if (drag.over !== col) {
      if (drag.over) drag.over.classList.remove('drop');
      drag.over = col;
      if (col && col.getAttribute('data-status') !== drag.status) col.classList.add('drop');
    }
  }
  function dragLoop() {
    if (!drag || !drag.active) return;
    var b = $('#boardcols'), r = b.getBoundingClientRect();
    if (drag.px < r.left + 50) b.scrollLeft -= 14; else if (drag.px > r.right - 50) b.scrollLeft += 14;
    if (drag.py < 60) window.scrollBy({ top: -14, behavior: 'instant' }); else if (drag.py > window.innerHeight - 60) window.scrollBy({ top: 14, behavior: 'instant' });
    drag.raf = requestAnimationFrame(dragLoop);
  }
  function endDrag() {
    var d = drag; if (!d) return; drag = null;
    cancelAnimationFrame(d.raf);
    document.removeEventListener('pointermove', onDragMove); document.removeEventListener('pointerup', onDragEnd);
    document.removeEventListener('pointercancel', onDragCancel); document.removeEventListener('keydown', onDragKey);
    if (d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
    d.card.classList.remove('dragging'); if (d.over) d.over.classList.remove('drop');
    document.body.classList.remove('is-dragging');
  }
  function onDragEnd(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    var d = drag, to = d.over && d.over.getAttribute('data-status');
    endDrag();
    if (d.active) { suppressClickUntil = Date.now() + 400; if (to && to !== d.status) moveLead(d.id, to); }
  }
  function onDragCancel() { endDrag(); }
  function onDragKey(e) { if (e.key === 'Escape') endDrag(); }
  function initLeadOpen() {
    document.addEventListener('click', function (e) {
      if (Date.now() < suppressClickUntil) return;
      var tg = e.target.closest ? e.target.closest('[data-lead]') : null;
      if (!tg || tg.closest('#mdl')) return;
      if (e.target.closest('button, select, input, textarea, a, .grip')) return;
      openLead(tg.getAttribute('data-lead'), tg);
    });
    document.addEventListener('keydown', function (e) {
      if (modalId) {
        if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
        if (e.key === 'Tab') {
          var f = $$('#mdl button, #mdl select, #mdl textarea, #mdl input, #mdl a[href]').filter(function (x) { return !x.disabled && x.offsetParent !== null; });
          if (!f.length) return;
          var first = f[0], last = f[f.length - 1];
          if (!$('#mdl').contains(document.activeElement)) { e.preventDefault(); first.focus(); }
          else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
        return;
      }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-lead]')) { e.preventDefault(); openLead(e.target.getAttribute('data-lead'), e.target); }
    });
    $('#mdl').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
    $('#mdl-close').addEventListener('click', closeModal);
  }

  /* ------------------------------------------------------------- orchestrate */
  function removeAgent(a) {
    if (AGENTS.length <= 1) { agMsg(t('ag_err_last')); return; }
    var wasExtra = isExtra(a), saved = wasExtra ? S.extra.filter(function (x) { return x.name === a; })[0] : null;
    if (isExtra(a)) S.extra = S.extra.filter(function (x) { return x.name !== a; }); else if (S.removed.indexOf(a) < 0) S.removed.push(a);
    saveTeam();
    Object.keys(S.moves).forEach(function (id) { if (S.moves[id] === a) delete S.moves[id]; });
    if (S.sel === a) S.sel = DEPT;
    refreshData(); agMsg(t('ag_removed', { a: a }));
    toast(t('tt_agent_removed', { a: a }), {
      undo: function () {
        if (wasExtra && saved) S.extra.push(saved); else S.removed = S.removed.filter(function (x) { return x !== a; });
        saveTeam(); refreshData();
      }
    });
  }
  function refreshData() {
    rebuild();
    if (S.agent && S.agent !== '__none' && AGENTS.indexOf(S.agent) < 0) S.agent = '';
    renderFilters(); renderHero(); renderBoard(); renderBars(); renderDups(); renderSpam(); renderAgents(); renderMetrics();
    if (modalId) renderModal();
  }
  function resetFilters() {
    Object.assign(S, { agent: '', pri: '', qual: '', delay: 0, seg: '', ind: '', src: '', repeat: false, paid: false, q: '', limit: {} });
    $('#f-repeat').checked = false; $('#f-paid').checked = false; $('#f-q').value = '';
  }
  function resetForData() { resetFilters(); S.sel = DEPT; S.simSel = ''; S.wsAgent = ''; S.moves = {}; S.spamTab = 'pending'; S.spamLimit = 12; }

  /* ---------------------------------------------------------------- import */
  var AG_REQ = ['date', 'agent', 'capacity', 'done', 'lead_time_h', 'cycle_time_h'], AG_OPT = ['assigned', 'critical_total', 'critical_in_sla'];
  var LD_REQ = ['id', 'name', 'status'], LD_OPT = ['request', 'segment', 'industry', 'source', 'priority', 'qual', 'agent', 'age_h', 'status_since_h', 'repeats', 'paid', 'budget', 'dup_of', 'spam_reason', 'conf'];
  var IN_REQ = ['date', 'new_leads'];
  var REASONS = ['nocontact', 'repeat', 'domain', 'gibberish', 'offtopic'];
  var TPL = {
    agents: 'date,agent,capacity,assigned,done,lead_time_h,cycle_time_h,critical_total,critical_in_sla\n2026-11-05,Anna P.,15,10,9,120.5,30,3,2\n2026-11-06,Anna P.,15,11,10,110,28,4,4\n',
    leads: 'id,name,request,segment,industry,source,status,priority,qual,agent,age_h,status_since_h,repeats,paid,budget,dup_of,spam_reason,conf\nL-1,Jamie Dawson,Website PPC campaign,B2B,SaaS,Website,New,High,Warm,,36,36,0,0,25000,,,\nL-2,Marta Evans,Social media strategy,SMB,Retail,Email,In Progress,Normal,Cold,Anna P.,20,8,1,0,6000,,,\nL-3,Paul Kingston,Lead generation,B2B,Finance,Call,New,Low,Spam,,5,5,0,0,0,,nocontact,0.93\n',
    inflow: 'date,new_leads\n2026-11-05,64\n2026-11-06,71\n'
  };
  var IMP = [
    { kind: 'agents', h: 'imp_agents_h', cols: AG_REQ.concat(AG_OPT), file: 'agents_daily.csv' },
    { kind: 'leads', h: 'imp_leads_h', cols: LD_REQ.concat(LD_OPT), file: 'leads.csv' },
    { kind: 'inflow', h: 'imp_inflow_h', cols: IN_REQ, file: 'inflow_daily.csv' }
  ];
  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, '');
    var first = text.split(/\r?\n/, 1)[0] || '';
    var delim = [',', ';', '\t'].map(function (d) { return [d, first.split(d).length - 1]; }).sort(function (a, b) { return b[1] - a[1]; })[0][0];
    var rows = [], row = [], cur = '', q = false, i, c;
    function endRow() { row.push(cur); cur = ''; if (row.length > 1 || row[0].trim() !== '') rows.push(row); row = []; }
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; endRow(); }
      else cur += c;
    }
    if (cur !== '' || row.length) endRow();
    var headers = (rows.shift() || []).map(function (h) { return h.trim().toLowerCase().replace(/\s+/g, '_'); });
    var objs = rows.map(function (r) { var o = {}; headers.forEach(function (h, k) { o[h] = r[k] === undefined ? '' : r[k]; }); return o; });
    return { headers: headers, objs: objs, delim: delim };
  }
  function toNum(raw, delim) {
    var s = String(raw).trim();
    if (delim !== ',' && /^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
  }
  function canon(list, v) { var l = String(v).trim().toLowerCase(); for (var i = 0; i < list.length; i++) if (list[i].toLowerCase() === l) return list[i]; return null; }
  function validate(kind, tbl, errs) {
    var req = kind === 'agents' ? AG_REQ : kind === 'leads' ? LD_REQ : IN_REQ;
    var miss = req.filter(function (c) { return tbl.headers.indexOf(c) < 0; });
    if (miss.length) { errs.push(t('imp_err_cols', { c: miss.join(', ') })); return null; }
    if (!tbl.objs.length) { errs.push(t('imp_err_empty')); return null; }
    var out = [], seen = {}, d = tbl.delim, dates = {};
    function num(o, c, r, required, errsLocal) {
      var raw = o[c];
      if (raw === undefined || String(raw).trim() === '') { if (required) { errs.push(t('imp_err_num', { r: r, c: c })); errsLocal.bad = true; } return null; }
      var v = toNum(raw, d);
      if (v === null || v < 0) { errs.push(t('imp_err_num', { r: r, c: c })); errsLocal.bad = true; return null; }
      return v;
    }
    tbl.objs.forEach(function (o, i) {
      var r = i + 2, st = { bad: false };
      if (kind === 'agents' || kind === 'inflow') {
        var date = String(o.date).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { errs.push(t('imp_err_date', { r: r })); return; }
        if (kind === 'inflow') {
          var nl = num(o, 'new_leads', r, true, st); if (st.bad) return;
          if (seen[date]) { errs.push(t('imp_err_dupkey', { r: r })); return; } seen[date] = 1;
          out.push({ date: date, new_leads: nl }); return;
        }
        var agent = String(o.agent).trim();
        if (!agent) { errs.push(t('imp_err_text', { r: r, c: 'agent' })); return; }
        var cap = num(o, 'capacity', r, true, st), dn = num(o, 'done', r, true, st), lt = num(o, 'lead_time_h', r, true, st), cy = num(o, 'cycle_time_h', r, true, st);
        var as = num(o, 'assigned', r, false, st), ct = num(o, 'critical_total', r, false, st), ci = num(o, 'critical_in_sla', r, false, st);
        if (st.bad) return;
        var key = date + '|' + agent;
        if (seen[key]) { errs.push(t('imp_err_dupkey', { r: r })); return; } seen[key] = 1; dates[date] = 1;
        out.push({ date: date, agent: agent, capacity: cap, assigned: as == null ? dn : as, done: dn, lead_time_h: lt, cycle_time_h: cy, critical_total: ct || 0, critical_in_sla: Math.min(ci || 0, ct || 0) });
        return;
      }
      var id = String(o.id).trim(), nm = String(o.name).trim();
      if (!id) { errs.push(t('imp_err_text', { r: r, c: 'id' })); return; }
      if (!nm) { errs.push(t('imp_err_text', { r: r, c: 'name' })); return; }
      var status = canon(STATUSES, o.status);
      if (!status) { errs.push(t('imp_err_enum', { r: r, v: o.status, c: 'status', a: STATUSES.join(', ') })); return; }
      var pr = 'Normal', ql = 'Cold';
      if (String(o.priority || '').trim() !== '') { pr = canon(PRI, o.priority); if (!pr) { errs.push(t('imp_err_enum', { r: r, v: o.priority, c: 'priority', a: PRI.join(', ') })); return; } }
      if (String(o.qual || '').trim() !== '') { ql = canon(QUALS, o.qual); if (!ql) { errs.push(t('imp_err_enum', { r: r, v: o.qual, c: 'qual', a: QUALS.join(', ') })); return; } }
      var age = num(o, 'age_h', r, false, st), since = num(o, 'status_since_h', r, false, st), rep = num(o, 'repeats', r, false, st), bud = num(o, 'budget', r, false, st), cf = num(o, 'conf', r, false, st);
      var paidRaw = String(o.paid || '').trim().toLowerCase(), paid = 0;
      if (['1', 'true', 'yes', 'y'].indexOf(paidRaw) >= 0) paid = 1; else if (['', '0', 'false', 'no', 'n'].indexOf(paidRaw) < 0) { errs.push(t('imp_err_enum', { r: r, v: o.paid, c: 'paid', a: '0, 1' })); return; }
      if (st.bad) return;
      if (seen[id]) { errs.push(t('imp_err_dupid', { r: r })); return; } seen[id] = 1;
      var reason = canon(REASONS, o.spam_reason || '') || '';
      var a = age == null ? 0 : age;
      out.push({
        id: id, name: nm, request: String(o.request || '').trim(), segment: String(o.segment || '').trim() || '—', industry: String(o.industry || '').trim() || '—', source: String(o.source || '').trim() || '—',
        status: status, priority: pr, qual: ql, agent: String(o.agent || '').trim(), age_h: a, status_since_h: since == null ? a : since, repeats: rep || 0, paid: paid, budget: bud || 0,
        dup_of: String(o.dup_of || '').trim(), spam_reason: reason, conf: cf == null ? (ql === 'Spam' ? 0.5 : 0) : Math.min(cf, 1)
      });
    });
    if (errs.length) return null;
    if (kind === 'agents' && Object.keys(dates).length < 2) { errs.push(t('imp_err_dates')); return null; }
    return out;
  }
  function impMsg(text, isErr) { var m = $('#imp-msg'); m.textContent = text; m.className = 'subt' + (isErr ? ' bad' : ''); }
  function unknownAgentsWarn() {
    var names = {}; DEMO.forEach(function (a) { names[a] = 1; }); S.extra.forEach(function (x) { names[x.name] = 1; });
    var n = DATA.leads.filter(function (r) { return r.agent && r.status !== 'Won' && !names[r.agent]; }).length;
    return n ? t('imp_warn_agents', { n: fmt(n) }) : '';
  }
  function commitImport(kind, rows, fname) {
    var cur = readJSON('mp.data', {}); if (!cur || typeof cur !== 'object') cur = {};
    cur[kind] = rows;
    var o = {}; Object.keys(DATA).forEach(function (k) { o[k] = DATA[k]; }); o[kind] = rows;
    var saving = db.set('mp.data', JSON.stringify(cur));
    if (kind === 'leads') { S.ov = {}; saveOv(); }
    applyData(o); resetForData(); renderAll();
    toast(t('tt_import_ok', { n: fmt(rows.length), f: fname }));
    var msg = t('imp_ok', { n: fmt(rows.length), f: fname }), w = unknownAgentsWarn();
    if (w) msg += ' ' + w;
    impMsg(msg, false);
    saving.then(function (ok) { if (!ok) impMsg(msg + ' ' + t('imp_unsaved'), false); });
  }
  function onFile(kind, input) {
    var f = input.files && input.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onerror = function () { impMsg(t('imp_err_read'), true); };
    rd.onload = function () {
      var errs = [], tbl, rows = null;
      try { tbl = parseCSV(String(rd.result)); rows = validate(kind, tbl, errs); } catch (e) { errs.push(t('imp_err_read')); }
      if (!rows || errs.length) { toast(t('tt_import_fail')); impMsg(errs.slice(0, 5).concat(errs.length > 5 ? [t('imp_more', { n: errs.length - 5 })] : []).concat([t('imp_nothing')]).join(' '), true); return; }
      commitImport(kind, rows, f.name);
    };
    rd.readAsText(f);
  }
  function downloadText(name, text) {
    var blob = new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function renderImport() {
    var box = $('#imp-rows'); box.textContent = '';
    IMP.forEach(function (m) {
      var row = el('div', 'improw'), left = el('div', 'grow'), custom = DATA[m.kind] !== DATA_DEMO[m.kind];
      left.appendChild(el('b', null, t(m.h)));
      left.appendChild(el('div', 'subt', custom ? t('imp_src_custom', { n: fmt(DATA[m.kind].length) }) : t('imp_src_demo')));
      left.appendChild(el('div', 'cols', t('imp_cols', { c: m.cols.join(', ') })));
      row.appendChild(left);
      var tb = el('button', 'btn sm', t('imp_tpl')); tb.type = 'button';
      tb.addEventListener('click', function () { downloadText(m.file, TPL[m.kind]); });
      var fi = el('input'); fi.type = 'file'; fi.accept = '.csv,text/csv,text/plain'; fi.setAttribute('aria-label', t(m.h));
      fi.addEventListener('change', function () { onFile(m.kind, fi); });
      row.appendChild(tb); row.appendChild(fi); box.appendChild(row);
    });
  }
  function loadSaved() {
    try {
      var s = readJSON('mp.data', null); if (!s || typeof s !== 'object') return;
      var chk = { leads: ['id', 'status'], agents: ['date', 'agent', 'done'], inflow: ['date', 'new_leads'] }, o = {};
      Object.keys(DATA).forEach(function (k) { o[k] = DATA[k]; });
      Object.keys(chk).forEach(function (k) {
        if (Array.isArray(s[k]) && s[k].length && typeof s[k][0] === 'object' && chk[k].every(function (c) { return s[k][0][c] != null; })) o[k] = s[k];
      });
      applyData(o);
    } catch (e) { /* ignore corrupted saved data */ }
  }
  function renderAll() { applyStatic(); renderImport(); renderFilters(); refreshData(); }
  function setTheme(th) { S.theme = th; document.documentElement.setAttribute('data-theme', th); store.set('mp.theme', th); $('#theme').textContent = th === 'dark' ? t('theme_light') : t('theme_dark'); }

  function bindOnce() {
    function bind(id, key, num) { $(id).addEventListener('change', function (e) { S[key] = num ? Number(e.target.value) : e.target.value; S.limit = {}; renderBoard(); }); }
    bind('#f-agent', 'agent'); bind('#f-pri', 'pri'); bind('#f-qual', 'qual'); bind('#f-delay', 'delay', true); bind('#f-seg', 'seg'); bind('#f-ind', 'ind'); bind('#f-src', 'src');
    $('#f-repeat').addEventListener('change', function (e) { S.repeat = e.target.checked; S.limit = {}; renderBoard(); });
    $('#f-paid').addEventListener('change', function (e) { S.paid = e.target.checked; S.limit = {}; renderBoard(); });
    $('#f-q').addEventListener('input', function (e) { S.q = e.target.value.trim().toLowerCase(); S.limit = {}; renderBoard(); });
    $('#f-reset').addEventListener('click', function () { resetFilters(); renderFilters(); renderBoard(); });
    $('#f-merge').addEventListener('click', function () { S.merged = !S.merged; S.limit = {}; renderHero(); renderBoard(); renderBars(); renderDups(); renderAgents(); renderMetrics(); toast(S.merged ? t('tt_merge_on') : t('tt_merge_off')); });
    $('#ov-reset').addEventListener('click', function () { var snap = JSON.parse(JSON.stringify(S.ov)); S.ov = {}; saveOv(); refreshData(); toast(t('tt_ov_reset'), { undo: function () { S.ov = snap; saveOv(); refreshData(); } }); });
    $('#imp-reset').addEventListener('click', function () {
      db.set('mp.data', '{}'); S.ov = {}; saveOv(); applyData({ leads: DATA_DEMO.leads, agents: DATA_DEMO.agents, inflow: DATA_DEMO.inflow }); resetForData(); renderAll(); impMsg(t('imp_demo_restored'), false); toast(t('tt_demo'));
    });
    $('#ag-add').addEventListener('click', function () {
      var name = $('#ag-name').value.trim().replace(/\s+/g, ' '), cap = Number($('#ag-cap').value);
      if (!name || name.length > 30) { agMsg(t('ag_err_name')); return; }
      var all = DEMO.concat(S.extra.map(function (x) { return x.name; }));
      if (all.some(function (n) { return n.toLowerCase() === name.toLowerCase(); })) { agMsg(t('ag_err_dup')); return; }
      if (!(cap >= 1 && cap <= 100) || Math.floor(cap) !== cap) { agMsg(t('ag_err_cap')); return; }
      S.extra.push({ name: name, capacity: cap }); saveTeam(); $('#ag-name').value = ''; S.sel = name;
      refreshData(); agMsg(t('ag_added', { a: name })); toast(t('tt_agent_added', { a: name }));
    });
    $('#ag-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#ag-add').click(); });
    $('#ag-reset').addEventListener('click', function () { var se = S.extra.slice(), sr = S.removed.slice(); S.extra = []; S.removed = []; saveTeam(); S.sel = DEPT; refreshData(); agMsg(t('ag_reset_done')); toast(t('tt_team_reset'), { undo: function () { S.extra = se; S.removed = sr; saveTeam(); refreshData(); } }); });
    $('#sim-norm').addEventListener('input', function () { renderSim(); renderWorkspace(); renderMetrics(); });
    $('#kpi-target').addEventListener('input', function () { renderMetrics(); });
    $('#sim-hi').addEventListener('input', function () { renderSim(); renderWorkspace(); renderMetrics(); });
    $('#sim-reset').addEventListener('click', function () { S.moves = {}; renderSim(); renderWorkspace(); renderMetrics(); toast(t('tt_sim_reset')); });
    $('#ws-agent').addEventListener('change', function (e) { S.wsAgent = e.target.value; renderWorkspace(); });
    $('#lang').addEventListener('change', function (e) { S.lang = e.target.value; store.set('mp.lang', S.lang); setLocale(); renderAll(); });
    $('#theme').addEventListener('click', function () { setTheme(S.theme === 'dark' ? 'light' : 'dark'); });
    var timer = null;
    window.addEventListener('orientationchange', function () { setTimeout(function () { drawDone($('#chart-done')); drawTime($('#chart-time')); }, 250); });
    window.addEventListener('resize', function () { clearTimeout(timer); timer = setTimeout(function () { drawDone($('#chart-done')); drawTime($('#chart-time')); }, 150); });
  }

  (function boot() {
    var sl = store.get('mp.lang'), nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    S.lang = I18N[sl] ? sl : (I18N[nav] ? nav : 'en');
    var st = store.get('mp.theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    S.theme = st === 'dark' || st === 'light' ? st : (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', S.theme);
    setLocale(); showSkeletons();
    db.open().then(function () { loadState(); loadSaved(); bindOnce(); initDnD(); initLeadOpen(); renderAll(); $$('[aria-busy]').forEach(function (n) { n.removeAttribute('aria-busy'); }); });
  })();
})();