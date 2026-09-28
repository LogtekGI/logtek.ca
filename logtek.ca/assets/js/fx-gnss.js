/* Logtek — « Signal perdu » : la page 404 fait un démarrage à froid GNSS et vous ramène à l'accueil
   Chargé seulement par 404.html, après fx-core.js (boucle rAF partagée : window.LTK.fx).
   Déroulé (≈ 4,2 s, une seule fois, puis tout est immobile) :
     0–1,4 s   le ciel GNSS se dessine (horizon, 30°, 60°, N-E-S-O ; « O » en français, « W » en anglais)
               et un balayage de recherche tourne puis ralentit (lancée → roue libre) ;
               les satellites apparaissent un à un ; leurs barres C/N0 montent, grises sous 30 dB-Hz, or au-dessus.
     0,6–2,6 s le point « vous êtes ici » erre (Ornstein-Uhlenbeck) dans un cercle de précision
               r = 4 + 176/(1 + n²/4) m (1 px = 2 m) qui fond à mesure que les satellites verrouillent :
               ±180 m … FIX 2D … FIX 3D … ±4 m. Seule partie qui utilise la boucle rAF.
     2,6–4,2 s trajet au moindre coût (A* 8 voisins sur ~64 colonnes, Chaikin ×2) sur le relief de topo.svg :
               la pente coûte au carré, donc le tracé contourne les resserrements de courbes et évite le texte ;
               il est révélé en tirets or jusqu'au bouton « Retour à l'accueil », qui reçoit un double anneau
               de géorepérage et l'événement « ltk:lap » (repris par fx-guide-bar s'il est présent).
   Survol / focus d'un des deux boutons : le trajet se recalcule vers ce bouton (fondu 200 ms, ~2 ms de calcul).
   Téléphone / tablette : le ciel devient une pastille de 120 px à côté des boutons, le trajet ne couvre que les boutons.
   Moins d'animation : état final immédiat (satellites verrouillés, ±4 m, trajet tracé). Sans JS : rien n'est ajouté.
   Tout est décoratif (aria-hidden, jamais focusable) ; le h1, le texte et les liens ne changent pas. */
