/* Logtek — « De la coupe à la carte » (accueil)
   Pendant les derniers 18 % du reel, la vidéo de Brandon devient la carte topographique d'elle-même :
   un anneau d'arpentage part de la tête d'abattage, les courbes de niveau (calculées sur les images du reel)
   apparaissent en doré par-dessus la vidéo qui s'éteint, puis se posent en crème très pâle, exactement comme
   le topo du hero. La même carte (dernière image, en miroir sous la jointure pour que les courbes se prolongent)
   devient le fond du hero, et un point GPS la parcourt une seule fois jusqu'au téléphone.

   - Précalcul hors du fil principal (Worker + OffscreenCanvas ; sinon requestIdleCallback) : 11 images clés
     réduites à une grille de luminance (96 × 96, 54 × 96 en portrait), lissée, marching squares, puis
     2 Path2D par image (courbes maîtresses, intermédiaires). Niveaux fixés une fois sur la dernière image.
   - Rendu : une tâche de la boucle partagée (fx-core.js), active seulement quand le reel est à l'écran et que
     la sortie a commencé ; aucune mesure de mise en page dans la boucle.
   - Mouvement réduit : courbes de l'affiche en surimpression fixe (bas de l'image) + carte du hero fixe.
   - Sans JS : l'affiche et topo.svg, inchangés. Tout ce qui est ajouté est décoratif (aria-hidden). */
