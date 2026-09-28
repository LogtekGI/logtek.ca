/* Logtek — « Trace chaînée certifiée » (page Logiciel, FR et EN)
   Le moment fort de la page : une trace GPS d'abatteuse se dessine derrière la section « Pas de réseau? »
   (bandes en va-et-vient, virages en U, un point toutes les 12 px, horodaté +3 s). Chaque point est un
   rivet doré relié au précédent par une plaque d'acier : la trace se lit comme une chaîne de hachage
   (FNV-1a 32 bits de « i|lat|lon|t|hash précédent »). Au tiers du parcours, la machine traverse une
   zone « Hors réseau » : les points restent sur l'appareil (anneaux ambre), puis un front de
   synchronisation repasse sur eux et les dore.
   Ensuite, tout est au repos (0 ms par seconde). On peut essayer d'altérer la trace :
     - souris/stylet : survol d'un rivet = fiche du point; on le saisit et on le tire, le lien vire au
       rouge et la vérification s'arrête là (onde rouge vers l'avant); au relâchement, ressort
       amorti critique (k = 170) puis onde dorée qui revalide jusqu'au bout;
     - toucher/clavier : le bouton « Tester l'intégrité » (carte 3) fait la même démonstration;
     - survol de la carte « Hors ligne d'abord » : rejoue seulement le passage hors réseau.
   L'état est annoncé dans une région role="status" (carte 3). Les canevas sont décoratifs
   (aria-hidden), sous le contenu, et ne tournent que pendant l'histoire, un glisser, un ressort ou une
   onde (tâche LTK.fx qui s'arrête d'elle-même, et jamais hors écran).
   Mouvement réduit : état final dessiné une seule fois (trace complète, zone, un horodatage); le test
   change les couleurs sans onde ni ressort. Sans JS : les quatre cartes restent telles quelles.
   Illustration seulement : les chiffres affichés ne sont pas ceux de l'app G&I. */
