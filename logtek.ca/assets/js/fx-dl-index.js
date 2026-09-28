/* Logtek — fx-dl-index : « Indexage 90 ↔ 97 DL » (page Pièces seulement : chaines.html, en/chains.html)
   La vraie photo du produit phare s'indexe maillon par maillon :
     1re vue    la bande photo, pavée sans joint, entre par la droite (montée en régime puis roue libre),
                compte ses maillons d'entraînement et s'arrête net sous le cran bronze, qui s'illumine;
                la cote DAO sous la photo se trace en même temps (0 → 90 DL · ≈ 1,85 m).
     Variante   90 ↔ 97 : un maillon à la fois (60 ms + 25 ms d'arrêt), le tambour des unités suit,
                le dernier clic retourne les 2 chiffres du code produit (palette), la cote s'allonge.
     Soumission la bande fait un tour complet (multiple de la période, même image à l'arrivée) et un vrai
                maillon, découpé dans la photo, vole jusqu'à la barre de soumission; la barre entre par le bas
                et le compteur bondit. Événement « ltk:lap » émis sur le bouton (pour fx-guide-bar).
   Repos : aucune image par seconde (tâche retirée de LTK.fx). Hors écran : le canevas ne dessine rien.
   Moins d'animation : photo d'origine, cran et cote fixes (libellé changé d'un coup), textes comme avant.
   Sans JS : rien n'est injecté. Tout le décor est aria-hidden; [data-dl-out] et [data-sku-out] gardent
   un vrai texte (copie .sr) mis à jour par main.js.

   PRÉPARATION (mesurée sur la source 950 × 150, AVIF et JPEG identiques à 0,03 px près) :
   - autocorrélation du profil de noirceur des colonnes : pics à 76,48 (0,47), 152,53 (0,88), 304,95 (0,96)
     → période d'une séquence complète de gouges P = 304,95 px = 4 maillons d'entraînement,
       pas d'un maillon p = P / 4 = 76,24 px (ajustement parabolique sous-pixel);
   - fenêtre sans joint [X0, X0 + P] avec X0 = 423 : écart résiduel au raccord (0,1 ; −0,1) px → < 0,5 px,
     donc bande pavée active (sinon : photo fixe, seulement le compteur et le cran);
   - interstice entre deux maillons latéraux : x = 129,9 + k·p (le cran pointe toujours un interstice);
   - chaîne visible entre y = 32 et y = 122; gouges à partir de y ≈ 37 (pointe du cran à y = 29). */
