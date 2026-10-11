/* WW2 Battle Odds. Copyright (C) 2026 jbmullican. Licensed under GPL-3.0-or-later; see LICENSE. */
importScripts('engine.js');
self.onmessage = function (e) {
  var m = e.data;
  try {
    var res = self.AAEngine.simulate(m.att, m.def, m.opts, m.n, m.seed, function (p) { self.postMessage({ progress: p, id: m.id }); });
    self.postMessage({ result: res, id: m.id });
  } catch (err) { self.postMessage({ error: String(err && err.stack || err), id: m.id }); }
};
