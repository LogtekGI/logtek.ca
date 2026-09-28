/* Logtek — « Barre-guide » : une chaîne .404 qui tourne sur le contour des boutons
   Au survol ou au focus clavier, le contour de chaque bouton-pilule (.btn) devient une barre-guide :
   maillons (plaques), rivets et gouges dessinés en SVG sur la ligne médiane de la bordure.
     - Survol / focus : la chaîne apparaît en 120 ms et tourne à 14 pas/s (montée en régime τ 160 ms,
       ralentissement en roue libre τ 300 ms). Au repos après 4 s sans mouvement du pointeur.
     - Appui : pointe à 60 pas/s pendant 250 ms (flou de chaîne .is-fast) et 6 à 8 copeaux giclent du nez
       (arc de droite), en WAAPI, depuis une réserve de 8 éléments. La navigation n'est jamais retardée.
     - Événement « ltk:lap » sur un bouton (envoyé par d'autres modules) : un tour complet de chaîne
       (exactement N maillons, 900 ms en douceur), un tour par article ajouté.
   Une seule tâche LTK.fx (fx-core.js) pour tous les boutons actifs ; rien ne tourne au repos ni hors écran.
   Un seul ResizeObserver garde la taille en cache : aucune lecture de mise en page dans la boucle.
   Mouvement réduit : la chaîne s'affiche immobile au survol/focus (ni rotation, ni copeaux, ni tour).
   Décoration aria-hidden, sans texte ; le contour de focus d'origine reste l'indicateur de focus.
   Sans JS : boutons ordinaires. */
