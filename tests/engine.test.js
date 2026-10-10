// Run: node tests/engine.test.js
const E = require('../js/engine.js');
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, `${msg} (got ${a.toFixed(4)}, expected ${b.toFixed(4)} ±${tol})`); }
const S = (nation, units) => [{ nation, units }];

// ---- Exact Markov-chain solver for land battles of single-hit units (no AA), cost-ordered casualties ----
function exactLand(attUnits, defUnits) {
  const U = E.UNITS;
  const order = (arr) => arr.slice().sort((x, y) => U[x].cost - U[y].cost || U[x].a - U[y].a);
  const A = order(attUnits), D = order(defUnits).sort((x, y) => U[x].cost - U[y].cost || U[x].d - U[y].d);
  const hitDist = (ps) => { let dist = [1]; for (const p of ps) { const q = p / 6, nd = new Array(dist.length + 1).fill(0); dist.forEach((v, i) => { nd[i] += v * (1 - q); nd[i + 1] += v * q; }); dist = nd; } return dist; };
  const attPowers = (rem) => { const nArt = rem.filter(t => t === 'art').length; let sup = 0; return rem.map(t => { if (t === 'inf' && sup < nArt) { sup++; return 2; } return U[t].a; }); };
  const memo = new Map();
  function P(i, j) { // i attacker casualties so far, j defender casualties
    const key = i + ',' + j; if (memo.has(key)) return memo.get(key);
    const aLeft = A.length - i, dLeft = D.length - j;
    let r;
    if (aLeft === 0 && dLeft === 0) r = { a: 0, d: 0, x: 1 };
    else if (dLeft === 0) r = { a: 1, d: 0, x: 0 };
    else if (aLeft === 0) r = { a: 0, d: 1, x: 0 };
    else {
      const ha = hitDist(attPowers(A.slice(i))), hd = hitDist(D.slice(j).map(t => U[t].d));
      const p00 = ha[0] * hd[0]; r = { a: 0, d: 0, x: 0 };
      for (let k = 0; k < ha.length; k++) for (let l = 0; l < hd.length; l++) {
        if (k === 0 && l === 0) continue;
        const pr = ha[k] * hd[l] / (1 - p00), sub = P(Math.min(A.length, i + l), Math.min(D.length, j + k));
        r.a += pr * sub.a; r.d += pr * sub.d; r.x += pr * sub.x;
      }
    }
    memo.set(key, r); return r;
  }
  return P(0, 0);
}
const expand = (o) => Object.entries(o).flatMap(([t, c]) => Array(c).fill(t));