(function () {
  "use strict";
  var L = window.LTK;
  if (!L || !L.fx) return;

  var card = document.querySelector(".product.featured");
  var vis = card && card.querySelector(".product-visual.photo");
  var img = vis && vis.querySelector("img");
  if (!img) return;

  /* ---------- constantes mesurées ---------- */
  var SRC_W = 950, SRC_H = 150;
  var PER = 304.95, PER_DL = 4, PITCH = PER / PER_DL, X0 = 423, SEAM_ERR = 0.14;
  var GAP0 = 129.9, TIP_Y = 29, CROP_Y0 = 32, CROP_Y1 = 122;
  var INCH_M = 0.0254, DL_IN = 0.404;       // longueur = 2 · N · .404″
  var DIM_MAX = 0.8, DIM_REF = 97;          // la cote de 97 DL occupe 80 % de la photo

  var body = document.body;
  var en = body.getAttribute("data-lang") === "en";
  var nf = new Intl.NumberFormat(en ? "en-CA" : "fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var fs = card.querySelector(".variants");
  var dd = card.querySelector("[data-dl-out]");
  var skuOut = card.querySelector("[data-sku-out]");
  var addBtn = card.querySelector("[data-add]");
  var bar = document.getElementById("quote-bar");
  var countEl = document.getElementById("quote-count");
  var reduce = !!L.reduce;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mod(a, n) { return ((a % n) + n) % n; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function checkedN() { var v = fs && fs.querySelector("input:checked"); return v ? (+v.getAttribute("data-dl") || 90) : 90; }
  function label(n) { return n + " DL · ≈ " + nf.format(2 * n * DL_IN * INCH_M) + " m"; }
  // cubic-bezier(x1, y1, x2, y2) par dichotomie (robuste pour .3, 0, .1, 1)
  function bez(x1, y1, x2, y2) {
    function c(a, b, t) { var u = 1 - t; return 3 * a * u * u * t + 3 * b * u * t * t + t * t * t; }
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var lo = 0, hi = 1, t = x;
      for (var i = 0; i < 22; i++) { t = (lo + hi) / 2; if (c(x1, x2, t) < x) lo = t; else hi = t; }
      return c(y1, y2, t);
    };
  }
  var EASE_STEP = bez(.3, 0, .1, 1);
  // montée en régime puis roue libre : vitesse ∝ t(1 − t)², arrivée à vitesse nulle, sans dépassement
  function spin(t) { return t * t * (6 - 8 * t + 3 * t * t); }

  /* ---------- état ---------- */
  var T = checkedN();                  // longueur visée (90 | 97)
  var count = reduce ? T : 0;          // valeur affichée par les tambours (fractionnaire en mouvement)
  var skuShown = T;                    // chiffres affichés dans le code produit
  var o = 0, oDrawn = null, oLast = 0; // décalage de la bande, en maillons
  var motion = null, lapQueued = false, introState = 0; // 0 attente, 1 en cours, 2 fait
  var running = false, onScreen = false;
  var useCanvas = !reduce && SEAM_ERR <= .5;

  vis.classList.add("fx-dl-index");
  if (reduce) vis.classList.add("fx-dl-index-static");

  /* ---------- décor injecté (aria-hidden) ---------- */
  var cv = el("canvas", "fx-dl-index-run"); cv.setAttribute("aria-hidden", "true");
  var ctx = cv.getContext && cv.getContext("2d");
  if (!ctx) useCanvas = false;
  var notch = el("span", "fx-dl-index-notch",
    '<span class="fx-dl-index-read"><span class="fx-dl-index-odo"></span><small>DL</small></span>' +
    '<i class="fx-dl-index-needle"></i><i class="fx-dl-index-tip"></i><i class="fx-dl-index-glint"></i>');
  notch.setAttribute("aria-hidden", "true");
  var dim = el("span", "fx-dl-index-dim",
    '<i class="fx-dl-index-line"></i><i class="fx-dl-index-end fx-dl-index-l"></i><i class="fx-dl-index-end fx-dl-index-r"></i>' +
    '<b class="fx-dl-index-lab"></b>');
  dim.setAttribute("aria-hidden", "true");
  var dimLine = dim.querySelector(".fx-dl-index-line"), dimL = dim.querySelector(".fx-dl-index-l"), dimR = dim.querySelector(".fx-dl-index-r");
  var dimLab = dim.querySelector(".fx-dl-index-lab");
  var glint = notch.querySelector(".fx-dl-index-glint");
  var chip = vis.querySelector(".chip");
  vis.insertBefore(cv, chip || null); vis.insertBefore(notch, chip || null); vis.insertBefore(dim, chip || null);
  dimLab.textContent = label(T);

  /* ---------- tambours (odomètre) ---------- */
  var ROLL = "<i>0</i><i>1</i><i>2</i><i>3</i><i>4</i><i>5</i><i>6</i><i>7</i><i>8</i><i>9</i><i>0</i>";
  function buildOdo(host) {
    host.innerHTML = '<span class="fx-dl-index-drum"><span class="fx-dl-index-roll">' + ROLL + '</span></span>' +
      '<span class="fx-dl-index-drum"><span class="fx-dl-index-roll">' + ROLL + "</span></span>";
    var r = host.querySelectorAll(".fx-dl-index-roll");
    return { t: r[0], u: r[1], tv: null, uv: null };
  }
  var odos = [buildOdo(notch.querySelector(".fx-dl-index-odo"))];
  var ddOdo = null;
  function buildDd() {
    if (!dd || reduce) return;
    var txt = dd.textContent.trim();
    dd.textContent = "";
    var sr = el("span", "sr"); sr.textContent = txt; dd.appendChild(sr);
    var host = el("span", "fx-dl-index-odo fx-dl-index-big"); host.setAttribute("aria-hidden", "true");
    dd.appendChild(host);
    if (ddOdo) odos.splice(odos.indexOf(ddOdo), 1);
    ddOdo = buildOdo(host); odos.push(ddOdo);
    ddOdo.tv = ddOdo.uv = null;
  }
  // Odomètre vrai : les unités roulent en continu, la dizaine ne tourne que pendant le passage 9 → 0
  function setOdo(od, c) {
    c = clamp(c, 0, 99.999);
    var u = mod(c, 10), tn = Math.floor(c / 10) + clamp(u - 9, 0, 1);
    if (od.uv !== u) { od.uv = u; od.u.style.transform = "translate3d(0," + (-u * 100 / 11).toFixed(3) + "%,0)"; }
    tn = mod(tn, 10);
    if (od.tv !== tn) { od.tv = tn; od.t.style.transform = "translate3d(0," + (-tn * 100 / 11).toFixed(3) + "%,0)"; }
  }
  function renderCount() { for (var i = 0; i < odos.length; i++) setOdo(odos[i], count); renderDim(); }

  /* ---------- code produit : palette sur les 2 chiffres ---------- */
  var sku = null;
  function buildSku() {
    if (!skuOut || reduce) return;
    var txt = skuOut.textContent.trim(), m = /^(.*?)(\d\d)(\D*)$/.exec(txt);
    if (!m) { sku = null; return; }
    skuOut.textContent = "";
    var sr = el("span", "sr"); sr.textContent = txt; skuOut.appendChild(sr);
    var v = el("span", "fx-dl-index-skuv"); v.setAttribute("aria-hidden", "true");
    var flap = el("span", "fx-dl-index-flap"), cur = el("span", "fx-dl-index-fcur");
    cur.textContent = String(skuShown); flap.appendChild(cur);
    v.appendChild(document.createTextNode(m[1])); v.appendChild(flap); v.appendChild(document.createTextNode(m[3]));
    skuOut.appendChild(v);
    sku = { flap: flap, cur: cur };
  }
  function flipSku(to) {
    if (!sku || skuShown === to) { skuShown = to; return; }
    var from = String(skuShown); skuShown = to; to = String(to);
    var f = sku.flap;
    [].slice.call(f.querySelectorAll(".fx-dl-index-leaf")).forEach(function (n) { n.remove(); });
    sku.cur.textContent = to;
    if (!f.animate) return;
    function leaf(txt, cls) { var s = el("span", "fx-dl-index-leaf " + cls); s.textContent = txt; f.appendChild(s); return s; }
    var oldBot = leaf(from, "fx-dl-index-bot"), oldTop = leaf(from, "fx-dl-index-top"), newBot = leaf(to, "fx-dl-index-bot fx-dl-index-nb");
    f.classList.add("fx-dl-index-flipping");
    oldTop.animate([{ transform: "perspective(40px) rotateX(0deg)", filter: "brightness(1)" }, { transform: "perspective(40px) rotateX(-90deg)", filter: "brightness(.88)" }],
      { duration: 80, easing: "cubic-bezier(.5,0,1,1)", fill: "forwards" });
    newBot.animate([{ transform: "perspective(40px) rotateX(90deg)", filter: "brightness(1.4)" }, { transform: "perspective(40px) rotateX(0deg)", filter: "brightness(1)" }],
      { duration: 80, delay: 80, easing: "cubic-bezier(0,0,.3,1.3)", fill: "both" }).onfinish = function () {
      oldBot.remove(); oldTop.remove(); newBot.remove(); f.classList.remove("fx-dl-index-flipping");
    };
  }

  /* ---------- géométrie (mesurée au redimensionnement seulement) ---------- */
  var G = { s: 1, iw: 0, ih: 0, il: 0, it: 0, vw: 0, r: 1, nx: 0, ok: false };
  var strip = null, sctx = null;
  function layout() {
    var iw = img.offsetWidth, ih = img.offsetHeight;
    if (!iw || !ih) return;
    var il = img.offsetLeft, it = img.offsetTop, vw = vis.clientWidth;
    // offsetLeft/Top de l'image : l'élément <picture> n'est pas positionné, le parent de décalage est la vignette
    if (img.offsetParent !== vis) { var a = img.getBoundingClientRect(), b = vis.getBoundingClientRect(); il = a.left - b.left - vis.clientLeft; it = a.top - b.top - vis.clientTop; }
    var s = iw / SRC_W, r = Math.min(2, window.devicePixelRatio || 1);
    G = { s: s, iw: iw, ih: ih, il: il, it: it, vw: vw, r: r, ok: true };
    // cran : l'interstice le plus proche de 64 % de la largeur, et toujours à droite de la pastille « Bientôt »
    var want = il + 0.64 * iw;
    if (chip && chip.offsetWidth) want = Math.max(want, chip.offsetLeft + chip.offsetWidth + 34);
    var k = Math.ceil(((want - il) / s - GAP0) / PITCH - .35);
    k = clamp(k, 0, Math.floor((SRC_W * .9 - GAP0) / PITCH));
    G.nx = il + (GAP0 + k * PITCH) * s;
    notch.style.left = G.nx.toFixed(2) + "px";
    var tipY = it + TIP_Y * s;
    notch.style.top = tipY.toFixed(2) + "px";
    // hauteur de la tête (compteur + aiguille) : ce qui tient au-dessus de la pointe, 52 px au plus
    notch.style.setProperty("--fx-dl-index-head", Math.round(clamp(tipY - 6, 30, 52)) + "px");
    dim.style.left = il + "px"; dim.style.width = iw + "px";
    dim.style.top = (it + ih + Math.max(6, 14 * s * 2)).toFixed(1) + "px";
    G.dimW = iw * DIM_MAX;
    dimLine.style.width = G.dimW.toFixed(1) + "px"; dimLine.style.marginLeft = (-G.dimW / 2).toFixed(1) + "px";
    if (ddOdo && dd) { var lh = parseFloat(getComputedStyle(dd).lineHeight); if (lh) dd.style.setProperty("--fx-dl-index-lh", lh + "px"); }
    if (useCanvas) {
      cv.style.top = it + "px"; cv.style.height = ih + "px";
      cv.width = Math.round(vw * r); cv.height = Math.round(ih * r);
      buildStrip();
    }
    vis.classList.add("fx-dl-index-ready");
    renderDim(); oDrawn = null; paint(0, true);
  }
  // Bande pré-rendue : la fenêtre sans joint répétée sur (largeur + P); chaque image = 1 drawImage (+3 flous)
  function buildStrip() {
    if (!img.complete || !img.naturalWidth) return;
    if (img.naturalWidth !== SRC_W || img.naturalHeight !== SRC_H) { useCanvas = false; vis.classList.remove("fx-dl-index-live"); return; }
    var s = G.s, r = G.r, pw = PER * s;
    strip = strip || document.createElement("canvas");
    strip.width = Math.ceil((G.vw + pw + 4) * r); strip.height = cv.height;
    sctx = strip.getContext("2d");
    sctx.fillStyle = "#fff"; sctx.fillRect(0, 0, strip.width, strip.height);
    sctx.imageSmoothingQuality = "high";
    for (var x = 0; x < strip.width; x += pw * r) {
      // +1 px de source : chevauchement pour ne jamais laisser de filet clair au raccord
      sctx.drawImage(img, X0, 0, PER + 1, SRC_H, x, 0, (PER + 1) * s * r, strip.height);
    }
  }
  function phase(off) { // décalage (px CSS) dans la bande pour un décalage « off » en maillons
    return G.s * mod(-G.il / G.s + off * PITCH - X0, PER);
  }
  function paint(dt, force) {
    if (!useCanvas || !strip || !G.ok || !vis.classList.contains("fx-dl-index-live")) return;
    if (!onScreen && !force) return;
    var d = o - oLast; oLast = o;
    if (!force && oDrawn === o && d === 0) return;
    var r = G.r, w = cv.width, h = cv.height;
    ctx.globalAlpha = 1;
    ctx.drawImage(strip, phase(o) * r, 0, w, h, 0, 0, w, h);
    // flou de bougé : 3 copies en traînée quand la bande dépasse 20 maillons/s
    var v = dt > 0 ? Math.abs(d) / dt : 0;
    if (v > 20) {
      var A = [.5, .3, .2];
      for (var i = 0; i < 3; i++) { ctx.globalAlpha = A[i]; ctx.drawImage(strip, phase(o - d * (i + 1) * .3) * r, 0, w, h, 0, 0, w, h); }
      ctx.globalAlpha = 1; oDrawn = null;
    } else oDrawn = o;
  }

  /* ---------- cote DAO ---------- */
  var dimShown = -1;
  function renderDim() {
    if (!G.ok) return;
    var f = clamp(count / DIM_REF, 0, 1.2);
    if (f === dimShown) return; dimShown = f;
    dimLine.style.transform = "scaleX(" + f.toFixed(4) + ")";
    var hx = (G.dimW / 2) * f;
    dimL.style.transform = "translate3d(" + (-hx).toFixed(2) + "px,0,0)";
    dimR.style.transform = "translate3d(" + hx.toFixed(2) + "px,0,0)";
  }
  function setLabel(n) {
    var t = label(n);
    if (dimLab.textContent === t) return;
    dimLab.textContent = t;
    if (!reduce && dimLab.animate) dimLab.animate([{ opacity: 0, transform: "translate3d(-50%,3px,0)" }, { opacity: 1, transform: "translate3d(-50%,0,0)" }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
  }

  /* ---------- cran : déclic ---------- */
  function click(big) {
    if (reduce || !glint.animate) return;
    glint.animate(big
      ? [{ opacity: 1, transform: "translate(-50%,-50%) scale(.3)" }, { opacity: 0, transform: "translate(-50%,-50%) scale(2.4)" }]
      : [{ opacity: .9, transform: "translate(-50%,-50%) scale(.3)" }, { opacity: 0, transform: "translate(-50%,-50%) scale(1.5)" }],
      { duration: big ? 420 : 140, easing: "cubic-bezier(.2,.7,.2,1)" });
    notch.animate([{ transform: "translate3d(0,0,0)" }, { transform: "translate3d(0," + (big ? 3 : 2) + "px,0)", offset: .35 }, { transform: "translate3d(0,0,0)" }],
      { duration: big ? 240 : 140, easing: "cubic-bezier(.3,0,.1,1)" });
  }

  /* ---------- mouvements (une seule boucle : LTK.fx) ---------- */
  var task = { update: function (dt, now) { return tick(dt, now); } };
  function go() { if (running) { L.fx.wake(); return; } running = true; L.fx.add(task); }
  function start(m, now) { m.t0 = now; m.o0 = o; m.c0 = count; motion = m; }
  function next(now) {
    if (introState !== 2) return null;
    o = mod(o, PER_DL); oLast = o; // même image, nombres petits
    var c = Math.round(count);
    if (c !== T) {
      var dir = T > c ? 1 : -1;
      start({ kind: "step", dur: 60, dwell: 25, ease: EASE_STEP, do: dir, dc: dir }, now);
    } else if (lapQueued) {
      lapQueued = false;
      // « un tour » : multiple de la période (4 maillons) le plus proche de N → image identique à l'arrivée
      start({ kind: "lap", dur: 900, dwell: 0, ease: L.ease.inOut3, do: PER_DL * Math.round(T / PER_DL), dc: 0 }, now);
    }
    return motion;
  }
  function tick(dt, now) {
    if (!motion && !next(now)) {
      paint(dt, true); // dernière image nette (sans traînée)
      running = false; L.fx.remove(task); return false;
    }
    var m = motion, t = (now - m.t0) / m.dur;
    var e = m.ease(clamp(t, 0, 1));
    o = m.o0 + m.do * e; count = m.c0 + m.dc * e;
    if (t >= 1 && !m.landed) {
      m.landed = true; o = m.o0 + m.do; count = m.c0 + m.dc;
      land(m);
    }
    renderCount(); paint(dt);
    if (t >= 1 && now >= m.t0 + m.dur + m.dwell) { motion = null; if (next(now)) return true; }
    return true;
  }
  function land(m) {
    var c = Math.round(count);
    if (m.kind === "intro") { introState = 2; click(true); setLabel(c); vis.classList.add("fx-dl-index-counted"); if (c === T) flipSku(T); }
    else if (m.kind === "step") { click(false); if (c === T) { flipSku(T); setLabel(T); } }
    else click(false);
  }

  /* ---------- 1re vue ---------- */
  function intro() {
    if (introState) return;
    introState = 1;
    var begin = function () {
      vis.classList.add("fx-dl-index-go");
      if (useCanvas) { vis.classList.add("fx-dl-index-live"); oDrawn = null; paint(0, true); }
      start({ kind: "intro", dur: 1100, dwell: 0, ease: spin, do: T, dc: T }, performance.now());
      go();
    };
    // attendre la fin de l'apparition de la fiche (main.js : .reveal → .in) et l'image décodée
    var t0 = performance.now();
    (function wait() {
      var revealing = card.classList.contains("reveal") && !card.classList.contains("in");
      if (revealing && performance.now() - t0 < 1200) { setTimeout(wait, 120); return; }
      var ready = useCanvas && img.decode ? img.decode().catch(function () { useCanvas = false; }) : Promise.resolve();
      ready.then(function () { if (useCanvas && !strip) buildStrip(); setTimeout(begin, revealing ? 0 : 180); });
    })();
  }

  /* ---------- variante ---------- */
  function onVariant() {
    T = checkedN();
    // main.js vient de réécrire les textes : on remet nos tambours / notre palette par-dessus
    if (reduce) { setLabel(T); count = T; renderCount(); return; }
    if (dd && !dd.querySelector(".fx-dl-index-odo")) buildDd();
    if (skuOut && !skuOut.querySelector(".fx-dl-index-skuv")) buildSku();
    renderCount();
    if (introState === 0) { flipSku(T); setLabel(T); return; } // pas encore vue : l'entrée ira à T
    if (introState === 2) { go(); }
  }
  if (fs) fs.addEventListener("change", onVariant);
  // filet : si un autre script réécrit les textes, on reconstruit (microtâche, avant l'affichage)
  if (window.MutationObserver && !reduce) {
    var mo = new MutationObserver(function () {
      if (dd && !dd.querySelector(".fx-dl-index-odo")) { buildDd(); renderCount(); }
      if (skuOut && !skuOut.querySelector(".fx-dl-index-skuv")) buildSku();
    });
    if (dd) mo.observe(dd, { childList: true });
    if (skuOut) mo.observe(skuOut, { childList: true });
  }

  /* ---------- ajout à la soumission ---------- */
  function fly() {
    if (!G.ok || !card.isConnected) return;
    var s = G.s, vr = vis.getBoundingClientRect();
    var cw = 58, ch = CROP_Y1 - CROP_Y0;               // maillon latéral + ses 2 rivets
    var cx = G.nx + (PITCH / 2) * s;                    // centre du maillon à droite du cran (px vignette)
    var u = (cx - G.il) / s + (useCanvas && vis.classList.contains("fx-dl-index-live") ? o * PITCH : 0);
    u = X0 + PITCH / 2 + mod(u - X0 - PITCH / 2, PER);  // ramené dans la vraie photo, loin des bords
    var Z = 2.4; // le sprite est rendu 2,4× plus grand : il grossit au décollage sans flou
    var w = cw * s * Z, h = ch * s * Z, r = Math.min(2, window.devicePixelRatio || 1);
    var sp = el("canvas", "fx-dl-index-fly"); sp.setAttribute("aria-hidden", "true");
    sp.width = Math.round(w * r); sp.height = Math.round(h * r);
    var x = sp.getContext("2d");
    x.imageSmoothingQuality = "high";
    x.drawImage(img, u - cw / 2, CROP_Y0, cw, ch, 0, 0, sp.width, sp.height);
    try { // fond blanc → transparent (le maillon vole seul), bords adoucis
      var id = x.getImageData(0, 0, sp.width, sp.height), p = id.data, n = sp.width;
      for (var i = 0; i < p.length; i += 4) {
        var mn = Math.min(p[i], p[i + 1], p[i + 2]), a = clamp((255 - mn) / 255 * 2.2, 0, 1);
        var col = (i / 4) % n, edge = clamp(Math.min(col, n - 1 - col) / (n * .12), 0, 1);
        if (a > 0) { var k = (1 - a) * 255; p[i] = clamp((p[i] - k) / a, 0, 255); p[i + 1] = clamp((p[i + 1] - k) / a, 0, 255); p[i + 2] = clamp((p[i + 2] - k) / a, 0, 255); }
        p[i + 3] = 255 * a * edge;
      }
      x.putImageData(id, 0, 0);
    } catch (e) { sp.classList.add("fx-dl-index-card"); }
    // départ : exactement sur le maillon, à sa taille réelle
    var x0 = vr.left + vis.clientLeft + cx, y0 = vr.top + vis.clientTop + G.it + ((CROP_Y0 + CROP_Y1) / 2) * s;
    sp.style.left = (x0 - w / 2) + "px"; sp.style.top = (y0 - h / 2) + "px";
    sp.style.width = w + "px"; sp.style.height = h + "px";
    // arrivée : le compteur de la barre si elle est visible, sinon sa place en bas au centre
    var x1 = window.innerWidth / 2, y1 = window.innerHeight - 40, onBar = false;
    if (bar && countEl && !bar.hidden && getComputedStyle(bar).visibility !== "hidden") {
      // offsetLeft/Top ignorent la translation d'entrée : c'est la place finale
      x1 = bar.offsetLeft - bar.offsetWidth / 2 + countEl.offsetLeft + countEl.offsetWidth / 2;
      y1 = bar.offsetTop + countEl.offsetTop + countEl.offsetHeight / 2;
      onBar = true;
    }
    document.body.appendChild(sp);
    // arc : bézier quadratique départ → contrôle (au-dessus) → arrivée; le maillon est « arraché » vers le haut
    var dx = x1 - x0, dy = y1 - y0, lift = clamp(110 + Math.abs(dy) * .25, 110, 260);
    var cxp = dx * .15, cyp = Math.min(0, dy) - lift, K = [], N = 18;
    for (var j = 0; j <= N; j++) {
      var t = j / N, e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2, q = 1 - e;
      var mx = 2 * q * e * cxp + e * e * dx, my = 2 * q * e * cyp + e * e * dy;
      var sc = t < .22 ? 1 + .7 * Math.sin(t / .22 * Math.PI / 2) : 1.7 - 1.25 * Math.pow((t - .22) / .78, 1.4);
      var rot = -34 * Math.sin(Math.PI * Math.min(1, t * 1.2)) + 8 * t;
      K.push({ transform: "translate3d(" + mx.toFixed(1) + "px," + my.toFixed(1) + "px,0) rotate(" + rot.toFixed(1) + "deg) scale(" + (sc / Z).toFixed(4) + ")", opacity: t > .88 ? +(1 - (t - .88) / .12).toFixed(3) : 1, offset: t });
    }
    var a = sp.animate(K, { duration: 600, easing: "linear", fill: "forwards" });
    a.onfinish = function () {
      sp.remove();
      if (onBar && countEl.animate) countEl.animate([{ scale: "1.2", color: "#D9A864" }, { scale: "1" }], { duration: 200, easing: "cubic-bezier(.2,.8,.2,1)" });
    };
  }
  if (addBtn) {
    addBtn.classList.add("fx-dl-index-add");
    addBtn.addEventListener("click", function () {
      if (reduce) return;
      addBtn.dispatchEvent(new CustomEvent("ltk:lap", { bubbles: true }));
      fly();
      if (introState === 2) { lapQueued = true; go(); }
    });
    // largeur et hauteur minimales : le « Ajouté ✓ » plus court ne fait plus bouger le champ quantité
    // (sur cellulaire, le libellé tient sur 2 lignes : c'est la hauteur qui sautait)
    var fixW = function () {
      if (addBtn.classList.contains("added")) return;
      addBtn.style.minWidth = ""; addBtn.style.minHeight = "";
      var w = addBtn.offsetWidth, h = addBtn.offsetHeight;
      if (w) { addBtn.style.minWidth = w + "px"; addBtn.style.minHeight = h + "px"; }
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fixW); else fixW();
    var rw; window.addEventListener("resize", function () { clearTimeout(rw); rw = setTimeout(fixW, 150); });
  }

  /* ---------- barre de soumission : entrée par le bas ---------- */
  if (bar && window.MutationObserver && !reduce) {
    var wasHidden = bar.hidden;
    new MutationObserver(function () {
      if (wasHidden && !bar.hidden) {
        // synchrone (microtâche) : la barre ne s'affiche jamais une image à sa place finale avant d'entrer
        bar.classList.add("fx-dl-index-bar-in");
      }
      wasHidden = bar.hidden;
    }).observe(bar, { attributes: true, attributeFilter: ["hidden"] });
    bar.addEventListener("animationend", function (e) { if (e.animationName === "fx-dl-index-bar-in") bar.classList.remove("fx-dl-index-bar-in"); });
  }

  /* ---------- démarrage ---------- */
  buildDd(); buildSku();
  renderCount();
  if ("ResizeObserver" in window) new ResizeObserver(function () { layout(); }).observe(vis);
  else { window.addEventListener("resize", layout); }
  layout();
  if (img.complete) layout(); else img.addEventListener("load", layout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);

  if (reduce) { count = T; renderCount(); return; }
  L.onVisible(vis, function (v) { onScreen = v; if (v) { oDrawn = null; paint(0, true); } });
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) {
        if (e.isIntersecting && e.intersectionRatio >= (e.target === img ? .6 : .99)) { io.disconnect(); intro(); }
      });
    }, { threshold: [.6, .99, 1] });
    io.observe(img); if (dd) io.observe(dd);
  } else intro();
})();