(function () {
  "use strict";
  var L = window.LTK;
  if (!L || !L.fx || !document.createElementNS || !window.WeakMap) return;

  var NS = "http://www.w3.org/2000/svg";
  var P = "fx-guide-bar";
  var HOVER_V = 14, PRESS_V = 60, SURGE_MS = 250, LAP_MS = 900, IDLE_MS = 4000;
  var FAST_ON = 30, FAST_OFF = 24;
  var hasRO = "ResizeObserver" in window, hasIO = "IntersectionObserver" in window;

  var states = new WeakMap();
  var active = new Set();
  var hovered = null;

  function btnOf(node) {
    var b = node && node.closest ? node.closest(".btn") : null;
    return b && !b.closest(".phone") ? b : null;
  }

  /* ---------- géométrie : contour arrondi sur la ligne médiane de la bordure (2 px) ----------
     Pilule (rayon = h/2) : M r+1,1 H w−r−1 A r r 0 0 1 w−r−1,h−1 H r+1 A r r 0 0 1 r+1,1 Z avec r = h/2−1.
     Le bouton d'en-tête a un rayon de 8 px : même tracé, avec deux côtés verticaux. o = décalage vers l'extérieur. */
  function outline(w, h, R, o) {
    var q = R - 1 + o, a = 1 - o, b = w - 1 + o, c = h - 1 + o, f = function (v) { return Math.round(v * 100) / 100; };
    var arc = "A" + f(q) + "," + f(q) + " 0 0 1 ";
    return "M" + f(a + q) + "," + f(a) + "H" + f(b - q) + arc + f(b) + "," + f(a + q) + "V" + f(c - q) + arc + f(b - q) + "," + f(c) +
      "H" + f(a + q) + arc + f(a) + "," + f(c - q) + "V" + f(a + q) + arc + f(a + q) + "," + f(a) + "Z";
  }
  function build(s) {
    var w = s.w, h = s.h;
    if (!(w > 6 && h > 6)) return;
    var R = Math.max(1, Math.min(s.br, h / 2, w / 2)), q = R - 1;
    var per = 2 * (w - 2 - 2 * q) + 2 * (h - 2 - 2 * q) + 2 * Math.PI * q;
    // N pair (la gouge revient tous les 2 pas) et pas entre 7 et 9 px : le motif se referme sans couture
    var n = Math.max(2, 2 * Math.round(per / 16));
    while (per / n > 9) n += 2;
    while (per / n < 7 && n > 2) n -= 2;
    s.n = n; s.R = R;
    var mid = outline(w, h, R, 0), out = outline(w, h, R, 1.5);
    s.plates.setAttribute("d", mid); s.rivets.setAttribute("d", mid); s.cutters.setAttribute("d", out);
    s.plates.setAttribute("pathLength", n); s.rivets.setAttribute("pathLength", n); s.cutters.setAttribute("pathLength", n);
  }
  function measure(s, w, h) {
    // lecture du rayon hors boucle (au redimensionnement seulement) ; 999px → pilule
    s.br = parseFloat(getComputedStyle(s.el).borderTopLeftRadius) || 0;
    s.w = w; s.h = h; build(s);
  }

  /* ---------- injection ---------- */
  var ro = hasRO ? new ResizeObserver(function (entries) {
    entries.forEach(function (e) {
      var s = states.get(e.target); if (!s) return;
      var bs = e.borderBoxSize && (e.borderBoxSize[0] || e.borderBoxSize);
      var w = bs && bs.inlineSize != null ? bs.inlineSize : e.target.offsetWidth;
      var h = bs && bs.blockSize != null ? bs.blockSize : e.target.offsetHeight;
      w = Math.round(w * 100) / 100; h = Math.round(h * 100) / 100;
      if (w !== s.w || h !== s.h) measure(s, w, h);
    });
  }) : null;
  var io = hasIO ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var s = states.get(e.target); if (!s) return;
      s.inView = e.isIntersecting;
      if (!s.inView && active.has(s)) settle(s);
      else if (s.inView && (s.focus || s.hover)) engage(s);
    });
  }) : null;
  // main.js remplace parfois le contenu d'un bouton (« Ajouté ✓ ») : on remet notre SVG en place
  var mo = "MutationObserver" in window ? new MutationObserver(function (recs) {
    recs.forEach(function (r) { var s = states.get(r.target); if (s) reattach(s); });
  }) : null;

  function reattach(s) {
    var el = s.el, kids = el.children;
    for (var i = kids.length - 1; i >= 0; i--) {
      if (kids[i] !== s.svg && kids[i].classList.contains(P)) el.removeChild(kids[i]);
    }
    if (s.svg.parentNode !== el) el.insertBefore(s.svg, el.firstChild);
  }

  function path(cls) {
    var p = document.createElementNS(NS, "path");
    p.setAttribute("class", P + "-" + cls);
    return p;
  }
  function inject(el) {
    var s = states.get(el);
    if (s) return s;
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", P);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    s = { el: el, svg: svg, plates: path("plates"), cutters: path("cutters"), rivets: path("rivets"),
      w: 0, h: 0, n: 0, br: 999, R: 0, phase: 0, v: 0, off: null, hover: false, focus: false, surge: 0, idle: 0,
      laps: 0, lapT0: 0, lapN: 0, lapDone: 0, fast: false, on: false, inView: true };
    svg.appendChild(s.plates); svg.appendChild(s.cutters); svg.appendChild(s.rivets);
    states.set(el, s);
    el.insertBefore(svg, el.firstChild);
    if (ro) ro.observe(el); else measure(s, el.offsetWidth, el.offsetHeight);
    if (io) io.observe(el);
    if (mo) mo.observe(el, { childList: true });
    return s;
  }
  function injectAll() {
    var list = document.querySelectorAll(".btn");
    for (var i = 0; i < list.length; i++) if (!list[i].closest(".phone")) inject(list[i]);
    if (!L.reduce && list.length) chipsPool();
  }

  /* ---------- état visible / rapide ---------- */
  function setOn(s, on) { if (s.on !== on) { s.on = on; s.svg.classList.toggle(P + "-on", on); } }
  function setFast(s, fast) { if (s.fast !== fast) { s.fast = fast; s.svg.classList.toggle(P + "-fast", fast); } }
  function writePhase(s) {
    var o = -(Math.round(s.phase * 1000) / 1000);
    if (o === s.off) return;
    var st = s.svg.style;
    s.off = o;
    st.setProperty("--" + P + "-o", o);                                   // plaques
    st.setProperty("--" + P + "-or", Math.round((o - .06) * 1000) / 1000); // rivets aux deux bouts de la plaque
    st.setProperty("--" + P + "-oc", Math.round((o - .11) * 1000) / 1000); // gouge centrée sur un maillon
  }
  function settle(s) {
    active.delete(s);
    s.v = 0; s.laps = 0; s.lapN = 0; s.lapDone = 0; s.surge = 0;
    setFast(s, false);
    setOn(s, s.hover || s.focus);
  }
  function engage(s) {
    if (L.reduce) { setOn(s, s.hover || s.focus); return; }
    if (!s.inView) return;
    if (!s.n && s.el.offsetWidth) measure(s, s.el.offsetWidth, s.el.offsetHeight);
    setOn(s, true);
    if (!active.has(s)) { active.add(s); L.fx.add(task); }
    L.fx.wake();
  }

  /* ---------- boucle (une seule tâche pour tous les boutons actifs) ---------- */
  var ease = L.ease.inOut3;
  var task = {
    update: function (dt, now) {
      active.forEach(function (s) {
        if (!s.el.isConnected || !s.inView) { settle(s); return; }
        var tgt = now < s.surge ? PRESS_V : (s.hover || s.focus) && now < s.idle ? HOVER_V : 0;
        var tau = tgt > s.v ? .16 : .30;
        s.v += (tgt - s.v) * (1 - Math.exp(-dt / tau));
        var d = s.v * dt, lapping = s.laps > 0;
        if (lapping) {
          if (!s.lapN) { s.lapN = s.n || 2; s.lapT0 = now; s.lapDone = 0; }
          var k = (now - s.lapT0) / LAP_MS;
          if (k >= 1) {
            d += s.lapN - s.lapDone;
            s.laps--; s.lapN = 0; s.lapDone = 0;
          } else {
            var e = ease(k) * s.lapN;
            d += e - s.lapDone; s.lapDone = e;
          }
        }
        s.phase = ((s.phase + d) % 2 + 2) % 2;
        var speed = dt > 0 ? d / dt : 0;
        setFast(s, s.fast ? speed > FAST_OFF : speed > FAST_ON);
        writePhase(s);
        if (tgt === 0 && s.v < .05 && !s.laps) {
          s.v = 0; active.delete(s); setFast(s, false); setOn(s, s.hover || s.focus);
        }
      });
      if (!active.size) { L.fx.remove(task); return false; }
      return true;
    }
  };

  /* ---------- copeaux (réserve partagée de 8, WAAPI, transform/opacity seulement) ---------- */
  var pool = null, poolI = 0;
  function chipsPool() {
    if (pool) return pool;
    var box = document.createElement("div");
    box.className = P + "-chips";
    box.setAttribute("aria-hidden", "true");
    pool = [];
    for (var i = 0; i < 8; i++) pool.push(box.appendChild(document.createElement("i")));
    document.body.appendChild(box);
    return pool;
  }
  function chips(s) {
    if (!document.body || !document.body.animate) return;
    chipsPool();
    var r = s.el.getBoundingClientRect(); // lecture unique, à l'appui (hors boucle)
    if (!r.width || r.bottom < 0 || r.top > innerHeight) return;
    var cs = getComputedStyle(s.el).getPropertyValue("--" + P + "-chip").split(",");
    var R = Math.min(s.R || r.height / 2, r.height / 2), cx = r.right - R, cy = r.top + r.height / 2;
    var count = 6 + (Math.random() * 3 | 0), G = 1200, DUR = 520;
    for (var i = 0; i < count; i++) {
      var c = pool[poolI++ % pool.length];
      var a = (-62 + Math.random() * 80) * Math.PI / 180;       // point d'éjection sur le nez
      var th = (20 + Math.random() * 50) * Math.PI / 180;       // angle de départ au-dessus de l'horizontale
      var sp = 180 + Math.random() * 140;
      var x0 = cx + Math.cos(a) * (R + 1), y0 = cy + Math.sin(a) * (R + 1);
      var vx = Math.cos(th) * sp, vy = -Math.sin(th) * sp;
      var rot0 = Math.random() * 180, spin = (Math.random() < .5 ? -1 : 1) * (540 + Math.random() * 540);
      var cw = 3.5 + Math.random() * 3, ch = 2 + Math.random() * 1.2;
      c.style.width = cw.toFixed(1) + "px"; c.style.height = ch.toFixed(1) + "px";
      c.style.background = (cs[i % cs.length] || "#D9A864").trim();
      var kf = [], STEPS = 6;
      for (var k = 0; k <= STEPS; k++) {
        var f = k / STEPS, t = f * DUR / 1000;
        kf.push({
          offset: f,
          transform: "translate(" + (x0 + vx * t).toFixed(1) + "px," + (y0 + vy * t + .5 * G * t * t).toFixed(1) + "px) rotate(" + (rot0 + spin * t).toFixed(0) + "deg) scale(" + (1 - .35 * f).toFixed(2) + ")",
          opacity: f < .55 ? 1 : +(1 - (f - .55) / .45).toFixed(2)
        });
      }
      if (c._a) c._a.cancel();
      c._a = c.animate(kf, { duration: DUR + (Math.random() * 60 | 0), delay: i * 9, easing: "linear", fill: "both" });
    }
  }

  /* ---------- actions ---------- */
  function enter(s) { s.hover = true; hovered = s; s.idle = performance.now() + IDLE_MS; engage(s); }
  function leave(s) { s.hover = false; if (hovered === s) hovered = null; if (!active.has(s)) setOn(s, s.focus); else L.fx.wake(); }
  function press(s) {
    if (L.reduce) { setOn(s, true); return; }
    var now = performance.now();
    s.surge = now + SURGE_MS; s.idle = now + IDLE_MS;
    chips(s);   // lectures d'abord (rect, couleurs), écritures ensuite : pas de mise en page forcée
    engage(s);
  }
  function lap(s) {
    if (L.reduce || !s.inView) return;
    s.laps++; engage(s);
  }

  /* ---------- écouteurs délégués (fonctionnent avant l'injection différée) ---------- */
  function from(e, related) {
    var b = btnOf(e.target);
    if (!b || (related && e.relatedTarget && b.contains(e.relatedTarget))) return null;
    return inject(b);
  }
  document.addEventListener("pointerover", function (e) {
    if (e.pointerType === "touch") return;
    var s = from(e, true); if (s) enter(s);
  }, { passive: true });
  document.addEventListener("pointerout", function (e) {
    var b = btnOf(e.target); if (!b || (e.relatedTarget && b.contains(e.relatedTarget))) return;
    var s = states.get(b); if (s && s.hover) leave(s);
  }, { passive: true });
  document.addEventListener("pointermove", function (e) {
    var s = hovered; if (!s || L.reduce) return;
    var now = performance.now();
    if (s.idle - now < IDLE_MS - 250) { s.idle = now + IDLE_MS; if (!active.has(s)) engage(s); }
  }, { passive: true });
  document.addEventListener("pointerdown", function (e) {
    if (e.button !== 0) return;
    var s = from(e); if (s) press(s);
  }, { passive: true });
  document.addEventListener("keydown", function (e) {
    if (e.repeat || !(e.key === "Enter" || (e.key === " " && e.target.tagName === "BUTTON"))) return;
    var s = from(e); if (s) press(s);
  });
  document.addEventListener("focusin", function (e) {
    var s = from(e); if (!s) return;
    var fv = true;
    try { fv = s.el.matches(":focus-visible"); } catch (x) { /* ancien navigateur */ }
    if (!fv) return;
    s.focus = true; s.idle = performance.now() + IDLE_MS; engage(s);
  });
  document.addEventListener("focusout", function (e) {
    var b = btnOf(e.target), s = b && states.get(b);
    if (!s || !s.focus) return;
    s.focus = false;
    if (!active.has(s)) setOn(s, s.hover); else L.fx.wake();
  });
  document.addEventListener("ltk:lap", function (e) {
    var b = btnOf(e.target); if (b) lap(inject(b));
  });

  /* ---------- démarrage : le bouton d'en-tête tout de suite, les autres au repos du navigateur ---------- */
  var head = document.querySelectorAll(".site-header .btn");
  for (var i = 0; i < head.length; i++) inject(head[i]);
  function later() { (window.requestIdleCallback || function (f) { return setTimeout(f, 200); })(injectAll, { timeout: 2000 }); }
  if (document.readyState === "complete") later(); else window.addEventListener("load", later, { once: true });
})();
