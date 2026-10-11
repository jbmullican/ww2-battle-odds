/* WW2 Battle Odds. Copyright (C) 2026 jbmullican. Licensed under GPL-3.0-or-later; see LICENSE. */
/* Experimental on-device piece counter. Segments pieces from a plain background, clusters them by
   plastic colour into countries and uses blob size only as a weak hint for unit type. */
(function (root) {
  'use strict';
  // Approximate plastic colours (sRGB) used for matching. Real lighting varies a lot.
  var REF = {
    Germany: [58, 58, 60], Japan: [226, 150, 45], Italy: [112, 70, 40], USSR: [128, 30, 30],
    UK: [200, 178, 125], USA: [92, 104, 46], China: [70, 150, 75], ANZAC: [140, 122, 80], France: [55, 90, 165]
  };

  function lab(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
    var x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, y = r * 0.2126 + g * 0.7152 + b * 0.0722, z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    var f = function (t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; };
    var fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  var REFLAB = {};
  Object.keys(REF).forEach(function (k) { REFLAB[k] = lab(REF[k][0], REF[k][1], REF[k][2]); });

  // Match on brightness-independent chromaticity (r,g,b shares) plus a little lightness,
  // because the same plastic looks much darker or lighter depending on light.
  function chroma(rgb) { var s = rgb[0] + rgb[1] + rgb[2] + 1e-6; return [rgb[0] / s, rgb[1] / s, rgb[2] / s]; }
  var REFCH = {};
  Object.keys(REF).forEach(function (k) { REFCH[k] = chroma(REF[k]); });
  function nearestNation(ch, L, allowed) {
    var best = null, bd = 1e9, second = 1e9;
    (allowed || Object.keys(REFCH)).forEach(function (k) {
      var r = REFCH[k], dr = ch[0] - r[0], dg = ch[1] - r[1], db = ch[2] - r[2];
      var d = 300 * Math.sqrt(dr * dr + dg * dg + db * db) + 0.35 * Math.abs(L - REFLAB[k][0]);
      if (d < bd) { second = bd; bd = d; best = k; } else if (d < second) second = d;
    });
    return { nation: best, dist: bd, margin: second - bd };
  }

  function median(arr) { if (!arr.length) return 0; var s = Array.prototype.slice.call(arr).sort(function (x, y) { return x - y; }); return s[s.length >> 1]; }

  function analyze(source, opts) {
    opts = opts || {};
    var maxDim = opts.maxDim || 640;
    var sw = source.naturalWidth || source.videoWidth || source.width, sh = source.naturalHeight || source.videoHeight || source.height;
    var scale = Math.min(1, maxDim / Math.max(sw, sh));
    var W = Math.max(1, Math.round(sw * scale)), H = Math.max(1, Math.round(sh * scale));
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(source, 0, 0, W, H);
    var px = cx.getImageData(0, 0, W, H).data, N = W * H, i;
    var Ls = new Float32Array(N), As = new Float32Array(N), Bs = new Float32Array(N);
    for (i = 0; i < N; i++) { var l = lab(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]); Ls[i] = l[0]; As[i] = l[1]; Bs[i] = l[2]; }

    // 1. Background model from the image border (k-means, k=3)
    var m = Math.max(2, Math.round(Math.min(W, H) * 0.03)), border = [];
    for (var y = 0; y < H; y += 2) for (var x = 0; x < W; x += 2) if (x < m || y < m || x >= W - m || y >= H - m) border.push(y * W + x);
    var K = 3, cen = [];
    var byL = border.slice().sort(function (p, q) { return Ls[p] - Ls[q]; });
    for (var k = 0; k < K; k++) { var p0 = byL[Math.floor((k + 0.5) / K * byL.length)]; cen.push([Ls[p0], As[p0], Bs[p0], 0]); }
    for (var it = 0; it < 8; it++) {
      var acc = cen.map(function () { return [0, 0, 0, 0]; });
      border.forEach(function (p) {
        var bi = 0, bd = 1e9;
        for (var c = 0; c < K; c++) { var d = sq(Ls[p] - cen[c][0]) + sq(As[p] - cen[c][1]) + sq(Bs[p] - cen[c][2]); if (d < bd) { bd = d; bi = c; } }
        acc[bi][0] += Ls[p]; acc[bi][1] += As[p]; acc[bi][2] += Bs[p]; acc[bi][3]++;
      });
      cen = acc.map(function (a, c) { return a[3] ? [a[0] / a[3], a[1] / a[3], a[2] / a[3], a[3]] : cen[c]; });
    }
    var bg = cen.filter(function (c) { return c[3] > border.length * 0.12; });
    if (!bg.length) bg = cen;
    function bgDist(p) {
      var bd = 1e9;
      for (var c = 0; c < bg.length; c++) {
        var C = bg[c], dL = Ls[p] - C[0], da = As[p] - C[1], db = Bs[p] - C[2];
        // shadows: darker but same hue as the background are not pieces
        if (dL < 0 && Ls[p] > 0.55 * C[0] && Math.abs(da) < 7 && Math.abs(db) < 7) dL *= 0.25;
        var d = Math.sqrt(dL * dL + da * da + db * db); if (d < bd) bd = d;
      }
      return bd;
    }
    // White balance from a bright, neutral-ish background (e.g. white paper)
    var wb = [1, 1, 1], main = bg.slice().sort(function (p, q) { return q[3] - p[3]; })[0];
    if (main && main[0] > 55 && Math.sqrt(main[1] * main[1] + main[2] * main[2]) < 22) {
      var sr = 0, sg = 0, sb = 0, sn = 0;
      border.forEach(function (p) { if (sq(Ls[p] - main[0]) + sq(As[p] - main[1]) + sq(Bs[p] - main[2]) < 100) { sr += px[p * 4]; sg += px[p * 4 + 1]; sb += px[p * 4 + 2]; sn++; } });
      if (sn) { var mr = sr / sn, mg = sg / sn, mb = sb / sn, mx = (mr + mg + mb) / 3; wb = [mx / mr, mx / mg, mx / mb]; }
    }
    var bds = border.map(bgDist).sort(function (p, q) { return p - q; });
    var T = Math.max(16, bds[Math.floor(bds.length * 0.97)] * 1.25);

    var mask = new Uint8Array(N);
    for (i = 0; i < N; i++) mask[i] = bgDist(i) > T ? 1 : 0;
    mask = morph(morph(mask, W, H, false), W, H, true);   // open: remove speckles
    mask = morph(morph(mask, W, H, true), W, H, false);   // close: fill highlights

    // 2. Connected components
    var lbl = new Int32Array(N), comps = [], stack = new Int32Array(N);
    var minArea = Math.max(25, Math.round(N * 0.00025)), maxArea = N * 0.2;
    for (i = 0; i < N; i++) {
      if (!mask[i] || lbl[i]) continue;
      var id = comps.length + 1, sp = 0, pix = [];
      stack[sp++] = i; lbl[i] = id;
      var x0 = W, y0 = H, x1 = 0, y1 = 0;
      while (sp) {
        var q = stack[--sp]; pix.push(q);
        var qx = q % W, qy = (q / W) | 0;
        if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
        if (qx > 0 && mask[q - 1] && !lbl[q - 1]) { lbl[q - 1] = id; stack[sp++] = q - 1; }
        if (qx < W - 1 && mask[q + 1] && !lbl[q + 1]) { lbl[q + 1] = id; stack[sp++] = q + 1; }
        if (qy > 0 && mask[q - W] && !lbl[q - W]) { lbl[q - W] = id; stack[sp++] = q - W; }
        if (qy < H - 1 && mask[q + W] && !lbl[q + W]) { lbl[q + W] = id; stack[sp++] = q + W; }
      }
      comps.push({ id: id, area: pix.length, x0: x0, y0: y0, x1: x1, y1: y1, pix: pix });
    }
    comps = comps.filter(function (c) {
      var bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
      return c.area >= minArea && c.area <= maxArea && !(bw > W * 0.7 || bh > H * 0.7);
    });

    // 3. Colour per component -> nation
    comps.forEach(function (c) {
      var step = Math.max(1, Math.floor(c.pix.length / 400)), Lv = [], cr = [], cg = [], cb = [], r = 0, g = 0, b = 0, n = 0;
      for (var j = 0; j < c.pix.length; j += step) {
        var p = c.pix[j];
        if (Ls[p] > 92) continue; // skip specular highlights
        var R = px[p * 4] * wb[0], G = px[p * 4 + 1] * wb[1], Bb = px[p * 4 + 2] * wb[2];
        Lv.push(Ls[p]); r += R; g += G; b += Bb; n++;
        if (R + G + Bb > 45) { var ch = chroma([R, G, Bb]); cr.push(ch[0]); cg.push(ch[1]); cb.push(ch[2]); }
      }
      if (!n) { var p1 = c.pix[0]; Lv = [Ls[p1]]; n = 1; r = px[p1 * 4]; g = px[p1 * 4 + 1]; b = px[p1 * 4 + 2]; }
      c.rgb = [Math.min(255, Math.round(r / n)), Math.min(255, Math.round(g / n)), Math.min(255, Math.round(b / n))];
      var chv = cr.length ? [median(cr), median(cg), median(cb)] : chroma(c.rgb);
      var s3 = chv[0] + chv[1] + chv[2]; chv = [chv[0] / s3, chv[1] / s3, chv[2] / s3];
      c.lab = lab(c.rgb[0], c.rgb[1], c.rgb[2]);
      c.chroma = chv;
      var nn = nearestNation(chv, c.lab[0], opts.nations);
      c.nation = nn.nation; c.dist = nn.dist; c.margin = nn.margin;
      c.conf = nn.dist < 18 && nn.margin > 6 ? 'high' : (nn.dist < 32 ? 'medium' : 'low');
      c.aspect = Math.max(c.x1 - c.x0 + 1, c.y1 - c.y0 + 1) / Math.min(c.x1 - c.x0 + 1, c.y1 - c.y0 + 1);
      delete c.pix;
    });

    // 4. Size as a weak hint: pieces per blob and small/medium/large class
    var ref = median(comps.map(function (c) { return c.area; })) || 1;
    comps.forEach(function (c) {
      var rel = c.area / ref;
      // A blob much bigger than a typical piece is probably several touching pieces.
      c.pieces = rel > 3.2 ? Math.round(rel / 1.3) : 1;
      // Typical-size blobs are most likely the commonest piece (infantry / destroyer).
      c.size = c.pieces > 1 ? 'small' : (rel < 1.45 ? 'small' : (rel <= 2.0 ? 'medium' : 'large'));
    });
    return { width: W, height: H, scale: scale, whiteBalance: wb, busy: comps.length > 60, threshold: T, background: bg.map(function (c) { return c.slice(0, 3); }), components: comps, canvas: cv, refArea: ref };
  }

  function sq(v) { return v * v; }
  function morph(src, W, H, dilate) {
    var out = new Uint8Array(src.length);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x, v = dilate ? 0 : 1;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var xx = x + dx, yy = y + dy, s = (xx < 0 || yy < 0 || xx >= W || yy >= H) ? 0 : src[yy * W + xx];
        if (dilate) { if (s) v = 1; } else if (!s) v = 0;
      }
      out[i] = v;
    }
    return out;
  }

  function drawOverlay(target, res, colorOf) {
    var W = res.width, H = res.height;
    target.width = W; target.height = H;
    var g = target.getContext('2d');
    g.drawImage(res.canvas, 0, 0);
    g.lineWidth = Math.max(2, W / 220);
    g.font = 'bold ' + Math.max(12, Math.round(W / 34)) + 'px -apple-system, sans-serif';
    res.components.forEach(function (c, idx) {
      var col = colorOf(c.nation);
      g.strokeStyle = '#fff'; g.strokeRect(c.x0 - 2, c.y0 - 2, c.x1 - c.x0 + 5, c.y1 - c.y0 + 5);
      g.strokeStyle = col; g.strokeRect(c.x0 - 1, c.y0 - 1, c.x1 - c.x0 + 3, c.y1 - c.y0 + 3);
      var t = String(idx + 1) + (c.pieces > 1 ? '×' + c.pieces : '');
      var tw = g.measureText(t).width + 8, th = Math.max(14, Math.round(W / 30));
      g.fillStyle = col; g.fillRect(c.x0 - 1, Math.max(0, c.y0 - th - 2), tw, th);
      g.fillStyle = '#fff'; g.fillText(t, c.x0 + 3, Math.max(th - 3, c.y0 - 5));
    });
  }

  root.AAPhoto = { analyze: analyze, drawOverlay: drawOverlay, REF: REF, lab: lab, nearestNation: nearestNation };
})(typeof window !== 'undefined' ? window : globalThis);