console.log('Analytic checks');
{
  // 1 inf attacks 1 inf: per round A hits 1/6, D hits 2/6.
  const ex = exactLand(['inf'], ['inf']);
  near(ex.a, 0.25, 1e-9, 'exact solver: 1 inf vs 1 inf attacker win = 4/16');
  near(ex.d, 0.625, 1e-9, 'exact solver: 1 inf vs 1 inf defender win = 10/16');
  near(ex.x, 0.125, 1e-9, 'exact solver: 1 inf vs 1 inf draw = 2/16');
  const r = E.simulate(S('USSR', { inf: 1 }), S('Germany', { inf: 1 }), { type: 'land' }, 200000, 1);
  near(r.attacker, 0.25, 0.005, 'sim 1 inf vs 1 inf attacker win');
  near(r.defender, 0.625, 0.005, 'sim 1 inf vs 1 inf defender win');
  near(r.draw, 0.125, 0.005, 'sim 1 inf vs 1 inf draw');
  near(r.rounds, 1 / (1 - 20 / 36), 0.02, 'sim 1 inf vs 1 inf average rounds = 36/16');
}
for (const [att, def] of [
  [{ inf: 3, art: 1, arm: 2 }, { inf: 4, arm: 1 }],
  [{ inf: 2, arm: 1, ftr: 1 }, { inf: 3, art: 1 }],
  [{ inf: 4, art: 2 }, { inf: 5 }],
]) {
  const ex = exactLand(expand(att), expand(def));
  const r = E.simulate(S('USA', att), S('Japan', def), { type: 'land' }, 200000, 7);
  const lbl = JSON.stringify(att) + ' vs ' + JSON.stringify(def);
  near(r.attacker, ex.a, 0.006, 'sim vs exact attacker win ' + lbl);
  near(r.defender, ex.d, 0.006, 'sim vs exact defender win ' + lbl);
  near(r.draw, ex.x, 0.006, 'sim vs exact draw ' + lbl);
}
{
  // Sub vs destroyer: destroyer cancels surprise strike, both fire at 2 => 0.4/0.4/0.2
  const r = E.simulate(S('Germany', { ss: 1 }), S('UK', { dd: 1 }), { type: 'sea' }, 200000, 3);
  near(r.attacker, 0.4, 0.005, 'sub vs destroyer attacker win = 0.4');
  near(r.draw, 0.2, 0.005, 'sub vs destroyer draw = 0.2');
  // Sub vs cruiser, no destroyer: surprise at 2 first, then cruiser fires at 3 only if it survives.
  // per round: A wins 2/6; else cruiser hits 3/6 -> D wins; else repeat. A = (1/3)/(1-(2/3)(1/2)) = 0.5
  const r2 = E.simulate(S('Germany', { ss: 1 }), S('UK', { ca: 1 }), { type: 'sea' }, 200000, 4);
  near(r2.attacker, 0.5, 0.005, 'sub surprise strike vs cruiser attacker win = 0.5');
  near(r2.draw, 0, 1e-9, 'sub surprise strike vs cruiser never draws');
  // Battleship (2 hits) attacking 1 destroyer: exact by Markov chain
  // states: BB healthy/damaged. p(BB hit)=4/6, p(DD hit)=2/6.
  const a = 4 / 6, d = 2 / 6;
  // V(h) = P(attacker wins | BB hp h). V(0)=0. Each round: A hits w.p. a; D hits w.p. d.
  // V(h) = [a*(1-d)*1 + a*d*(h>1?1:0) + (1-a)*d*V(h-1)] / (1-(1-a)(1-d))
  const V1 = (a * (1 - d)) / (1 - (1 - a) * (1 - d));
  const V2 = (a * (1 - d) + a * d + (1 - a) * d * V1) / (1 - (1 - a) * (1 - d));
  const r3 = E.simulate(S('USA', { bb: 1 }), S('Japan', { dd: 1 }), { type: 'sea' }, 200000, 5);
  near(r3.attacker, V2, 0.005, 'battleship two-hit exact vs sim');
}

