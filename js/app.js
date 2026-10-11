/* WW2 Battle Odds. Copyright (C) 2026 jbmullican. Licensed under GPL-3.0-or-later; see LICENSE. */
(function () {
  'use strict';
  var E = window.AAEngine, U = E.UNITS, NAT = E.NATIONS;
  var VERSION = '1.0.2';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  // Escape any text that goes into innerHTML (attribute or element content).
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var esc = escapeHtml;
  function toCount(v) { var n = Math.floor(Number(v)); return isFinite(n) ? Math.max(0, Math.min(99, n)) : 0; }
  function pct(x) { return (x * 100).toFixed(x > 0 && x < 0.001 ? 2 : 1) + '%'; }
  function natStyle(n) { var c = NAT[n] || { color: '#888', text: '#fff' }; return '--nc:' + c.color + ';--nt:' + c.text; }

  // ---------- state ----------
  var DEFAULT = {
    type: 'land',
    att: [{ nation: 'USSR', units: { inf: 3, art: 1, arm: 1 } }],
    def: [{ nation: 'Germany', units: { inf: 3, arm: 1 } }],
    opts: { order: 'cost', keepLand: true, retreatAfter: 0, n: 10000 }
  };
  // Rebuild state from untrusted input (localStorage or __aa.set): only known
  // battle types, nations from E.NATION_ORDER, known unit keys, and integer counts 0-99.
  var ORDERS = ['cost', 'power'], SIM_COUNTS = [2000, 10000, 25000, 50000];
  function sanitizeState(raw) {
    var d = JSON.parse(JSON.stringify(DEFAULT));
    if (!raw || typeof raw !== 'object') return d;
    var out = { type: Object.prototype.hasOwnProperty.call(E.ALLOWED, raw.type) ? raw.type : d.type, opts: {} };
    ['att', 'def'].forEach(function (role) {
      var list = Array.isArray(raw[role]) ? raw[role] : [], seen = [];
      out[role] = [];
      list.forEach(function (e) {
        if (!e || typeof e !== 'object' || E.NATION_ORDER.indexOf(e.nation) < 0 || seen.indexOf(e.nation) >= 0) return;
        seen.push(e.nation);
        var units = {}, src = e.units && typeof e.units === 'object' ? e.units : {};
        Object.keys(U).forEach(function (t) { if (Object.prototype.hasOwnProperty.call(src, t)) { var c = toCount(src[t]); if (c) units[t] = c; } });
        out[role].push({ nation: e.nation, units: units });
      });
      if (!out[role].length) out[role] = d[role];
    });
    var o = raw.opts && typeof raw.opts === 'object' ? raw.opts : {};
    out.opts.order = ORDERS.indexOf(o.order) >= 0 ? o.order : d.opts.order;
    out.opts.keepLand = o.keepLand === undefined ? d.opts.keepLand : !!o.keepLand;
    var r = Math.floor(Number(o.retreatAfter)); out.opts.retreatAfter = isFinite(r) ? Math.max(0, Math.min(20, r)) : 0;
    out.opts.n = SIM_COUNTS.indexOf(+o.n) >= 0 ? +o.n : d.opts.n;
    return out;
  }
  var S;
  try { S = JSON.parse(localStorage.getItem('aa-state')); } catch (e) { S = null; }
  S = sanitizeState(S);
  function save() { try { localStorage.setItem('aa-state', JSON.stringify(S)); } catch (e) {} }
  var view = 'setup';

  function specFor(role) { return S[role].map(function (e) { return { nation: e.nation, units: e.units }; }); }
  function engineOpts() { return { type: S.type, keepLand: S.opts.keepLand, order: S.opts.order, retreatAfter: S.opts.retreatAfter }; }

  // ---------- setup view ----------
  function unitRow(role, idx, t, count) {
    var u = U[t], role2 = role === 'att' ? 'A' : 'D';
    var val = role === 'att' ? u.a : u.d;
    var extra = '';
    if (t === 'inf' && role === 'att') extra = ' (2 with art)';
    if (t === 'aa') extra = ' · fires at air';
    if (u.hp > 1) extra += ' · 2 hits';
    if (role === 'att' && S.type === 'amph' && u.dom === 'sea') extra = ' · bombards round 1';
    if (t === 'ss') extra = ' · first strike';
    return '<div class="urow' + (count ? '' : ' zero') + '"><div class="un"><b>' + u.name + '</b><small>' + role2 + val + extra + ' · ' + u.cost + ' IPC</small></div>' +
      '<div class="stepper"><button data-act="dec" data-role="' + role + '" data-idx="' + idx + '" data-unit="' + t + '" aria-label="Remove ' + u.name + '">−</button>' +
      '<input inputmode="numeric" pattern="[0-9]*" value="' + escapeHtml(count) + '" data-act="set" data-role="' + role + '" data-idx="' + idx + '" data-unit="' + t + '" aria-label="' + u.name + ' count">' +
      '<button data-act="inc" data-role="' + role + '" data-idx="' + idx + '" data-unit="' + t + '" aria-label="Add ' + u.name + '">+</button></div></div>';
  }
  function sideIpc(role) {
    var tot = 0, n = 0;
    S[role].forEach(function (e) { E.ALLOWED[S.type][role].forEach(function (t) { var c = toCount(e.units[t]); tot += c * U[t].cost; n += c; }); });
    return { ipc: tot, n: n };
  }
  function renderSide(role) {
    var card = $('#card-' + role), allowed = E.ALLOWED[S.type][role];
    var tot = sideIpc(role);
    var h = '<div class="side-head"><h2>' + (role === 'att' ? 'Attacker' : 'Defender') + '</h2><span class="side-tot">' + escapeHtml(tot.n) + ' units · ' + escapeHtml(tot.ipc) + ' IPC</span></div>';
    S[role].forEach(function (e, idx) {
      var used = S[role].map(function (x) { return x.nation; });
      var ipc = 0; allowed.forEach(function (t) { ipc += toCount(e.units[t]) * U[t].cost; });
      h += '<div class="nation" style="' + natStyle(e.nation) + '"><div class="nation-head"><select data-act="nation" data-role="' + role + '" data-idx="' + idx + '" aria-label="Country">' +
        E.NATION_ORDER.map(function (n) { return '<option' + (n === e.nation ? ' selected' : '') + (used.indexOf(n) >= 0 && n !== e.nation ? ' disabled' : '') + '>' + escapeHtml(n) + '</option>'; }).join('') +
        '</select><span class="ipc">' + escapeHtml(ipc) + ' IPC</span>' +
        (S[role].length > 1 ? '<button class="icon-btn" data-act="rmnation" data-role="' + role + '" data-idx="' + idx + '" aria-label="Remove ' + escapeHtml(e.nation) + '">✕</button>' : '') + '</div>';
      allowed.forEach(function (t) { h += unitRow(role, idx, t, toCount(e.units[t])); });
      h += '</div>';
    });
    h += '<div class="side-actions">' + (S[role].length < E.NATION_ORDER.length ? '<button class="btn full" data-act="addnation" data-role="' + role + '">＋ Add country</button>' : '') +
      '<button class="btn grow" data-act="photo" data-role="' + role + '">📷 Count from photo <span class="badge">Experimental</span></button>' +
      '<button class="btn" data-act="clear" data-role="' + role + '">Clear</button></div>';
    card.innerHTML = h;
  }
  function renderSetup() {
    renderSide('att'); renderSide('def');
    $('#opt-order').value = S.opts.order;
    $('#opt-keepland').checked = !!S.opts.keepLand;
    $('#row-keepland').classList.toggle('hidden', S.type === 'sea');
    $('#opt-retreat').textContent = S.opts.retreatAfter ? String(S.opts.retreatAfter) : 'never';
    $('#opt-n').value = String(S.opts.n);
    $$('.type-seg button').forEach(function (b) { b.classList.toggle('on', b.dataset.type === S.type); });
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
    var role = b.dataset.role, idx = +b.dataset.idx, t = b.dataset.unit, act = b.dataset.act;
    if (act === 'inc' || act === 'dec') {
      var e = S[role][idx], v = (+e.units[t] || 0) + (act === 'inc' ? 1 : -1);
      e.units[t] = Math.max(0, Math.min(99, v));
      changed(); renderSide(role);
    } else if (act === 'addnation') {
      var used = S[role].map(function (x) { return x.nation; });
      var pref = role === 'att' ? ['USA', 'UK', 'USSR', 'Germany', 'Japan', 'Italy', 'China', 'ANZAC', 'France'] : ['Italy', 'Japan', 'Germany', 'UK', 'USA', 'USSR', 'China', 'ANZAC', 'France'];
      var other = S[role][0] && NAT[S[role][0].nation] ? NAT[S[role][0].nation].side : null;
      var cand = pref.filter(function (n) { return used.indexOf(n) < 0 && (!other || NAT[n].side === other); });
      if (!cand.length) cand = pref.filter(function (n) { return used.indexOf(n) < 0; });
      if (cand.length) { S[role].push({ nation: cand[0], units: {} }); changed(); renderSide(role); }
    } else if (act === 'rmnation') {
      S[role].splice(idx, 1); changed(); renderSide(role);
    } else if (act === 'clear') {
      S[role].forEach(function (e) { e.units = {}; }); changed(); renderSide(role);
    } else if (act === 'photo') {
      openPhoto(role);
    }
  });
  document.addEventListener('change', function (ev) {
    var el = ev.target, act = el.dataset && el.dataset.act;
    if (act === 'nation') { if (E.NATION_ORDER.indexOf(el.value) < 0) return; S[el.dataset.role][+el.dataset.idx].nation = el.value; changed(); renderSide(el.dataset.role); }
    if (act === 'set') {
      var v = Math.max(0, Math.min(99, parseInt(el.value, 10) || 0));
      S[el.dataset.role][+el.dataset.idx].units[el.dataset.unit] = v; changed(); renderSide(el.dataset.role);
    }
  });
  document.addEventListener('focusin', function (ev) { if (ev.target.dataset && ev.target.dataset.act === 'set') ev.target.select(); });
  $('#opt-order').onchange = function () { S.opts.order = this.value; changed(); };
  $('#opt-keepland').onchange = function () { S.opts.keepLand = this.checked; changed(); };
  $('#opt-n').onchange = function () { S.opts.n = +this.value; changed(); };
  $$('[data-step]').forEach(function (b) { b.onclick = function () {
    var d = +b.dataset.step.split(':')[1]; S.opts.retreatAfter = Math.max(0, Math.min(20, S.opts.retreatAfter + d)); changed(); renderSetup(); }; });
  $$('.type-seg button').forEach(function (b) { b.onclick = function () {
    S.type = b.dataset.type; changed(); renderSetup(); if (view === 'battle') resetBattle(); }; });

  var dirty = true;
  function changed() { dirty = true; save(); battleStale = true; }

  // ---------- views & action bar ----------
  function show(v) {
    view = v;
    $$('.view').forEach(function (s) { s.classList.toggle('on', s.id === 'view-' + v); });
    $$('.tabbar button').forEach(function (b) { b.classList.toggle('on', b.dataset.view === v); });
    if (v === 'battle' && (battleStale || !B)) resetBattle();
    renderActions();
    window.scrollTo(0, 0);
  }
  $$('.tabbar button').forEach(function (b) { b.onclick = function () { show(b.dataset.view); }; });

  function renderActions() {
    var bar = $('#actionbar'), h = '';
    if (view === 'setup') h = '<button class="btn primary" id="a-calc">Calculate odds</button><button class="btn" id="a-battle">Battle ▸</button>';
    else if (view === 'odds') h = '<button class="btn primary" id="a-calc">' + (lastResult ? 'Recalculate' : 'Calculate odds') + '</button><button class="btn" id="a-battle">Battle ▸</button>';
    else if (view === 'battle') {
      var over = !B || B.st.over, picking = !!B && !!B.pending;
      h = '<button class="btn att" id="a-roll"' + (over || picking ? ' disabled' : '') + '>🎲 Roll</button>' +
        '<button class="btn" id="a-auto"' + (over || picking ? ' disabled' : '') + '>Auto</button>' +
        '<button class="btn" id="a-retreat"' + (over || picking || !B || B.st.round === 0 ? ' disabled' : '') + '>Retreat</button>' +
        '<button class="btn" id="a-reset">Reset</button>';
    }
    bar.innerHTML = h; bar.classList.toggle('hidden', !h);
    var c = $('#a-calc'); if (c) c.onclick = calc;
    var bt = $('#a-battle'); if (bt) bt.onclick = function () { show('battle'); };
    var r = $('#a-roll'); if (r) r.onclick = function () { rollOne(); };
    var a = $('#a-auto'); if (a) a.onclick = autoResolve;
    var rt = $('#a-retreat'); if (rt) rt.onclick = function () { E.retreat(B.st); B.log.push({ round: B.st.round, steps: [{ kind: 'note', text: 'Attacker retreats.' }] }); renderBattle(); };
    var rs = $('#a-reset'); if (rs) rs.onclick = function () { resetBattle(); };
  }

  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.add('hidden'); }, 2600); }

  // ---------- odds ----------
  var worker = null, noWorker = false, lastResult = null, jobId = 0;
  function calc() {
    var a = sideIpc('att'), d = sideIpc('def');
    var bomb = S.type === 'amph' && S.att.some(function (e) { return (+e.units.bb || 0) + (+e.units.ca || 0) > 0; });
    if (!a.n || !d.n) { toast('Add units to both sides first.'); return; }
    show('odds');
    $('#odds-empty').classList.add('hidden'); $('#odds-progress').classList.remove('hidden');
    $('#odds-bar').style.width = '0%'; $('#odds-ptext').textContent = 'Simulating ' + S.opts.n.toLocaleString() + ' battles…';
    var msg = { att: specFor('att'), def: specFor('def'), opts: engineOpts(), n: S.opts.n, seed: (Math.random() * 4294967296) >>> 0, id: ++jobId };
    var done = function (res) {
      $('#odds-progress').classList.add('hidden'); lastResult = res; renderOdds(res, msg); renderActions();
    };
    var mainThread = function () {
      setTimeout(function () { if (msg.id === jobId) done(E.simulate(msg.att, msg.def, msg.opts, msg.n, msg.seed)); }, 30);
    };
    if (window.Worker && !noWorker && (location.protocol !== 'file:' || window.AA_INLINE_WORKER)) {
      if (worker) worker.terminate();
      try {
        worker = window.AA_INLINE_WORKER ? new Worker(URL.createObjectURL(new Blob([window.AA_INLINE_WORKER], { type: 'text/javascript' }))) : new Worker('js/worker.js');
      } catch (err) { worker = null; noWorker = true; mainThread(); return; }
      // If the worker script can't load (e.g. a restricted WebView), fall back to the main thread.
      worker.onerror = function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        if (worker) worker.terminate();
        worker = null; noWorker = true; mainThread();
      };
      worker.onmessage = function (e) {
        if (e.data.id !== jobId) return;
        if (e.data.progress != null) $('#odds-bar').style.width = (e.data.progress * 100) + '%';
        else if (e.data.result) done(e.data.result);
        else if (e.data.error) { $('#odds-progress').classList.add('hidden'); toast('Error: ' + e.data.error.split('\n')[0]); }
      };
      worker.postMessage(msg);
    } else {
      mainThread();
    }
    void bomb;
  }
  function remTable(start, rem, cap) {
    var keys = Object.keys(start).sort(function (x, y) {
      var nx = x.split('|'), ny = y.split('|');
      return E.NATION_ORDER.indexOf(nx[0]) - E.NATION_ORDER.indexOf(ny[0]) || U[nx[1]].cost - U[ny[1]].cost;
    });
    var h = '<table class="rem"><tr><th>' + cap + '</th><th>Start</th><th>Avg left</th></tr>';
    keys.forEach(function (k) {
      var p = k.split('|');
      h += '<tr><td><span class="ntag" style="' + natStyle(p[0]) + '"><i></i>' + esc(p[0]) + ' ' + U[p[1]].name + '</span></td><td>' + start[k] + '</td><td>' + (rem[k] || 0).toFixed(2) + '</td></tr>';
    });
    return h + '</table>';
  }
  function byNation(o) {
    var ks = Object.keys(o).sort(function (a, b) { return E.NATION_ORDER.indexOf(a) - E.NATION_ORDER.indexOf(b); });
    if (ks.length < 2) return '';
    return '<div class="muted small">' + ks.map(function (k) { return '<span class="ntag" style="' + natStyle(k) + '"><i></i>' + esc(k) + ' ' + o[k].toFixed(1) + '</span>'; }).join(' &nbsp; ') + '</div>';
  }
  function renderOdds(r, msg) {
    var el = $('#odds-result'); el.classList.remove('hidden');
    var hold = r.defender + r.retreat;
    var seg = function (v, col, lab) { return v > 0 ? '<div style="width:' + (v * 100) + '%;background:' + col + '">' + (v > 0.09 ? lab + ' ' + Math.round(v * 100) + '%' : '') + '</div>' : ''; };
    var land = msg.opts.type !== 'sea';
    var se = Math.sqrt(Math.max(r.attacker * (1 - r.attacker), 1e-9) / r.n) * 196;
    var h = '<div class="card"><h2>Battle odds <span class="muted small">· ' + ({ land: 'Land', sea: 'Sea', amph: 'Amphibious' })[msg.opts.type] + ' · ' + r.n.toLocaleString() + ' battles</span></h2>' +
      '<div class="outcome-bar">' + seg(r.attacker, 'var(--att)', 'Att') + seg(r.draw, '#7d7458', 'Draw') + seg(r.retreat, '#6b5aa8', 'Ret') + seg(r.defender, 'var(--def)', 'Def') + '</div>' +
      '<div class="legend"><span><i style="background:var(--att)"></i>Attacker wins</span><span><i style="background:#7d7458"></i>Draw / both destroyed</span>' + (r.retreat ? '<span><i style="background:#6b5aa8"></i>Attacker retreated</span>' : '') + '<span><i style="background:var(--def)"></i>Defender wins</span></div></div>' +
      '<div class="big"><div class="stat att"><div class="v">' + pct(r.attacker) + '</div><div class="l">Attacker wins</div></div>' +
      '<div class="stat def"><div class="v">' + pct(r.defender) + '</div><div class="l">Defender wins (attacker wiped out)</div></div>' +
      '<div class="stat"><div class="v">' + pct(r.draw) + '</div><div class="l">Draw · both destroyed or stalemate</div></div>' +
      (land ? '<div class="stat"><div class="v">' + pct(r.capture) + '</div><div class="l">Attacker captures territory</div></div>' :
        '<div class="stat"><div class="v">' + pct(hold) + '</div><div class="l">Defender holds (incl. retreat)</div></div>') + '</div>' +
      '<div class="card" style="margin-top:10px">' +
      (r.retreat ? '<div class="kv"><span>Attacker retreated</span><b>' + pct(r.retreat) + '</b></div>' : '') +
      (land ? '<div class="kv"><span>Defender holds (wins + retreats)</span><b>' + pct(hold) + '</b></div>' : '') +
      '<div class="kv"><span>Average rounds</span><b>' + r.rounds.toFixed(2) + '</b></div>' +
      '<div class="kv"><span>Avg units left · attacker</span><b>' + r.remCountA.toFixed(2) + '</b></div>' +
      '<div class="kv"><span>Avg units left · defender</span><b>' + r.remCountD.toFixed(2) + '</b></div>' +
      '<div class="kv"><span>Expected IPC lost · attacker</span><b style="color:#ff8a76">' + r.ipcA.toFixed(1) + '</b></div>' + byNation(r.ipcByNationA) +
      '<div class="kv"><span>Expected IPC lost · defender</span><b style="color:#7db8ff">' + r.ipcD.toFixed(1) + '</b></div>' + byNation(r.ipcByNationD) +
      '<div class="kv"><span>IPC swing for attacker</span><b>' + (r.ipcD - r.ipcA >= 0 ? '+' : '') + (r.ipcD - r.ipcA).toFixed(1) + '</b></div>' +
      '<p class="muted small">Win % accurate to about ±' + se.toFixed(1) + ' points (95%).</p></div>' +
      '<div class="card"><h2>Remaining units (average over all battles)</h2>' + remTable(r.startA, r.remA, 'Attacker') + '<div style="height:10px"></div>' + remTable(r.startD, r.remD, 'Defender') + '</div>';
    el.innerHTML = h;
  }

  // ---------- push-button battle ----------
  var B = null, battleStale = true;
  function resetBattle() {
    var st = E.buildState(specFor('att'), specFor('def'), engineOpts());
    B = { st: st, log: [], current: null, pending: null, start: { att: E.summarize(st.att.concat(st.bomb)), def: E.summarize(st.def) }, rng: E.mulberry32((Math.random() * 4294967296) >>> 0) };
    battleStale = false;
    renderBattle();
  }
  function rollOne() {
    if (!B || B.st.over || B.pending) return;
    var p = E.rollRound(B.st, B.rng, true);
    if (p.done) { pushEv(p.ev); renderBattle(); return; }
    var manual = $('#b-manual').checked;
    if (manual && (p.A.k > 0 || p.D.k > 0)) {
      B.pending = p; B.pick = { A: selFromAuto(p.A), D: selFromAuto(p.D) };
      renderBattle(); return;
    }
    E.resolveRound(B.st, p); pushEv(p.ev); renderBattle();
  }
  function pushEv(ev) { if (!ev) return; if (B.current) B.log.push(B.current); B.current = ev; }
  function autoResolve() {
    if (!B) return;
    var guard = 0;
    while (!B.st.over && guard++ < 300) {
      var p = E.rollRound(B.st, B.rng, true);
      if (!p.done) E.resolveRound(B.st, p);
      pushEv(p.ev);
    }
    renderBattle();
  }

  // manual casualty selection
  function kindsOf(side) {
    var kinds = [], map = {};
    side.slots.forEach(function (sl) {
      var key = sl.u.n + '|' + sl.u.t + '|' + (sl.absorb ? 'dmg' : 'kill');
      if (!map[key]) { map[key] = { key: key, n: sl.u.n, t: sl.u.t, absorb: sl.absorb, slots: [] }; kinds.push(map[key]); }
      map[key].slots.push(sl);
    });
    return kinds;
  }
  function selFromAuto(side) {
    var sel = {};
    side.auto.forEach(function (sl) { var key = sl.u.n + '|' + sl.u.t + '|' + (sl.absorb ? 'dmg' : 'kill'); sel[key] = (sel[key] || 0) + 1; });
    return sel;
  }
  function slotsFromSel(side, sel) {
    var chosen = [], err = null;
    var kinds = kindsOf(side);
    kinds.filter(function (k) { return k.absorb; }).forEach(function (k) { chosen = chosen.concat(k.slots.slice(0, sel[k.key] || 0)); });
    kinds.filter(function (k) { return !k.absorb; }).forEach(function (k) {
      var m = sel[k.key] || 0;
      var cands = k.slots.slice().sort(function (x, y) { return pr(x) - pr(y); });
      function pr(s) { if (s.u.hp === 1) return 0; return chosen.some(function (c) { return c.absorb && c.u === s.u; }) ? 1 : 2; }
      var take = cands.slice(0, m);
      if (take.some(function (s) { return pr(s) === 2; })) err = U[k.t].name + ' must take damage before it can be sunk.';
      chosen = chosen.concat(take);
    });
    return { chosen: chosen, err: err };
  }
  function renderPick() {
    var el = $('#b-pick'), p = B && B.pending;
    if (!p) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    var h = '<div class="pick"><h2>Choose casualties</h2>';
    var allOk = true;
    ['A', 'D'].forEach(function (S2) {
      var side = p[S2]; if (!side.k) return;
      var sel = B.pick[S2], tot = 0; Object.keys(sel).forEach(function (k) { tot += sel[k]; });
      var res = slotsFromSel(side, sel);
      var err = res.err || E.validSelection(res.chosen, side.pools.h1, side.pools.h2, side.pools.h3, side.k);
      if (err) allOk = false;
      h += '<div class="sidecol ' + (S2 === 'A' ? 'att' : 'def') + '"><b>' + (S2 === 'A' ? 'Attacker' : 'Defender') + '</b> takes ' + side.k + ' hit' + (side.k > 1 ? 's' : '') + ' · chosen ' + tot + '/' + side.k;
      kindsOf(side).forEach(function (k) {
        var c = sel[k.key] || 0;
        h += '<div class="urow"><div class="un"><b><span class="ntag" style="' + natStyle(k.n) + '"><i></i>' + esc(k.n) + ' ' + U[k.t].name + '</span></b><small>' + (k.absorb ? 'take damage (stays in battle)' : (U[k.t].hp > 1 ? 'sink' : 'destroy')) + ' · max ' + k.slots.length + '</small></div>' +
          '<div class="stepper"><button data-pk="' + escapeHtml(S2 + '|' + k.key + '|-1') + '">−</button><input readonly value="' + escapeHtml(c) + '"><button data-pk="' + escapeHtml(S2 + '|' + k.key + '|1') + '">+</button></div></div>';
      });
      h += '<div class="perr">' + (err ? esc(err) : '') + '</div></div>';
    });
    h += '<div class="side-actions"><button class="btn" id="pk-auto">Use suggestion</button><button class="btn ok grow" id="pk-ok"' + (allOk ? '' : ' disabled') + '>Remove casualties</button></div></div>';
    el.innerHTML = h;
    $$('[data-pk]', el).forEach(function (b) { b.onclick = function () {
      var parts = b.dataset.pk.split('|'), S2 = parts[0], key = parts.slice(1, 4).join('|'), d = +parts[4];
      var side = p[S2], kind = kindsOf(side).filter(function (k) { return k.key === key; })[0];
      var sel = B.pick[S2]; sel[key] = Math.max(0, Math.min(kind.slots.length, (sel[key] || 0) + d)); renderPick(); }; });
    $('#pk-auto').onclick = function () { B.pick = { A: selFromAuto(p.A), D: selFromAuto(p.D) }; renderPick(); };
    $('#pk-ok').onclick = function () {
      var ca = p.A.k ? slotsFromSel(p.A, B.pick.A).chosen : [], cd = p.D.k ? slotsFromSel(p.D, B.pick.D).chosen : [];
      E.resolveRound(B.st, p, ca, cd); B.pending = null; pushEv(p.ev); renderBattle();
    };
  }

  function forceHtml(units, start, lost) {
    var by = {};
    units.forEach(function (u) { var k = u.n + '|' + u.t; by[k] = by[k] || { n: u.n, t: u.t, c: 0, dmg: 0 }; by[k].c++; if (u.hp < U[u.t].hp) by[k].dmg++; });
    var lostBy = {}; lost.forEach(function (u) { var k = u.n + '|' + u.t; lostBy[k] = (lostBy[k] || 0) + 1; });
    var nations = [];
    start.forEach(function (s) { if (nations.indexOf(s.n) < 0) nations.push(s.n); });
    nations.sort(function (a, b) { return E.NATION_ORDER.indexOf(a) - E.NATION_ORDER.indexOf(b); });
    if (!nations.length) return '<div class="empty-side">No units</div>';
    return nations.map(function (n) {
      var chips = start.filter(function (s) { return s.n === n; }).sort(function (a, b) { return U[a.t].cost - U[b.t].cost; }).map(function (s) {
        var k = n + '|' + s.t, cur = by[k], out = '';
        if (cur) out += '<span class="chip' + (cur.dmg ? ' dmg' : '') + '" title="' + U[s.t].name + '">' + cur.c + ' ' + U[s.t].short + (cur.dmg ? ' (' + cur.dmg + ' dmg)' : '') + '</span>';
        if (lostBy[k]) out += '<span class="chip lost">' + lostBy[k] + ' ' + U[s.t].short + '</span>';
        return out;
      }).join('');
      return '<div class="fn" style="' + natStyle(n) + '"><div class="fnh"><i></i>' + esc(n) + '</div><div class="chips">' + chips + '</div></div>';
    }).join('');
  }
  function groupsHtml(groups) {
    return groups.map(function (g) {
      var lbl = g.label ? g.label : (U[g.t].name + (g.sup ? ' +art' : ''));
      return '<div class="dgroup"><div class="dlabel" style="' + natStyle(g.n) + '"><b><span class="ntag"><i></i>' + esc(g.n || '') + '</span></b><small>' + esc(lbl) + ' · hits on ' + (g.p > 0 ? '≤' + g.p : '—') + '</small></div><div class="dice">' +
        g.dice.map(function (d) { var hit = g.p > 0 && d <= g.p; return '<span class="die ' + (hit ? 'hit' : 'miss') + '">' + d + '</span>'; }).join('') + '</div><span class="hitsum">' + g.hits + ' hit' + (g.hits === 1 ? '' : 's') + '</span></div>';
    }).join('');
  }
  function casHtml(c) {
    if (!c || !c.length) return '<div class="cas muted">No casualties</div>';
    return '<div class="cas">Lost: ' + c.map(function (x) { return '<b>' + x.c + ' ' + esc(x.n) + ' ' + U[x.t].name + (x.damaged ? ' (damaged)' : '') + '</b>'; }).join(', ') + '</div>';
  }
  function stepHtml(s) {
    if (s.kind === 'note') return '<div class="step"><div>' + esc(s.text) + '</div></div>';
    if (s.kind === 'defenseless') return '<div class="step"><h4>Defenseless transports</h4>' + casHtml(s.casualties) + '</div>';
    if (s.kind === 'aa') return '<div class="step"><h4>Anti-aircraft fire</h4>' + groupsHtml(s.groups) + '<div class="sidecol att">Attacker aircraft ' + casHtml(s.casualtiesA) + '</div></div>';
    var title = s.kind === 'surprise' ? 'Submarine surprise strike' : 'Combat';
    var h = '<div class="step"><h4>' + title + '</h4>';
    if (s.groupsA && s.groupsA.length) h += '<div class="sidecol att"><b>Attacker fires</b>' + groupsHtml(s.groupsA) + '</div>';
    if (s.groupsD && s.groupsD.length) h += '<div class="sidecol def"><b>Defender fires</b>' + groupsHtml(s.groupsD) + '</div>';
    if (s.casualtiesA !== undefined) h += '<div class="sidecol att">Attacker ' + casHtml(s.casualtiesA) + '</div>';
    if (s.casualtiesD !== undefined) h += '<div class="sidecol def">Defender ' + casHtml(s.casualtiesD) + '</div>';
    return h + '</div>';
  }
  function evHtml(ev, previewPending) {
    var h = '<div class="muted small" style="margin:4px 2px">Round ' + ev.round + '</div>' + ev.steps.map(stepHtml).join('');
    if (previewPending) h += stepHtml({ kind: 'combat', groupsA: previewPending.A.groups, groupsD: previewPending.D.groups });
    return h;
  }
  function renderBattle() {
    if (!B) return;
    var st = B.st;
    $('#b-round').textContent = 'Round ' + st.round;
    var status = st.over ? '' : (B.pending ? 'Choose casualties' : (st.round ? 'In progress' : 'Ready'));
    $('#b-status').textContent = status;
    var bombHtml = st.bomb.length ? '<div class="muted small">Bombarding: ' + E.summarize(st.bomb).map(function (x) { return x.c + ' ' + x.n + ' ' + U[x.t].short; }).join(', ') + '</div>' : '';
    $('#b-att').innerHTML = forceHtml(st.att, B.start.att.filter(function (s) { return !(S.type === 'amph' && U[s.t].dom === 'sea'); }), st.lostA) + bombHtml;
    $('#b-def').innerHTML = forceHtml(st.def, B.start.def, st.lostD);
    var dh = '';
    if (st.over) {
      var txt = { attacker: 'Attacker wins', defender: 'Defender wins', draw: 'Draw', retreat: 'Attacker retreated' }[st.outcome];
      dh += '<div class="result-banner ' + st.outcome + '">' + txt + '<div class="small" style="font-weight:600;margin-top:2px">' + esc(st.reason) + ' · IPC lost: attacker ' + E.ipc(st.lostA) + ', defender ' + E.ipc(st.lostD) + '</div></div>';
    }
    if (B.pending) dh += evHtml(B.pending.ev, B.pending);
    else if (B.current) dh += evHtml(B.current);
    else if (!st.over) dh += '<div class="card muted">Tap <b>Roll round</b> to roll one round of combat, or <b>Auto</b> to fight it out.</div>';
    $('#b-dice').innerHTML = dh;
    $('#b-log').innerHTML = B.log.length ? B.log.slice().reverse().map(function (e) { return evHtml(e); }).join('') : '<div class="muted small">No earlier rounds.</div>';
    renderPick();
    renderActions();
  }

  // ---------- photo ----------
  var photoRole = 'att', photoRes = null, photoClusters = [];
  function openPhoto(role) {
    photoRole = role; $('#photo-sheet').classList.remove('hidden');
    $('#photo-status').textContent = ''; $('#photo-canvas').classList.add('hidden'); $('#photo-results').innerHTML = '';
    document.body.style.overflow = 'hidden';
  }
  function closePhoto() { $('#photo-sheet').classList.add('hidden'); document.body.style.overflow = ''; }
  $('#photo-close').onclick = closePhoto;
  $('#photo-sheet').addEventListener('click', function (e) { if (e.target.id === 'photo-sheet') closePhoto(); });
  ['#photo-cam', '#photo-pick'].forEach(function (id) { $(id).addEventListener('change', function () { if (this.files && this.files[0]) loadPhoto(this.files[0]); this.value = ''; }); });

  function loadPhoto(file) {
    $('#photo-status').textContent = 'Analyzing on your phone…';
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      setTimeout(function () {
        try { photoRes = window.AAPhoto.analyze(img); }
        catch (e) { $('#photo-status').textContent = 'Could not analyze this photo: ' + e.message; return; }
        URL.revokeObjectURL(url);
        showPhotoResult(photoRes);
      }, 20);
    };
    img.onerror = function () { $('#photo-status').textContent = 'Could not open that image (HEIC may need a JPEG export).'; };
    img.src = url;
  }
  window.__aaAnalyzeForTest = function (img) { photoRes = window.AAPhoto.analyze(img); showPhotoResult(photoRes); return photoRes; };

  function suggestUnit(size, role) {
    if (S.type === 'sea') return size === 'small' ? 'dd' : (size === 'medium' ? 'ca' : 'bb');
    return size === 'small' ? 'inf' : (size === 'medium' ? 'art' : 'arm');
  }
  function showPhotoResult(res) {
    var cv = $('#photo-canvas'); cv.classList.remove('hidden');
    window.AAPhoto.drawOverlay(cv, res, function (n) { return (NAT[n] || {}).color || '#fff'; });
    var groups = {};
    res.components.forEach(function (c) {
      var g = groups[c.nation] = groups[c.nation] || { nation: c.nation, pieces: 0, blobs: 0, rgb: [0, 0, 0], units: {}, confs: { high: 0, medium: 0, low: 0 } };
      g.pieces += c.pieces; g.blobs++; g.confs[c.conf]++;
      g.rgb[0] += c.rgb[0]; g.rgb[1] += c.rgb[1]; g.rgb[2] += c.rgb[2];
      var t = suggestUnit(c.size, photoRole); g.units[t] = (g.units[t] || 0) + c.pieces;
    });
    photoClusters = Object.keys(groups).map(function (k) { var g = groups[k]; g.rgb = g.rgb.map(function (v) { return Math.round(v / g.blobs); }); return g; })
      .sort(function (a, b) { return b.pieces - a.pieces; });
    var total = photoClusters.reduce(function (s, g) { return s + g.pieces; }, 0);
    $('#photo-status').innerHTML = total ? 'Found about <b>' + escapeHtml(total) + '</b> piece' + (total === 1 ? '' : 's') + ' in ' + escapeHtml(photoClusters.length) + ' color group' + (photoClusters.length === 1 ? '' : 's') + '. These are guesses: fix the country and counts below.' :
      'No pieces found. Try a plain, light background with pieces spread apart.';
    if (res.busy) $('#photo-status').innerHTML = '<b style="color:#ffb3a6">The background looks too busy (' + escapeHtml(total) + ' blobs), so these numbers are almost certainly wrong.</b> Put the pieces on a plain sheet of paper and try again.';
    renderClusters();
  }
  function renderClusters() {
    var el = $('#photo-results');
    if (!photoClusters.length) { el.innerHTML = ''; return; }
    var allowed = E.ALLOWED[S.type][photoRole];
    var h = '<div class="target"><span>Fill</span><select id="ph-role"><option value="att"' + (photoRole === 'att' ? ' selected' : '') + '>Attacker</option><option value="def"' + (photoRole === 'def' ? ' selected' : '') + '>Defender</option></select>' +
      '<select id="ph-mode"><option value="replace">replacing those countries’ counts</option><option value="add">adding to current counts</option></select></div>';
    photoClusters.forEach(function (g, gi) {
      var conf = g.confs.high >= g.confs.medium + g.confs.low ? 'color match: good' : (g.confs.low > g.blobs / 2 ? 'color match: poor, check country' : 'color match: fair');
      h += '<div class="cluster" style="' + natStyle(g.nation) + '"><div class="cluster-head"><span class="swatch" style="background:rgb(' + g.rgb.map(function (v) { return Math.max(0, Math.min(255, Math.round(+v) || 0)); }).join(',') + ')"></span>' +
        '<select data-ph="nation" data-gi="' + gi + '"><option value="">Ignore this group</option>' + E.NATION_ORDER.map(function (n) { return '<option' + (n === g.nation ? ' selected' : '') + '>' + escapeHtml(n) + '</option>'; }).join('') + '</select></div>' +
        '<div class="conf">' + escapeHtml(g.pieces) + ' piece' + (g.pieces === 1 ? '' : 's') + ' detected · ' + conf + ' · unit types guessed from size only</div>';
      allowed.forEach(function (t) {
        var c = g.units[t] || 0;
        h += '<div class="urow' + (c ? '' : ' zero') + '"><div class="un"><b>' + U[t].name + '</b></div><div class="stepper"><button data-ph="dec" data-gi="' + gi + '" data-unit="' + t + '">−</button><input readonly value="' + escapeHtml(c) + '"><button data-ph="inc" data-gi="' + gi + '" data-unit="' + t + '">+</button></div></div>';
      });
      h += '</div>';
    });
    h += '<button class="btn ok" style="width:100%" id="ph-apply">Use these counts</button><p class="muted small">Nothing changes until you tap “Use these counts”.</p>';
    el.innerHTML = h;
    $('#ph-role').onchange = function () { photoRole = this.value; renderClusters(); };
    $$('[data-ph]', el).forEach(function (x) {
      var gi = +x.dataset.gi, g = photoClusters[gi];
      if (x.dataset.ph === 'nation') x.onchange = function () { g.nation = E.NATION_ORDER.indexOf(this.value) >= 0 ? this.value : null; renderClusters(); };
      else x.onclick = function () { var t = x.dataset.unit; g.units[t] = Math.max(0, (g.units[t] || 0) + (x.dataset.ph === 'inc' ? 1 : -1)); renderClusters(); };
    });
    $('#ph-apply').onclick = applyPhoto;
  }
  function applyPhoto() {
    var role = $('#ph-role').value, mode = $('#ph-mode').value, allowed = E.ALLOWED[S.type][role];
    var agg = {};
    photoClusters.forEach(function (g) {
      if (!g.nation) return;
      agg[g.nation] = agg[g.nation] || {};
      allowed.forEach(function (t) { if (g.units[t]) agg[g.nation][t] = (agg[g.nation][t] || 0) + g.units[t]; });
    });
    Object.keys(agg).forEach(function (n) {
      var e = S[role].filter(function (x) { return x.nation === n; })[0];
      if (!e) { e = { nation: n, units: {} }; S[role].push(e); }
      if (mode === 'replace') { allowed.forEach(function (t) { e.units[t] = agg[n][t] || 0; }); }
      else Object.keys(agg[n]).forEach(function (t) { e.units[t] = (+e.units[t] || 0) + agg[n][t]; });
    });
    // drop empty placeholder nations
    S[role] = S[role].filter(function (e, i, arr) { return arr.length === 1 || Object.keys(e.units).some(function (t) { return +e.units[t] > 0; }) || agg[e.nation]; });
    changed(); renderSetup(); closePhoto(); show('setup'); toast('Counts filled. Review them before calculating.');
  }

  // ---------- info table ----------
  (function () {
    var h = '<tr><th>Unit</th><th>Att</th><th>Def</th><th>Cost</th><th>Hits</th></tr>';
    Object.keys(U).forEach(function (t) { var u = U[t]; h += '<tr><td>' + u.name + '</td><td>' + (t === 'aa' ? '—' : u.a) + (t === 'inf' ? ' (2)' : '') + '</td><td>' + (t === 'aa' ? '1*' : u.d) + '</td><td>' + u.cost + '</td><td>' + u.hp + '</td></tr>'; });
    $('#units-table').innerHTML = h + '<tr><td colspan="5" class="muted small" style="text-align:left">(2) infantry paired with artillery. * AA: one shot at 1 per attacking aircraft (max 3), first round only.</td></tr>';
    $('#ver').textContent = 'v' + VERSION;
  })();

  renderSetup(); renderActions();
  // No service worker inside the native iOS app (it serves bundled files over app://).
  if (!window.WW2_NATIVE && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  window.__aa = { show: show, S: function () { return S; }, set: function (s) { S = sanitizeState(s); changed(); renderSetup(); }, calc: calc, roll: rollOne, auto: autoResolve, reset: resetBattle };
})();