(function () {
  "use strict";
  var doc = document, body = doc.body;
  var hero = doc.querySelector(".page-hero");
  var wrap = hero && hero.querySelector(".wrap");
  var actions = hero && hero.querySelector(".hero-actions");
  if (!wrap || !actions || hero.querySelector(".fx-gnss")) return;
  var btnHome = actions.querySelector(".btn:not(.btn-ghost-light)");
  var btnAlt = actions.querySelector(".btn-ghost-light");
  if (!btnHome) return;
  var h1 = hero.querySelector("h1"), lead = hero.querySelector(".lead"), eyebrow = hero.querySelector(".eyebrow");

  var L = window.LTK || {};
  var reduce = !!L.reduce || !(L.fx && window.Element && Element.prototype.animate);
  var NS = "http://www.w3.org/2000/svg";
  var lang = (body.getAttribute("data-lang") || doc.documentElement.lang || "fr").slice(0, 2) === "en" ? "en" : "fr";
  var S = {
    fr: { card: ["N", "E", "S", "O"], search: "RECHERCHE", f2: "FIX 2D", f3: "FIX 3D", loc: "fr-CA" },
    en: { card: ["N", "E", "S", "W"], search: "SEARCHING", f2: "2D FIX", f3: "3D FIX", loc: "en-CA" }
  }[lang];
  var nf0, nf1;
  try { nf0 = new Intl.NumberFormat(S.loc, { maximumFractionDigits: 0 }); nf1 = new Intl.NumberFormat(S.loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  catch (e) { nf0 = { format: function (v) { return String(Math.round(v)); } }; nf1 = { format: function (v) { return v.toFixed(1); } }; }

  /* ---------- constellation (fixe = même ciel à chaque visite) ---------- */
  // G = GPS (rond), E = Galileo (losange), R = GLONASS (triangle). C/N0 en dB-Hz : bas sur l'horizon = faible.
  var SATS = [
    { id: "G07", az: 58, el: 62, cn: 46 }, { id: "G13", az: 118, el: 40, cn: 42 },
    { id: "E24", az: 208, el: 72, cn: 44 }, { id: "R12", az: 292, el: 24, cn: 34 },
    { id: "G21", az: 334, el: 47, cn: 41 }, { id: "E03", az: 152, el: 13, cn: 27 },
    { id: "G30", az: 246, el: 50, cn: 39 }, { id: "R05", az: 72, el: 8, cn: 23 }
  ];
  var CX = 120, CY = 120, R = 92, BAR_BASE = 292, BAR_MAX = 40, LOCK = 30;
  // réglages du trajet (choisis à l'œil sur 1440, 1024, 768, 390 et 320 px de large)
  var GRID_COLS = 110, SLOPE_K = 8, ROUGH = 6, TURN = 3, EPS = .6;
  var T_WANDER0 = .6, T_WANDER1 = 2.6, T_ROUTE = 2.6, T_ARRIVE = 4.2, PX_M = 2; // 1 px = 2 m
  var out3 = function (t) { return 1 - Math.pow(1 - t, 3); };
  // instants d'apparition et de verrouillage (la barre monte en out3 : on résout out3(u)·cn = 30)
  SATS.forEach(function (s, i) {
    s.t = .42 + i * .19; s.g = s.t + .1; s.gd = .95;
    s.lk = s.cn > LOCK ? s.g + s.gd * (1 - Math.pow(1 - LOCK / s.cn, 1 / 3)) : Infinity;
    var r = R * (90 - s.el) / 90, a = s.az * Math.PI / 180;
    s.x = CX + r * Math.sin(a); s.y = CY - r * Math.cos(a);
  });
  var locks = SATS.map(function (s) { return s.lk; }).filter(isFinite).sort(function (a, b) { return a - b; });
  var T_ALL = locks[locks.length - 1];
  function nLocked(t) { var n = 0; for (var i = 0; i < locks.length; i++) if (locks[i] <= t) n++; return n; }
  function accM(t) { // précision annoncée (m)
    var n = nLocked(t), r = 4 + 176 / (1 + n * n / 4);
    return t < T_ALL ? r : 4 + (r - 4) * Math.exp(-(t - T_ALL) * 7);
  }

  /* ---------- SVG : le ciel (dans .wrap) ---------- */
  function f(v) { return Math.round(v * 10) / 10; }
  function pol(r, deg) { var a = deg * Math.PI / 180; return [f(CX + r * Math.sin(a)), f(CY - r * Math.cos(a))]; }
  var ticks = "";
  for (var d = 0; d < 360; d += 10) { var a0 = pol(R, d), a1 = pol(R + (d % 30 ? 3 : 6), d); ticks += "M" + a0 + "L" + a1; }
  var w0 = pol(R, -46), w1 = pol(R, 0);
  var sky = '<defs><linearGradient id="fx-gnss-sw" gradientUnits="userSpaceOnUse" x1="' + w0[0] + '" y1="' + w0[1] + '" x2="' + w1[0] + '" y2="' + w1[1] + '">' +
    '<stop offset="0" stop-color="#D9A864" stop-opacity="0"/><stop offset="1" stop-color="#D9A864" stop-opacity=".28"/></linearGradient></defs>' +
    '<g class="fx-gnss-sweep"><path d="M' + CX + " " + CY + "L" + w0 + "A" + R + " " + R + " 0 0 1 " + w1 + 'Z" fill="url(#fx-gnss-sw)"/>' +
    '<path d="M' + CX + " " + CY + "L" + w1 + '" class="fx-gnss-sweep-edge"/></g>' +
    '<path class="fx-gnss-cross" d="M' + CX + " " + (CY - R) + "V" + (CY + R) + "M" + (CX - R) + " " + CY + "H" + (CX + R) + '"/>' +
    '<path class="fx-gnss-tk" d="' + ticks + '"/>';
  [[R, "fx-gnss-r0"], [R * 2 / 3, "fx-gnss-r1"], [R / 3, "fx-gnss-r1"]].forEach(function (c) {
    sky += '<circle class="fx-gnss-ring ' + c[1] + '" cx="' + CX + '" cy="' + CY + '" r="' + f(c[0]) + '" pathLength="1" transform="rotate(-90 ' + CX + " " + CY + ')"/>';
  });
  S.card.forEach(function (c, i) { var p = pol(R + 15, i * 90); sky += '<text class="fx-gnss-card' + (i ? "" : " is-n") + '" x="' + p[0] + '" y="' + f(p[1] + 3.5) + '">' + c + "</text>"; });
  sky += '<text class="fx-gnss-elv" x="' + (CX + 3) + '" y="' + f(CY - R * 2 / 3 - 2.5) + '">30°</text><text class="fx-gnss-elv" x="' + (CX + 3) + '" y="' + f(CY - R / 3 - 2.5) + '">60°</text>';
  SATS.forEach(function (s) {
    var k = s.id.charAt(0), g = k === "E" ? '<path d="M0-4.6L4.6 0 0 4.6-4.6 0Z"/>' : k === "R" ? '<path d="M0-4.8L4.4 3.4H-4.4Z"/>' : '<circle r="3.8"/>';
    sky += '<g class="fx-gnss-sat' + (s.cn > LOCK ? " is-lock" : "") + '" transform="translate(' + f(s.x) + " " + f(s.y) + ')">' +
      '<circle class="fx-gnss-ping" r="4"/><g class="fx-gnss-glyph">' + g + '</g><text x="7" y="-5">' + s.id + "</text></g>";
  });
  // barres C/N0
  var bw = 14, gap = 8, bx0 = CX - (SATS.length * bw + (SATS.length - 1) * gap) / 2, bars = "";
  var yThr = BAR_BASE - BAR_MAX * LOCK / 50;
  bars += '<path class="fx-gnss-thr" d="M' + f(bx0 - 6) + " " + yThr + "H" + f(CX + (CX - bx0) + 6) + '"/><text class="fx-gnss-thrl" x="' + f(bx0 - 9) + '" y="' + (yThr + 3) + '">30</text>';
  SATS.forEach(function (s, i) {
    var x = bx0 + i * (bw + gap), h = BAR_MAX * s.cn / 50;
    bars += '<rect class="fx-gnss-bar' + (s.cn > LOCK ? " is-lock" : "") + '" x="' + f(x) + '" y="' + f(BAR_BASE - h) + '" width="' + bw + '" height="' + f(h) + '" rx="1.5"/>' +
      '<text class="fx-gnss-barl" x="' + f(x + bw / 2) + '" y="' + (BAR_BASE + 13) + '">' + s.id + "</text>";
  });
  bars += '<path class="fx-gnss-base" d="M' + f(bx0 - 6) + " " + (BAR_BASE + .5) + "H" + f(CX + (CX - bx0) + 6) + '"/>';
  var VB_FULL = "0 0 240 312", VB_SKY = "0 0 240 240", RATIO_FULL = 312 / 240;

  var panel = doc.createElementNS(NS, "svg");
  panel.setAttribute("class", "fx-gnss");
  panel.setAttribute("aria-hidden", "true"); panel.setAttribute("focusable", "false");
  panel.setAttribute("viewBox", VB_FULL);
  panel.innerHTML = '<g class="fx-gnss-sky">' + sky + '</g><g class="fx-gnss-bars">' + bars + "</g>";

  /* ---------- SVG : la carte (couvre le hero, sous le texte) ---------- */
  var leg = function (i) {
    return '<mask id="fx-gnss-mk' + i + '" maskUnits="userSpaceOnUse"><path class="fx-gnss-mpath"/></mask>';
  };
  var map = doc.createElementNS(NS, "svg");
  map.setAttribute("class", "fx-gnss-route");
  map.setAttribute("aria-hidden", "true"); map.setAttribute("focusable", "false");
  map.innerHTML = "<defs>" + leg(0) + leg(1) + "</defs>" +
    [0, 1].map(function (i) {
      return '<g class="fx-gnss-leg" style="opacity:0"><g mask="url(#fx-gnss-mk' + i + ')">' +
        '<path class="fx-gnss-glow"/><path class="fx-gnss-line"/><path class="fx-gnss-kt"/></g>' +
        '<circle class="fx-gnss-end" r="3.2"/><circle class="fx-gnss-head" r="3.4" cx="0" cy="0"/></g>';
    }).join("") +
    '<g class="fx-gnss-fix"><circle class="fx-gnss-acc" r="2"/><g class="fx-gnss-dotg"><circle class="fx-gnss-lockring" r="6"/>' +
    '<path class="fx-gnss-ret" d="M0-9V-14M0 9V14M-9 0H-14M9 0H14"/><circle class="fx-gnss-dot" r="4.2"/></g>' +
    '<text class="fx-gnss-lbl"><tspan class="fx-gnss-l1"></tspan><tspan class="fx-gnss-l2" dy="17"></tspan></text></g>';
  var topo = hero.querySelector(".topo-bg");
  hero.insertBefore(map, topo ? topo.nextSibling : hero.firstChild);
  wrap.appendChild(panel);

  var q = function (sel, root) { return (root || map).querySelector(sel); };
  var legs = [].slice.call(map.querySelectorAll(".fx-gnss-leg")).map(function (g, i) {
    return { g: g, mk: q("#fx-gnss-mk" + i + " path"), paths: [].slice.call(g.querySelectorAll("[mask] path")), end: q(".fx-gnss-end", g), head: q(".fx-gnss-head", g), to: null, len: 0 };
  });
  var accEl = q(".fx-gnss-acc"), dotG = q(".fx-gnss-dotg"), lbl = q(".fx-gnss-lbl"), l1 = q(".fx-gnss-l1"), l2 = q(".fx-gnss-l2");

  /* ---------- mise en page (une fois, puis au redimensionnement ; jamais par image) ---------- */
  var G = {}; // géométrie courante, coordonnées relatives au hero
  function box(el) { // boîte sans les transformations en cours (l'entrée « rise » du hero)
    var x = 0, y = 0, e = el;
    while (e && e !== hero) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
    return { x: x, y: y, w: el.offsetWidth, h: el.offsetHeight, r: x + el.offsetWidth, b: y + el.offsetHeight };
  }
  function inkRight(el, dflt) { // bord droit réel du texte (la boîte du paragraphe est plus large que ses lignes)
    if (!el) return dflt;
    var rg = doc.createRange(), hr = hero.getBoundingClientRect(), m = -1e9; rg.selectNodeContents(el);
    [].forEach.call(rg.getClientRects(), function (b) { m = Math.max(m, b.right - hr.left); });
    return m > -1e9 ? m : dflt;
  }
  function layout() {
    var W = hero.clientWidth, H = hero.clientHeight, cs = getComputedStyle(wrap), wb = box(wrap);
    var left = wb.x + parseFloat(cs.paddingLeft), right = wb.r - parseFloat(cs.paddingRight);
    var hb = h1 ? box(h1) : { x: 0, y: 0, w: 0, h: 0, r: 0, b: wb.y }, lb = lead ? box(lead) : hb, b1 = box(btnHome), b2 = btnAlt ? box(btnAlt) : b1;
    var textR = Math.max(inkRight(lead, lb.r), b1.r, b2.r), bottom = wb.b - 44, top = hb.b + 26;
    var pw = Math.min(240, (bottom - top) / RATIO_FULL), px = right - pw, compact = !(pw >= 176 && px >= textR + 48);
    var pan, fx, fy;
    if (!compact) {
      pan = { x: px, y: bottom - pw * RATIO_FULL, w: pw, h: pw * RATIO_FULL };
      fx = textR + (px - textR) * .5; fy = Math.min(H - 64, Math.max(Math.max(b1.b, b2.b) + 80, pan.y + pan.h * .6));
    } else {
      var s = 120, ptop = Math.max(lb.b + 16, b1.y - 2);
      var rowR = function (top) { return Math.max(b1.y < top + s && b1.b > top ? b1.r : left, b2.y < top + s && b2.b > top ? b2.r : left); };
      s = Math.min(120, right - rowR(ptop) - 22);
      if (s < 84) { s = 104; ptop = Math.max(b1.b, b2.b) + 18; }
      pan = { x: right - s, y: ptop, w: s, h: s };
      var room = H - (pan.y + s);
      if (room >= 64) { fx = pan.x + s * .42; fy = pan.y + s + room * .52; }
      else { fx = pan.x - 44; fy = pan.y + s * .6; }
    }
    G = { W: W, H: H, compact: compact, pan: pan, fx: f(fx), fy: f(fy), b1: b1, b2: b2 };
    panel.classList.toggle("is-compact", compact);
    panel.setAttribute("viewBox", compact ? VB_SKY : VB_FULL);
    panel.style.transform = "translate(" + f(pan.x - wb.x) + "px," + f(pan.y - wb.y) + "px)";
    panel.style.width = f(pan.w) + "px"; panel.style.height = f(pan.h) + "px";
    map.setAttribute("viewBox", "0 0 " + W + " " + H);
    // étiquette : première place libre (à droite, à gauche, puis en dessous) qui ne touche ni texte, ni bouton, ni ciel
    var lw = 112, busy = [pan, b1, b2, hb, lb], side = 1, below = 0;
    var free = function (x, y) {
      if (x < 4 || x + lw + 10 > W - 4 || y + 30 > H - 4) return false;
      return !busy.some(function (o) { var ox = o.x, oy = o.y, or = o.r !== undefined ? o.r : o.x + o.w, ob = o.b !== undefined ? o.b : o.y + o.h; return x < or + 6 && ox - 6 < x + lw + 10 && y < ob + 6 && oy - 6 < y + 34; });
    };
    var spots = [[1, 0], [-1, 0], [1, 24], [-1, 24], [1, 30], [-1, 30]];
    for (var si = 0; si < spots.length; si++) {
      var sx = spots[si][0] > 0 ? fx + 12 : fx - lw - 22;
      if (free(sx, fy - 10 + spots[si][1])) { side = spots[si][0]; below = spots[si][1]; break; }
      if (si === spots.length - 1) { side = fx < W / 2 ? 1 : -1; below = 24; }
    }
    G.lbl = { x: side > 0 ? fx + 12 : fx - lw - 22, y: fy - 10 + below, w: lw + 10, h: 34 };
    lbl.setAttribute("x", f(fx + side * 22)); lbl.setAttribute("y", f(fy + 4 + below));
    l2.setAttribute("x", f(fx + side * 22));
    lbl.setAttribute("text-anchor", side > 0 ? "start" : "end");
    [0, 1].forEach(function (i) { legs[i].mk.parentNode.setAttribute("width", W); legs[i].mk.parentNode.setAttribute("height", H); legs[i].mk.parentNode.setAttribute("x", 0); legs[i].mk.parentNode.setAttribute("y", 0); });
  }

  /* ---------- relief : champ T(x,y) tiré de topo.svg (même construction que topo-stump, copiée exprès) ---------- */
  var field = null; // { lines: [[y…] par courbe], x0, dx } en unités du SVG 1600×900
  var fieldP = (function () {
    var url = null;
    try { var m = /url\(["']?([^"')]+)["']?\)/.exec(getComputedStyle(topo).backgroundImage); url = m && m[1]; } catch (e) { /* pas de topo */ }
    if (!url || !window.fetch) return Promise.resolve(null);
    return fetch(url).then(function (r) { return r.ok ? r.text() : null; }).then(function (txt) {
      if (!txt) return null;
      var re = /\sd="([^"]+)"/g, m, lines = [], x0 = null, dx = null;
      while ((m = re.exec(txt))) {
        var n = m[1].match(/-?\d+(?:\.\d+)?/g); if (!n || n.length < 8) continue;
        var ys = []; for (var i = 1; i < n.length; i += 2) ys.push(+n[i]);
        if (x0 === null) { x0 = +n[0]; dx = +n[2] - +n[0]; }
        lines.push(ys);
      }
      return lines.length > 3 && dx > 0 ? (field = { lines: lines, x0: x0, dx: dx }) : null;
    }).catch(function () { return null; });
  })();
  function noise(x, y) { // bruit de valeur lissé, graine fixe (repli si topo.svg est illisible)
    function h(i, j) { var s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }
    var i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
  }
  // T échantillonné aux centres des cellules
  function sampleT(cols, rows, c) {
    var W = G.W, H = G.H, T = new Float32Array(cols * rows);
    var sc = Math.max(W / 1600, H / 900), ox = (W - 1600 * sc) / 2, oy = (H - 900 * sc) / 2;
    for (var ci = 0; ci < cols; ci++) {
      var px = (ci + .5) * c;
      if (field) {
        var sx = (px - ox) / sc, fj = (sx - field.x0) / field.dx, j = Math.max(0, Math.min(field.lines[0].length - 2, Math.floor(fj))), u = fj - j;
        var ys = field.lines.map(function (l) { return l[j] + (l[j + 1] - l[j]) * u; }).sort(function (a, b) { return a - b; });
        var gapM = (ys[ys.length - 1] - ys[0]) / (ys.length - 1);
        for (var ri = 0; ri < rows; ri++) {
          var sy = ((ri + .5) * c - oy) / sc, k = 0, t;
          if (sy <= ys[0]) t = (sy - ys[0]) / gapM;
          else if (sy >= ys[ys.length - 1]) t = ys.length - 1 + (sy - ys[ys.length - 1]) / gapM;
          else { while (ys[k + 1] < sy) k++; t = k + (sy - ys[k]) / (ys[k + 1] - ys[k]); }
          T[ri * cols + ci] = t;
        }
      } else {
        for (var r2 = 0; r2 < rows; r2++) { var X = px / 170, Y = (r2 + .5) * c / 120; T[r2 * cols + ci] = 7 * noise(X, Y) + 3 * noise(X * 2.1 + 5, Y * 2.1) + Y * 2.2; }
      }
    }
    return T;
  }

  /* ---------- trajet au moindre coût ---------- */
  var grid = null;
  function buildGrid() {
    var c = Math.max(9, G.W / GRID_COLS), cols = Math.round(G.W / c), rows = Math.ceil(G.H / c), n = cols * rows, T = sampleT(cols, rows, c);
    var gm = new Float32Array(n), GX = new Float32Array(n), GY = new Float32Array(n), cost = new Float32Array(n), sorted = [];
    for (var r = 0; r < rows; r++) for (var q2 = 0; q2 < cols; q2++) {
      var i = r * cols + q2, l = T[r * cols + Math.max(0, q2 - 1)], rr = T[r * cols + Math.min(cols - 1, q2 + 1)];
      var u = T[Math.max(0, r - 1) * cols + q2], d = T[Math.min(rows - 1, r + 1) * cols + q2];
      var gx = (rr - l) / ((Math.min(cols - 1, q2 + 1) - Math.max(0, q2 - 1)) * c), gy = (d - u) / ((Math.min(rows - 1, r + 1) - Math.max(0, r - 1)) * c);
      GX[i] = gx; GY[i] = gy; gm[i] = Math.sqrt(gx * gx + gy * gy); sorted.push(gm[i]);
    }
    sorted.sort(function (a, b) { return a - b; });
    var gref = sorted[n >> 1] || 1;
    // la pente se paie au carré et seulement dans le sens de la marche : longer une courbe est gratuit,
    // la couper dans un resserrement coûte cher → le tracé suit le relief et traverse là où les courbes s'écartent
    // + un sol inégal (roches, milieux humides, peuplements denses) : bruit fixe qui fait serpenter le sentier
    for (i = 0; i < n; i++) { GX[i] /= gref; GY[i] /= gref; var nn = noise((i % cols + .5) * c / 95 + 3.7, ((i / cols | 0) + .5) * c / 95 + 1.3); cost[i] = ROUGH * nn * nn; }
    // texte, autre bouton, ciel et étiquette : quasi infranchissables (on ne passe pas sous les mots)
    var hr = hero.getBoundingClientRect(), obs = [];
    function addRects(el, pad, k) { // lignes de texte, corrigées de l'entrée « rise » éventuellement en cours
      if (!el) return;
      var rg = doc.createRange(), eb = el.getBoundingClientRect(), bx = box(el), dx = bx.x - (eb.left - hr.left), dy = bx.y - (eb.top - hr.top);
      rg.selectNodeContents(el);
      [].forEach.call(rg.getClientRects(), function (b) { obs.push([b.left - hr.left + dx - pad, b.top - hr.top + dy - pad, b.right - hr.left + dx + pad, b.bottom - hr.top + dy + pad, k]); });
    }
    addRects(eyebrow, 8, 40); addRects(h1, 10, 60); addRects(lead, 8, 60);
    obs.push([G.pan.x - 6, G.pan.y - 6, G.pan.x + G.pan.w + 6, G.pan.y + G.pan.h + 6, 30]);
    obs.push([G.lbl.x, G.lbl.y - 18, G.lbl.x + G.lbl.w, G.lbl.y + G.lbl.h, 12]);
    obs.forEach(function (o) {
      for (var r3 = Math.max(0, Math.floor(o[1] / c)); r3 <= Math.min(rows - 1, Math.floor(o[3] / c)); r3++)
        for (var c3 = Math.max(0, Math.floor(o[0] / c)); c3 <= Math.min(cols - 1, Math.floor(o[2] / c)); c3++) cost[r3 * cols + c3] += o[4];
    });
    grid = { cols: cols, rows: rows, c: c, cost: cost, gx: GX, gy: GY };
  }
  function stadium(b, x, y) { // distance au contour d'un bouton-pilule, et point projeté sur ce contour
    var r = b.h / 2, cx = Math.max(b.x + r, Math.min(b.r - r, x)), cy = b.y + r, dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy) || 1;
    return { d: d - r, px: cx + dx / d * r, py: cy + dy / d * r, nx: dx / d, ny: dy / d };
  }
  var btnBox = box; // boîte hors transformation (le bouton peut encore être en train de monter)
  function route(btn) {
    var gr = grid, cols = gr.cols, rows = gr.rows, c = gr.c, n = cols * rows, cost = new Float32Array(gr.cost);
    var tb = btnBox(btn), other = btn === btnHome ? btnAlt : btnHome, ob = other ? btnBox(other) : null;
    var goal = new Uint8Array(n), ci, ri, i;
    for (ri = 0; ri < rows; ri++) for (ci = 0; ci < cols; ci++) {
      i = ri * cols + ci; var x = (ci + .5) * c, y = (ri + .5) * c, st = stadium(tb, x, y);
      if (st.d < 2) cost[i] = 1e4; else if (st.d <= c * 1.25 + 4) goal[i] = 1;
      if (ob) { var so = stadium(ob, x, y); if (so.d < c * .9 + 8) cost[i] += 80; }
    }
    var s0 = Math.min(rows - 1, Math.floor(G.fy / c)) * cols + Math.min(cols - 1, Math.floor(G.fx / c));
    var gS = new Float32Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    var heap = [], hf = [];
    function push(k, fv) { heap.push(k); hf.push(fv); var j = heap.length - 1; while (j > 0) { var p = (j - 1) >> 1; if (hf[p] <= hf[j]) break; var t = heap[p]; heap[p] = heap[j]; heap[j] = t; t = hf[p]; hf[p] = hf[j]; hf[j] = t; j = p; } }
    function pop() {
      var top = heap[0], lk = heap.pop(), lf = hf.pop();
      if (heap.length) { heap[0] = lk; hf[0] = lf; var j = 0; for (;;) { var a = 2 * j + 1, b = a + 1, m = j; if (a < heap.length && hf[a] < hf[m]) m = a; if (b < heap.length && hf[b] < hf[m]) m = b; if (m === j) break; var t = heap[m]; heap[m] = heap[j]; heap[j] = t; t = hf[m]; hf[m] = hf[j]; hf[j] = t; j = m; } }
      return top;
    }
    function hEst(k) { var x = (k % cols + .5) * c, y = ((k / cols | 0) + .5) * c; return Math.max(0, stadium(tb, x, y).d - c * 1.25 - 4); }
    gS[s0] = 0; push(s0, hEst(s0));
    var DX = [1, -1, 0, 0, 1, 1, -1, -1, 2, 2, -2, -2, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 2, -2, 2, -2], end = -1;
    var GXa = gr.gx, GYa = gr.gy, K = SLOPE_K, dir = new Int8Array(n).fill(-1), DL = DX.map(function (x, j) { return Math.sqrt(x * x + DY[j] * DY[j]); });
    while (heap.length) {
      var k = pop(); if (done[k]) continue; done[k] = 1;
      if (goal[k]) { end = k; break; }
      var kx = k % cols, ky = k / cols | 0;
      for (var dI = 0; dI < 16; dI++) {
        var nx = kx + DX[dI], ny = ky + DY[dI]; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        var nk = ny * cols + nx; if (done[nk]) continue;
        var cc = (cost[k] + cost[nk]) / 2;
        if (dI >= 8) { // pas de cavalier : les deux cellules enjambées comptent aussi (sinon il « saute » les obstacles)
          var m1 = (ky + (DY[dI] / 2 | 0)) * cols + kx + (DX[dI] / 2 | 0), m2 = (ky + Math.round(DY[dI] / 2)) * cols + kx + Math.round(DX[dI] / 2);
          cc = (cost[k] + cost[nk] + cost[m1] + cost[m2]) / 4;
        }
        var sl = Math.sqrt(DX[dI] * DX[dI] + DY[dI] * DY[dI]), ux = DX[dI] / sl, uy = DY[dI] / sl;
        var ds = ((GXa[k] + GXa[nk]) * ux + (GYa[k] + GYa[nk]) * uy) / 2; // pente dans le sens de la marche (1 = pente médiane)
        var gv = gS[k] + sl * c * (1 + K * ds * ds + cc), pd = dir[k];
        if (pd >= 0) gv += TURN * c * (1 - (DX[pd] * ux + DY[pd] * uy) / DL[pd]); // virage : un sentier ne fait pas d'escalier
        if (gv < gS[nk]) { gS[nk] = gv; from[nk] = k; dir[nk] = dI; push(nk, gv + hEst(nk)); }
      }
    }
    var pts = [];
    if (end < 0) { var st0 = stadium(tb, G.fx, G.fy); pts = [[G.fx, G.fy], [st0.px + st0.nx * 4, st0.py + st0.ny * 4]]; }
    else {
      for (var k2 = end; k2 >= 0; k2 = from[k2]) pts.unshift([(k2 % cols + .5) * c, ((k2 / cols | 0) + .5) * c]);
      pts[0] = [G.fx, G.fy];
      var last = pts[pts.length - 1], se = stadium(tb, last[0], last[1]);
      pts.push([se.px + se.nx * 5, se.py + se.ny * 5]);
    }
    pts = rdp(pts, c * EPS);
    for (var it = 0; it < 3; it++) { // Chaikin ×3 (extrémités conservées)
      var o = [pts[0]];
      for (var j = 0; j < pts.length - 1; j++) { var A = pts[j], B = pts[j + 1]; o.push([A[0] * .75 + B[0] * .25, A[1] * .75 + B[1] * .25], [A[0] * .25 + B[0] * .75, A[1] * .25 + B[1] * .75]); }
      o.push(pts[pts.length - 1]); pts = o;
    }
    return pts;
  }
  function rdp(pts, eps) { // Ramer-Douglas-Peucker : enlève l'escalier de la grille, garde les vrais virages
    if (pts.length < 3) return pts;
    var a = pts[0], b = pts[pts.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, mi = 0, md = 0;
    for (var i = 1; i < pts.length - 1; i++) { var d = Math.abs((pts[i][0] - a[0]) * dy - (pts[i][1] - a[1]) * dx) / l; if (d > md) { md = d; mi = i; } }
    if (md <= eps) return [a, b];
    return rdp(pts.slice(0, mi + 1), eps).slice(0, -1).concat(rdp(pts.slice(mi), eps));
  }
  function geom(pts) { // chemin, longueur, jalons tous les 250 m, positions échantillonnées pour la tête
    var d = "M" + f(pts[0][0]) + " " + f(pts[0][1]), len = 0, cum = [0], kt = "", step = 250 / PX_M, next = step;
    for (var i = 1; i < pts.length; i++) {
      var ax = pts[i - 1][0], ay = pts[i - 1][1], bx = pts[i][0], by = pts[i][1], sl = Math.hypot(bx - ax, by - ay);
      d += "L" + f(bx) + " " + f(by);
      while (sl > 0 && next <= len + sl) {
        var u = (next - len) / sl, x = ax + (bx - ax) * u, y = ay + (by - ay) * u, nx = -(by - ay) / sl * 5, ny = (bx - ax) / sl * 5;
        kt += "M" + f(x - nx) + " " + f(y - ny) + "L" + f(x + nx) + " " + f(y + ny); next += step;
      }
      len += sl; cum.push(len);
    }
    var samples = [], N = 36, j = 1;
    for (var s = 0; s <= N; s++) {
      var at = len * s / N; while (j < cum.length - 1 && cum[j] < at) j++;
      var sg = cum[j] - cum[j - 1] || 1, uu = (at - cum[j - 1]) / sg;
      samples.push({ transform: "translate(" + f(pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * uu) + "px," + f(pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * uu) + "px)" });
    }
    return { d: d, len: len, kt: kt, samples: samples, end: pts[pts.length - 1] };
  }
  function fmtRoute(len) {
    var m = len * PX_M, min = Math.max(1, Math.round(m / 1000 / 5 * 60));
    return (m >= 1000 ? nf1.format(m / 1000) + " km" : nf0.format(Math.round(m / 10) * 10) + " m") + " · " + nf0.format(min) + " min";
  }

  /* ---------- tracé d'une étape ---------- */
  var active = 0, target = btnHome, anims = [], routeShown = false, arrived = false, revealAnim = null;
  function paintLeg(lg, btn, pts) {
    var g = geom(pts); lg.to = btn; lg.len = g.len; lg.geo = g;
    lg.mk.setAttribute("d", g.d);
    lg.paths[0].setAttribute("d", g.d); lg.paths[1].setAttribute("d", g.d); lg.paths[2].setAttribute("d", g.kt);
    lg.end.setAttribute("cx", f(g.end[0])); lg.end.setAttribute("cy", f(g.end[1]));
    lg.head.style.transform = g.samples[g.samples.length - 1].transform;
    lg.mk.style.strokeDasharray = "none"; lg.mk.style.strokeDashoffset = "0";
    return g;
  }
  function anim(el, kf, o) { if (reduce) return null; var a = el.animate(kf, o); anims.push(a); return a; }
  function showRoute(btn, how) { // how : "reveal" (intro), "fade" (re-routage), "snap"
    if (!grid) return;
    var pts = route(btn), lg, old = legs[active];
    if (how === "reveal" || !routeShown) { lg = old; }
    else { active = 1 - active; lg = legs[active]; }
    var g = paintLeg(lg, btn, pts);
    l2.textContent = fmtRoute(g.len);
    routeShown = true; target = btn;
    if (how === "reveal" || !old.to || old === lg) { lg.g.style.opacity = 1; }
    if (how === "reveal" && !reduce) {
      var E = "cubic-bezier(.45,.05,.25,1)", D = (T_ARRIVE - T_ROUTE) * 1000;
      lg.mk.style.strokeDasharray = f(g.len + 2) + " " + f(g.len + 2);
      revealAnim = anim(lg.mk, [{ strokeDashoffset: f(g.len + 2) }, { strokeDashoffset: 0 }], { duration: D, easing: E, fill: "backwards" });
      anim(lg.head, g.samples, { duration: D, easing: E, fill: "backwards" });
      anim(lg.head, [{ opacity: 0 }, { opacity: 1, offset: .08 }, { opacity: 1, offset: .92 }, { opacity: 0 }], { duration: D, fill: "backwards" });
      anim(lg.end, [{ opacity: 0, transform: "scale(0)" }, { opacity: 1, transform: "scale(1.8)", offset: .5 }, { opacity: 1, transform: "scale(1)" }], { duration: 420, delay: D - 60, easing: "ease-out", fill: "backwards" });
      anim(l2, [{ opacity: 0 }, { opacity: 1 }], { duration: 380, delay: D - 120, fill: "backwards" });
      revealAnim.finished.then(function () { if (target === btn && lg === legs[active]) arrive(btn); }, function () { });
      return;
    }
    if (how === "fade" && lg !== old) {
      lg.g.style.opacity = 1; old.g.style.opacity = 0;
      anim(lg.g, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
      anim(old.g, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease-in" });
    } else { lg.g.style.opacity = 1; if (lg !== old) old.g.style.opacity = 0; }
  }
  function arrive(btn) {
    if (arrived || reduce) return; arrived = true;
    var b = btn.getBoundingClientRect();
    btn.style.setProperty("--fx-gnss-sx", f(1 + 32 / Math.max(1, b.width)));
    btn.style.setProperty("--fx-gnss-sy", f(1 + 32 / Math.max(1, b.height)));
    btn.classList.add("fx-gnss-geo");
    btn.addEventListener("animationend", function done(e) {
      if (e.animationName !== "fx-gnss-geofence") return;
      btn.classList.remove("fx-gnss-geo"); btn.removeEventListener("animationend", done);
    });
    try { btn.dispatchEvent(new CustomEvent("ltk:lap", { bubbles: true })); } catch (e) { /* vieux navigateur */ }
  }

  /* ---------- le point « vous êtes ici » (seule tâche rAF, 0,6 → 2,6 s) ---------- */
  var t0 = 0, rS = 180, ox = 0, oy = 0, lastTxt = "", wanderOn = false, heroVisible = true;
  function gauss() { var u = Math.random() || 1e-6, v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); }
  function readout(t, m) {
    var n = nLocked(t), st = n >= 4 ? S.f3 : n >= 3 ? S.f2 : S.search;
    return "±" + nf0.format(Math.round(m)) + " m · " + st;
  }
  function setFix(x, y, m, txt) {
    dotG.setAttribute("transform", "translate(" + f(x) + " " + f(y) + ")");
    accEl.setAttribute("cx", f(x)); accEl.setAttribute("cy", f(y)); accEl.setAttribute("r", f(Math.max(2, m / PX_M)));
    if (txt !== lastTxt) { l1.textContent = txt; lastTxt = txt; }
  }
  function finalFix() { ox = oy = 0; rS = 4; setFix(G.fx, G.fy, 4, readout(99, 4)); }
  var task = {
    update: function (dt, now) {
      var t = (now - t0) / 1000;
      if (t >= T_WANDER1 + .05) { finalFix(); wanderOn = false; return false; }
      if (!heroVisible) return false;
      rS = L.damp(rS, accM(t), 9, dt);
      var sd = rS / PX_M * .42, th = 2.6, sg = sd * Math.sqrt(2 * th), sq = Math.sqrt(dt);
      var pull = t > T_WANDER1 - .35 ? 14 : 0; // atterrit pile sur le point à la fin
      ox += (-(th + pull) * ox) * dt + sg * sq * gauss(); oy += (-(th + pull) * oy) * dt + sg * sq * gauss();
      var lim = rS / PX_M * .85, dd = Math.hypot(ox, oy); if (dd > lim) { ox *= lim / dd; oy *= lim / dd; }
      setFix(G.fx + ox, G.fy + oy, rS, readout(t, rS));
      return true;
    }
  };

  /* ---------- intro ---------- */
  function intro() {
    t0 = performance.now();
    if (reduce) { finish(); return; }
    var q2 = function (s) { return [].slice.call(panel.querySelectorAll(s)); };
    // ciel : anneaux, graduations, lettres
    q2(".fx-gnss-ring").forEach(function (c, i) { anim(c, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 1100 - i * 150, delay: 60 + i * 140, easing: "cubic-bezier(.6,0,.2,1)", fill: "backwards" }); });
    anim(panel.querySelector(".fx-gnss-tk"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 500, fill: "backwards" });
    anim(panel.querySelector(".fx-gnss-cross"), [{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 300, fill: "backwards" });
    q2(".fx-gnss-card, .fx-gnss-elv").forEach(function (c, i) { anim(c, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 700 + i * 90, fill: "backwards" }); });
    // balayage : lancé puis roue libre jusqu'à l'arrêt, s'efface au FIX
    var sw = panel.querySelector(".fx-gnss-sweep");
    anim(sw, [{ transform: "rotate(0deg)" }, { transform: "rotate(900deg)" }], { duration: 2300, delay: 150, easing: "cubic-bezier(.25,.55,.3,1)", fill: "both" });
    anim(sw, [{ opacity: 0 }, { opacity: 1, offset: .1 }, { opacity: 1, offset: .75 }, { opacity: 0 }], { duration: 2400, delay: 150, fill: "both" });
    // satellites et barres
    var sats = q2(".fx-gnss-sat"), barsE = q2(".fx-gnss-bar"), GREY = "#6E675C", GOLD = "#D9A864";
    SATS.forEach(function (s, i) {
      var gl = sats[i].querySelector(".fx-gnss-glyph");
      anim(gl, [{ transform: "scale(0)" }, { transform: "scale(1.5)", offset: .55 }, { transform: "scale(.9)", offset: .8 }, { transform: "scale(1)" }], { duration: 480, delay: s.t * 1000, easing: "ease-out", fill: "backwards" });
      anim(sats[i].querySelector("text"), [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: s.t * 1000 + 120, fill: "backwards" });
      var gD = s.gd * 1000;
      anim(barsE[i], [{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: gD, delay: s.g * 1000, easing: "cubic-bezier(.33,1,.68,1)", fill: "backwards" });
      if (isFinite(s.lk)) {
        var u = (s.lk - s.g) / s.gd;
        anim(barsE[i], [{ fill: GREY }, { fill: GREY, offset: u }, { fill: GOLD, offset: Math.min(1, u + .04) }, { fill: GOLD }], { duration: gD, delay: s.g * 1000, fill: "backwards" });
        anim(gl, [{ fill: "rgba(217,168,100,0)", stroke: GREY }, { fill: GOLD, stroke: GOLD }], { duration: 160, delay: s.lk * 1000, fill: "backwards" });
        anim(sats[i].querySelector(".fx-gnss-ping"), [{ opacity: .75, transform: "scale(1)" }, { opacity: 0, transform: "scale(3.6)" }], { duration: 650, delay: s.lk * 1000, easing: "cubic-bezier(.2,.7,.2,1)", fill: "both" });
      }
    });
    // point « vous êtes ici » : apparaît grand et flou, se resserre
    var fixG = map.querySelector(".fx-gnss-fix");
    anim(fixG, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: (T_WANDER0 - .15) * 1000, fill: "backwards" });
    anim(map.querySelector(".fx-gnss-ret"), [{ opacity: 0, transform: "scale(1.8) rotate(45deg)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: T_WANDER1 * 1000 - 180, easing: "cubic-bezier(.2,.7,.2,1)", fill: "backwards" });
    anim(map.querySelector(".fx-gnss-lockring"), [{ opacity: .8, transform: "scale(1)" }, { opacity: 0, transform: "scale(4)" }], { duration: 700, delay: T_WANDER1 * 1000 - 120, easing: "cubic-bezier(.2,.7,.2,1)", fill: "both" });
    anim(map.querySelector(".fx-gnss-dot"), [{ fill: "#F3E9D8" }, { fill: "#D9A864" }], { duration: 200, delay: T_WANDER1 * 1000 - 150, fill: "backwards" });
    rS = 180; setFix(G.fx, G.fy, 180, readout(0, 180));
    // la marche aléatoire (rAF partagé) démarre à 0,6 s
    setTimeout(function () { wanderOn = true; if (heroVisible) L.fx.add(task); }, T_WANDER0 * 1000 - 20);
    // trajet à 2,6 s (le relief est déjà chargé ; sinon, bruit de repli)
    setTimeout(function () {
      var go = function () { if (!grid) buildGrid(); showRoute(target, "reveal"); };
      if (field) go(); else Promise.race([fieldP, new Promise(function (r) { setTimeout(r, 250); })]).then(go);
    }, T_ROUTE * 1000);
  }
  function finish() { // état final immédiat (moins d'animation, ou redimensionnement pendant l'intro)
    anims.forEach(function (a) { try { a.cancel(); } catch (e) { /* déjà fini */ } }); anims = [];
    if (L.fx) L.fx.remove(task); wanderOn = false;
    finalFix();
    var go = function () { buildGrid(); routeShown = false; legs[1 - active].g.style.opacity = 0; showRoute(target, "snap"); };
    if (field) go(); else fieldP.then(go);
  }

  /* ---------- re-routage au survol / focus ---------- */
  var hov = null, focusB = null, backT = 0;
  function want() { return hov || focusB || btnHome; }
  function retarget() {
    clearTimeout(backT);
    var b = want(); if (b === target && routeShown) return;
    if (!routeShown) { target = b; return; }
    if (revealAnim && revealAnim.playState === "running") { finish(); }
    showRoute(b, reduce ? "snap" : "fade");
  }
  function later() { clearTimeout(backT); backT = setTimeout(retarget, 350); }
  [btnHome, btnAlt].forEach(function (b) {
    if (!b) return;
    b.addEventListener("pointerenter", function () { hov = b; retarget(); });
    b.addEventListener("pointerleave", function () { if (hov === b) hov = null; later(); });
    b.addEventListener("focus", function () { focusB = b; retarget(); });
    b.addEventListener("blur", function () { if (focusB === b) focusB = null; later(); });
  });

  /* ---------- démarrage, visibilité, redimensionnement ---------- */
  layout(); finalFix();
  var started = false, lastW = G.W, lastH = G.H, rT = 0;
  function start() { if (started) return; started = true; intro(); }
  if (L.onVisible) L.onVisible(hero, function (v) {
    heroVisible = v;
    if (v) { start(); if (wanderOn) L.fx.add(task); } else if (L.fx) L.fx.remove(task);
  }); else start();
  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      clearTimeout(rT);
      rT = setTimeout(function () {
        var W = hero.clientWidth, H = hero.clientHeight, a = actions.offsetWidth + "x" + actions.offsetHeight;
        if (W === lastW && H === lastH && a === G.a) return;
        lastW = W; lastH = H; layout(); G.a = a;
        if (started && (routeShown || performance.now() - t0 > T_ROUTE * 1000)) finish();
        else if (started) { finalFixIfDone(); }
      }, 160);
    }).observe(hero);
  }
  function finalFixIfDone() { if (!wanderOn) setFix(G.fx, G.fy, rS, lastTxt || readout(0, rS)); }
  G.a = actions.offsetWidth + "x" + actions.offsetHeight;
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () {
    var a = actions.offsetWidth + "x" + actions.offsetHeight; if (a === G.a) return;
    G.a = a; layout(); if (routeShown) finish(); else finalFixIfDone();
  });
})();