(function () {
  "use strict";
  var L = window.LTK;
  var reel = document.querySelector("section.reel");
  if (!L || !L.fx || !reel || !window.Path2D) return;
  var media = reel.querySelector(".reel-media"), base = reel.querySelector(".reel-canvas");
  if (!media || !base) return;
  var shade = reel.querySelector(".reel-shade"), stickyEl = reel.querySelector(".reel-sticky");
  var leak = reel.querySelector(".reel-light"), grainEl = reel.querySelector(".reel-grain");
  var hero = document.querySelector("section.hero");
  var heroBg = hero && hero.querySelector(".topo-bg");
  if (heroBg && heroBg.parentNode !== hero) heroBg = null;
  var lang = (document.body.getAttribute("data-lang") || "fr") === "en" ? "en" : "fr";
  var P = "fx-reel-map-";
  var REDUCE = !!L.reduce;

  /* ---------- réglages ---------- */
  var n = +reel.getAttribute("data-frames") || 120;
  var srcSq = reel.getAttribute("data-src") || "", srcPt = reel.getAttribute("data-src-portrait") || srcSq;
  var portraitMq = window.matchMedia("(orientation: portrait)");
  var conn = navigator.connection || {};
  var STRIDE = conn.saveData || /2g/.test(conn.effectiveType || "") ? 4 : 1; // mêmes images que main.js
  var INTRO_F = Math.min(12, n - 1), EXIT = .82;
  // Tête d'abattage, relevée image par image sur les deux séries [image, x, y] (fractions de l'image)
  var HEAD = {
    sq: [[100, .58, .62], [104, .60, .63], [108, .59, .63], [110, .63, .63], [112, .66, .63], [114, .67, .64], [116, .71, .65], [119, .70, .65]],
    pt: [[100, .57, .50], [104, .57, .52], [108, .60, .50], [110, .62, .50], [112, .65, .50], [114, .69, .50], [116, .67, .50], [119, .69, .50]]
  };
  var GOLD = [217, 168, 100], CREAM = [233, 228, 214];
  var SKY = .12, RAMP = .24; // rien dans le haut 12 % (ciel, feuillage), fondu jusqu'à 24 %
  var ZOOM_END = 1.03;       // zoom de .reel-media en fin de course (main.js : 1.1 − .07)
  function pad(i) { return "f" + String(i).padStart(3, "0") + ".jpg"; }
  function sstep(a, b, x) { var t = L.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a.toFixed(3) + ")"; }
  function mix(a, b, t) { return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]; }
  var idle = window.requestIdleCallback ? function (f) { requestIdleCallback(f, { timeout: 500 }); }
    : function (f) { setTimeout(function () { var t0 = performance.now(); f({ timeRemaining: function () { return Math.max(0, 8 - (performance.now() - t0)); } }); }, 32); };
  function phoneLike() { return Math.min(window.innerWidth, window.innerHeight) < 600; }

  /* ==========================================================================
     Calcul des courbes (fonctions pures : servent dans le Worker et, à défaut, ici)
     ========================================================================== */
  function reelMapCore() {
    // Luminance (Rec. 709) + deux passes de flou boîte 3 prises, séparable
    function lum(d, GW, GH) {
      var N = GW * GH, Y = new Float32Array(N), T = new Float32Array(N), i, p, x, y, r;
      for (i = 0, p = 0; i < N; i++, p += 4) Y[i] = (.2126 * d[p] + .7152 * d[p + 1] + .0722 * d[p + 2]) / 255;
      for (var pass = 0; pass < 2; pass++) {
        for (y = 0; y < GH; y++) for (x = 0, r = y * GW; x < GW; x++) T[r + x] = (Y[r + (x ? x - 1 : 0)] + Y[r + x] + Y[r + (x < GW - 1 ? x + 1 : x)]) / 3;
        for (y = 0; y < GH; y++) {
          var u = (y ? y - 1 : 0) * GW, w = (y < GH - 1 ? y + 1 : y) * GW;
          for (x = 0; x < GW; x++) Y[y * GW + x] = (T[u + x] + T[y * GW + x] + T[w + x]) / 3;
        }
      }
      return Y;
    }
    // Niveaux aux quantiles (k + .5) / N, sous la bande du ciel
    function levels(Y, GW, GH, NL, SKY) {
      var j0 = Math.ceil(SKY * (GH - 1)), a = Float32Array.from(Y.subarray(j0 * GW)).sort(), lv = [];
      for (var k = 0; k < NL; k++) lv.push(a[Math.min(a.length - 1, Math.floor((k + .5) / NL * a.length))]);
      return lv;
    }
    var L1, L2, VIS, EX, EY, TOUCH;
    // Marching squares, interpolation linéaire, cols tranchés par la moyenne du centre ; chaînage en polylignes
    function contour(Y, GW, GH, v, SKY, FW, FH, lvk) {
      var HN = GW * GH, E = HN * 2, nt = 0;
      if (!L1 || L1.length < E) { L1 = new Int32Array(E).fill(-1); L2 = new Int32Array(E).fill(-1); VIS = new Uint8Array(E); EX = new Float32Array(E); EY = new Float32Array(E); TOUCH = new Int32Array(E); }
      function pt(e, x, y) { if (L1[e] < 0) { EX[e] = x; EY[e] = y; TOUCH[nt++] = e; } }
      function link(e1, e2) {
        if (L1[e1] < 0) L1[e1] = e2; else L2[e1] = e2;
        if (L1[e2] < 0) L1[e2] = e1; else L2[e2] = e1;
      }
      var j0 = Math.ceil(SKY * (GH - 1));
      for (var j = j0; j < GH - 1; j++) {
        for (var i = 0; i < GW - 1; i++) {
          var o = j * GW + i, a = Y[o], b = Y[o + 1], c = Y[o + GW + 1], d = Y[o + GW];
          var A = a > v, B_ = b > v, C_ = c > v, D = d > v;
          var code = (A ? 8 : 0) | (B_ ? 4 : 0) | (C_ ? 2 : 0) | (D ? 1 : 0);
          if (code === 0 || code === 15) continue;
          var T = o, Bo = o + GW, Le = HN + o, R = HN + o + 1;
          var eT = A !== B_, eR = B_ !== C_, eB = D !== C_, eL = A !== D;
          if (eT) pt(T, i + (v - a) / (b - a), j);
          if (eR) pt(R, i + 1, j + (v - b) / (c - b));
          if (eB) pt(Bo, i + (v - d) / (c - d), j + 1);
          if (eL) pt(Le, i, j + (v - a) / (d - a));
          if (code === 5 || code === 10) {
            var up = (a + b + c + d) / 4 > v;
            if ((code === 5) === up) { link(Le, T); link(Bo, R); } else { link(T, R); link(Le, Bo); }
          } else {
            var e1 = -1, e2 = -1;
            if (eT) e1 = T;
            if (eR) { if (e1 < 0) e1 = R; else e2 = R; }
            if (eB) { if (e1 < 0) e1 = Bo; else e2 = Bo; }
            if (eL) e2 = Le;
            link(e1, e2);
          }
        }
      }
      var out = [], sx = FW / GW, sy = FH / GH;
      function walk(s) {
        var xs = [], prev = -1, cur = s, len = 0, lx = 0, ly = 0;
        while (cur >= 0 && !VIS[cur]) {
          VIS[cur] = 1;
          var x = EX[cur], y = EY[cur];
          if (xs.length) len += Math.sqrt((x - lx) * (x - lx) + (y - ly) * (y - ly));
          xs.push((x + .5) * sx, (y + .5) * sy); lx = x; ly = y;
          var nx = L1[cur] !== prev ? L1[cur] : L2[cur];
          prev = cur; cur = nx;
        }
        var closed = cur === s && xs.length > 4;
        if (closed) len += Math.sqrt((EX[s] - lx) * (EX[s] - lx) + (EY[s] - ly) * (EY[s] - ly));
        if (len >= 6) out.push({ p: xs, c: closed, len: len, k: lvk }); // < 6 cellules : bruit
      }
      var t;
      for (t = 0; t < nt; t++) if (!VIS[TOUCH[t]] && L2[TOUCH[t]] < 0) walk(TOUCH[t]); // lignes ouvertes
      for (t = 0; t < nt; t++) if (!VIS[TOUCH[t]]) walk(TOUCH[t]);                     // boucles
      for (t = 0; t < nt; t++) { var z = TOUCH[t]; L1[z] = -1; L2[z] = -1; VIS[z] = 0; }
      return out;
    }
    // Plafond de segments : on garde les plus longues (= relever la longueur minimale), puis on emballe
    function pack(polys, cap) {
      var segs = 0, i;
      for (i = 0; i < polys.length; i++) segs += polys[i].p.length / 2 - (polys[i].c ? 0 : 1);
      if (segs > cap) {
        polys.sort(function (a, b) { return b.len - a.len; });
        var keep = [], acc = 0;
        for (i = 0; i < polys.length; i++) { var s = polys[i].p.length / 2; if (acc + s > cap) break; acc += s; keep.push(polys[i]); }
        polys = keep; segs = acc;
      }
      var np = 0; for (i = 0; i < polys.length; i++) np += polys[i].p.length;
      var pts = new Float32Array(np), meta = new Int32Array(polys.length * 3), lens = new Float32Array(polys.length), o = 0;
      for (i = 0; i < polys.length; i++) {
        pts.set(polys[i].p, o); meta[3 * i] = o; meta[3 * i + 1] = polys[i].p.length; meta[3 * i + 2] = (polys[i].c ? 1 : 0) | (polys[i].k << 1);
        lens[i] = polys[i].len; o += polys[i].p.length;
      }
      return { pts: pts, meta: meta, lens: lens, segs: segs };
    }
    return { lum: lum, levels: levels, contour: contour, pack: pack };
  }

  // Worker : télécharge (cache HTTP) et calcule chaque image clé, la référence d'abord
  function reelMapWorker() {
    var C = reelMapCore();
    self.onmessage = function (e) {
      var m = e.data, levels = null, cv = null, cx = null;
      function one(k) {
        return fetch(m.base + "f" + String(k).padStart(3, "0") + ".jpg").then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); })
          .then(function (b) { return createImageBitmap(b); })
          .then(function (bm) {
            if (!cv) { cv = new OffscreenCanvas(m.GW, m.GH); cx = cv.getContext("2d", { willReadFrequently: true }); if (!cx) throw new Error("2d"); }
            cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high";
            cx.clearRect(0, 0, m.GW, m.GH); cx.drawImage(bm, 0, 0, m.GW, m.GH);
            var FW = bm.width, FH = bm.height; if (bm.close) bm.close();
            var Y = C.lum(cx.getImageData(0, 0, m.GW, m.GH).data, m.GW, m.GH);
            if (!levels) levels = C.levels(Y, m.GW, m.GH, m.NL, m.SKY);
            var polys = [];
            for (var q = 0; q < levels.length; q++) polys = polys.concat(C.contour(Y, m.GW, m.GH, levels[q], m.SKY, FW, FH, q));
            var pk = C.pack(polys, m.cap);
            self.postMessage({ k: k, FW: FW, FH: FH, levels: levels, pts: pk.pts, meta: pk.meta, lens: pk.lens, segs: pk.segs }, [pk.pts.buffer, pk.meta.buffer, pk.lens.buffer]);
          });
      }
      var order = [m.ref].concat(m.keys.filter(function (k) { return k !== m.ref; }));
      order.reduce(function (pr, k) { return pr.then(function () { return one(k); }); }, Promise.resolve())
        .then(function () { self.postMessage({ done: true }); }, function (err) { self.postMessage({ err: String(err && err.message || err) }); });
    };
  }

  /* ---------- éléments injectés (décor seulement) ---------- */
  var iso = document.createElement("canvas");
  iso.className = P + "iso"; iso.setAttribute("aria-hidden", "true"); iso.width = iso.height = 1;
  // Mouvement réduit : rien ne bouge, le calque fixe passe au-dessus des voiles (même zoom que .reel-media)
  if (REDUCE && shade) { iso.classList.add(P + "static"); shade.insertAdjacentElement("afterend", iso); }
  else base.insertAdjacentElement("afterend", iso);
  var ictx = iso.getContext("2d");
  if (!ictx) return;

  var tc = reel.querySelector(".reel-meta [data-tc]"), rec = tc && tc.parentNode, ci = null;
  if (rec && !REDUCE) {
    rec.classList.add(P + "rec");
    ci = document.createElement("b");
    ci.className = P + "ci"; ci.setAttribute("aria-hidden", "true");
    ci.textContent = lang === "en" ? "Contour interval 10 m" : "Équidistance 10 m";
    rec.appendChild(ci);
  }

  var topo = null, tctx = null;
  if (heroBg) {
    topo = document.createElement("canvas");
    topo.className = P + "topo"; topo.setAttribute("aria-hidden", "true"); topo.width = topo.height = 1;
    heroBg.appendChild(topo);
    tctx = topo.getContext("2d");
  }

  /* ---------- série d'images (carré ou portrait) ---------- */
  var CORE = null, S = null, perf = { mainSlices: [], worker: false, builds: [] };
  function makeSet(portrait) {
    var src = portrait ? srcPt : srcSq, last = n - 1, keys = [], k;
    if (REDUCE) keys = [0];
    else if (STRIDE > 1) { for (k = Math.max(0, n - 20); k <= last; k++) if (k % STRIDE === 0) keys.push(k); }
    else { for (k = Math.max(0, n - 20); k < last; k += 2) keys.push(k); keys.push(last); }
    return {
      portrait: portrait, src: src, keys: keys, ref: keys[keys.length - 1],
      GW: portrait ? 54 : 96, GH: 96, NL: portrait || phoneLike() ? 8 : 10,
      cap: phoneLike() ? 3500 : 6000,
      FW: 0, FH: 0, levels: null, data: {}, pending: [], busy: false, dead: false, worker: null,
      head: portrait ? HEAD.pt : HEAD.sq
    };
  }
  function startSet(portrait) {
    if (S) { S.dead = true; if (S.worker) S.worker.terminate(); }
    S = makeSet(portrait);
    var set = S;
    if (!tryWorker(set)) mainThread(set);
  }
  var WURL = null;
  function tryWorker(set) {
    if (!window.Worker || !window.OffscreenCanvas || !window.createImageBitmap || !window.Blob || !window.URL) return false;
    try {
      if (!WURL) WURL = URL.createObjectURL(new Blob([reelMapCore.toString() + "\n(" + reelMapWorker.toString() + ")();"], { type: "text/javascript" }));
      var w = new Worker(WURL);
      set.worker = w; perf.worker = true;
      w.onmessage = function (e) {
        if (set.dead) return;
        var m = e.data;
        if (m.err) { w.terminate(); set.worker = null; perf.worker = "fallback:" + m.err; mainThread(set); return; }
        if (m.done) { w.terminate(); set.worker = null; return; }
        if (!set.FW) { set.FW = m.FW; set.FH = m.FH; sizeIso(); }
        set.levels = m.levels;
        set.pending.push(m); schedule(set);
      };
      w.onerror = function (ev) { if (ev && ev.preventDefault) ev.preventDefault(); if (set.dead) return; w.terminate(); set.worker = null; perf.worker = "fallback"; mainThread(set); };
      w.postMessage({ base: new URL(set.src, location.href).href, keys: set.keys, ref: set.ref, GW: set.GW, GH: set.GH, NL: set.NL, SKY: SKY, cap: set.cap });
      return true;
    } catch (err) { return false; }
  }
  // Repli sans Worker : images décodées hors fil, puis une étape de calcul par temps mort (≤ ~5 ms)
  function mainThread(set) {
    if (set.dead) return;
    CORE = CORE || reelMapCore();
    var cv = document.createElement("canvas"), cx = null, jobs = {};
    set.keys.forEach(function (k) {
      var im = new Image();
      im.onload = function () {
        var go = function () { if (set.dead) return; jobs[k] = { k: k, im: im, lv: 0, polys: [] }; set.pending.push({ job: jobs[k] }); schedule(set); };
        if (im.decode) im.decode().then(go, go); else go();
      };
      im.src = set.src + pad(k);
    });
    set.step = function (item) {
      var j = item.job;
      if (!j.Y) {
        if (!set.levels && j.k !== set.ref) return false; // la référence fixe les niveaux : on attend
        if (!cx) { cv.width = set.GW; cv.height = set.GH; cx = cv.getContext("2d", { willReadFrequently: true }); }
        if (!set.FW) { set.FW = j.im.naturalWidth; set.FH = j.im.naturalHeight; sizeIso(); }
        cx.drawImage(j.im, 0, 0, set.GW, set.GH);
        j.Y = CORE.lum(cx.getImageData(0, 0, set.GW, set.GH).data, set.GW, set.GH);
        if (!set.levels) set.levels = CORE.levels(j.Y, set.GW, set.GH, set.NL, SKY);
        return true;
      }
      j.polys = j.polys.concat(CORE.contour(j.Y, set.GW, set.GH, set.levels[j.lv], SKY, set.FW, set.FH, j.lv));
      if (++j.lv < set.NL) return true;
      var pk = CORE.pack(j.polys, set.cap); pk.k = j.k;
      item.job = null; item.msg = pk; // prêt à devenir des Path2D
      return true;
    };
  }
  function schedule(set) {
    if (set.busy || set.dead) return;
    set.busy = true;
    idle(function (dl) { set.busy = false; slice(set, dl); });
  }
  function slice(set, dl) {
    if (set.dead) return;
    var t0 = performance.now(), progressed = true, any = false;
    while (set.pending.length && progressed) {
      progressed = false;
      // la référence d'abord
      var qi = 0;
      for (var i = 0; i < set.pending.length; i++) { var it = set.pending[i], kk = it.job ? it.job.k : it.msg ? it.msg.k : it.k; if (kk === set.ref) { qi = i; break; } }
      var item = set.pending[qi];
      if (item.job) {
        if (set.step(item)) progressed = true;
        else { // attendre la référence : essayer les autres qui ont déjà leur grille
          for (var q = 0; q < set.pending.length && !progressed; q++) if (set.pending[q].job && set.pending[q].job.Y && set.step(set.pending[q])) progressed = true;
        }
      } else {
        var m = item.msg || item;
        var tb = performance.now();
        build(set, m); set.pending.splice(qi, 1); progressed = true;
        perf.builds.push(+(performance.now() - tb).toFixed(2));
      }
      if (progressed) any = true;
      if (dl.timeRemaining() < 3 || performance.now() - t0 > 4) break;
    }
    perf.mainSlices.push(+(performance.now() - t0).toFixed(2));
    if (set.pending.length && any) schedule(set); // sinon : on attend l'image de référence (son arrivée relance)
  }
  // Courbes lissées (quadratiques par les milieux) : même nombre de segments, sans les cassures de la grille
  function addPoly(path, p, o, len, closed) {
    var m = len / 2, i;
    if (m < 2) return;
    if (closed) {
      var lx = p[o + len - 2], ly = p[o + len - 1];
      path.moveTo((lx + p[o]) / 2, (ly + p[o + 1]) / 2);
      for (i = 0; i < m; i++) {
        var a = o + 2 * i, b = o + 2 * ((i + 1) % m);
        path.quadraticCurveTo(p[a], p[a + 1], (p[a] + p[b]) / 2, (p[a + 1] + p[b + 1]) / 2);
      }
      path.closePath();
    } else {
      path.moveTo(p[o], p[o + 1]);
      for (i = 1; i < m - 1; i++) { var c = o + 2 * i; path.quadraticCurveTo(p[c], p[c + 1], (p[c] + p[c + 2]) / 2, (p[c + 1] + p[c + 3]) / 2); }
      path.lineTo(p[o + len - 2], p[o + len - 1]);
    }
  }
  function isIndex(lvk, NL) { return NL >= 10 ? lvk % 5 === 2 : lvk === 2 || lvk === 6; } // une courbe sur cinq (sur quatre en 8 niveaux)
  function build(set, m) {
    var minor = new Path2D(), index = new Path2D(), meta = m.meta, pts = m.pts, polys = [];
    for (var i = 0; i < meta.length; i += 3) {
      var o = meta[i], len = meta[i + 1], closed = meta[i + 2] & 1, lvk = meta[i + 2] >> 1;
      addPoly(isIndex(lvk, set.NL) ? index : minor, pts, o, len, closed);
      if (m.k === set.ref) polys.push({ p: pts.subarray(o, o + len), c: closed, len: m.lens[i / 3] });
    }
    set.data[m.k] = { minor: minor, index: index, segs: m.segs, polys: m.k === set.ref ? polys : null };
    if (m.k === set.ref) { heroReady(); if (REDUCE) drawStatic(); }
    if (!REDUCE) { last = ""; L.fx.wake(); }
  }

  /* ---------- géométrie (mise en cache, jamais dans la boucle) ---------- */
  var BW = 0, BH = 0, KS = 1, cover = 1, ox = 0, oy = 0;
  function measure() {
    BW = media.offsetWidth; BH = media.offsetHeight;
    if (!S || !S.FW || !BW) return;
    cover = Math.max(BW / S.FW, BH / S.FH);
    ox = (BW - S.FW * cover) * .5; oy = (BH - S.FH * cover) * .45; // object-position: 50% 45%
  }
  function sizeIso() {
    measure();
    if (!S || !S.FW) return;
    var k = Math.min(2, Math.ceil(cover * Math.min(window.devicePixelRatio || 1, 1.5)));
    if (iso.width !== S.FW * k || iso.height !== S.FH * k) { iso.width = S.FW * k; iso.height = S.FH * k; painted = true; }
    KS = k; fillGrad = null; last = "";
  }

  /* ---------- rendu de la sortie ---------- */
  var on = false, painted = false, last = "", fillGrad = null, visible = false, labelOn = false, breathing = false;
  function ensureFill() {
    // Même lueur que le fond du hero (radial 1200 × 600 px à 80 % / 10 %, #2B2218 → #16130F) prolongée
    // au-dessus de la jointure : le bas du reel se fond dans le haut du hero.
    if (fillGrad) return;
    var z = ZOOM_END, hH = hero ? hero.offsetHeight : BH, cx = .8 * BW, cy = BH + .1 * hH;
    fillGrad = {
      x: ((cx - BW / 2) / z + BW / 2 - ox) / cover, y: ((cy - BH / 2) / z + BH / 2 - oy) / cover,
      rx: 1200 / (cover * z), ry: 600 / (cover * z), g: ictx.createRadialGradient(0, 0, 0, 0, 0, 1)
    };
    fillGrad.g.addColorStop(0, "#2B2218"); fillGrad.g.addColorStop(.6, "#16130F"); fillGrad.g.addColorStop(1, "#16130F");
  }
  function setOn(v) {
    if (v === on) return;
    on = v;
    reel.classList.toggle(P + "on", v);
    breathe(v && visible);
    if (!v && shade) shade.style.opacity = "";
    if (!v) { if (leak) leak.style.opacity = ""; if (grainEl) grainEl.style.opacity = ""; }
  }
  function setLabel(v) {
    if (v === labelOn || !ci) return;
    labelOn = v; reel.classList.toggle(P + "ci-on", v);
  }
  // Le reel « respire » (reel-breathe, 16 s) : le calque suit exactement le même mouvement, calé sur la même horloge
  function breathe(v) {
    if (v === breathing || REDUCE) return;
    breathing = v;
    iso.classList.toggle(P + "breathe", v);
    if (v && iso.getAnimations && base.getAnimations) {
      var find = function (el) { return el.getAnimations().filter(function (a) { return a.animationName === "reel-breathe"; })[0]; };
      var a = find(base), b = find(iso);
      if (a && b) Promise.all([a.ready, b.ready]).then(function () { if (a.startTime != null) b.startTime = a.startTime; })["catch"](function () {});
    }
  }
  function headAt(set, f) {
    var tr = set.head, i = 0;
    if (f <= tr[0][0]) return [tr[0][1], tr[0][2]];
    for (; i < tr.length - 1 && tr[i + 1][0] < f; i++);
    if (i >= tr.length - 1) return [tr[i][1], tr[i][2]];
    var a = tr[i], b = tr[i + 1], t = (f - a[0]) / (b[0] - a[0]);
    return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function strokeKey(d, w, col, idxA, minA, s) {
    if (!d || w <= .002) return;
    var FH = S.FH;
    function grad(a) { var g = ictx.createLinearGradient(0, SKY * FH, 0, RAMP * FH); g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, a)); return g; }
    ictx.globalAlpha = w;
    ictx.lineWidth = 1 / s; ictx.strokeStyle = grad(minA); ictx.stroke(d.minor);
    ictx.lineWidth = 1.4 / s; ictx.strokeStyle = grad(idxA); ictx.stroke(d.index);
  }
  function draw(ee, f) {
    var set = S, FW = set.FW, FH = set.FH, k = KS;
    ictx.setTransform(1, 0, 0, 1, 0, 0);
    ictx.clearRect(0, 0, iso.width, iso.height);
    ictx.setTransform(k, 0, 0, k, 0, 0);
    // Images clés a ≤ f < b, fondu enchaîné
    var keys = set.keys, a = keys[0], b = keys[0];
    for (var i = 0; i < keys.length; i++) { b = keys[i]; if (keys[i] > f) break; a = keys[i]; }
    var da = set.data[a] || set.data[set.ref], db = set.data[b] || da, t = b > a ? L.clamp((f - a) / (b - a), 0, 1) : 0;
    var s = cover * ZOOM_END; // px CSS par px d'image
    // Anneau d'arpentage centré sur la tête d'abattage, gardé dans le cadre visible
    var h = headAt(set, f);
    var vx0 = -ox / cover, vx1 = (BW - ox) / cover, vy0 = -oy / cover, vy1 = (BH - oy) / cover;
    var hx = L.clamp(h[0] * FW, vx0 + 60 / s, vx1 - 60 / s), hy = L.clamp(h[1] * FH, vy0 + 60 / s, vy1 - 90 / s);
    var R = Math.max(Math.hypot(hx - vx0, hy - vy0), Math.hypot(vx1 - hx, hy - vy0), Math.hypot(hx - vx0, vy1 - hy), Math.hypot(vx1 - hx, vy1 - hy)) + 4 / s;
    var r = sstep(0, .6, ee) * R;
    var m = sstep(.45, 1, ee); // doré → crème
    var col = mix(GOLD, CREAM, m);
    var idxA = .62 + (.10 - .62) * m, minA = .34 + (.05 - .34) * m;
    ictx.save();
    ictx.beginPath(); ictx.arc(hx, hy, Math.max(.01, r), 0, Math.PI * 2); ictx.clip();
    // la vidéo s'éteint sous la carte (une seule couche, sans mode de fusion)
    ensureFill();
    ictx.globalAlpha = .62 + .38 * sstep(.15, 1, ee);
    ictx.save(); ictx.translate(fillGrad.x, fillGrad.y); ictx.scale(fillGrad.rx, fillGrad.ry);
    ictx.fillStyle = fillGrad.g; ictx.fillRect(-fillGrad.x / fillGrad.rx, -fillGrad.y / fillGrad.ry, FW / fillGrad.rx, FH / fillGrad.ry);
    ictx.restore();
    // front d'onde : un voile doré juste derrière l'anneau
    var wa = .16 * (1 - sstep(.3, .75, ee));
    if (wa > .004 && r > 4) {
      var band = 110 / s, wg = ictx.createRadialGradient(hx, hy, Math.max(0, r - band), hx, hy, r);
      wg.addColorStop(0, rgba(GOLD, 0)); wg.addColorStop(1, rgba(GOLD, wa));
      ictx.globalAlpha = 1; ictx.fillStyle = wg; ictx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    }
    ictx.lineJoin = "round"; ictx.lineCap = "round";
    strokeKey(da, db === da ? 1 : 1 - t, col, idxA, minA, s);
    if (db !== da) strokeKey(db, t, col, idxA, minA, s);
    ictx.restore();
    // l'anneau lui-même et le point de coupe d'où part le relevé
    if (ee < 1 && r > 1) {
      ictx.globalAlpha = 1;
      ictx.beginPath(); ictx.arc(hx, hy, r, 0, Math.PI * 2);
      ictx.lineWidth = 8 / s; ictx.strokeStyle = rgba(GOLD, .10 * (1 - ee)); ictx.stroke();
      ictx.lineWidth = 1.2 / s; ictx.strokeStyle = rgba(GOLD, .9 * (1 - ee)); ictx.stroke();
    }
    var pa = 1 - sstep(.05, .4, ee);
    if (pa > .01) {
      ictx.globalAlpha = pa; ictx.beginPath(); ictx.arc(hx, hy, 3.5 / s, 0, Math.PI * 2); ictx.fillStyle = "#D9A864"; ictx.fill();
      ictx.beginPath(); ictx.arc(hx, hy, 9 / s, 0, Math.PI * 2); ictx.lineWidth = 1 / s; ictx.strokeStyle = "rgba(217,168,100,.6)"; ictx.stroke();
    }
    ictx.globalAlpha = 1;
    // Les voiles du reel s'effacent : le fond de carte prend le relais (pas de double assombrissement)
    if (shade) { var so = (1 - sstep(.25, 1, ee)).toFixed(3); if (shade.style.opacity !== so) shade.style.opacity = so;
      if (leak) leak.style.opacity = (.85 * so).toFixed(3);
      if (grainEl) grainEl.style.opacity = (.13 * so).toFixed(3); }
    painted = true;
  }
  function clearIso() {
    if (!painted) return;
    ictx.setTransform(1, 0, 0, 1, 0, 0); ictx.clearRect(0, 0, iso.width, iso.height); painted = false;
  }

  // État du reel publié par main.js (reel._ltk) ; sinon on le calcule nous-mêmes à partir de mesures en cache
  var top0 = 0, span = 1;
  function geo() { top0 = reel.getBoundingClientRect().top + window.scrollY; span = Math.max(1, reel.offsetHeight - (stickyEl ? stickyEl.offsetHeight : 0)); }
  var stats = { updates: 0, draws: 0, drawMs: 0, maxDraw: 0 };
  var task = {
    update: function () {
      stats.updates++;
      var st = reel._ltk, ee, f;
      if (st) {
        ee = st.ee; f = st.f;
        if (!!st.portrait !== S.portrait) { swap(!!st.portrait); return false; }
      } else {
        var sp = L.clamp((window.scrollY - top0) / span, 0, 1), e = L.clamp((sp - EXIT) / (1 - EXIT), 0, 1);
        ee = e * e * (3 - 2 * e); f = INTRO_F + sp * (n - 1 - INTRO_F);
      }
      setLabel(ee > .2);
      if (!(ee > 0) || !S.FW || !S.data[S.ref]) { clearIso(); setOn(false); last = ""; return false; }
      var key = ee.toFixed(4) + "|" + f.toFixed(3);
      if (key === last) return false;
      last = key;
      setOn(true);
      var td = performance.now(); draw(ee, f); td = performance.now() - td; stats.draws++; stats.drawMs += td; if (td > stats.maxDraw) stats.maxDraw = td;
      return true; // une image de plus : main.js peut encore être en train de lisser la position
    }
  };

  /* ---------- hero : la carte continue sous la jointure ---------- */
  var heroNear = false, heroDrawn = false, heroSeen = false, heroInView = false, dotDone = false;
  function heroReady() { if (heroNear) drawHero(); }
  // Image → hero : miroir sous la jointure (les courbes se prolongent), puis va-et-vient si le hero est plus haut
  function heroTiles(W, Hh) {
    var set = S, z = REDUCE ? 1 : ZOOM_END, bw = BW || W, bh = BH || window.innerHeight;
    var cv = Math.max(bw / set.FW, bh / set.FH), oxr = (bw - set.FW * cv) * .5, oyr = (bh - set.FH * cv) * .45;
    var sz = cv * z, yb = L.clamp(((bh / 2) / z + bh / 2 - oyr) / cv, 0, set.FH);
    var ex = (oxr - bw / 2) * z + bw / 2 + (W - bw) / 2, tiles = [];
    for (var k = 0; k < 12; k++) {
      var flip = k % 2 === 0, f0 = flip ? (yb + k * set.FH) * sz : (yb + (k - 1) * set.FH) * sz;
      if ((flip ? f0 - set.FH * sz : f0) > Hh) break;
      tiles.push({ a: sz, d: flip ? -sz : sz, e: ex, f: f0 });
    }
    return { tiles: tiles, sz: sz };
  }
  function drawHero() {
    if (!tctx || !S || !S.data[S.ref]) return;
    var W = hero.offsetWidth, Hh = hero.offsetHeight;
    if (!W || !Hh) return;
    var dpr = Math.min(1.5, window.devicePixelRatio || 1), cw = Math.round(W * dpr), ch = Math.round(Hh * dpr);
    if (topo.width !== cw || topo.height !== ch) { topo.width = cw; topo.height = ch; }
    tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.clearRect(0, 0, cw, ch);
    var d = S.data[S.ref], T = heroTiles(W, Hh), FH = S.FH;
    tctx.lineJoin = "round"; tctx.lineCap = "round";
    T.tiles.forEach(function (t) {
      tctx.setTransform(t.a * dpr, 0, 0, t.d * dpr, t.e * dpr, t.f * dpr);
      var gi = tctx.createLinearGradient(0, SKY * FH, 0, RAMP * FH), gm = tctx.createLinearGradient(0, SKY * FH, 0, RAMP * FH);
      gi.addColorStop(0, rgba(CREAM, 0)); gi.addColorStop(1, rgba(CREAM, .10)); // = topo.svg
      gm.addColorStop(0, rgba(CREAM, 0)); gm.addColorStop(1, rgba(CREAM, .05));
      tctx.lineWidth = 1 / T.sz; tctx.strokeStyle = gm; tctx.stroke(d.minor);
      tctx.lineWidth = 1.4 / T.sz; tctx.strokeStyle = gi; tctx.stroke(d.index);
    });
    if (!heroDrawn) {
      heroDrawn = true;
      // Déjà à l'écran (rechargement au milieu de la page) : fondu enchaîné ; sinon bascule hors champ
      if (heroSeen && !REDUCE) {
        topo.classList.add(P + "fade");
        requestAnimationFrame(function () { requestAnimationFrame(function () { topo.classList.add(P + "in"); }); });
        setTimeout(function () { heroBg.classList.add(P + "live"); }, 950);
      } else { topo.classList.add(P + "in"); heroBg.classList.add(P + "live"); }
    }
    if (heroInView) maybeDot();
  }

  /* ---------- point GPS : une seule fois, le long d'une courbe, jusqu'au bord du téléphone ---------- */
  function maybeDot() {
    if (dotDone || REDUCE || !heroDrawn || !S.data[S.ref] || !heroBg) return;
    var phone = hero.querySelector(".hero-visual .phone") || hero.querySelector(".hero-visual");
    dotDone = true;
    if (!phone || !Element.prototype.animate) return;
    var hr = hero.getBoundingClientRect(), pr = phone.getBoundingClientRect(); // lu une seule fois
    var W = hr.width, Hh = hr.height, px = pr.left - hr.left, pTop = pr.top - hr.top, pBot = pr.bottom - hr.top;
    if (px < W * .45) return; // une seule colonne (cellulaire) : le téléphone n'est pas à côté
    var T = heroTiles(W, Hh), polys = S.data[S.ref].polys || [], best = null;
    var y0 = Math.max(24, pTop + 60), y1 = Math.min(Hh - 24, pBot - 60);
    polys.forEach(function (q) {
      T.tiles.forEach(function (t) {
        var p = q.p, m = p.length / 2, run = [], runs = [];
        for (var i = 0; i < m; i++) {
          var x = t.a * p[2 * i] + t.e, y = t.d * p[2 * i + 1] + t.f;
          if (x >= 0 && x <= px + 2 && y >= 24 && y <= Hh - 24) run.push(x, y);
          else { if (run.length > 4) runs.push(run); run = []; }
        }
        if (run.length > 4) runs.push(run);
        runs.forEach(function (r) {
          if (r[0] > r[r.length - 2]) { var rv = []; for (var j = r.length - 2; j >= 0; j -= 2) rv.push(r[j], r[j + 1]); r = rv; }
          var ex = r[r.length - 2], ey = r[r.length - 1];
          if (ex < px - 50 || ey < y0 || ey > y1) return; // doit finir au bord du téléphone, à sa hauteur
          // on part du point le plus à gauche (au plus une demi-largeur avant) : un trajet qui avance vers l'app
          var im = 0, lim = ex - W * .5;
          for (var j2 = 0; j2 < r.length; j2 += 2) if (r[j2] < r[im]) im = j2;
          if (r[im] < lim) { for (var j3 = r.length - 2; j3 >= 0; j3 -= 2) if (r[j3] <= lim) { im = j3; break; } }
          var sub = r.slice(im), dx = ex - sub[0], len = 0;
          for (var k = 2; k < sub.length; k += 2) len += Math.hypot(sub[k] - sub[k - 2], sub[k + 1] - sub[k - 1]);
          if (dx < 1 || len < 1) return;
          var score = dx * Math.sqrt(dx / len); // avancer, et plutôt en douceur
          if (!best || score > best.score) best = { r: sub, len: len, dx: dx, score: score };
        });
      });
    });
    perf.dot = best ? { len: Math.round(best.len), dx: Math.round(best.dx), x0: Math.round(best.r[0]), y0: Math.round(best.r[1]) } : null;
    if (!best || best.dx < 160) return;
    var r = best.r;
    var lens = [0], tot = 0, i2;
    for (i2 = 2; i2 < r.length; i2 += 2) { tot += Math.hypot(r[i2] - r[i2 - 2], r[i2 + 1] - r[i2 - 1]); lens.push(tot); }
    var kf = [], trail = "M" + r[0].toFixed(1) + " " + r[1].toFixed(1);
    for (var j = 0; j < r.length; j += 2) {
      var o = lens[j / 2] / tot;
      kf.push({ offset: o, transform: "translate3d(" + r[j].toFixed(1) + "px," + r[j + 1].toFixed(1) + "px,0)", opacity: o < .06 ? o / .06 : o > .88 ? Math.max(0, (1 - o) / .12) : 1 });
      if (j) trail += "L" + r[j].toFixed(1) + " " + r[j + 1].toFixed(1);
    }
    var NS = "http://www.w3.org/2000/svg";
    var dot = document.createElement("i"); dot.className = P + "dot"; dot.setAttribute("aria-hidden", "true");
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", P + "trail"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
    svg.setAttribute("width", Math.round(W)); svg.setAttribute("height", Math.round(Hh)); svg.setAttribute("viewBox", "0 0 " + Math.round(W) + " " + Math.round(Hh));
    var path = document.createElementNS(NS, "path");
    path.setAttribute("d", trail); path.setAttribute("pathLength", "1");
    svg.appendChild(path); heroBg.appendChild(svg); heroBg.appendChild(dot);
    var DUR = 1600, EASE = "cubic-bezier(.65,0,.35,1)", TL = .24, delay = 200;
    var a1 = dot.animate(kf, { duration: DUR, delay: delay, easing: EASE, fill: "both" });
    var a2 = path.animate([{ strokeDasharray: TL + " 2", strokeDashoffset: TL, strokeOpacity: .55 }, { strokeDasharray: TL + " 2", strokeDashoffset: TL - 1, strokeOpacity: 0 }],
      { duration: DUR, delay: delay, easing: EASE, fill: "both" });
    a1.onfinish = function () { a1.cancel(); a2.cancel(); dot.remove(); svg.remove(); };
  }

  /* ---------- mouvement réduit : image fixe ---------- */
  function drawStatic() {
    var d = S && S.data[S.ref];
    if (!d) return;
    sizeIso();
    var FW = S.FW, FH = S.FH, k = KS, s = cover;
    ictx.setTransform(k, 0, 0, k, 0, 0); ictx.clearRect(0, 0, FW, FH);
    // bas du cadre visible (35 %), fondu linéaire ; par-dessus les voiles du reel, sous le texte
    var yb = (BH - oy) / s, yt = (BH * .65 - oy) / s;
    function g(a) { var q = ictx.createLinearGradient(0, yt, 0, yb); q.addColorStop(0, rgba(CREAM, 0)); q.addColorStop(1, rgba(CREAM, a)); return q; }
    ictx.lineJoin = "round"; ictx.lineCap = "round";
    ictx.lineWidth = 1 / s; ictx.strokeStyle = g(.08); ictx.stroke(d.minor);
    ictx.lineWidth = 1.4 / s; ictx.strokeStyle = g(.16); ictx.stroke(d.index);
    painted = true;
  }

  /* ---------- orientation ---------- */
  function swap(portrait) {
    if (S && S.portrait === portrait) return;
    clearIso(); setOn(false); setLabel(false);
    startSet(portrait); measure(); last = "";
  }

  /* ---------- démarrage ---------- */
  var rt = 0;
  function onResize() {
    clearTimeout(rt);
    rt = setTimeout(function () {
      sizeIso(); geo(); fillGrad = null; last = "";
      if (REDUCE) drawStatic(); else { clearIso(); L.fx.wake(); }
      if (heroDrawn || heroNear) drawHero();
    }, 200);
  }
  function boot() {
    startSet(portraitMq.matches);
    geo(); measure();
    window.addEventListener("resize", onResize);
    var pm = function () { if (REDUCE || !reel._ltk) swap(portraitMq.matches); };
    if (portraitMq.addEventListener) portraitMq.addEventListener("change", pm); else if (portraitMq.addListener) portraitMq.addListener(pm);
    if (!REDUCE) {
      L.onVisible(reel, function (v) {
        visible = v;
        if (v) { L.fx.add(task); breathe(on); } else { L.fx.remove(task); breathe(false); }
      });
    }
    if (hero && topo) {
      L.onVisible(hero, function (v) { if (v && !heroNear) { heroNear = true; drawHero(); } }, "100% 0px 100% 0px");
      L.onVisible(hero, function (v) { heroSeen = heroSeen || v; });
      L.onVisible(hero, function (v) { heroInView = v; if (v) maybeDot(); }, "0px 0px -68% 0px");
      if (window.ResizeObserver) {
        var w0 = 0, h0 = 0;
        new ResizeObserver(function (en) {
          var cr = en[0].contentRect;
          if (Math.abs(cr.width - w0) < 1 && Math.abs(cr.height - h0) < 1) return;
          w0 = cr.width; h0 = cr.height;
          if (heroDrawn) onResize();
        }).observe(hero);
      }
    }
  }
  // Après « load » : on ne vole jamais la bande passante à l'affiche, aux polices ni aux images d'ouverture
  if (document.readyState === "complete") setTimeout(boot, 0);
  else window.addEventListener("load", function () { setTimeout(boot, 0); });

  // Lecture seule, pour les tests de performance
  L.reelMap = {
    stats: stats, perf: perf,
    state: function () { return S && { keys: S.keys, ready: Object.keys(S.data).length, segs: S.keys.map(function (k) { return S.data[k] && S.data[k].segs; }), levels: S.levels, portrait: S.portrait, cap: S.cap, NL: S.NL }; }
  };
})();
