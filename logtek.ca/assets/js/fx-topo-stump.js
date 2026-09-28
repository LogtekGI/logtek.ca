/* Logtek — fx-topo-stump : « Cernes topographiques » (hero des pages intérieures)
   Les courbes de niveau du hero (topo.svg) se referment en cernes de souche autour d'un point doré, puis
   s'ouvrent de nouveau en carte. Chaque page est un arbre différent (graine tirée de body[data-page] :
   lobes, moelle excentrée, bonnes et mauvaises années, gerces) ; FR et EN ont le même arbre.
   Pages : .page-hero > .topo-bg (logiciel, pièces, services, à propos, contact + EN). Rien sur l'accueil
   (reel-map) ni sur la 404 (gnss) : body[data-page="home" | "404"] → on sort.

   CHAMP : topo.svg (déjà en cache) est relu ; ses 22 courbes deviennent un champ T(x, y) :
     T = k + (y − y_k(x)) / (y_k+1(x) − y_k(x)), linéaire entre les nœuds, prolongé par l'écart moyen.
     Ses isolignes entières SONT les courbes d'origine. Cadrage identique au CSS (cover, centré).
     Les courbes sont tracées une fois dans un canevas « repos » avec les traits du SVG : bascule invisible
     (mesuré : 3 pixels sur 537 000 diffèrent de plus de 3/255).
   SOUCHE (autour de la moelle P) :
     ρ  = distance dans le repère de la vitesse (a = Δ·û / (1 + κ|v|), étirement 1,5× plus fort derrière :
          en mouvement rapide les cernes filent en « cathédrale », puis se détendent, ω 10, ζ .8) ;
     ρ' = ρ · (1 + Σ a_k sin(kθ + φ_k) + e cos(θ − θe)), k = 2…5 ;
     g(ρ') compte les cernes (λ ≈ 9 px au bureau, ajusté à ≥ 2,6× la densité du terrain au téléphone) ;
     H  = T + b·(T(P) + ½-décalage − T) + d·ln(1 + e^(c/d)) − f(−4d),  c = g(r₀) − g(ρ')  (cône adouci) :
          le long de chaque rayon H décroît strictement dans la souche, donc tous les cernes se ferment
          (cœur mis à plat au niveau de la moelle, b → 1), puis s'ouvrent en courbes de niveau sans
          bourrelet ni boucle parasite; nul exactement au-delà de c = −4d.
   RENDU : carrés marchants sur une grille fixe de 16 px (8 px au téléphone), raffinée ÷ 4 autour de la
     moelle, seulement dans la boîte de la souche. Par image : on recolle le repos sur l'ancienne boîte, on
     retire le repos dans le disque (fondu sur la couronne extérieure : aucune couture), on trace 2 Path2D
     (fines, maîtresses) avec un dégradé radial crème → or, on ouvre 2 gerces de séchage, on pose la moelle.
   TEMPS : ~400 ms après l'entrée du h1 (ou au 1er survol), la souche pousse depuis la moelle en 900 ms.
     Bureau (pointeur fin) : la moelle suit le curseur dans le hero (ressort critique ω 12) ; à la sortie
     elle revient au point de repos en ~600 ms. Téléphone / tactile : pousse une fois puis se fige.
     Point de repos : le span doré du h1 s'il existe, sinon le point le plus loin des lignes de texte.
   COÛT : tâche LTK.fx seulement si le hero est visible ET (ressort pas au repos OU curseur bougé dans le
     hero depuis < 1,2 s). Hors écran : tâche retirée. Au repos : zéro image. Un canevas, DPR ≤ 1,5.
   LISIBILITÉ : or ≤ .42, ≤ .3 dès que la souche approche du texte ; sous chaque ligne de texte, les traits
     perdent 65 % de leur opacité et la moelle disparaît → .lead ≥ 5:1 au pire pixel (mesuré).
   MOINS D'ANIMATION : une seule image, la souche déjà formée au point de repos, aucun suivi.
   SANS JS / ÉCHEC DE LECTURE : topo.svg reste tel quel (aucune classe ajoutée). Décor aria-hidden. */