(function () {
  "use strict";
  var L = window.LTK, doc = document, win = window;
  if (!L || !L.fx || !win.Path2D || !doc.querySelector) return;
  var grid = doc.querySelector(".tech-grid");
  var host = grid && grid.closest(".section-dark");
  if (!host || host.closest(".chain-feature") || host.querySelector(".chain-feature")) return;
  var cards = grid.children;
  if (cards.length < 3) return;
  var ctxTest = doc.createElement("canvas").getContext;
  if (!ctxTest) return;

  /* ---------- Textes (FR/EN) ---------- */
  var EN = (doc.body.getAttribute("data-lang") || doc.documentElement.lang || "fr").slice(0, 2) === "en";
  function T(fr, en) { return EN ? en : fr; }
  var LOC = EN ? "en-CA" : "fr-CA";
  function fmt(n, d) { return Number(n).toLocaleString(LOC, { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function pad4(n) { return ("000" + n).slice(-4); }
  function two(n) { return (n < 10 ? "0" : "") + n; }
  function clock(t) { return two(Math.floor(t / 3600) % 24) + ":" + two(Math.floor(t / 60) % 60) + ":" + two(t % 60); }
  function fnv(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function hex(h) { return ("0000000" + (h >>> 0).toString(16)).slice(-8).slice(0, 6); }
  var S_TXT = {
    idle: T("Illustration : trace GPS de démonstration", "Illustration: demo GPS track"),
    rec: T("Enregistrement de la trace…", "Recording the track…"),
    off: T("Hors ligne · points gardés sur l'appareil", "No signal · points kept on the device"),
    sync: function (n) { return T("Synchronisé ✓ · " + fmt(n) + " points transmis (illustration)", "Synced ✓ · " + fmt(n) + " points sent (illustration)"); },
    done: function (n) { return T("Trace vérifiée ✓ · " + fmt(n) + " points (illustration)", "Track verified ✓ · " + fmt(n) + " points (illustration)"); },
    bad: function (j, n) { return T("Altération détectée au point " + pad4(j) + " — " + fmt(n) + " points non vérifiés", "Tampering detected at point " + pad4(j) + " — " + fmt(n) + " points unverified"); },
    back: function (n) { return T("Trace rétablie ✓ · " + fmt(n) + " points vérifiés (illustration)", "Track restored ✓ · " + fmt(n) + " points verified (illustration)"); }
  };

  /* ---------- Couleurs et constantes ---------- */
  var C = {
    plate: "rgba(230,224,213,.22)", rivet: "rgba(217,168,100,.6)", goldPlate: "rgba(217,168,100,.3)",
    amberPlate: "rgba(245,158,11,.2)", amber: "rgba(245,158,11,.55)",
    red: "#EF4444", redPlate: "rgba(239,68,68,.3)", redRivet: "rgba(239,68,68,.62)",
    zone: "rgba(243,233,216,.24)", label: "rgba(243,233,216,.4)", stamp: "rgba(243,233,216,.35)"
  };
  var MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
  var SANS = '"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
  var STEP = 12, GAP = 3.2, T0 = 6 * 3600 + 12 * 60, VERIFY = 1 / .012 /* 12 ms par point */, SYNC = 90;
  var K = 170, OMEGA = Math.sqrt(K);
  var TAU = Math.PI * 2;
  // Abatteuse de la maquette du téléphone (svg.mi), tracés pleins et tracés à trous séparés
  var MACH = new Path2D("M1.5 14h14a.5.5 0 0 1 .5.5v1.5a.5.5 0 0 1-.5.5h-14a.5.5 0 0 1-.5-.5v-1.5a.5.5 0 0 1 .5-.5zM11 9.4l-.9-1 7.4-5.5.9 1.1zM17.2 3.7l1.4-.4 2.6 7.6-1.4.5zM19.2 10.8h3.4v3.4h-3.4zM19.4 14.2l-.9 2.2h1l.5-1.2.5 1.2h1l.5-1.2.5 1.2h1l-.9-2.2z");
  var MACH_EO = new Path2D("M3 14V8a1 1 0 0 1 1-1h6.5a1 1 0 0 1 1 1v6zM4.6 8.6v3.2h5.4V8.6zM3.8 20.9a2.3 2.3 0 1 0 0 -4.6a2.3 2.3 0 1 0 0 4.6zM3.8 19.4a0.8 0.8 0 1 1 0 -1.6a0.8 0.8 0 1 1 0 1.6zM8.4 20.9a2.3 2.3 0 1 0 0 -4.6a2.3 2.3 0 1 0 0 4.6zM8.4 19.4a0.8 0.8 0 1 1 0 -1.6a0.8 0.8 0 1 1 0 1.6zM13.4 20.9a2.3 2.3 0 1 0 0 -4.6a2.3 2.3 0 1 0 0 4.6zM13.4 19.4a0.8 0.8 0 1 1 0 -1.6a0.8 0.8 0 1 1 0 1.6z");
  var FINE = win.matchMedia ? win.matchMedia("(hover: hover) and (pointer: fine)") : { matches: false };

  /* ---------- DOM : canevas décoratifs + panneau d'état dans la carte 3 ---------- */
  function mk(tag, cls) { var e = doc.createElement(tag); e.className = cls; return e; }
  host.classList.add("fx-trace-host");
  var cvB = mk("canvas", "fx-trace-cv"), cvT = mk("canvas", "fx-trace-cv"), cvH = mk("canvas", "fx-trace-hud");
  [cvB, cvT, cvH].forEach(function (c) { c.setAttribute("aria-hidden", "true"); });
  host.insertBefore(cvT, host.firstChild); host.insertBefore(cvB, cvT); host.appendChild(cvH);
  var cB = cvB.getContext("2d"), cT = cvT.getContext("2d"), cHud = cvH.getContext("2d");
  if (!cB || !cT || !cHud) return;

  var card1 = cards[0], card3 = cards[2];
  var panel = mk("div", "fx-trace-panel"), read = mk("p", "fx-trace-read"), status = mk("p", "fx-trace-status");
  var led = mk("span", "fx-trace-led"), msg = mk("span", "fx-trace-msg"), btn = mk("button", "fx-trace-test");
  read.setAttribute("aria-hidden", "true"); led.setAttribute("aria-hidden", "true");
  status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  status.appendChild(led); status.appendChild(msg);
  btn.type = "button";
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2v7.5a2 2 0 0 1-.2.9L4.7 20.6a1 1 0 0 0 .9 1.4h12.8a1 1 0 0 0 .9-1.4l-5.1-10.2a2 2 0 0 1-.2-.9V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/></svg>';
  btn.appendChild(doc.createTextNode(T("Tester l'intégrité", "Test integrity")));
  panel.appendChild(read); panel.appendChild(status); panel.appendChild(btn);
  card3.appendChild(panel);
  var curState = "", curMsg = "";
  function setStatus(state, text) {
    if (state !== curState) { panel.setAttribute("data-state", state); curState = state; }
    if (text !== curMsg) { msg.textContent = text; curMsg = text; }
  }
  var curRead = "";
  function setRead(t) { if (t !== curRead) { read.textContent = t; curRead = t; } }
  setStatus("idle", S_TXT.idle);
  setRead("--:--:-- · #------ · 0 pts");

  /* ---------- Géométrie ---------- */
  function h1(n) { n = Math.imul(n ^ 0x27d4eb2d, 0x165667b1); n ^= n >>> 15; n = Math.imul(n, 0x2c1b3c6d); n ^= n >>> 12; return (n >>> 0) / 4294967296; }
  function vnoise(x) { var i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return (h1(i) * (1 - u) + h1(i + 1) * u) * 2 - 1; }
  function off(el) { var x = 0, y = 0; while (el && el !== host) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; } return { x: x, y: y }; }
  function box(el) { var o = off(el); return { l: o.x, t: o.y, r: o.x + el.offsetWidth, b: o.y + el.offsetHeight }; }

  var W = 0, H = 0, P = [], N = 0, zA = -1, zB = -2, ZONE = null, cTop = 0, cH = 0, dpr = 1, sig = "", gridHash = {}, CELL = 40, phone = false;

  function route(wps, amp) {
    // polyligne avec congés circulaires (virages à 90°), échantillonnée finement, puis ondulée et rééchantillonnée
    var dense = [], cur = { x: wps[0].x, y: wps[0].y };
    dense.push({ x: cur.x, y: cur.y, hz: false });
    function straight(q) {
      var dx = q.x - cur.x, dy = q.y - cur.y, len = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(len / 2)), hz = Math.abs(dy) < .5;
      for (var s = 1; s <= n; s++) { var f = s / n; dense.push({ x: cur.x + dx * f, y: cur.y + dy * f, hz: hz, d: Math.min(f * len, (1 - f) * len) }); }
      cur = { x: q.x, y: q.y };
    }
    for (var k = 1; k < wps.length; k++) {
      var V = wps[k], A = wps[k - 1], B = wps[k + 1];
      if (!B || !V.r) { straight(V); continue; }
      var l1 = Math.hypot(V.x - A.x, V.y - A.y), l2 = Math.hypot(B.x - V.x, B.y - V.y);
      var u1 = { x: (V.x - A.x) / l1, y: (V.y - A.y) / l1 }, u2 = { x: (B.x - V.x) / l2, y: (B.y - V.y) / l2 };
      var r = V.r, T1 = { x: V.x - u1.x * r, y: V.y - u1.y * r }, T2 = { x: V.x + u2.x * r, y: V.y + u2.y * r };
      var Cc = { x: T1.x + u2.x * r, y: T1.y + u2.y * r };
      straight(T1);
      var a0 = Math.atan2(T1.y - Cc.y, T1.x - Cc.x), a1 = Math.atan2(T2.y - Cc.y, T2.x - Cc.x), da = a1 - a0;
      while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      var n = Math.max(2, Math.ceil(Math.abs(da) * r / 2));
      for (var s = 1; s <= n; s++) { var a = a0 + da * s / n; dense.push({ x: Cc.x + Math.cos(a) * r, y: Cc.y + Math.sin(a) * r, hz: false }); }
      cur = { x: T2.x, y: T2.y };
    }
    // ondulation du terrain (bruit de valeur), nulle dans les virages et les allées entre les cartes
    dense.forEach(function (p) {
      if (!p.hz) return;
      var w = Math.min(1, p.d / 70); w = w * w * (3 - 2 * w);
      p.y += amp * w * vnoise(p.x / 220 + p.y * .137);
    });
    // rééchantillonnage tous les 12 px
    var out = [{ x: dense[0].x, y: dense[0].y }], acc = 0;
    for (var i = 1; i < dense.length; i++) {
      var a = dense[i - 1], b = dense[i], seg = Math.hypot(b.x - a.x, b.y - a.y);
      while (acc + seg >= STEP) { var f = (STEP - acc) / seg; a = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; out.push(a); seg = Math.hypot(b.x - a.x, b.y - a.y); acc = 0; }
      acc += seg;
    }
    return out;
  }

  var HB = null; // boîte du titre de section (coordonnées de l'hôte)
  function build() {
    W = host.clientWidth; H = host.clientHeight;
    var gb = box(grid), head = host.querySelector(".section-head"), hb = head ? box(head) : { l: 0, t: gb.t - 100, r: W, b: gb.t - 48 };
    HB = hb;
    var cb = [].map.call(cards, box);
    var rowTop = Math.min.apply(null, cb.map(function (c) { return c.t; }));
    var row = cb.filter(function (c) { return Math.abs(c.t - rowTop) < 4; }).sort(function (a, b) { return a.l - b.l; });
    var gaps = []; for (var i = 0; i + 1 < row.length; i++) gaps.push((row[i].r + row[i + 1].l) / 2);
    phone = row.length < 2;
    var wps = [], turns = [], sp, amp, xl, xr, dir = 1, levels = [];
    if (phone) {
      // mobile : bande de 140 px entre la carte 2 et la carte 3 (juste au-dessus du bouton de test)
      sp = 48; amp = 5;
      var top = cb[1].b, bot = cb[2].t, band = bot - top;
      var nl = Math.max(2, Math.min(3, Math.floor((band - 24) / sp) + 1));
      var y0 = top + (band - (nl - 1) * sp) / 2;
      for (i = 0; i < nl; i++) levels.push(y0 + i * sp);
      xl = Math.max(16 + sp / 2 + 4, W * .08); xr = W - xl;
    } else {
      sp = 64; amp = 8;
      var ya = gb.t - Math.min(24, Math.max(12, (gb.t - hb.b) / 2));
      // deux voies qui encadrent le titre (au-dessus du surtitre, sous le h2) : la trace ne passe jamais sur le texte
      levels = [Math.max(34, hb.t - 20), ya]; sp = Math.max(48, ya - levels[0]);
      var cl = Math.max(24, (W - Math.min(W, 1180)) / 2 + 24);
      xl = Math.max(24, cl * .35) + sp / 2; xr = W - xl;
    }
    var R0 = sp / 2;
    wps.push({ x: 4, y: levels[0], r: 0 });
    for (i = 0; i < levels.length; i++) {
      if (i + 1 < levels.length) {
        var X = dir > 0 ? xr + R0 : xl - R0;
        wps.push({ x: X, y: levels[i], r: R0 }); wps.push({ x: X, y: levels[i + 1], r: R0 });
        turns.push({ x: X, y1: levels[i], y2: levels[i + 1], w: wps.length - 1, side: dir });
        dir = -dir;
      }
    }
    var endY = levels[levels.length - 1];
    if (!phone && gaps.length) {
      // serpentin entre les cartes : descend une allée, longe le bas, remonte la suivante…
      var yb = gb.b + Math.min(48, Math.max(20, (H - gb.b) / 2)), lvl = endY, gs = gaps.slice();
      if (dir < 0) gs.reverse();
      gs.forEach(function (g) { wps.push({ x: g, y: lvl, r: 20 }); lvl = lvl === endY ? yb : endY; wps.push({ x: g, y: lvl, r: 20 }); });
      endY = lvl;
    }
    wps.push({ x: dir > 0 ? W - 4 : 4, y: endY, r: 0 });
    var pts = route(wps, amp);
    N = pts.length;
    // zone hors réseau : autour du virage en U le plus près du milieu du trajet
    var best = null;
    turns.forEach(function (t) {
      var cx = t.x - t.side * R0, cy = (t.y1 + t.y2) / 2, bi = 0, bd = 1e9;
      pts.forEach(function (p, k) { var d = Math.hypot(p.x - cx - t.side * R0, p.y - cy); if (d < bd) { bd = d; bi = k; } });
      var score = Math.abs(bi / N - .45);
      if (!best || score < best.score) best = { score: score, apex: bi, t: t };
    });
    zA = -1; zB = -2; ZONE = null;
    if (best) {
      var t = best.t, lz = phone ? W * .36 : Math.min(W * .26, 420);
      gaps.forEach(function (g) { lz = Math.min(lz, Math.abs(g - t.x) - 56); });
      lz = Math.max(lz, 90);
      var edge = t.side > 0 ? W + 30 : -30, inner = t.x - t.side * lz;
      ZONE = { cx: (edge + inner) / 2, cy: (t.y1 + t.y2) / 2, ax: Math.abs(edge - inner) / 2 + 12, ay: (t.y2 - t.y1) / 2 + 26, side: t.side, inner: inner, tx: t.x - t.side * R0, y1: t.y1, y2: t.y2, n: 3.2 };
      var inside = function (p) { return Math.pow(Math.abs(p.x - ZONE.cx) / ZONE.ax, ZONE.n) + Math.pow(Math.abs(p.y - ZONE.cy) / ZONE.ay, ZONE.n) < 1; };
      zA = zB = best.apex;
      while (zA > 1 && inside(pts[zA - 1])) zA--;
      while (zB < N - 2 && inside(pts[zB + 1])) zB++;
    }
    // points : heure, hachage chaîné, précision
    var prev = 0;
    P = pts.map(function (p, k) {
      var a = pts[Math.max(0, k - 1)], b = pts[Math.min(N - 1, k + 1)];
      return { x: p.x, y: p.y, a: Math.atan2(b.y - a.y, b.x - a.x), t: T0 + 3 * k };
    });
    for (i = 0; i < N; i++) { var q = P[i]; q.ph = prev; q.h = hashOf(i, q.x, q.y, prev); q.acc = 1.4 + 2.2 * h1(i * 7 + 3); prev = q.h; }
    // grille spatiale pour la recherche du rivet le plus proche
    gridHash = {};
    P.forEach(function (p, k) { var key = Math.floor(p.x / CELL) + "," + Math.floor(p.y / CELL); (gridHash[key] = gridHash[key] || []).push(k); });
    // canevas : juste la hauteur utile (DPR ≤ 1,5)
    var minY = 1e9, maxY = -1e9; P.forEach(function (p) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
    if (ZONE) { minY = Math.min(minY, ZONE.cy - ZONE.ay); maxY = Math.max(maxY, ZONE.cy + ZONE.ay); }
    cTop = Math.max(0, Math.floor(minY - 36)); cH = Math.min(H, Math.ceil(maxY + 36)) - cTop;
    dpr = Math.min(1.5, win.devicePixelRatio || 1);
    [cvB, cvT].forEach(function (c) {
      c.width = Math.round(W * dpr); c.height = Math.round(cH * dpr);
      c.style.top = cTop + "px"; c.style.height = cH + "px";
    });
    cB.setTransform(dpr, 0, 0, dpr, 0, -cTop * dpr); cT.setTransform(dpr, 0, 0, dpr, 0, -cTop * dpr);
    committed = new Uint8Array(N); lay = new Uint8Array(N);
  }
  function hashOf(i, x, y, prev) {
    // « coordonnées » fictives près de Dégelis, à 6 décimales
    var lat = (47.5512 - y * 1e-5).toFixed(6), lon = (-68.6431 + x * 1.5e-5).toFixed(6);
    return fnv(i + "|" + lat + "|" + lon + "|" + clock(T0 + 3 * i) + "|" + hex(prev));
  }
  function inZone(i) { return i >= zA && i <= zB; }
  function horiz(i) { return Math.abs(Math.cos(P[i].a)) > .9; }

  /* ---------- Dessin ---------- */
  var committed = new Uint8Array(0), lay = new Uint8Array(0);
  function plate(c, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy); if (l < GAP * 2 + 1) return;
    var k = GAP / l; c.moveTo(a.x + dx * k, a.y + dy * k); c.lineTo(b.x - dx * k, b.y - dy * k);
  }
  function dot(c, p, r) { c.moveTo(p.x + r, p.y); c.arc(p.x, p.y, r, 0, TAU); }
  function strokeP(c, style, w) { c.strokeStyle = style; c.lineWidth = w; c.stroke(); }
  // unités (plaque i-1 → i + rivet i) dans un contexte, par lots de même style
  function drawUnits(c, from, to, keep) {
    var i;
    c.lineCap = "round";
    c.beginPath(); for (i = Math.max(1, from); i <= to; i++) if (keep(i) && !inZone(i)) plate(c, P[i - 1], P[i]); strokeP(c, C.plate, 3);
    c.beginPath(); for (i = Math.max(1, from); i <= to; i++) if (keep(i) && inZone(i)) plate(c, P[i - 1], P[i]); strokeP(c, C.goldPlate, 3);
    c.beginPath(); for (i = from; i <= to; i++) if (keep(i)) dot(c, P[i], 1.6); c.fillStyle = C.rivet; c.fill();
  }
  function drawZone(c) {
    if (!ZONE) return;
    var Z = ZONE, n = 96;
    var zp = new Path2D();
    for (var k = 0; k <= n; k++) {
      var th = k / n * TAU, co = Math.cos(th), si = Math.sin(th);
      var wob = 1 + .06 * vnoise(k * .19 + 11);
      var x = Z.cx + Z.ax * wob * Math.sign(co) * Math.pow(Math.abs(co), 2 / Z.n);
      var y = Z.cy + Z.ay * wob * Math.sign(si) * Math.pow(Math.abs(si), 2 / Z.n);
      k ? zp.lineTo(x, y) : zp.moveTo(x, y);
    }
    zp.closePath();
    c.save();
    // hachures de carte « pas de couverture », découpées dans le contour
    c.save(); c.clip(zp);
    c.beginPath();
    var x0 = Z.cx - Z.ax - 20, x1 = Z.cx + Z.ax + 20, y0 = Z.cy - Z.ay - 20, y1 = Z.cy + Z.ay + 20;
    for (var hx = x0 - (y1 - y0); hx < x1; hx += 7) { c.moveTo(hx, y1); c.lineTo(hx + (y1 - y0), y0); }
    c.strokeStyle = "rgba(245,158,11,.07)"; c.lineWidth = 1; c.stroke();
    c.restore();
    c.setLineDash([3, 5]); c.lineWidth = 1; c.strokeStyle = C.zone; c.stroke(zp); c.setLineDash([]);
    // étiquette entre les deux bandes, avec pictogramme « pas de signal »
    var label = T("HORS RÉSEAU", "NO SIGNAL");
    c.font = "600 9px " + SANS;
    if ("letterSpacing" in c) c.letterSpacing = "1.6px";
    // dans la boucle du virage en U, à côté de son centre (loin du titre centré)
    var tw = c.measureText(label).width, ly = Z.cy + 3.2;
    var lx = Z.side > 0 ? Z.tx - 12 - tw : Z.tx + 12 + 13;
    c.fillStyle = C.label; c.textBaseline = "alphabetic"; c.textAlign = "left";
    c.fillText(label, lx, ly);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    var ix = lx - 13, iy = Z.cy + 3;
    c.strokeStyle = C.label; c.lineWidth = 1.2; c.lineCap = "round";
    c.beginPath(); c.moveTo(ix, iy); c.lineTo(ix, iy - 2); c.moveTo(ix + 3, iy); c.lineTo(ix + 3, iy - 4.5); c.moveTo(ix + 6, iy); c.lineTo(ix + 6, iy - 7); c.moveTo(ix - 1.5, iy - 8); c.lineTo(ix + 7.5, iy + 1); c.stroke();
    c.restore();
  }
  function stampAt(c, i, alpha) {
    var p = P[i], txt = clock(p.t) + " · " + hex(p.h);
    if (HB && p.y - 24 < HB.b && p.y - 8 > HB.t && p.x + 90 > HB.l && p.x - 90 < HB.r) return;
    c.globalAlpha = alpha;
    c.font = "9px " + MONO; c.textAlign = "center"; c.textBaseline = "alphabetic";
    var tw = c.measureText(txt).width, x = Math.max(tw / 2 + 6, Math.min(W - tw / 2 - 6, p.x));
    c.strokeStyle = C.stamp; c.lineWidth = 1; c.beginPath(); c.moveTo(p.x, p.y - 4.5); c.lineTo(p.x, p.y - 10); c.stroke();
    c.fillStyle = C.stamp; c.fillText(txt, x, p.y - 13);
    c.globalAlpha = 1;
  }
  var still = -1; // horodatage fixe (mouvement réduit)
  function paintBase(keep) {
    keep = keep || function (i) { return committed[i]; };
    cB.clearRect(0, cTop, W, cH);
    drawZone(cB);
    drawUnits(cB, 0, N - 1, keep);
    if (still >= 0 && reduce() && keep(still)) stampAt(cB, still, .9);
  }
  function commit(i) {
    committed[i] = 1;
    cB.lineCap = "round"; cB.beginPath();
    if (i > 0) { plate(cB, P[i - 1], P[i]); strokeP(cB, inZone(i) ? C.goldPlate : C.plate, 3); }
    cB.beginPath(); dot(cB, P[i], 1.6); cB.fillStyle = C.rivet; cB.fill();
  }
  function posAt(f) {
    // position interpolée sur la trace (extrapolée avant le début et après la fin)
    if (f <= 0) { var a = P[0].a; return { x: P[0].x + Math.cos(a) * f * STEP, y: P[0].y + Math.sin(a) * f * STEP, a: a }; }
    if (f >= N - 1) { var b = P[N - 1].a, e = f - (N - 1); return { x: P[N - 1].x + Math.cos(b) * e * STEP, y: P[N - 1].y + Math.sin(b) * e * STEP, a: b }; }
    var i = Math.floor(f), u = f - i, p = P[i], q = P[i + 1];
    var da = q.a - p.a; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
    return { x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u, a: p.a + da * u };
  }
  function machine(c, pos, alpha) {
    if (alpha <= 0) return;
    c.save();
    c.globalAlpha = alpha;
    var g = c.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 22);
    g.addColorStop(0, "rgba(217,168,100,.3)"); g.addColorStop(1, "rgba(217,168,100,0)");
    c.fillStyle = g; c.fillRect(pos.x - 22, pos.y - 22, 44, 44);
    c.translate(pos.x, pos.y);
    var a = pos.a;
    if (Math.cos(a) < -.001) { c.scale(-1, 1); c.rotate(Math.PI - a); } else c.rotate(a);
    c.scale(1.02, 1.02); c.translate(-12, -14.5);
    c.lineJoin = "round"; c.lineWidth = 2.6; c.strokeStyle = "#16130F";
    c.stroke(MACH); c.stroke(MACH_EO);
    c.fillStyle = "#F3E9D8"; c.fill(MACH); c.fill(MACH_EO, "evenodd");
    c.restore();
  }
  function glow(c, pos, rgb, a) {
    var g = c.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 9);
    g.addColorStop(0, "rgba(" + rgb + "," + a + ")"); g.addColorStop(.35, "rgba(" + rgb + "," + a * .45 + ")"); g.addColorStop(1, "rgba(" + rgb + ",0)");
    c.fillStyle = g; c.fillRect(pos.x - 9, pos.y - 9, 18, 18);
    c.beginPath(); c.arc(pos.x, pos.y, 1.9, 0, TAU); c.fillStyle = "rgba(255,244,222," + Math.min(1, a + .1) + ")"; c.fill();
  }

  /* ---------- État ---------- */
  var visible = false, started = false, finished = false, dirty = false;
  var run = null;      // tête qui pose des points : { h, end, rate, next, kind, start }
  var sync = null;     // front de synchro : { s, k }
  var stamps = [], pulses = [], stampEvery = 20, lastRead = 0;
  var tm = null;       // test d'altération
  var hov = null;      // survol souris : { x, y, j, ok }
  var reduce = function () { return !!L.reduce; };
  var stats = host._fxTrace = { calls: 0, frames: 0, work: [] }; // compteurs de mise au point (lecture seule)
  stats.at = function (i) { var p = P[i]; return p ? { x: p.x, y: p.y, n: N, zA: zA, zB: zB, top: cTop } : null; };

  function pendingCount() { var n = 0; for (var i = zA; i <= zB; i++) if (lay[i] && !committed[i]) n++; return n; }
  function laidCount() { var n = 0; for (var i = 0; i < N; i++) if (lay[i]) n++; return n; }

  function start() {
    if (started || !N) return;
    started = true;
    if (reduce()) { finalize(); return; }
    var rate = Math.max(26, Math.min(64, N / 7.5));
    stampEvery = Math.max(10, Math.round(rate * .8));
    run = { h: -2.5, end: N - 1 + 3, rate: rate, next: 0, kind: "story", start: -2.5, nextStamp: Math.round(stampEvery * .6) };
    paintBase();
    setStatus("rec", S_TXT.rec);
    kick();
  }
  function finalize() {
    run = null; sync = null; stamps = []; pulses = []; tm = null;
    for (var i = 0; i < N; i++) { committed[i] = 1; lay[i] = 1; }
    // un seul horodatage fixe, sur une bande horizontale (mouvement réduit)
    still = -1;
    for (var k = Math.floor(N * .3); k < N; k++) if (horiz(k) && !inZone(k)) { still = k; break; }
    paintBase();
    cT.clearRect(0, cTop, W, cH);
    finished = true;
    setStatus("ok", S_TXT.done(N));
    setRead(clock(P[N - 1].t) + " · #" + hex(P[N - 1].h) + " · " + fmt(N) + " pts");
    hud(null);
  }
  function layUnit(i) {
    if (i < 0 || i >= N) return;
    lay[i] = 1;
    if (inZone(i)) {
      if (i === zA || curState !== "off") setStatus("off", S_TXT.off);
    } else if (!committed[i]) commit(i);
    if (!inZone(i) && i > zB && !sync && pendingCount()) sync = { s: zB + .999, k: zB, n: pendingCount() };
    if (i >= run.nextStamp && horiz(i) && !inZone(i - 1)) {
      stamps.push({ i: i, age: 0 }); if (stamps.length > 2) stamps.shift();
      pulses.push({ i: i, age: 0 });
      run.nextStamp = i + stampEvery;
    }
  }
  function stepRun(dt) {
    var r = run;
    r.h += r.rate * dt;
    var hi = Math.min(N - 1, Math.floor(r.h));
    while (r.next <= hi) layUnit(r.next++);
    var now = performance.now();
    if (now - lastRead > 110) {
      lastRead = now;
      var last = Math.max(0, r.next - 1), pc = pendingCount();
      setRead(clock(P[last].t) + " · " + (pc ? T("attente ", "queue ") + fmt(pc) : "#" + hex(P[last].h)) + " · " + fmt(r.kind === "story" ? r.next : laidCount()) + " pts");
    }
    if (r.h >= r.end && !sync && !stamps.length && !pulses.length) {
      run = null;
      if (r.kind === "story") { finished = true; setStatus("ok", S_TXT.done(N)); }
      setRead(clock(P[N - 1].t) + " · #" + hex(P[N - 1].h) + " · " + fmt(N) + " pts");
      return false;
    }
    return true;
  }
  function stepSync(dt) {
    sync.s -= SYNC * dt;
    while (sync.k >= zA && sync.k > sync.s) { if (lay[sync.k] && !committed[sync.k]) commit(sync.k); sync.k--; }
    if (sync.k < zA && !sync.said) { sync.said = true; setStatus("sync", S_TXT.sync(sync.n)); }
    if (sync.s < zA - 12) sync = null;
  }
  function stepFx(dt) {
    var i;
    for (i = stamps.length - 1; i >= 0; i--) { stamps[i].age += dt; if (stamps[i].age > 1.6) stamps.splice(i, 1); }
    for (i = pulses.length - 1; i >= 0; i--) { pulses[i].age += dt; if (pulses[i].age > .6) pulses.splice(i, 1); }
  }

  /* ---------- Rejouer le passage hors réseau (survol de la carte 1) ---------- */
  var lastReplay = 0;
  function replay() {
    if (!finished || run || tm || zA < 0 || reduce() || !visible) return;
    var now = performance.now(); if (now - lastReplay < 2500) return; lastReplay = now;
    for (var i = zA; i <= zB; i++) { committed[i] = 0; lay[i] = 0; }
    paintBase();
    var rate = Math.max(26, Math.min(64, N / 7.5)) * .9;
    run = { h: zA - 4, end: zB + 5, rate: rate, next: zA, kind: "replay", start: zA - 4, nextStamp: zA + Math.round(stampEvery * .5) };
    kick();
  }

  /* ---------- Test d'altération ---------- */
  function startTamper(j, mode) {
    if (run || sync) finalize();
    tm = { j: j, mode: mode, d: { x: 0, y: 0 }, v: { x: 0, y: 0 }, goal: null, rf: -1, gf: -1, hold: 0, bad: false, age: 0 };
    paintBase(function (i) { return i < j; });
    dirty = true; kick();
  }
  function tamperedNow() { return tm && Math.hypot(tm.d.x, tm.d.y) > .35; }
  function markBad() {
    if (tm.bad) return;
    tm.bad = true; tm.rf = tm.j;
    setStatus("bad", S_TXT.bad(tm.j, N - tm.j));
    var q = P[tm.j];
    setRead("pt " + pad4(tm.j) + " · #" + hex(q.h) + " ≠ " + hex(hashOf(tm.j, q.x + tm.d.x, q.y + tm.d.y, q.ph)));
    if (reduce()) tm.rf = N + 20;
  }
  function heal() {
    tm.gf = tm.j;
    if (reduce()) tm.gf = N + 20;
  }
  function springTo(dt, gx, gy) {
    var steps = Math.ceil(dt / (1 / 240)), h = dt / steps, d = tm.d, v = tm.v;
    for (var s = 0; s < steps; s++) {
      var ax = -K * (d.x - gx) - 2 * OMEGA * v.x, ay = -K * (d.y - gy) - 2 * OMEGA * v.y;
      v.x += ax * h; v.y += ay * h; d.x += v.x * h; d.y += v.y * h;
    }
  }
  function stepTamper(dt) {
    var t = tm; t.age += dt;
    if (t.mode === "drag") { /* d suit le pointeur */ }
    else if (t.mode === "pull" && reduce()) {
      // mouvement réduit : bascule immédiate, puis retour après une pause (sans image par image)
      t.d.x = t.goal.x; t.d.y = t.goal.y; markBad(); hud(t.j);
      if (!t.timer) t.timer = setTimeout(function () { if (tm === t) { t.mode = "back"; dirty = true; kick(); } }, 2200);
      return false;
    } else if (t.mode === "pull") {
      springTo(dt, t.goal.x, t.goal.y);
      if (tamperedNow()) markBad();
      t.hold += dt;
      if (t.hold > (reduce() ? 2.2 : 1.6)) t.mode = "back";
    } else if (t.mode === "back") {
      if (reduce()) { t.d.x = t.d.y = t.v.x = t.v.y = 0; } else springTo(dt, 0, 0);
      if (Math.hypot(t.d.x, t.d.y) < .35 && Math.hypot(t.v.x, t.v.y) < 6) { t.d.x = t.d.y = t.v.x = t.v.y = 0; t.mode = "heal"; if (t.bad) heal(); else t.gf = N + 20; }
    }
    if (t.mode === "drag" && tamperedNow()) markBad();
    if (t.rf >= 0 && t.rf < N + 20) t.rf += VERIFY * dt;
    if (t.gf >= 0 && t.gf < N + 20) t.gf += VERIFY * dt;
    if (t.mode === "heal" && t.gf >= N + 8) {
      tm = null;
      paintBase();
      cT.clearRect(0, cTop, W, cH);
      if (t.bad) setStatus("ok", S_TXT.back(N));
      setRead(clock(P[N - 1].t) + " · #" + hex(P[N - 1].h) + " · " + fmt(N) + " pts");
      hud(null);
      return false;
    }
    hud(t.j);
    var now = performance.now();
    if (t.bad && now - lastRead > 110) {
      lastRead = now;
      var q = P[t.j];
      setRead(t.gf >= 0 ? T("revalidation ", "re-checking ") + pad4(Math.min(N - 1, Math.floor(t.gf))) + " / " + pad4(N - 1)
        : "pt " + pad4(t.j) + " · #" + hex(q.h) + " ≠ " + hex(hashOf(t.j, q.x + t.d.x, q.y + t.d.y, q.ph)));
    }
    return true;
  }
  function drawTamper(c) {
    var t = tm, j = t.j, mp = { x: P[j].x + t.d.x, y: P[j].y + t.d.y }, bad = tamperedNow() || (t.bad && t.gf < j);
    function pos(i) { return i === j ? mp : P[i]; }
    function unver(i) { return t.rf >= 0 && i <= t.rf && !(t.gf >= 0 && i <= t.gf); }
    var i, lo = j, hi = N - 1;
    c.lineCap = "round";
    // plaques normales (acier / or) et non vérifiées (rouge pâle)
    c.beginPath(); for (i = lo + 2; i <= hi; i++) if (!unver(i) && !inZone(i)) plate(c, P[i - 1], P[i]); strokeP(c, C.plate, 3);
    c.beginPath(); for (i = lo + 2; i <= hi; i++) if (!unver(i) && inZone(i)) plate(c, P[i - 1], P[i]); strokeP(c, C.goldPlate, 3);
    c.beginPath(); for (i = lo + 2; i <= hi; i++) if (unver(i)) plate(c, P[i - 1], P[i]); strokeP(c, C.redPlate, 3);
    // les deux maillons du point déplacé
    c.beginPath(); if (j > 0) plate(c, P[j - 1], mp); if (j + 1 < N) plate(c, mp, P[j + 1]);
    strokeP(c, bad ? "rgba(239,68,68,.95)" : (inZone(j) ? C.goldPlate : C.plate), 3);
    // rivets
    c.beginPath(); for (i = lo + 1; i <= hi; i++) if (!unver(i)) dot(c, P[i], 1.6); c.fillStyle = C.rivet; c.fill();
    c.beginPath(); for (i = lo + 1; i <= hi; i++) if (unver(i)) dot(c, P[i], 1.7); c.strokeStyle = C.redRivet; c.lineWidth = 1; c.stroke();
    // fantôme de la position enregistrée
    if (Math.hypot(t.d.x, t.d.y) > 2) {
      c.setLineDash([2, 3]); c.strokeStyle = "rgba(243,233,216,.38)"; c.lineWidth = 1;
      c.beginPath(); c.arc(P[j].x, P[j].y, 4.5, 0, TAU); c.moveTo(P[j].x, P[j].y); c.lineTo(mp.x, mp.y); c.stroke(); c.setLineDash([]);
    }
    c.beginPath(); dot(c, mp, bad ? 2.6 : 2.2); c.fillStyle = bad ? C.red : "#D9A864"; c.fill();
    c.beginPath(); c.arc(mp.x, mp.y, 6.5, 0, TAU); c.strokeStyle = bad ? "rgba(239,68,68,.55)" : "rgba(217,168,100,.5)"; c.lineWidth = 1; c.stroke();
    if (t.rf >= 0 && t.rf < N - 1 && !reduce() && !(t.gf >= t.rf)) glow(c, posAt(t.rf), "239,68,68", .8);
    if (t.gf >= 0 && t.gf < N - 1 && !reduce()) glow(c, posAt(t.gf), "217,168,100", .95);
  }
  // La fiche (≈ 212×58, placée 72 px au-dessus du point, ou 16 px dessous) ne doit couvrir ni le titre ni le bouton de test
  function hudHits(i) {
    var p = P[i], bw = 230, x = p.x + 14, y = p.y - 72;
    if (x + bw > W - 8) x = p.x - 14 - bw;
    if (y < 8) y = p.y + 16;
    var boxes = [HB];
    if (btn && btn.offsetParent) { var hr = host.getBoundingClientRect(), br = btn.getBoundingClientRect(); boxes.push({ l: br.left - hr.left - 8, t: br.top - hr.top - 8, r: br.right - hr.left + 8, b: br.bottom - hr.top + 8 }); }
    for (var k = 0; k < boxes.length; k++) { var b = boxes[k]; if (b && x < b.r && x + bw > b.l && y < b.b && y + 62 > b.t) return true; }
    return false;
  }
  function pickTestPoint() {
    var r = host.getBoundingClientRect(), vh = win.innerHeight, cands = [];
    for (var i = Math.floor(N * .12); i < Math.floor(N * .88); i++) {
      var y = r.top + P[i].y;
      if (y > 70 && y < vh - 70 && horiz(i) && !inZone(i) && (i < zA - 3 || i > zB + 3) && P[i].x > 40 && P[i].x < W - 40 && !hudHits(i)) cands.push(i);
    }
    if (!cands.length) for (i = Math.floor(N * .3); i < Math.floor(N * .7); i++) if (horiz(i) && !inZone(i)) cands.push(i);
    if (!cands.length) cands.push(Math.floor(N / 2));
    return cands[Math.floor(Math.random() * cands.length)];
  }
  function runTest() {
    if (!N) return;
    if (tm && tm.mode !== "heal") return;
    if (!started) { started = true; finalize(); }
    var j = pickTestPoint(), a = P[j].a, nx = -Math.sin(a), ny = Math.cos(a);
    if (ny > 0) { nx = -nx; ny = -ny; }
    startTamper(j, "pull");
    tm.goal = { x: nx * 22 + Math.cos(a) * 6, y: ny * 22 + Math.sin(a) * 6 };
    if (!visible) { tm.d.x = tm.goal.x; tm.d.y = tm.goal.y; markBad(); }
  }
  btn.addEventListener("click", runTest);

  /* ---------- Fiche (HUD) d'un point ---------- */
  var hudJ = -2, hudKey = "", HW = 300, HH = 70, hdpr = Math.min(2, win.devicePixelRatio || 1);
  cvH.width = HW * hdpr; cvH.height = HH * hdpr; cvH.style.width = HW + "px"; cvH.style.height = HH + "px";
  function hud(j) {
    if (j == null || j < 0) { if (hudJ !== -1) { cvH.classList.remove("is-on"); hudJ = -1; hudKey = ""; } return; }
    var p = P[j], t = tm && tm.j === j ? tm : null, mp = t ? { x: p.x + t.d.x, y: p.y + t.d.y } : p;
    var bad = t && t.bad && !(t.gf >= j), rh = t ? hashOf(j, mp.x, mp.y, p.ph) : p.h;
    var l1 = "POINT " + pad4(j) + " · " + clock(p.t) + " · ±" + fmt(p.acc, 1) + " m";
    var l2 = bad ? "#" + hex(p.h) + " ≠ " + hex(rh) + " " + T("(recalculé)", "(recomputed)") : "#" + hex(p.h) + "  ←  " + T("préc. ", "prev. ") + hex(p.ph);
    var l3 = bad ? T("Vérification arrêtée ici", "Verification stops here") : (t ? T("Hachage conforme", "Hash matches") : T("Glissez pour tenter d'altérer", "Drag to try tampering"));
    var key = l1 + l2 + l3;
    if (key !== hudKey) {
      hudKey = key;
      var c = cHud; c.setTransform(hdpr, 0, 0, hdpr, 0, 0); c.clearRect(0, 0, HW, HH);
      c.font = "600 10.5px " + MONO; var w1 = c.measureText(l1).width, w2 = c.measureText(l2).width;
      c.font = "500 10px " + SANS; var w3 = c.measureText(l3).width;
      var bw = Math.min(HW - 2, Math.ceil(Math.max(w1, w2, w3)) + 22), bh = 58;
      c.beginPath(); if (c.roundRect) c.roundRect(.5, .5, bw, bh, 8); else c.rect(.5, .5, bw, bh);
      c.fillStyle = "rgba(11,10,8,.92)"; c.fill(); c.strokeStyle = bad ? "rgba(239,68,68,.6)" : "rgba(217,168,100,.4)"; c.lineWidth = 1; c.stroke();
      c.textAlign = "left"; c.textBaseline = "alphabetic";
      c.font = "600 10.5px " + MONO; c.fillStyle = "rgba(243,233,216,.92)"; c.fillText(l1, 11, 19);
      c.fillStyle = bad ? "#F87171" : "#D9A864"; c.fillText(l2, 11, 35);
      c.font = "500 10px " + SANS; c.fillStyle = bad ? "rgba(248,113,113,.85)" : "rgba(243,233,216,.5)"; c.fillText(l3, 11, 50);
      cvH._bw = bw;
    }
    var bw2 = cvH._bw || 200, x = mp.x + 14, y = mp.y - 58 - 14;
    if (x + bw2 > W - 8) x = mp.x - 14 - bw2;
    if (y < 8) y = mp.y + 16;
    if (HB && x < HB.r && x + bw2 > HB.l && y < HB.b && y + 58 > HB.t) y = Math.max(mp.y + 16, HB.b + 8); // jamais sur le titre
    cvH.style.transform = "translate3d(" + Math.round(x) + "px," + Math.round(y) + "px,0)";
    if (hudJ !== j) { cvH.classList.add("is-on"); hudJ = j; }
  }

  /* ---------- Survol, loupe et glisser (souris/stylet seulement) ---------- */
  var EXCL = ".tech-grid > div, a, button, input, select, textarea, label";
  function nearest(x, y, rad, maxI) {
    var best = -1, bd = rad * rad, cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    for (var gx = cx - 1; gx <= cx + 1; gx++) for (var gy = cy - 1; gy <= cy + 1; gy++) {
      var cell = gridHash[gx + "," + gy]; if (!cell) continue;
      for (var k = 0; k < cell.length; k++) { var i = cell[k]; if (i > maxI) continue; var dx = P[i].x - x, dy = P[i].y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
    }
    return best;
  }
  function lens(c) {
    if (!hov || !hov.in) return;
    var x = hov.x, y = hov.y, R = 80, cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    c.lineCap = "round";
    for (var gx = cx - 2; gx <= cx + 2; gx++) for (var gy = cy - 2; gy <= cy + 2; gy++) {
      var cell = gridHash[gx + "," + gy]; if (!cell) continue;
      for (var k = 0; k < cell.length; k++) {
        var i = cell[k]; if (!committed[i] || (tm && i >= tm.j)) continue;
        var d = Math.hypot(P[i].x - x, P[i].y - y); if (d > R) continue;
        var f = 1 - d / R; f = f * f;
        c.globalAlpha = f;
        if (i > 0 && committed[i - 1]) { c.beginPath(); plate(c, P[i - 1], P[i]); strokeP(c, inZone(i) ? "rgba(217,168,100,.45)" : "rgba(243,233,216,.38)", 3); }
        c.beginPath(); dot(c, P[i], 1.8); c.fillStyle = "rgba(233,190,120,.7)"; c.fill();
      }
    }
    c.globalAlpha = 1;
    if (hov.j >= 0 && !tm) { c.beginPath(); c.arc(P[hov.j].x, P[hov.j].y, 5.5, 0, TAU); c.strokeStyle = "rgba(217,168,100,.8)"; c.lineWidth = 1.2; c.stroke(); }
  }
  var lastCursor = "";
  function cursor(v) { if (v !== lastCursor) { host.style.cursor = v; lastCursor = v; } }
  function local(e) { var r = host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  var dragId = null, grabOff = null;
  function onMove(e) {
    if (e.pointerType === "touch" || !FINE.matches || !N) return;
    var q = local(e);
    hov = { x: q.x, y: q.y, in: true, ok: !(e.target.closest && e.target.closest(EXCL)), cx: e.clientX, cy: e.clientY };
    if (dragId != null && tm) {
      var dx = q.x - grabOff.x - P[tm.j].x, dy = q.y - grabOff.y - P[tm.j].y, m = Math.hypot(dx, dy), lim = 90;
      if (m > lim) { dx *= lim / m; dy *= lim / m; }
      tm.d.x = dx; tm.d.y = dy;
    }
    dirty = true; kick();
  }
  function onLeave() { if (dragId != null) return; hov = null; cursor(""); if (!tm) hud(null); dirty = true; kick(); }
  function onDown(e) {
    if (e.button !== 0 || e.pointerType === "touch" || !FINE.matches || !finished || run || sync || (tm && tm.mode !== "heal") || !N) return;
    if (e.target.closest && e.target.closest(EXCL)) return;
    var q = local(e), j = nearest(q.x, q.y, 14, N - 1);
    if (j < 0) return;
    e.preventDefault();
    try { host.setPointerCapture(e.pointerId); } catch (err) { /* pointeur déjà relâché */ }
    dragId = e.pointerId; grabOff = { x: q.x - P[j].x, y: q.y - P[j].y };
    host.classList.add("fx-trace-drag");
    cursor("grabbing");
    startTamper(j, "drag");
  }
  function onUp(e) {
    if (dragId == null || (e.pointerId != null && e.pointerId !== dragId)) return;
    try { if (host.hasPointerCapture && host.hasPointerCapture(dragId)) host.releasePointerCapture(dragId); } catch (err) { /* rien */ }
    dragId = null; host.classList.remove("fx-trace-drag"); cursor("");
    if (tm && tm.mode === "drag") { tm.mode = "back"; if (reduce()) { tm.d.x = tm.d.y = 0; } }
    dirty = true; kick();
  }
  host.addEventListener("pointermove", onMove, { passive: true });
  host.addEventListener("pointerleave", onLeave);
  host.addEventListener("pointerdown", onDown);
  host.addEventListener("pointerup", onUp);
  host.addEventListener("pointercancel", onUp);
  host.addEventListener("lostpointercapture", onUp);
  host.addEventListener("selectstart", function (e) { if (dragId != null) e.preventDefault(); });
  win.addEventListener("scroll", function () {
    if (!hov || !hov.in || !visible) return;
    var r = host.getBoundingClientRect(); hov.x = hov.cx - r.left; hov.y = hov.cy - r.top; dirty = true; kick();
  }, { passive: true });
  card1.addEventListener("mouseenter", function () { if (FINE.matches) replay(); });

  /* ---------- Image par image (boucle partagée LTK.fx) ---------- */
  function drawTop() {
    var c = cT;
    c.clearRect(0, cTop, W, cH);
    var i;
    if (run || sync) {
      // points en attente (hors réseau) : anneaux ambre
      c.lineCap = "round";
      c.beginPath(); for (i = Math.max(1, zA); i <= zB; i++) if (lay[i] && !committed[i]) plate(c, P[i - 1], P[i]); strokeP(c, C.amberPlate, 3);
      c.beginPath(); for (i = zA; i <= zB; i++) if (i >= 0 && lay[i] && !committed[i]) dot(c, P[i], 1.9); c.strokeStyle = C.amber; c.lineWidth = 1; c.stroke();
      if (run) {
        var last = run.next - 1, hp = posAt(run.h);
        if (last >= 0 && last < N - 1 && run.h > last) {
          c.beginPath(); plate(c, P[last], { x: hp.x + Math.cos(hp.a) * GAP, y: hp.y + Math.sin(hp.a) * GAP });
          strokeP(c, inZone(last + 1) ? C.amberPlate : C.plate, 3);
        }
      }
      if (sync) {
        // traînée dorée derrière le front, puis le point lumineux
        for (i = Math.ceil(sync.s); i <= Math.min(zB, sync.s + 10); i++) {
          if (i < Math.max(1, zA)) continue;
          c.globalAlpha = Math.max(0, 1 - (i - sync.s) / 10);
          c.beginPath(); plate(c, P[i - 1], P[i]); strokeP(c, "rgba(233,190,120,.55)", 3);
        }
        c.globalAlpha = 1;
        if (sync.s >= zA - 1) glow(c, posAt(Math.max(zA, sync.s)), "217,168,100", .95);
      }
      for (i = 0; i < pulses.length; i++) {
        var pu = pulses[i], e = pu.age / .6, pp = P[pu.i];
        c.beginPath(); c.arc(pp.x, pp.y, 2 + 9 * L.ease.out3(e), 0, TAU); c.strokeStyle = "rgba(217,168,100," + (.45 * (1 - e)) + ")"; c.lineWidth = 1; c.stroke();
      }
      for (i = 0; i < stamps.length; i++) {
        var st = stamps[i], a = Math.min(1, st.age / .18) * Math.min(1, (1.6 - st.age) / .55);
        stampAt(c, st.i, Math.max(0, a));
      }
      if (run) {
        var fa = Math.min(1, (run.h - run.start) / 1.2), fb = Math.min(1, (run.end - run.h) / 2.2);
        machine(c, posAt(run.h), Math.max(0, Math.min(fa, fb)));
      }
    }
    if (tm) drawTamper(c);
    lens(c);
  }
  var task = {
    update: function (dt) {
      stats.calls++;
      if (!visible && dragId == null) { L.fx.remove(task); return false; }
      var t0 = performance.now(), busy = false;
      if (run) busy = stepRun(dt) || busy;
      if (sync) { stepSync(dt); busy = true; }
      if (stamps.length || pulses.length) { stepFx(dt); busy = true; }
      if (run || sync) busy = true;
      if (tm) busy = stepTamper(dt) || busy;
      if (hov && hov.in && !run && !sync && (!tm || dragId == null)) {
        var j = (hov.ok && finished && !tm) ? nearest(hov.x, hov.y, 14, N - 1) : -1;
        hov.j = j;
        if (!tm) { hud(j >= 0 ? j : null); cursor(j >= 0 ? "grab" : ""); }
      }
      if (busy || dirty) { drawTop(); dirty = false; stats.frames++; }
      var w = performance.now() - t0; if (stats.work.length < 4000) stats.work.push(w); if (w > 4 && stats.slow) stats.slow.push([Math.round(w), run ? run.kind + ":" + Math.floor(run.h) : "", tm ? tm.mode : "", stats.frames]);
      if (!busy) L.fx.remove(task);
      return busy;
    }
  };
  function kick() { if (visible || dragId != null) L.fx.add(task); }

  /* ---------- Démarrage, visibilité, redimensionnement ---------- */
  build();
  // mise en chauffe hors animation (dégradés, glyphe, polices du canevas) pour que la première image soit légère
  function warm() {
    if (started || !N) return;
    machine(cT, P[0], 1); glow(cT, P[0], "217,168,100", .9); stampAt(cT, 0, .5); drawZone(cT);
    cT.clearRect(0, cTop, W, cH);
    hud(0); hud(null);
  }
  if (win.requestIdleCallback) win.requestIdleCallback(warm, { timeout: 2500 }); else setTimeout(warm, 600);
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { if (finished && !tm && !run && !sync) finalize(); });
  if ("IntersectionObserver" in win) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        visible = e.isIntersecting;
        if (!visible) return;
        if (!started && (e.intersectionRatio >= .25 || e.intersectionRect.height > win.innerHeight * .4)) start();
        if (run || sync || tm || stamps.length) kick();
      });
    }, { threshold: [0, .1, .25, .5] }).observe(cvT);
  } else { visible = true; start(); }
  var rt = 0;
  function sigNow() { return host.clientWidth + "x" + host.clientHeight + ":" + grid.offsetTop + ":" + grid.offsetHeight; }
  sig = sigNow();
  function onResize() {
    clearTimeout(rt);
    rt = setTimeout(function () {
      var s = sigNow(); if (s === sig) return; sig = s;
      if (dragId != null) { try { host.releasePointerCapture(dragId); } catch (e) { /* rien */ } dragId = null; host.classList.remove("fx-trace-drag"); cursor(""); }
      var was = started;
      run = null; sync = null; tm = null; stamps = []; pulses = []; hov = null;
      build();
      hud(null);
      if (was) finalize(); else { cB.clearRect(0, cTop, W, cH); cT.clearRect(0, cTop, W, cH); }
    }, 200);
  }
  if (win.ResizeObserver) new ResizeObserver(onResize).observe(host); else win.addEventListener("resize", onResize);
})();
