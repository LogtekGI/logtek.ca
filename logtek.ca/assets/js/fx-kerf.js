/* Logtek — « Trait de scie » : transition entre les pages + repère de navigation (aucune dépendance)
   Au changement de page, la nouvelle page entre comme un trait d'abattage : la barre pivote depuis
   le bas de l'en-tête (à gauche en avançant dans le menu, à droite en reculant) et découvre la page
   derrière son fil chaud. L'en-tête ne bouge pas ; le repère sous l'onglet actif glisse d'un onglet
   à l'autre. FR ↔ EN : simple fondu. Transitions de vue entre documents (Chrome 126+, Safari 18.2+) :
   aucune boucle rAF, aucun calcul par image — 2 instantanés, un clip-path précalculé, une texture tournée.
   Script classique (non différé), dans <head> avant les feuilles de style : il doit écouter « pagereveal »
   avant le 1er rendu, sans attendre le CSS. Ne dépend pas de fx-core.js.
   Mouvement réduit, Firefox ou sans JS : navigation normale, le repère reste un soulignement fixe. */
(function () {
  "use strict";
  var W = window, D = document, R = D.documentElement, KEY = "fx-kerf";
  var ORDER = { index: 0, logiciel: 1, software: 1, chaines: 2, chains: 2, services: 3, "a-propos": 4, about: 4, contact: 5 };
  var N = 50, CLAMP = 100, SWING = 400, FADE = 80;

  // Position d'une page dans le menu (-1 : hors menu) et langue, d'après son URL
  function where(u) {
    if (!u) return null;
    var p; try { p = new URL(u, location.href).pathname.toLowerCase(); } catch (e) { return null; }
    var en = /^\/en(\/|$)/.test(p), b = p.replace(/^\/en(\/|$)/, "/").split("/").pop().replace(/\.html?$/, "") || "index";
    return { i: ORDER.hasOwnProperty(b) ? ORDER[b] : -1, en: en };
  }
  // fwd | back | lang. Même page dans l'autre langue : fondu. Sinon l'ordre du menu décide ;
  // hors menu (404…), le sens de l'historique ; par défaut on avance.
  function kind(a, b, trav) {
    if (!a || !b) return trav < 0 ? "back" : "fwd";
    if (a.i === b.i && a.en !== b.en) return "lang";
    if (a.i >= 0 && b.i >= 0 && a.i !== b.i) return b.i < a.i ? "back" : "fwd";
    return trav < 0 ? "back" : "fwd";
  }
  function header() { return D.querySelector(".site-header"); }
  function onReel() { return !!D.body && D.body.classList.contains("on-reel"); }
  function addType(vt, t) { if (vt.types) try { vt.types.add(t); } catch (e) { /* types non pris en charge */ } }
  function kill(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

  // Repère « cote » sous l'onglet actif ; il porte son propre nom de transition et glisse seul
  function mark() {
    var a = D.querySelector('.main-nav a[aria-current="page"]');
    if (!a || a.querySelector(".fx-kerf-mark")) return;
    var i = D.createElement("i"); i.className = "fx-kerf-mark"; i.setAttribute("aria-hidden", "true");
    a.appendChild(i);
  }
  D.addEventListener("DOMContentLoaded", mark);

  // Page qui s'en va : on classe la navigation (utile pour les styles côté ancienne page)
  // et on laisse une trace pour les navigateurs sans Navigation API (Safari).
  W.addEventListener("pageswap", function (e) {
    var vt = e.viewTransition, a = e.activation, hd = header(), t = "fwd", nav = W.navigation;
    if (!vt) return;
    kill(D.querySelector(".fx-kerf-blade"));
    if (hd && onReel()) hd.style.viewTransitionName = "none"; // en-tête transparent sur la vidéo : il suit la coupe
    if (a && a.entry) t = kind(where(location.href), where(a.entry.url),
      a.navigationType === "traverse" && nav && nav.currentEntry ? (a.entry.index < nav.currentEntry.index ? -1 : 1) : 0);
    addType(vt, t);
    try { sessionStorage.setItem(KEY, JSON.stringify({ f: location.href, t: Date.now() })); } catch (x) { /* stockage indisponible */ }
  });

  // Nouvelle page : avant le premier rendu, on pose le repère et la lame, puis on coupe
  W.addEventListener("pagereveal", function (e) {
    var vt = e.viewTransition, hd = header(), act = W.navigation && W.navigation.activation, from, trav = 0, s, t, blade;
    mark();
    if (hd) hd.style.viewTransitionName = onReel() ? "none" : "";
    if (!vt) return;
    if (act && act.from) {
      from = act.from.url;
      if (act.navigationType === "traverse" && act.entry) trav = act.entry.index < act.from.index ? -1 : 1;
    } else {
      try { s = JSON.parse(sessionStorage.getItem(KEY)); } catch (x) { s = null; }
      from = s && Date.now() - s.t < 1e4 ? s.f : D.referrer;
    }
    try { sessionStorage.removeItem(KEY); } catch (x) { /* rien */ }
    t = kind(where(from), where(location.href), trav);
    addType(vt, t);
    if (t === "lang" || !vt.types || (W.matchMedia && W.matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
    blade = D.createElement("i"); blade.className = "fx-kerf-blade" + (t === "back" ? " is-back" : ""); blade.setAttribute("aria-hidden", "true");
    var h = hd ? Math.max(0, Math.min(innerHeight, hd.getBoundingClientRect().bottom)) : 0;
    blade.style.top = h + "px";
    blade.style.width = Math.ceil(Math.sqrt(innerWidth * innerWidth + (innerHeight - h) * (innerHeight - h))) + 2 + "px";
    D.body.appendChild(blade);
    var anims = [], done = function () { kill(blade); for (var k = 0; k < anims.length; k++) anims[k].cancel(); };
    vt.ready.then(function () { anims = cut(t === "back", h); }).catch(done);
    vt.finished.then(done, done);
  });

  // Courbe du vérin : cubic-bezier(.5,0,.25,1), résolue par dichotomie
  function ease(u) {
    var lo = 0, hi = 1, m, x, j;
    for (j = 0; j < 24; j++) { m = (lo + hi) / 2; x = 1.5 * m * (1 - m) * (1 - m) + .75 * m * m * (1 - m) + m * m * m; if (x < u) lo = m; else hi = m; }
    return 3 * m * m * (1 - m) + m * m * m;
  }

  // Coupe : rayon issu de (0,h) — ou (W,h) en reculant — qui balaie 0 → 90°. Tout est précalculé.
  function cut(back, h) {
    var w = innerWidth, H = innerHeight, clip = [], rot = [], k, f, tn, x, y, yR, o, P = function (a, b) { return (back ? w - a : a) + "px " + b + "px"; };
    for (k = 0; k <= N; k++) {
      f = Math.PI / 2 * ease(k / N); tn = Math.tan(f); o = k / N;
      if (w * tn <= H - h) { x = w; y = yR = h + w * tn; } else { x = (H - h) / tn; y = yR = H; }
      clip.push({ offset: o, clipPath: "polygon(" + [P(0, 0), P(w, 0), P(w, yR), P(x, y), P(0, h)].join(",") + ")" });
      rot.push({ offset: o, transform: "rotate(" + (back ? -f : f) + "rad)", opacity: o < 1 - FADE / SWING ? 1 : 1 - (o - 1 + FADE / SWING) * SWING / FADE });
    }
    var opt = function (d, del, pe) { return { duration: d, delay: del, easing: "linear", fill: "both", pseudoElement: pe }; };
    return [
      // l'ancienne page : serrée par le grappin, elle s'assombrit puis tombe de quelques pixels, comme la bille coupée
      // (le haut découvert reste sous l'en-tête, aucun bord vide n'apparaît)
      R.animate([{ transform: "none", filter: "none", easing: "cubic-bezier(.3,0,.2,1)" },
        { offset: CLAMP / (CLAMP + SWING), transform: "translateY(4px)", filter: "brightness(.9)", easing: "cubic-bezier(.5,0,.8,.6)" },
        { transform: "translateY(18px)", filter: "brightness(.78)" }],
        { duration: CLAMP + SWING, fill: "both", pseudoElement: "::view-transition-old(root)" }),
      R.animate(clip, opt(SWING, CLAMP, "::view-transition-new(root)")),
      R.animate(rot, opt(SWING, CLAMP, "::view-transition-new(fx-kerf-blade)"))
    ];
  }
})();