(function () {
  "use strict";
  var W = window, D = document, L = W.LTK;
  if (!L || !L.fx || !W.fetch || !W.Path2D) return;
  var body = D.body, page = body.getAttribute("data-page") || "";
  if (page === "home" || page === "404") return; // accueil : reel-map ; 404 : gnss
  var hero = D.querySelector(".page-hero"), bg = null, i;
  if (!hero) return;
  for (i = 0; i < hero.children.length; i++) if (hero.children[i].classList.contains("topo-bg")) { bg = hero.children[i]; break; }
  if (!bg) return;
  var mUrl = /url\(\s*(["']?)(.*?)\1\s*\)/.exec(getComputedStyle(bg).backgroundImage || "");
  if (!mUrl || !mUrl[2]) return;

  var PI2 = Math.PI * 2, sqrt = Math.sqrt, exp = Math.exp, abs = Math.abs, floor = Math.floor, ceil = Math.ceil;
  var CREAM = [233, 228, 214], GOLD = [217, 168, 100];

  /* ---------- graine : un arbre par page ---------- */
  function rng(str) {
    var h = 2166136261;
    for (var k = 0; k < str.length; k++) { h ^= str.charCodeAt(k); h = Math.imul(h, 16777619); }
    return function () { // mulberry32
      h = (h + 0x6D2B79F5) | 0; var t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rnd = rng("logtek:" + page), rr = function (a, b) { return a + (b - a) * rnd(); };
  // harmoniques k = 2..5 : sin(kθ + φ) = sin kθ · cos φ + cos kθ · sin φ
  var HA = [], HB = [], amp = [0, 0, rr(.035, .07), rr(.02, .045), rr(.01, .028), rr(.006, .016)];
  for (i = 2; i <= 5; i++) { var ph = rr(0, PI2); HA[i] = amp[i] * Math.cos(ph); HB[i] = amp[i] * Math.sin(ph); }
  var ECC = rr(.1, .2), eAng = rr(0, PI2), EC = ECC * Math.cos(eAng), ES = ECC * Math.sin(eAng);
  var CK = [rr(0, PI2)]; CK.push(CK[0] + rr(1.9, 2.9)); // deux gerces, bien séparées
  var CKJ = []; for (i = 0; i < 64; i++) CKJ.push(rr(-1, 1));
  // largeur des cernes : larges au cœur, plus serrés vers l'écorce, bonnes et mauvaises années
  var RW = [], ar = 0;
  for (i = 0; i < 120; i++) { ar = ar * .55 + rr(-1, 1) * .45; RW.push((1.18 - .4 * Math.min(1, i / 28)) * (1 + .32 * ar) * (i === 0 ? 1.15 : 1)); }

  /* ---------- lecture de topo.svg ---------- */
  function attr(tag, name) { var m = new RegExp("\\s" + name + "=\"([^\"]*)\"").exec(tag); return m ? m[1] : null; }
  function parse(txt) {
    var vb = /viewBox="\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)\s*"/.exec(txt);
    if (!vb) return null;
    var re = /<(?:path|polyline)\b[^>]*>/g, m, raw = [];
    while ((m = re.exec(txt))) {
      var t = m[0], d = attr(t, "d") || attr(t, "points");
      if (!d) continue;
      var nums = (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
      if (nums.length < 8 || nums.length % 2) return null;
      var xs = [], ys = [];
      for (var k = 0; k < nums.length; k += 2) { xs.push(nums[k]); ys.push(nums[k + 1]); }
      var op = parseFloat(attr(t, "stroke-opacity")); if (!(op >= 0)) op = 1;
      var sw = parseFloat(attr(t, "stroke-width")); if (!(sw > 0)) sw = 1;
      raw.push({ xs: xs, ys: ys, op: op, sw: sw, col: attr(t, "stroke") || "#E9E4D6", my: ys.reduce(function (a, b) { return a + b; }, 0) / ys.length });
    }
    if (raw.length < 4) return null;
    raw.sort(function (a, b) { return a.my - b.my; });
    var xs0 = raw[0].xs, nk = xs0.length, dx = (xs0[nk - 1] - xs0[0]) / (nk - 1);
    if (!(dx > 0)) return null;
    var nl = raw.length, Y = new Float64Array(nl * nk);
    for (var l = 0; l < nl; l++) {
      var r = raw[l];
      if (r.xs.length !== nk) return null;
      for (var j = 0; j < nk; j++) {
        if (abs(r.xs[j] - (xs0[0] + j * dx)) > .01) return null; // nœuds réguliers et communs
        Y[l * nk + j] = r.ys[j];
        if (l && Y[l * nk + j] <= Y[(l - 1) * nk + j]) return null; // courbes qui se croisent : on abandonne
      }
    }
    var gap = 0;
    for (j = 0; j < nk; j++) gap += (Y[(nl - 1) * nk + j] - Y[j]) / (nl - 1);
    return { vw: +vb[3], vh: +vb[4], vx: +vb[1], vy: +vb[2], x0: xs0[0], dx: dx, nk: nk, nl: nl, Y: Y, gap: gap / nk, lines: raw };
  }

  /* ---------- état ---------- */
  var F, cv, ctx, rest, rctx, dpr = 1, Wc = 0, Hc = 0, sc = 1, ox = 0, oy = 0, phone = false;
  var R0 = 150, CELL = 16, LAM = 9, DS = 1.5, FCUT = DS * Math.log(1 + Math.exp(-4)), restX = 0, restY = 0;
  var Px = 0, Py = 0, Vx = 0, Vy = 0, tx = 0, ty = 0, om = 12;
  var ux = 1, uy = 0, q = 0, qv = 0;           // étirement (repère de la vitesse)
  var grow = 0, armed = false, armAt = 0, visible = false, live = false, dirty = true;
  var prevBox = null, lastPX = -1, lastPY = -1, lastMove = -1e9, lastSY = -1, rect = null, inside = false;
  var track = false, drawn = { px: NaN, py: NaN, q: NaN, g: NaN, cap: NaN };
  var TXT = [], cap = .42;                     // boîtes de texte du hero ; opacité max. de l'or
  var LSTY = [];                               // style par niveau entier (fine / maîtresse)
  var gTab = null, gMax = 0, HMIN = .7;        // g(ρ') tabulé au pixel ; minimum des lobes
  var colBuf = new Float64Array(0), vBuf = new Float32Array(0);

  function styleOf(lv) {
    if (lv >= 0 && lv < F.nl) return LSTY[lv];
    var ref = LSTY.indexOf(1); // hors des 22 courbes : une maîtresse tous les 5 niveaux, comme la carte
    return ref >= 0 && (((lv - ref) % 5) + 5) % 5 === 0 ? 1 : 0;
  }

  // lobes : h(θ) = 1 + Σ a_k sin(kθ + φ_k) + e cos(θ − θe), à partir de cos θ, sin θ
  function lobes(c1, s1) {
    var c2 = c1 * c1 - s1 * s1, s2 = 2 * c1 * s1, c3 = c2 * c1 - s2 * s1, s3 = s2 * c1 + c2 * s1,
      c4 = c2 * c2 - s2 * s2, s4 = 2 * c2 * s2, c5 = c4 * c1 - s4 * s1, s5 = s4 * c1 + c4 * s1;
    return 1 + s2 * HA[2] + c2 * HB[2] + s3 * HA[3] + c3 * HB[3] + s4 * HA[4] + c4 * HB[4] + s5 * HA[5] + c5 * HB[5] + c1 * EC + s1 * ES;
  }

  // g(ρ') : nombre de cernes (fractionnaire) à la distance ρ' de la moelle
  function buildRings() {
    var n = ceil(R0 * 1.25 + 12 * LAM + 40), tab = new Float32Array(n), r = 0, k = 0, edge = RW[0] * LAM;
    for (var p = 0; p < n; p++) {
      while (p >= edge && k < RW.length - 1) { r = edge; k++; edge = r + RW[k] * LAM; }
      tab[p] = k + (p - r) / (edge - r);
    }
    gTab = tab; gMax = n - 1;
    HMIN = 9;
    for (var a = 0; a < 180; a++) HMIN = Math.min(HMIN, lobes(Math.cos(a * PI2 / 180), Math.sin(a * PI2 / 180)));
  }
  function g(rp) {
    if (rp >= gMax) return gTab[gMax] + (rp - gMax) / LAM;
    var p = rp | 0; return gTab[p] + (gTab[p + 1] - gTab[p]) * (rp - p);
  }
  function ginv(v) { // plus petit ρ' tel que g(ρ') ≥ v
    if (v >= gTab[gMax]) return gMax + (v - gTab[gMax]) * LAM;
    var lo = 0, hi = gMax;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (gTab[m] < v) lo = m; else hi = m; }
    return hi;
  }

  // ordonnées des courbes à l'abscisse SVG x → out[off..off+nl)
  function column(x, out, off) {
    var c = (x - F.x0) / F.dx, j = floor(c);
    if (j < 0) j = 0; else if (j > F.nk - 2) j = F.nk - 2;
    var f = c - j, nk = F.nk, Y = F.Y;
    for (var l = 0; l < F.nl; l++) out[off + l] = Y[l * nk + j] * (1 - f) + Y[l * nk + j + 1] * f;
  }
  function Tcol(y, col, off) {
    var nl = F.nl;
    if (y <= col[off]) return (y - col[off]) / F.gap;
    if (y >= col[off + nl - 1]) return nl - 1 + (y - col[off + nl - 1]) / F.gap;
    var lo = 0, hi = nl - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (col[off + mid] <= y) lo = mid; else hi = mid; }
    return lo + (y - col[off + lo]) / (col[off + lo + 1] - col[off + lo]);
  }

  var tmpCol = new Float64Array(64);
  function Tat(u, v) { column((u - ox) / sc, tmpCol, 0); return Tcol((v - oy) / sc, tmpCol, 0); }

  /* ---------- mise en place / redimensionnement ---------- */
  // lignes de texte du hero (pas les boîtes pleine largeur), dans le repère du hero
  function measureText() {
    TXT = [];
    var hr = hero.getBoundingClientRect(), tl = hero.querySelectorAll(".wrap > *"), rg = D.createRange();
    for (var t = 0; t < tl.length; t++) {
      rg.selectNodeContents(tl[t]);
      var rs = rg.getClientRects();
      for (var j = 0; j < rs.length; j++) {
        var b = rs[j];
        if (b.width > 1 && b.height > 1) TXT.push([b.left - hr.left, b.top - hr.top, b.right - hr.left, b.bottom - hr.top]);
      }
    }
  }
  function restPoint() {
    var hr = hero.getBoundingClientRect(), gs = hero.querySelector("h1 span, h1 em");
    if (gs && gs.getClientRects().length) {
      var r = gs.getBoundingClientRect();
      restX = r.left + r.width / 2 - hr.left; restY = r.top + r.height / 2 - hr.top; return;
    }
    // Sinon : le point du hero le plus loin du texte (lignes réellement occupées), vers 80 % / 50 %
    var best = -1e9;
    for (var i = 0; i <= 24; i++) for (var j = 0; j <= 12; j++) {
      var x = Wc * .45 + (Wc - (phone ? .35 : .1) * R0 - Wc * .45) * i / 24, y = Hc * (.28 + .5 * j / 12), d = 1e9;
      for (var k = 0; k < TXT.length; k++) {
        var t = TXT[k], nx = L.clamp(x, t[0], t[2]) - x, ny = L.clamp(y, t[1], t[3]) - y;
        d = Math.min(d, sqrt(nx * nx + ny * ny));
      }
      var sc0 = Math.min(d, R0 * 1.1) - R0 * (.5 * abs(x / Wc - .8) + .3 * abs(y / Hc - .5));
      if (sc0 > best) { best = sc0; restX = x; restY = y; }
    }
  }

  function layout() {
    var w = hero.clientWidth, h = hero.clientHeight;
    if (!w || !h) return false;
    Wc = w; Hc = h; phone = w < 640;
    R0 = phone ? 104 : 150; CELL = phone ? 8 : 16;
    dpr = Math.min(W.devicePixelRatio || 1, 1.5);
    sc = Math.max(w / F.vw, h / F.vh);
    // cernes ≥ 2,6× plus serrés que les courbes du terrain à cette échelle : la moelle reste au sommet
    LAM = L.clamp(F.gap * sc / 2.6, 6, 9); ox = (w - F.vw * sc) / 2 - F.vx * sc; oy = (h - F.vh * sc) / 2 - F.vy * sc;
    var bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    cv.width = bw; cv.height = bh; rest.width = bw; rest.height = bh;
    // repos : les courbes d'origine, mêmes traits que le SVG
    rctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * ox, dpr * oy);
    rctx.lineJoin = "miter"; rctx.lineCap = "butt";
    F.lines.forEach(function (ln) {
      rctx.beginPath(); rctx.moveTo(ln.xs[0], ln.ys[0]);
      for (var k = 1; k < ln.xs.length; k++) rctx.lineTo(ln.xs[k], ln.ys[k]);
      rctx.globalAlpha = ln.op; rctx.strokeStyle = ln.col; rctx.lineWidth = ln.sw; rctx.stroke();
    });
    rctx.globalAlpha = 1;
    buildRings();
    measureText();
    restPoint();
    if (!track || !inside) { Px = tx = restX; Py = ty = restY; Vx = Vy = 0; }
    cap = capTarget();
    prevBox = null; dirty = true;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, bw, bh); ctx.drawImage(rest, 0, 0);
    return true;
  }

  /* ---------- champ et carrés marchants ---------- */
  // H = T + cône : c = G0 − g(ρ'), relevé doux f = d·ln(1 + e^(c/d)) − f(−4d), nul au-delà.
  // Le long de chaque rayon, H décroît strictement dans la souche (pente 1 cerne / λ > pente du terrain) :
  // les cernes se referment tous, puis s'ouvrent en courbes de niveau, sans bourrelet ni boucle parasite.
  var G0, TP, OFF = 0, Rc2, sPres, stretchB, stretchF, pathMinor, pathIdx;

  function evalGrid(gx, gy, cell, nx, ny) {
    var nl = F.nl, st = nx + 1, i, j, cut = -4 * DS;
    if (colBuf.length < st * nl) colBuf = new Float64Array(st * nl * 1.5 | 0);
    if (vBuf.length < st * (ny + 1)) vBuf = new Float32Array(st * (ny + 1) * 1.5 | 0);
    for (i = 0; i <= nx; i++) column((gx + i * cell - ox) / sc, colBuf, i * nl);
    for (j = 0; j <= ny; j++) {
      var v = gy + j * cell, ys = (v - oy) / sc, dy = v - Py;
      for (i = 0; i <= nx; i++) {
        var dx = gx + i * cell - Px, T = Tcol(ys, colBuf, i * nl), r2 = dx * dx + dy * dy;
        if (r2 < Rc2) {
          var a = dx * ux + dy * uy, b = dy * ux - dx * uy;
          a = a / (a < 0 ? stretchB : stretchF);
          var rho = sqrt(a * a + b * b), r = sqrt(r2);
          var c = G0 - g(r > 1e-6 ? rho * lobes(dx / r, dy / r) : 0);
          if (c > cut) {
            // cœur à plat (niveau du terrain sous la moelle), puis relevé en cône
            var bl = c >= 3 * DS ? 1 : (c - cut) / (7 * DS); bl = bl * bl * (3 - 2 * bl);
            T += bl * (TP + OFF - T) + (c > 12 * DS ? c - FCUT : DS * Math.log(1 + exp(c / DS)) - FCUT);
          }
        }
        vBuf[j * st + i] = T;
      }
    }
  }

  function seg(p, x1, y1, x2, y2) { p.moveTo(x1, y1); p.lineTo(x2, y2); }
  function march(gx, gy, cell, nx, ny, skip) {
    var st = nx + 1;
    for (var j = 0; j < ny; j++) {
      for (var i = 0; i < nx; i++) {
        if (skip && i >= skip[0] && i < skip[1] && j >= skip[2] && j < skip[3]) continue;
        var k = j * st + i, v0 = vBuf[k], v1 = vBuf[k + 1], v2 = vBuf[k + st + 1], v3 = vBuf[k + st];
        var mn = Math.min(v0, v1, v2, v3), mx = Math.max(v0, v1, v2, v3);
        var lo = floor(mn) + 1, hi = floor(mx);
        if (mn === floor(mn)) lo = mn; // niveau pile sur un coin
        if (lo > hi) continue;
        var x = gx + i * cell, y = gy + j * cell, xr = x + cell, yb = y + cell;
        for (var lv = lo; lv <= hi; lv++) {
          var c = (v0 > lv ? 1 : 0) | (v1 > lv ? 2 : 0) | (v2 > lv ? 4 : 0) | (v3 > lv ? 8 : 0);
          if (c === 0 || c === 15) continue;
          var p = styleOf(lv) ? pathIdx : pathMinor;
          // points sur les arêtes : haut, droite, bas, gauche
          var e0x = x + cell * (lv - v0) / (v1 - v0), e1y = y + cell * (lv - v1) / (v2 - v1),
            e2x = x + cell * (lv - v3) / (v2 - v3), e3y = y + cell * (lv - v0) / (v3 - v0);
          switch (c) {
            case 1: case 14: seg(p, x, e3y, e0x, y); break;
            case 2: case 13: seg(p, e0x, y, xr, e1y); break;
            case 3: case 12: seg(p, x, e3y, xr, e1y); break;
            case 4: case 11: seg(p, xr, e1y, e2x, yb); break;
            case 6: case 9: seg(p, e0x, y, e2x, yb); break;
            case 7: case 8: seg(p, x, e3y, e2x, yb); break;
            default: // selles (5, 10) : tranchées par la moyenne au centre
              if ((c === 5) === ((v0 + v1 + v2 + v3) / 4 > lv)) { seg(p, e0x, y, xr, e1y); seg(p, e2x, yb, x, e3y); }
              else { seg(p, x, e3y, e0x, y); seg(p, xr, e1y, e2x, yb); }
          }
        }
      }
    }
  }

  function capTarget() {
    var r = R0 * .75 + 6; // au-delà, le dégradé est déjà sous .3
    for (var k = 0; k < TXT.length; k++) {
      var b = TXT[k], nx = L.clamp(Px, b[0], b[2]) - Px, ny = L.clamp(Py, b[1], b[3]) - Py;
      if (nx * nx + ny * ny < r * r) return .3;
    }
    return .42;
  }
  function smooth(a, b, x) { x = L.clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
  // dégradé radial crème → or : les cernes s'allument vers la moelle, les courbes lointaines restent d'origine
  // Fondu enchaîné au bord du disque (m : 1 → 0 sur la dernière couronne) : les courbes recalculées
  // rejoignent celles du repos sans couture, même là où l'interpolation s'écarte de ~1 px du tracé exact.
  var STOPS = [];
  function stops(Rc) {
    var fs = 1 - Math.max(28, .24 * Rc) / Rc; STOPS.length = 0;
    for (var k = 0; k <= 10; k++) STOPS.push(fs * k / 10);
    for (k = 1; k <= 6; k++) STOPS.push(fs + (1 - fs) * k / 6);
    return fs;
  }
  var FS = .8;
  function mask(f) { return 1 - smooth(FS, 1, f); }
  function grad(r0, base, top) {
    var Rc = sqrt(Rc2), gr = ctx.createRadialGradient(Px, Py, 0, Px, Py, Rc);
    for (var k = 0; k < STOPS.length; k++) {
      var f = STOPS[k], w = sPres * (1 - smooth(.3 * r0, 1.2 * r0, f * Rc)), u = smooth(0, .45, w), a = (base + (top * (.4 + .6 * w) - base) * u) * mask(f);
      gr.addColorStop(f, "rgba(" + Math.round(CREAM[0] + (GOLD[0] - CREAM[0]) * u) + "," + Math.round(CREAM[1] + (GOLD[1] - CREAM[1]) * u) + "," +
        Math.round(CREAM[2] + (GOLD[2] - CREAM[2]) * u) + "," + a.toFixed(4) + ")");
    }
    return gr;
  }

  // position écran d'un point (ρ', θ) de l'espace des cernes
  function ringToScreen(rp, th, out) {
    var c1 = Math.cos(th), s1 = Math.sin(th), a = c1 * ux + s1 * uy, b = s1 * ux - c1 * uy;
    a = a / (a < 0 ? stretchB : stretchF);
    var r = rp / (lobes(c1, s1) * sqrt(a * a + b * b));
    out[0] = Px + c1 * r; out[1] = Py + s1 * r;
  }

  var pt = [0, 0];
  function draw() {
    var r0 = R0 * L.ease.out3(grow), pad = 3;
    sPres = L.ease.out3(Math.min(1, grow * 1.5));
    stretchB = Math.max(.6, 1 + 1.5 * q); stretchF = Math.max(.75, 1 + .35 * q);
    G0 = g(r0);
    var Rc = r0 > 1 ? ginv(G0 + 4 * DS) * Math.max(stretchB, 1) / HMIN + 2 : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // boîte sale : ancienne ∪ nouvelle, recollée depuis le repos
    var nb = Rc ? [Math.max(0, Px - Rc), Math.max(0, Py - Rc), Math.min(Wc, Px + Rc), Math.min(Hc, Py + Rc)] : null, ub = prevBox;
    if (nb && (nb[2] <= nb[0] || nb[3] <= nb[1])) nb = null;
    if (nb) ub = ub ? [Math.min(ub[0], nb[0]), Math.min(ub[1], nb[1]), Math.max(ub[2], nb[2]), Math.max(ub[3], nb[3])] : nb;
    if (ub) {
      var x0 = Math.max(0, floor(ub[0] * dpr) - pad), y0 = Math.max(0, floor(ub[1] * dpr) - pad),
        x1 = Math.min(cv.width, ceil(ub[2] * dpr) + pad), y1 = Math.min(cv.height, ceil(ub[3] * dpr) + pad);
      if (x1 > x0 && y1 > y0) { ctx.clearRect(x0, y0, x1 - x0, y1 - y0); ctx.drawImage(rest, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0); }
    }
    prevBox = nb;
    if (!nb) return;
    Rc2 = Rc * Rc; TP = Tat(Px, Py);
    // la moelle tombe au milieu d'un cerne (1er cerne ≈ ½ largeur, jamais un losange de 2 px) ;
    // décaler d'un niveau entier redonne les mêmes courbes : pas de saut quand la fraction boucle
    var pk = TP + (G0 > 12 * DS ? G0 : DS * Math.log(1 + exp(G0 / DS))) - FCUT;
    OFF = .5 - (pk - floor(pk));

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // on retire le repos dans le disque (plein au centre, en fondu sur la couronne extérieure)
    FS = stops(Rc);
    var er = ctx.createRadialGradient(Px, Py, 0, Px, Py, Rc);
    for (var e = 0; e < STOPS.length; e++) er.addColorStop(STOPS[e], "rgba(0,0,0," + mask(STOPS[e]).toFixed(4) + ")");
    ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = er;
    ctx.fillRect(nb[0], nb[1], nb[2] - nb[0], nb[3] - nb[1]);
    ctx.globalCompositeOperation = "source-over";
    pathMinor = new Path2D(); pathIdx = new Path2D();
    // grille grossière alignée sur le canevas (les courbes lointaines ne frémissent pas), limitée au hero
    var gx = floor(nb[0] / CELL) * CELL, gy = floor(nb[1] / CELL) * CELL,
      nx = ceil((nb[2] - gx) / CELL), ny = ceil((nb[3] - gy) / CELL);
    var fi0 = floor((Px - 44 - gx) / CELL), fi1 = ceil((Px + 44 - gx) / CELL), fj0 = floor((Py - 44 - gy) / CELL), fj1 = ceil((Py + 44 - gy) / CELL);
    evalGrid(gx, gy, CELL, nx, ny);
    march(gx, gy, CELL, nx, ny, [fi0, fi1, fj0, fj1]);
    // grille fine (÷ 4) autour de la moelle : les premiers cernes restent ronds
    var sub = CELL / 4, fgx = gx + fi0 * CELL, fgy = gy + fj0 * CELL, fnx = (fi1 - fi0) * 4, fny = (fj1 - fj0) * 4;
    evalGrid(fgx, fgy, sub, fnx, fny);
    march(fgx, fgy, sub, fnx, fny, null);

    var mi = LSTY.indexOf(0), xi = LSTY.indexOf(1), mn = F.lines[mi < 0 ? 0 : mi], ix = F.lines[xi < 0 ? 0 : xi];
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.lineWidth = mn.sw * sc; ctx.strokeStyle = grad(r0, mn.op, cap); ctx.stroke(pathMinor);
    ctx.lineWidth = ix.sw * sc; ctx.strokeStyle = grad(r0, ix.op, cap + .02); ctx.stroke(pathIdx);
    // téléphone : le cadrage « cover » rend les traits très fins (≈ .5 px) ; les cernes dorés reçoivent
    // un 2e passage à 1 px (alpha nul hors de la souche : les courbes lointaines restent identiques)
    if (mn.sw * sc < .8) { ctx.lineWidth = 1; ctx.strokeStyle = grad(r0, 0, cap * .55); ctx.stroke(pathMinor); ctx.stroke(pathIdx); }

    // gerces de séchage : deux fentes radiales qui s'ouvrent à la fin, plus larges vers l'écorce
    var open = smooth(.5, 1, grow) * 5;
    if (open > .05) {
      var ck = new Path2D();
      for (var c = 0; c < 2; c++) {
        var th0 = CK[c], ra = r0 * (c ? .42 : .22), rb = r0 * (c ? 1 : 1.1), n = Math.max(3, ceil((rb - ra) / 6)), L1 = [], R1 = [];
        for (var k = 0; k <= n; k++) {
          var t = k / n, th = th0 + CKJ[(c * 31 + k) & 63] * .018, hw = .5 * open * Math.pow(t, 1.4) / Math.max(20, ra + (rb - ra) * t);
          ringToScreen(ra + (rb - ra) * t, th - hw, pt); L1.push(pt[0], pt[1]);
          ringToScreen(ra + (rb - ra) * t, th + hw, pt); R1.push(pt[0], pt[1]);
        }
        ck.moveTo(L1[0], L1[1]);
        for (k = 2; k < L1.length; k += 2) ck.lineTo(L1[k], L1[k + 1]);
        for (k = R1.length - 2; k >= 0; k -= 2) ck.lineTo(R1[k], R1[k + 1]);
        ck.closePath();
      }
      ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = "#000"; ctx.fill(ck);
      ctx.globalCompositeOperation = "source-over";
    }
    // moelle (effacée sous une ligne de texte)
    var under = 0;
    for (k = 0; k < TXT.length; k++) { var tb = TXT[k]; if (Px > tb[0] - 4 && Px < tb[2] + 4 && Py > tb[1] - 4 && Py < tb[3] + 4) under = 1; }
    if (!under) {
      ctx.fillStyle = "rgba(217,168,100," + (.9 * sPres).toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(Px, Py, 1.5, 0, PI2); ctx.fill();
    }
    // lisibilité : sous chaque ligne de texte touchée, les traits perdent 65 % de leur opacité
    // (gomme adoucie par l'ombre portée d'un rectangle hors champ : pas de bord net sur les cernes)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath(); ctx.rect(floor(nb[0] * dpr), floor(nb[1] * dpr), ceil((nb[2] - nb[0]) * dpr), ceil((nb[3] - nb[1]) * dpr)); ctx.clip(); // jamais hors de la boîte recollée
    ctx.globalCompositeOperation = "destination-out";
    ctx.shadowColor = "rgba(0,0,0,.65)"; ctx.shadowBlur = 8 * dpr; ctx.shadowOffsetX = 1e4; ctx.fillStyle = "#000";
    for (k = 0; k < TXT.length; k++) {
      tb = TXT[k];
      if (tb[2] + 20 < nb[0] || tb[0] - 20 > nb[2] || tb[3] + 20 < nb[1] || tb[1] - 20 > nb[3]) continue;
      ctx.fillRect((tb[0] - 8) * dpr - 1e4, (tb[1] - 6) * dpr, (tb[2] - tb[0] + 16) * dpr, (tb[3] - tb[1] + 12) * dpr);
    }
    ctx.restore();
  }

  /* ---------- dynamique ---------- */
  function step(dt, now) {
    if (!live || !visible) return false;
    var p = L.pointer, sy = W.scrollY;
    track = !!p.fine && !L.reduce && !phone;
    if (L.reduce && grow < 1) { grow = 1; Px = tx = restX; Py = ty = restY; Vx = Vy = 0; q = qv = 0; dirty = true; }
    if (track) {
      var moved = p.x !== lastPX || p.y !== lastPY;
      if (moved) { lastPX = p.x; lastPY = p.y; lastMove = now; }
      if (moved || sy !== lastSY || !rect) { rect = hero.getBoundingClientRect(); lastSY = sy; }
      var was = inside;
      inside = p.active && p.x >= rect.left && p.x < rect.right && p.y >= rect.top && p.y < rect.bottom;
      if (inside) { tx = p.x - rect.left; ty = p.y - rect.top; om = 12; if (!armed || now < armAt) { armed = true; armAt = now; } }
      else { tx = restX; ty = restY; if (was) om = 7.5; }
    } else if (inside) { inside = false; tx = restX; ty = restY; om = 7.5; }
    if (L.reduce) { Px = tx; Py = ty; Vx = Vy = 0; q = qv = 0; }
    // croissance
    if (armed && now >= armAt && grow < 1) { grow = Math.min(1, grow + dt / .9); dirty = true; }
    // moelle : ressort critique (solution exacte)
    var ex = exp(-om * dt), dx = Px - tx, dy = Py - ty;
    var nPx = tx + (dx + (Vx + om * dx) * dt) * ex, nPy = ty + (dy + (Vy + om * dy) * dt) * ex;
    Vx = (Vx - om * (Vx + om * dx) * dt) * ex; Vy = (Vy - om * (Vy + om * dy) * dt) * ex;
    Px = nPx; Py = nPy;
    var sp = sqrt(Vx * Vx + Vy * Vy);
    if (sp > 40) { var k = 1 - exp(-14 * dt); ux += (Vx / sp - ux) * k; uy += (Vy / sp - uy) * k; var un = sqrt(ux * ux + uy * uy) || 1; ux /= un; uy /= un; }
    // étirement : ressort sous-amorti (ω 10, ζ .8) vers κ|v|
    var qt = Math.min(.9, sp * .0006), sub = Math.max(1, ceil(dt / .004)), h = dt / sub;
    for (var s = 0; s < sub; s++) { qv += (100 * (qt - q) - 16 * qv) * h; q += qv * h; }
    if (q < -.3) { q = -.3; qv = 0; }
    // contraste : or ≤ .3 (× .9) dès que la souche touche une boîte de texte → .lead ≥ 4,5:1 sur un trait
    var ct = capTarget(); cap = abs(cap - ct) < .002 ? ct : L.damp(cap, ct, 8, dt);
    var settled = cap === ct && grow >= 1 && abs(Px - tx) < .05 && abs(Py - ty) < .05 && sp < .5 && abs(q) < .002 && abs(qv) < .01;
    if (settled) { Px = tx; Py = ty; Vx = Vy = 0; q = qv = 0; }
    if (dirty || abs(Px - drawn.px) > .01 || abs(Py - drawn.py) > .01 || abs(q - drawn.q) > 1e-4 || grow !== drawn.g || cap !== drawn.cap) {
      if (armed && now >= armAt || grow > 0) draw();
      drawn.px = Px; drawn.py = Py; drawn.q = q; drawn.g = grow; drawn.cap = cap; dirty = false;
    }
    var recent = track && inside && now - lastMove < 1200;
    if (!armed || now < armAt) return recent; // en attente de la pousse : la minuterie réveillera la boucle
    return !settled || recent;
  }
  var task = { update: step };
  /* ---------- démarrage ---------- */
  function start(txt) {
    F = parse(txt);
    if (!F) return;
    for (var k = 0; k < F.nl; k++) LSTY.push(F.lines[k].op >= .08 || F.lines[k].sw > 1.2 ? 1 : 0);
    cv = D.createElement("canvas"); cv.className = "fx-topo-stump-canvas"; cv.setAttribute("aria-hidden", "true");
    ctx = cv.getContext("2d"); rest = D.createElement("canvas"); rctx = rest.getContext("2d");
    if (!ctx || !rctx) return;
    bg.appendChild(cv);
    if (!layout()) { bg.removeChild(cv); return; }
    live = true;
    bg.classList.add("fx-topo-stump-live"); // même tâche que le 1er dessin : bascule invisible
    // pousse ~400 ms après l'entrée du h1 (fin de « rise » ≈ 0,95 s après le chargement)
    var t0 = (W.performance && performance.now()) || 0, at = Math.max(t0 + 120, 1350);
    if (L.reduce) { grow = 1; armed = true; armAt = 0; }
    else { setTimeout(function () { if (!armed) { armed = true; armAt = 0; } L.fx.wake(); }, at - t0); }
    L.onVisible(hero, function (v) {
      visible = v;
      if (v) { dirty = true; L.fx.add(task); } else L.fx.remove(task);
    });
    // l'entrée « rise » du texte terminée : on remesure les lignes (le point de repos, lui, ne bouge plus)
    var ta = 0;
    hero.addEventListener("animationend", function () {
      clearTimeout(ta); ta = setTimeout(function () { measureText(); dirty = true; if (visible) L.fx.wake(); }, 60);
    });
    // redimensionnement : reconstruit après 200 ms de calme, seulement si le hero a changé
    var tm = 0, rebuild = function () {
      clearTimeout(tm);
      tm = setTimeout(function () {
        if (hero.clientWidth === Wc && hero.clientHeight === Hc && Math.min(W.devicePixelRatio || 1, 1.5) === dpr) return;
        rect = null; if (layout()) { dirty = true; drawn.g = -1; if (visible) { L.fx.add(task); L.fx.wake(); } }
      }, 200);
    };
    if (W.ResizeObserver) new ResizeObserver(rebuild).observe(hero); else W.addEventListener("resize", rebuild);
  }
  fetch(mUrl[2]).then(function (r) { return r.ok ? r.text() : null; }).then(function (t) { if (t) start(t); }).catch(function () {});
})();
