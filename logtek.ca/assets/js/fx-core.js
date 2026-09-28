/* Logtek — socle d'animation partagé (aucune dépendance)
   Une seule boucle requestAnimationFrame pour tous les effets, qui dort quand rien ne bouge.
   Les modules fx-*.js s'y branchent :
     LTK.fx.add(tache)          tache = { update(dt, now) → true tant qu'il faut encore des images }
     LTK.fx.wake()              relance la boucle (défilement, pointeur, visibilité…)
     LTK.onVisible(el, cb, m)   cb(true|false) quand l'élément entre/sort de l'écran (marge m, ex. "200px")
     LTK.pointer                { x, y, nx, ny, active } (nx/ny : -1…1 dans la fenêtre), lissé : sx, sy
     LTK.scroll                 { y, vh, v } (v = vitesse lissée, px/s)
     LTK.reduce                 true si l'utilisateur demande moins d'animation
     LTK.clamp, LTK.lerp, LTK.damp(courant, cible, lambda, dt), LTK.ease.{out3, inOut3, outExpo} */
(function () {
  "use strict";
  var L = window.LTK = window.LTK || {};
  if (L.fx) return;

  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  L.reduce = !!(mq && mq.matches);
  if (mq && mq.addEventListener) mq.addEventListener("change", function (e) { L.reduce = e.matches; });

  L.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  L.lerp = function (a, b, t) { return a + (b - a) * t; };
  L.damp = function (a, b, lambda, dt) { return b + (a - b) * Math.exp(-lambda * dt); };
  L.ease = {
    out3: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOut3: function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outExpo: function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }
  };

  /* ---------- boucle partagée ---------- */
  var tasks = [], running = false, last = 0;
  function frame(now) {
    var dt = Math.min(.064, Math.max(0, (now - last) / 1000)); last = now;
    // défilement : vitesse lissée
    var y = window.scrollY;
    var inst = dt > 0 ? (y - L.scroll.y) / dt : 0;
    L.scroll.v = L.damp(L.scroll.v, inst, 10, dt); L.scroll.y = y;
    if (Math.abs(L.scroll.v) < 1) L.scroll.v = 0;
    // pointeur lissé
    var p = L.pointer;
    p.sx = L.damp(p.sx, p.nx, 8, dt); p.sy = L.damp(p.sy, p.ny, 8, dt);
    var busy = Math.abs(p.sx - p.nx) > .001 || Math.abs(p.sy - p.ny) > .001 || L.scroll.v !== 0;
    for (var i = tasks.length - 1; i >= 0; i--) {
      var t = tasks[i], keep;
      try { keep = t.update(dt, now); } catch (e) { tasks.splice(i, 1); if (window.console) console.error(e); continue; }
      if (keep) busy = true;
    }
    if (busy && !document.hidden) requestAnimationFrame(frame); else running = false;
  }
  L.fx = {
    add: function (t) { if (tasks.indexOf(t) < 0) tasks.push(t); L.fx.wake(); return t; },
    remove: function (t) { var i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); },
    wake: function () { if (!running && !document.hidden) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
  };

  /* ---------- défilement et pointeur ---------- */
  L.scroll = { y: window.scrollY, vh: window.innerHeight, v: 0 };
  L.pointer = { x: -1, y: -1, nx: 0, ny: 0, sx: 0, sy: 0, active: false, fine: !!(window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) };
  window.addEventListener("scroll", L.fx.wake, { passive: true });
  window.addEventListener("resize", function () { L.scroll.vh = window.innerHeight; L.fx.wake(); });
  window.addEventListener("pointermove", function (e) {
    if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    var p = L.pointer; p.x = e.clientX; p.y = e.clientY; p.active = true;
    p.nx = e.clientX / window.innerWidth * 2 - 1; p.ny = e.clientY / window.innerHeight * 2 - 1;
    L.fx.wake();
  }, { passive: true });
  document.addEventListener("pointerleave", function () { L.pointer.active = false; L.pointer.nx = 0; L.pointer.ny = 0; L.fx.wake(); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) L.fx.wake(); });

  /* ---------- visibilité ---------- */
  L.onVisible = function (el, cb, margin) {
    if (!el) return;
    if (!("IntersectionObserver" in window)) { cb(true); return; }
    new IntersectionObserver(function (en) { en.forEach(function (e) { cb(e.isIntersecting, e); }); }, { rootMargin: margin || "0px" }).observe(el);
  };
})();
