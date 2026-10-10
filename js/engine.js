/* Axis & Allies battle engine (1942 Second Edition rules, simplified where noted).
   Works in the browser (window.AAEngine), in a Web Worker (self.AAEngine) and in Node (module.exports). */
(function (root) {
  'use strict';

  var UNITS = {
    inf: { name: 'Infantry', short: 'Inf', a: 1, d: 2, cost: 3, hp: 1, dom: 'land' },
    art: { name: 'Artillery', short: 'Art', a: 2, d: 2, cost: 4, hp: 1, dom: 'land' },
    arm: { name: 'Tank', short: 'Tank', a: 3, d: 3, cost: 6, hp: 1, dom: 'land' },
    aa:  { name: 'AA gun', short: 'AA', a: 0, d: 0, cost: 5, hp: 1, dom: 'land' },
    ftr: { name: 'Fighter', short: 'Ftr', a: 3, d: 4, cost: 10, hp: 1, dom: 'air' },
    bmb: { name: 'Bomber', short: 'Bmb', a: 4, d: 1, cost: 12, hp: 1, dom: 'air' },
    ss:  { name: 'Submarine', short: 'Sub', a: 2, d: 1, cost: 6, hp: 1, dom: 'sea' },
    dd:  { name: 'Destroyer', short: 'DD', a: 2, d: 2, cost: 8, hp: 1, dom: 'sea' },
    ca:  { name: 'Cruiser', short: 'CA', a: 3, d: 3, cost: 12, hp: 1, dom: 'sea' },
    cv:  { name: 'Carrier', short: 'CV', a: 0, d: 2, cost: 14, hp: 2, dom: 'sea' },
    bb:  { name: 'Battleship', short: 'BB', a: 4, d: 4, cost: 20, hp: 2, dom: 'sea' },
    tt:  { name: 'Transport', short: 'TT', a: 0, d: 0, cost: 7, hp: 1, dom: 'sea' }
  };

  var NATIONS = {
    Germany: { color: '#4a4a4a', text: '#fff', side: 'Axis' },
    Japan:   { color: '#e39a26', text: '#1b1b1b', side: 'Axis' },
    Italy:   { color: '#7a4b2a', text: '#fff', side: 'Axis' },
    USSR:    { color: '#8e1d1d', text: '#fff', side: 'Allies' },
    UK:      { color: '#c8b07a', text: '#1b1b1b', side: 'Allies' },
    USA:     { color: '#5b6a2c', text: '#fff', side: 'Allies' },
    China:   { color: '#3f9a4c', text: '#fff', side: 'Allies' },
    ANZAC:   { color: '#8a7a55', text: '#fff', side: 'Allies' },
    France:  { color: '#3a5ca8', text: '#fff', side: 'Allies' }
  };
  var NATION_ORDER = ['Germany', 'Japan', 'Italy', 'USSR', 'UK', 'USA', 'China', 'ANZAC', 'France'];

  // Which units may appear, by battle type and role.
  var ALLOWED = {
    land: { att: ['inf', 'art', 'arm', 'ftr', 'bmb'], def: ['inf', 'art', 'arm', 'aa', 'ftr', 'bmb'] },
    sea:  { att: ['ss', 'dd', 'ca', 'cv', 'bb', 'tt', 'ftr', 'bmb'], def: ['ss', 'dd', 'ca', 'cv', 'bb', 'tt', 'ftr'] },
    amph: { att: ['inf', 'art', 'arm', 'ftr', 'bmb', 'bb', 'ca'], def: ['inf', 'art', 'arm', 'aa', 'ftr', 'bmb'] }
  };

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function die(rng) { return 1 + Math.floor(rng() * 6); }

  function isAir(u) { return UNITS[u.t].dom === 'air'; }
  function isSub(u) { return u.t === 'ss'; }
  function isLand(u) { return UNITS[u.t].dom === 'land'; }
  function cls(u) { return isSub(u) ? 'S' : (isAir(u) ? 'A' : 'O'); }
  function hasType(units, t) { for (var i = 0; i < units.length; i++) if (units[i].t === t) return true; return false; }

  /* spec: [{nation:'Germany', units:{inf:3, arm:1}}, ...] */
  function buildState(attSpec, defSpec, opts) {
    opts = normOpts(opts);
    var st = { att: [], def: [], bomb: [], round: 0, over: false, outcome: null, reason: null,
      lostA: [], lostD: [], opts: opts, uid: 0 };
    function add(spec, role) {
      (spec || []).forEach(function (e) {
        var allowed = ALLOWED[opts.type][role];
        Object.keys(e.units || {}).forEach(function (t) {
          if (allowed.indexOf(t) < 0) return;
          var c = Math.max(0, Math.floor(+e.units[t] || 0));
          for (var i = 0; i < c; i++) {
            var u = { t: t, n: e.nation, hp: UNITS[t].hp, ord: i, id: st.uid++ };
            if (role === 'att' && opts.type === 'amph' && UNITS[t].dom === 'sea') st.bomb.push(u);
            else st[role].push(u);
          }
        });
      });
    }
    add(attSpec, 'att');
    add(defSpec, 'def');
    return st;
  }

  function normOpts(o) {
    o = o || {};
    return {
      type: o.type === 'sea' || o.type === 'amph' ? o.type : 'land',
      keepLand: !!o.keepLand,
      order: o.order === 'power' ? 'power' : 'cost',
      retreatAfter: Math.max(0, Math.floor(+o.retreatAfter || 0)),
      maxRounds: o.maxRounds || 200
    };
  }

  // Attack/defense value of each unit, including artillery support on attack.
  function powers(units, role) {
    var res = new Array(units.length), nArt = 0, sup = 0, i;
    if (role === 'att') for (i = 0; i < units.length; i++) if (units[i].t === 'art') nArt++;
    for (i = 0; i < units.length; i++) {
      var u = units[i], p = role === 'att' ? UNITS[u.t].a : UNITS[u.t].d;
      if (role === 'att' && u.t === 'inf' && sup < nArt) { p = 2; sup++; u._sup = true; } else u._sup = false;
      res[i] = p;
    }
    return res;
  }

  /* Ordered list of "hit slots" for a side: the owner's casualty preference.
     Multi-hit units contribute an absorb slot (damage) first. Transports are always last. */
  function buildSlots(units, role, opts, filter) {
    var absorbs = [], kills = [];
    var counter = {};
    var order = units.slice().sort(function (x, y) { return x.id - y.id; });
    order.forEach(function (u) {
      if (filter && !filter(u)) return;
      var key = u.n + '|' + u.t;
      counter[key] = (counter[key] || 0);
      var rr = counter[key]++;
      if (u.hp > 1) absorbs.push({ u: u, absorb: true, cls: cls(u) });
      kills.push({ u: u, absorb: false, cls: cls(u), rr: rr });
    });
    absorbs.sort(function (x, y) { return UNITS[y.u.t].cost - UNITS[x.u.t].cost; });
    var pw = function (u) { return role === 'att' ? UNITS[u.t].a : UNITS[u.t].d; };
    kills.sort(function (x, y) {
      var tx = x.u.t === 'tt' ? 1 : 0, ty = y.u.t === 'tt' ? 1 : 0;
      if (tx !== ty) return tx - ty;
      var cx = UNITS[x.u.t].cost, cy = UNITS[y.u.t].cost, px = pw(x.u), py = pw(y.u);
      if (opts.order === 'power') { if (px !== py) return px - py; if (cx !== cy) return cx - cy; }
      else { if (cx !== cy) return cx - cy; if (px !== py) return px - py; }
      if (x.u.t !== y.u.t) return x.u.t < y.u.t ? -1 : 1;
      if (x.rr !== y.rr) return x.rr - y.rr;
      return x.u.id - y.u.id;
    });
    if (role === 'att' && opts.keepLand && opts.type !== 'sea') {
      for (var i = kills.length - 1; i >= 0; i--) {
        if (isLand(kills[i].u)) { var s = kills.splice(i, 1)[0]; kills.push(s); break; }
      }
    }
    return absorbs.concat(kills);
  }

  /* Choose casualties respecting hit restrictions.
     h1 = hits that cannot hit subs (air without a friendly destroyer)
     h2 = hits that cannot hit air (submarines)
     h3 = unrestricted hits
     Returns the max number of assignable hits, taken in the owner's preference order. */
  function maxAssignable(nS, nA, nO, h1, h2, h3) {
    var H = h1 + h2 + h3;
    return Math.min(H, Math.min(nS, h2 + h3) + Math.min(nA, h1 + h3) + nO);
  }
  function pickSlots(slots, h1, h2, h3) {
    var nS = 0, nA = 0, nO = 0, i;
    for (i = 0; i < slots.length; i++) { var c = slots[i].cls; if (c === 'S') nS++; else if (c === 'A') nA++; else nO++; }
    var capS = h2 + h3, capA = h1 + h3;
    var k = maxAssignable(nS, nA, nO, h1, h2, h3);
    var chosen = [], s = 0, a = 0, o = 0, remS = nS, remA = nA, remO = nO;
    for (i = 0; i < slots.length && chosen.length < k; i++) {
      var sl = slots[i];
      if (sl.cls === 'S') remS--; else if (sl.cls === 'A') remA--; else remO--;
      var ns = s + (sl.cls === 'S' ? 1 : 0), na = a + (sl.cls === 'A' ? 1 : 0), no = o + (sl.cls === 'O' ? 1 : 0);
      if (ns > capS || na > capA) continue;
      // a kill slot of a 2-hit unit requires its absorb slot to be chosen first
      if (!sl.absorb && sl.u.hp > 1 && chosen.indexOf(absorbOf(slots, sl.u)) < 0) continue;
      var size = chosen.length + 1;
      var maxFrom = size + Math.min(remS, capS - ns) + Math.min(remA, capA - na) + remO;
      if (maxFrom >= k) { chosen.push(sl); s = ns; a = na; o = no; }
    }
    return { chosen: chosen, k: k };
  }
  function absorbOf(slots, u) { for (var i = 0; i < slots.length; i++) if (slots[i].u === u && slots[i].absorb) return slots[i]; return null; }

  // Validate a manual selection of slots.
  function validSelection(chosen, h1, h2, h3, k) {
    var s = 0, a = 0;
    chosen.forEach(function (sl) { if (sl.cls === 'S') s++; else if (sl.cls === 'A') a++; });
    if (chosen.length !== k) return 'Pick exactly ' + k + ' casualt' + (k === 1 ? 'y' : 'ies') + '.';
    if (s > h2 + h3) return 'Aircraft without a friendly destroyer cannot hit submarines.';
    if (a > h1 + h3) return 'Submarines cannot hit aircraft.';
    return null;
  }

  function applyCasualties(units, chosen, lost) {
    var dead = [];
    chosen.forEach(function (sl) { if (!sl.absorb) sl.u._dead = true; });
    chosen.forEach(function (sl) { if (sl.absorb && !sl.u._dead) sl.u.hp--; });
    for (var i = units.length - 1; i >= 0; i--) {
      if (units[i]._dead) { dead.push(units[i]); lost.push(units[i]); units.splice(i, 1); }
    }
    return dead;
  }

  // Can any unit in X score a hit on any unit in Y?
  function canHit(X, Y, role, type) {
    if (!Y.length) return false;
    var yNonAir = false, yNonSub = false, i;
    for (i = 0; i < Y.length; i++) { if (!isAir(Y[i])) yNonAir = true; if (!isSub(Y[i])) yNonSub = true; }
    var dd = hasType(X, 'dd');
    var pw = powers(X, role);
    for (i = 0; i < X.length; i++) {
      if (pw[i] <= 0) continue;
      var u = X[i];
      if (isSub(u)) { if (yNonAir) return true; }
      else if (isAir(u) && type === 'sea' && !dd) { if (yNonSub) return true; }
      else return true;
    }
    return false;
  }
  function onlyTransports(X) { if (!X.length) return false; for (var i = 0; i < X.length; i++) if (X[i].t !== 'tt') return false; return true; }

  function defenselessCheck(st, ev) {
    var t = st.opts.type;
    if (t !== 'sea') return;
    [['def', 'att', 'lostD', 'att'], ['att', 'def', 'lostA', 'def']].forEach(function (p) {
      var X = st[p[0]], Y = st[p[1]];
      if (onlyTransports(X) && !onlyTransports(Y) && canHit(Y, X, p[3], t)) {
        var killed = X.splice(0, X.length);
        killed.forEach(function (u) { st[p[2]].push(u); });
        if (ev) ev.steps.push({ kind: 'defenseless', side: p[0], casualties: summarize(killed) });
      }
    });
  }

  function summarize(units) {
    var m = {}, out = [];
    units.forEach(function (u) { var k = u.n + '|' + u.t; m[k] = (m[k] || 0) + 1; });
    Object.keys(m).forEach(function (k) { var p = k.split('|'); out.push({ n: p[0], t: p[1], c: m[k] }); });
    return out;
  }
  function summarizeSlots(chosen) {
    var m = {}, out = [];
    chosen.forEach(function (sl) { var k = sl.u.n + '|' + sl.u.t + '|' + (sl.absorb ? 'dmg' : 'kill'); m[k] = (m[k] || 0) + 1; });
    Object.keys(m).forEach(function (k) { var p = k.split('|'); out.push({ n: p[0], t: p[1], damaged: p[2] === 'dmg', c: m[k] }); });
    return out;
  }

  function rollGroup(units, pw, rng, detail, groups, label) {
    // returns {h1,h2,h3} contributions are handled by caller; here just roll
    var res = [];
    for (var i = 0; i < units.length; i++) {
      var d = die(rng), hit = pw[i] > 0 && d <= pw[i];
      res.push({ u: units[i], d: d, hit: hit, p: pw[i] });
    }
    if (detail) {
      var g = {};
      res.forEach(function (r) {
        var key = r.u.n + '|' + r.u.t + '|' + r.p + '|' + (r.u._sup ? 's' : '');
        if (!g[key]) { g[key] = { n: r.u.n, t: r.u.t, p: r.p, sup: !!r.u._sup, dice: [], hits: 0, label: label || null }; groups.push(g[key]); }
        g[key].dice.push(r.d); if (r.hit) g[key].hits++;
      });
    }
    return res;
  }

  /* Phase 1 of a round: pre-combat fire (AA, bombardment, sub surprise strike) and the dice of
     general combat. Returns a pending object holding the casualty choices for general combat. */
  function rollRound(st, rng, detail) {
    var o = st.opts, type = o.type;
    var ev = detail ? { round: st.round + 1, steps: [] } : null;
    if (st.round === 0) {
      defenselessCheck(st, ev);
      if (endCheck(st, true)) return { ev: ev, done: true };
    }
    st.round++;
    var A = st.att, D = st.def, groups, i, r;

    // 1. Anti-aircraft fire (first round only, land/amphibious battles)
    if (st.round === 1 && type !== 'sea') {
      var nAA = 0, nAir = 0;
      D.forEach(function (u) { if (u.t === 'aa') nAA++; });
      A.forEach(function (u) { if (isAir(u)) nAir++; });
      var shots = Math.min(nAir, 3 * nAA);
      if (shots > 0) {
        var dice = [], hits = 0;
        for (i = 0; i < shots; i++) { var d = die(rng); dice.push(d); if (d <= 1) hits++; }
        var pk = pickSlots(buildSlots(A, 'att', o, isAir), 0, 0, hits);
        var dead = applyCasualties(A, pk.chosen, st.lostA);
        if (ev) ev.steps.push({ kind: 'aa', side: 'def', groups: [{ n: aaNation(D), t: 'aa', p: 1, dice: dice, hits: hits, label: 'AA fire at ' + shots + ' aircraft' }], hits: hits, casualtiesA: summarize(dead) });
      }
    }

    // 2. Submarine surprise strike (sea battles)
    var aSurp = false, dSurp = false;
    if (type === 'sea') {
      aSurp = hasType(A, 'ss') && !hasType(D, 'dd');
      dSurp = hasType(D, 'ss') && !hasType(A, 'dd');
      if (aSurp || dSurp) {
        var gA = [], gD = [], aHits = 0, dHits = 0;
        if (aSurp) {
          var subsA = A.filter(isSub);
          rollGroup(subsA, powers(subsA, 'att'), rng, detail, gA, 'Surprise strike').forEach(function (x) { if (x.hit) aHits++; });
        }
        if (dSurp) {
          var subsD = D.filter(isSub);
          rollGroup(subsD, powers(subsD, 'def'), rng, detail, gD, 'Surprise strike').forEach(function (x) { if (x.hit) dHits++; });
        }
        var pD = pickSlots(buildSlots(D, 'def', o), 0, aHits, 0);
        var pA = pickSlots(buildSlots(A, 'att', o), 0, dHits, 0);
        var sumD = summarizeSlots(pD.chosen), sumA = summarizeSlots(pA.chosen);
        applyCasualties(D, pD.chosen, st.lostD);
        applyCasualties(A, pA.chosen, st.lostA);
        if (ev) ev.steps.push({ kind: 'surprise', groupsA: gA, groupsD: gD, hitsA: aHits, hitsD: dHits, casualtiesA: sumA, casualtiesD: sumD });
        defenselessCheck(st, ev);
        if (!A.length || !D.length) { endCheck(st, false); return { ev: ev, done: true }; }
      }
    }

    // 3. General combat
    function fire(X, role, skipSubs, bomb) {
      var all = X.filter(function (u) { return !(skipSubs && isSub(u)); });
      var pwAll = powers(all, role), units = [], pw = [], g = [], pools = { h1: 0, h2: 0, h3: 0 };
      // units with 0 strength (transports, attacking carriers, AA guns) don't roll
      for (var q = 0; q < all.length; q++) if (pwAll[q] > 0) { units.push(all[q]); pw.push(pwAll[q]); }
      var dd = hasType(X, 'dd');
      rollGroup(units, pw, rng, detail, g).forEach(function (x) {
        if (!x.hit) return;
        if (isSub(x.u)) pools.h2++;
        else if (isAir(x.u) && type === 'sea' && !dd) pools.h1++;
        else pools.h3++;
      });
      if (bomb && bomb.length) {
        var bp = bomb.map(function (u) { u._sup = false; return UNITS[u.t].a; });
        rollGroup(bomb, bp, rng, detail, g, 'Shore bombardment').forEach(function (x) { if (x.hit) pools.h3++; });
      }
      return { groups: g, pools: pools };
    }
    var fa = fire(A, 'att', aSurp, st.round === 1 && type === 'amph' ? st.bomb : null);
    var fd = fire(D, 'def', dSurp, null);
    var slotsD = buildSlots(D, 'def', o), slotsA = buildSlots(A, 'att', o);
    var autoD = pickSlots(slotsD, fa.pools.h1, fa.pools.h2, fa.pools.h3);
    var autoA = pickSlots(slotsA, fd.pools.h1, fd.pools.h2, fd.pools.h3);
    var pending = {
      ev: ev, done: false,
      A: { slots: slotsA, pools: fd.pools, auto: autoA.chosen, k: autoA.k, groups: fa.groups },
      D: { slots: slotsD, pools: fa.pools, auto: autoD.chosen, k: autoD.k, groups: fd.groups }
    };
    return pending;
  }

  // Phase 2: apply general-combat casualties (auto or manual choice), then check for the end.
  function resolveRound(st, pending, chosenA, chosenD) {
    var ev = pending.ev;
    chosenA = chosenA || pending.A.auto; chosenD = chosenD || pending.D.auto;
    var sumA = summarizeSlots(chosenA), sumD = summarizeSlots(chosenD);
    applyCasualties(st.att, chosenA, st.lostA);
    applyCasualties(st.def, chosenD, st.lostD);
    if (ev) ev.steps.push({ kind: 'combat', groupsA: pending.A.groups, groupsD: pending.D.groups,
      hitsA: pending.D.pools.h1 + pending.D.pools.h2 + pending.D.pools.h3,
      hitsD: pending.A.pools.h1 + pending.A.pools.h2 + pending.A.pools.h3,
      casualtiesA: sumA, casualtiesD: sumD });
    defenselessCheck(st, ev);
    endCheck(st, false);
    return ev;
  }

  function aaNation(D) { for (var i = 0; i < D.length; i++) if (D[i].t === 'aa') return D[i].n; return ''; }

  function endCheck(st, pre) {
    var A = st.att, D = st.def, t = st.opts.type;
    if (!A.length && !D.length) { finish(st, 'draw', 'Both sides destroyed'); return true; }
    if (!D.length) { finish(st, 'attacker', 'Defender destroyed'); return true; }
    if (!A.length) { finish(st, 'defender', 'Attacker destroyed'); return true; }
    var ca = canHit(A, D, 'att', t) || (st.round === 0 && t === 'amph' && st.bomb.length > 0);
    var cd = canHit(D, A, 'def', t);
    if (!ca && !cd) { finish(st, 'draw', 'Stalemate: neither side can hit the other'); return true; }
    if (pre) return false;
    if (st.opts.retreatAfter > 0 && st.round >= st.opts.retreatAfter) { finish(st, 'retreat', 'Attacker retreated after round ' + st.round); return true; }
    if (st.round >= st.opts.maxRounds) { finish(st, 'draw', 'Round limit reached'); return true; }
    return false;
  }
  function finish(st, outcome, reason) { st.over = true; st.outcome = outcome; st.reason = reason; }

  function retreat(st) { if (!st.over) finish(st, 'retreat', 'Attacker retreated after round ' + st.round); }

  function runBattle(st, rng) {
    while (!st.over) {
      var p = rollRound(st, rng, false);
      if (p.done) break;
      resolveRound(st, p);
    }
    return st;
  }

  function ipc(units) { var s = 0; for (var i = 0; i < units.length; i++) s += UNITS[units[i].t].cost; return s; }

  /* Monte Carlo. Returns aggregated statistics. */
  function simulate(attSpec, defSpec, opts, n, seed, onProgress) {
    n = n || 10000;
    var rng = mulberry32(seed == null ? (Math.random() * 4294967296) >>> 0 : seed);
    var res = { n: n, attacker: 0, defender: 0, draw: 0, retreat: 0, capture: 0, rounds: 0,
      ipcA: 0, ipcD: 0, ipcByNationA: {}, ipcByNationD: {}, remA: {}, remD: {}, remCountA: 0, remCountD: 0,
      startA: {}, startD: {}, startIpcA: 0, startIpcD: 0, roundsHist: {} };
    var probe = buildState(attSpec, defSpec, opts);
    probe.att.concat(probe.bomb).forEach(function (u) { var k = u.n + '|' + u.t; res.startA[k] = (res.startA[k] || 0) + 1; });
    probe.def.forEach(function (u) { var k = u.n + '|' + u.t; res.startD[k] = (res.startD[k] || 0) + 1; });
    res.startIpcA = ipc(probe.att); res.startIpcD = ipc(probe.def);
    if (!probe.att.length && !probe.bomb.length || !probe.def.length) res.empty = true;
    for (var i = 0; i < n; i++) {
      var st = runBattle(buildState(attSpec, defSpec, opts), rng);
      res[st.outcome]++;
      if (st.outcome === 'attacker' && st.opts.type !== 'sea' && st.att.some(isLand)) res.capture++;
      res.rounds += st.round;
      res.roundsHist[st.round] = (res.roundsHist[st.round] || 0) + 1;
      st.lostA.forEach(function (u) { var c = UNITS[u.t].cost; res.ipcA += c; res.ipcByNationA[u.n] = (res.ipcByNationA[u.n] || 0) + c; });
      st.lostD.forEach(function (u) { var c = UNITS[u.t].cost; res.ipcD += c; res.ipcByNationD[u.n] = (res.ipcByNationD[u.n] || 0) + c; });
      st.att.forEach(function (u) { var k = u.n + '|' + u.t; res.remA[k] = (res.remA[k] || 0) + 1; res.remCountA++; });
      st.def.forEach(function (u) { var k = u.n + '|' + u.t; res.remD[k] = (res.remD[k] || 0) + 1; res.remCountD++; });
      if (onProgress && (i + 1) % 1000 === 0) onProgress((i + 1) / n);
    }
    var f = function (o) { Object.keys(o).forEach(function (k) { o[k] /= n; }); };
    ['attacker', 'defender', 'draw', 'retreat', 'capture', 'rounds', 'ipcA', 'ipcD', 'remCountA', 'remCountD'].forEach(function (k) { res[k] /= n; });
    f(res.ipcByNationA); f(res.ipcByNationD); f(res.remA); f(res.remD);
    return res;
  }

  var API = { UNITS: UNITS, NATIONS: NATIONS, NATION_ORDER: NATION_ORDER, ALLOWED: ALLOWED,
    mulberry32: mulberry32, buildState: buildState, rollRound: rollRound, resolveRound: resolveRound,
    runBattle: runBattle, simulate: simulate, pickSlots: pickSlots, buildSlots: buildSlots,
    validSelection: validSelection, retreat: retreat, powers: powers, summarize: summarize, ipc: ipc, normOpts: normOpts };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.AAEngine = API;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