console.log('Rule checks');
{
  // Fighter alone vs a lone sub: air cannot hit subs without a destroyer, subs cannot hit air => stalemate
  const st = E.runBattle(E.buildState(S('USA', { ftr: 2 }), S('Germany', { ss: 1 }), { type: 'sea' }), E.mulberry32(1));
  ok(st.outcome === 'draw' && /Stalemate/.test(st.reason), 'aircraft vs lone sub is a stalemate');
  // With a destroyer, aircraft can hit subs
  const r = E.simulate(S('USA', { ftr: 2, dd: 1 }), S('Germany', { ss: 1 }), { type: 'sea' }, 2000, 2);
  ok(r.attacker > 0.95, 'aircraft + destroyer beat a lone sub (' + (r.attacker * 100).toFixed(1) + '%)');
  // Lone transports are destroyed without combat
  const st2 = E.runBattle(E.buildState(S('Japan', { dd: 1 }), S('USA', { tt: 3 }), { type: 'sea' }), E.mulberry32(1));
  ok(st2.outcome === 'attacker' && st2.round === 0 && st2.lostD.length === 3, 'defenseless transports destroyed automatically');
  // Transports are taken last
  const slots = E.buildSlots(E.buildState([], S('UK', { tt: 1, dd: 1, ss: 1 }), { type: 'sea' }).def, 'def', E.normOpts({ type: 'sea' }));
  ok(slots[slots.length - 1].u.t === 'tt', 'transport is last in casualty order');
  // Battleship absorbs first hit
  const st3 = E.buildState([], S('UK', { bb: 1, inf: 0, dd: 2 }), { type: 'sea' });
  const pk = E.pickSlots(E.buildSlots(st3.def, 'def', st3.opts), 0, 0, 1);
  ok(pk.chosen.length === 1 && pk.chosen[0].absorb && pk.chosen[0].u.t === 'bb', 'battleship takes the free first hit');
  // Sub hits can't be assigned to air
  const st4 = E.buildState([], S('USA', { ftr: 2, dd: 1 }), { type: 'sea' });
  const pk2 = E.pickSlots(E.buildSlots(st4.def, 'def', st4.opts), 0, 3, 0);
  ok(pk2.k === 1 && pk2.chosen[0].u.t === 'dd', 'sub hits only kill the destroyer, not fighters');
  // Matching: air hit (no subs) + sub hit vs destroyer + fighter: must assign sub->DD, air->fighter
  const st5 = E.buildState([], S('USA', { ftr: 1, dd: 1 }), { type: 'sea' });
  const pk3 = E.pickSlots(E.buildSlots(st5.def, 'def', st5.opts), 1, 1, 0);
  ok(pk3.k === 2 && pk3.chosen.length === 2, 'restricted hits matched to both units');
  // Artillery support: 2 inf + 1 art => one inf at 2
  const st6 = E.buildState(S('USSR', { inf: 2, art: 1 }), [], { type: 'land' });
  ok(JSON.stringify(E.powers(st6.att, 'att').sort()) === '[1,2,2]', 'artillery supports exactly one infantry');
  // Keep a land unit: attacker 1 inf + 2 fighters takes 2 hits -> loses fighters? no: loses inf? keepLand keeps the inf
  const st7 = E.buildState(S('UK', { inf: 1, ftr: 2 }), [], { type: 'land', keepLand: true });
  const pk4 = E.pickSlots(E.buildSlots(st7.att, 'att', st7.opts), 0, 0, 2);
  ok(pk4.chosen.every(s => s.u.t === 'ftr'), 'keep-land option sacrifices fighters before the last land unit');
  const st8 = E.buildState(S('UK', { inf: 1, ftr: 2 }), [], { type: 'land' });
  const pk5 = E.pickSlots(E.buildSlots(st8.att, 'att', st8.opts), 0, 0, 1);
  ok(pk5.chosen[0].u.t === 'inf', 'default order loses cheapest (infantry) first');
  // AA: 3 fighters vs 1 AA + 0 others: AA fires 3 dice at 1. P(fighter shot) per die 1/6
  const r9 = E.simulate(S('USA', { ftr: 3 }), S('Germany', { aa: 1, inf: 1 }), { type: 'land' }, 50000, 9);
  ok(r9.ipcA > 0, 'AA gun shoots down aircraft (attacker avg loss ' + r9.ipcA.toFixed(2) + ' IPC)');
  // Retreat after 1 round
  const r10 = E.simulate(S('USA', { inf: 10 }), S('Germany', { inf: 10 }), { type: 'land', retreatAfter: 1 }, 5000, 10);
  ok(r10.rounds === 1 && r10.retreat > 0.9, 'retreat after round 1 ends every battle in 1 round');
  // Amphibious: bombarding battleship fires round 1 only and is never a casualty
  const r11 = E.simulate(S('USA', { inf: 1, bb: 1 }), S('Japan', { inf: 1 }), { type: 'amph' }, 50000, 11);
  ok(r11.ipcA <= 3.0001, 'bombarding battleship never taken as casualty');
  // Seeded determinism
  const a1 = E.simulate(S('USSR', { inf: 5, arm: 2 }), S('Germany', { inf: 4, art: 2 }), { type: 'land' }, 3000, 42);
  const a2 = E.simulate(S('USSR', { inf: 5, arm: 2 }), S('Germany', { inf: 4, art: 2 }), { type: 'land' }, 3000, 42);
  ok(JSON.stringify(a1) === JSON.stringify(a2), 'same seed gives identical results');
  // Multi-nation pooling: UK + USA vs Germany equals single-nation of same composition
  const m1 = E.simulate([{ nation: 'UK', units: { inf: 2, arm: 1 } }, { nation: 'USA', units: { inf: 2, ftr: 1 } }], S('Germany', { inf: 5 }), { type: 'land' }, 100000, 12);
  const m2 = E.simulate(S('UK', { inf: 4, arm: 1, ftr: 1 }), S('Germany', { inf: 5 }), { type: 'land' }, 100000, 13);
  near(m1.attacker, m2.attacker, 0.01, 'allied units pool together');
  ok(m1.ipcByNationA.UK > 0 && m1.ipcByNationA.USA > 0, 'per-country IPC losses tracked');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
