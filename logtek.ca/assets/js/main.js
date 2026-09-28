/* Logtek — scripts du site (aucune dépendance) */
(function () {
  "use strict";
  document.documentElement.classList.add("js");
  var body = document.body;
  var lang = body.getAttribute("data-lang") || "fr";
  var EMAIL = body.getAttribute("data-email");
  var ENDPOINT = body.getAttribute("data-endpoint");
  var T = function (fr, en) { return lang === "fr" ? fr : en; };

  /* ---------- Menu mobile ---------- */
  var toggle = document.querySelector(".nav-toggle");
  if (toggle) {
    var navEl = document.getElementById("main-nav");
    var closeNav = function (refocus) {
      if (!body.classList.contains("nav-open")) return;
      body.classList.remove("nav-open"); toggle.setAttribute("aria-expanded", "false");
      if (refocus) toggle.focus();
    };
    toggle.addEventListener("click", function (e) {
      var open = body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      // Clavier : le panneau s'ouvre par-dessus la page, on y amène le focus (le menu vient avant le bouton dans le HTML)
      if (open && navEl && e.detail === 0) { var first = navEl.querySelector("a"); if (first) first.focus(); }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeNav(navEl && navEl.contains(document.activeElement)); });
    // Le focus quitte le menu et son bouton : on referme (sinon il tomberait sur du contenu caché sous le panneau)
    document.addEventListener("focusin", function (e) {
      if (body.classList.contains("nav-open") && navEl && !navEl.contains(e.target) && e.target !== toggle) closeNav(false);
    });
    document.querySelectorAll(".main-nav a").forEach(function (a) {
      a.addEventListener("click", function () { body.classList.remove("nav-open"); toggle.setAttribute("aria-expanded", "false"); });
    });
    // Menu resté ouvert en passant au format bureau (rotation d'une tablette) : on le referme
    var wide = window.matchMedia("(min-width: 961px)");
    var closeWide = function () { if (wide.matches) { body.classList.remove("nav-open"); toggle.setAttribute("aria-expanded", "false"); } };
    if (wide.addEventListener) wide.addEventListener("change", closeWide); else if (wide.addListener) wide.addListener(closeWide);
  }

  /* ---------- Soumission (panier sans paiement) ---------- */
  var KEY = "logtek_quote";
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function save(items) { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* stockage indisponible */ } }
  var quote = load();

  var list = document.getElementById("quote-list");
  var bar = document.getElementById("quote-bar");
  var count = document.getElementById("quote-count");
  var TRASH = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function render() {
    if (!list) return;
    list.innerHTML = quote.map(function (it, i) {
      return '<div class="quote-item"><b><small>' + esc(it.sku) + "</small>" + esc(it.name) + "</b>" +
        '<label class="sr" for="qi-' + i + '">' + T("Quantité", "Quantity") + "</label>" +
        '<input id="qi-' + i + '" type="number" min="1" value="' + it.qty + '" data-i="' + i + '">' +
        '<button type="button" data-rm="' + i + '" aria-label="' + T("Retirer", "Remove") + '">' + TRASH + "</button></div>";
    }).join("");
    var n = quote.reduce(function (s, it) { return s + it.qty; }, 0);
    if (bar) {
      bar.hidden = n === 0;
      if (count) count.textContent = n;
    }
  }

  if (list) {
    document.querySelectorAll("[data-add]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var card = btn.closest(".product");
        var qty = Math.max(1, parseInt(card.querySelector('input[type="number"]').value, 10) || 1);
        // Variante choisie (ex. longueur de chaîne 90 DL) : un seul produit, une ligne de soumission par variante
        var v = card.querySelector(".variants input:checked");
        var sku = v ? v.value : card.getAttribute("data-sku");
        var name = card.getAttribute("data-name") + (v ? " — " + v.getAttribute("data-label") : "");
        var found = quote.filter(function (it) { return it.sku === sku; })[0];
        if (found) found.qty += qty; else quote.push({ sku: sku, name: name, qty: qty });
        save(quote); render();
        var label = btn.innerHTML;
        btn.classList.add("added");
        btn.textContent = T("Ajouté ✓", "Added ✓");
        setTimeout(function () { btn.classList.remove("added"); btn.innerHTML = label; }, 1400);
      });
    });
    list.addEventListener("input", function (e) {
      var i = e.target.getAttribute("data-i");
      if (i === null) return;
      quote[i].qty = Math.max(1, parseInt(e.target.value, 10) || 1);
      save(quote);
      var n = quote.reduce(function (s, it) { return s + it.qty; }, 0);
      if (count) count.textContent = n;
    });
    list.addEventListener("click", function (e) {
      var b = e.target.closest("[data-rm]");
      if (!b) return;
      quote.splice(+b.getAttribute("data-rm"), 1);
      save(quote); render();
    });
    render();
    // Variantes : le code produit et la fiche suivent le choix
    document.querySelectorAll(".product .variants").forEach(function (fs) {
      var card = fs.closest(".product"), out = card.querySelector("[data-sku-out]"), dl = card.querySelector("[data-dl-out]");
      function sync() {
        var v = fs.querySelector("input:checked"); if (!v) return;
        if (out) out.textContent = v.value;
        if (dl) dl.textContent = v.getAttribute("data-dl");
      }
      fs.addEventListener("change", sync); sync();
    });
    // cacher la barre quand le formulaire est visible
    var target = document.getElementById("soumission");
    if (bar && target && "IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        bar.style.visibility = entries[0].isIntersecting ? "hidden" : "";
      }, { threshold: 0.15 }).observe(target);
    }
  }

  /* ---------- Sujet pré-rempli (?sujet=demo) ---------- */
  var params = new URLSearchParams(location.search);
  var sujet = params.get("sujet");
  if (sujet) {
    var sel = document.querySelector('select[name="sujet"]');
    if (sel && sel.querySelector('option[value="' + sujet + '"]')) sel.value = sujet;
  }

  /* ---------- Formulaires ---------- */
  var LABELS = {
    nom: T("Nom", "Name"), entreprise: T("Entreprise", "Company"), courriel: T("Courriel", "Email"),
    telephone: T("Téléphone", "Phone"), sujet: T("Sujet", "Subject"), machine: T("Machine", "Machine"), message: T("Message", "Message")
  };

  document.querySelectorAll("form[data-form]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var status = form.querySelector(".form-status");
      var ok = true;
      form.querySelectorAll("[required]").forEach(function (f) {
        var bad = !f.value.trim() || (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value));
        f.classList.toggle("invalid", bad);
        if (bad) ok = false;
      });
      if (!ok) {
        status.className = "form-status err";
        status.textContent = T("Veuillez remplir les champs obligatoires (*).", "Please fill in the required fields (*).");
        return;
      }
      var kind = form.getAttribute("data-form");
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      if (kind === "quote") {
        if (!quote.length && !data.message.trim()) {
          status.className = "form-status err";
          status.textContent = T("Ajoutez au moins un produit ou décrivez votre besoin.", "Add at least one product or describe what you need.");
          return;
        }
        data.produits = quote.map(function (it) { return it.qty + " × " + it.name + " (" + it.sku + ")"; }).join("\n");
      }
      var subjectLine = kind === "quote"
        ? T("Demande de soumission — ", "Quote request — ") + (data.entreprise || data.nom)
        : "[logtek.ca] " + (form.querySelector('select[name="sujet"] option:checked') || {}).textContent + " — " + (data.entreprise || data.nom);
      if (kind === "services") subjectLine = T("Idée de service — ", "Service idea — ") + (data.entreprise || data.nom);

      var lines = [];
      if (data.produits) lines.push(T("PRODUITS", "PRODUCTS") + ":\n" + data.produits + "\n");
      Object.keys(LABELS).forEach(function (k) { if (data[k]) lines.push(LABELS[k] + ": " + data[k]); });
      var text = lines.join("\n");

      function done() {
        status.className = "form-status ok";
        status.textContent = T("Merci! On vous revient rapidement.", "Thanks! We'll get back to you shortly.");
        form.reset();
        if (kind === "quote") { quote = []; save(quote); render(); }
      }

      if (ENDPOINT) {
        var btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(Object.assign({ _subject: subjectLine, _replyto: data.courriel, resume: text }, data))
        }).then(function (r) {
          if (!r.ok) throw new Error(r.status);
          done();
        }).catch(function () {
          status.className = "form-status err";
          status.textContent = T("Erreur d'envoi. Écrivez-nous à ", "Sending failed. Email us at ") + EMAIL;
        }).then(function () { btn.disabled = false; });
      } else {
        location.href = "mailto:" + EMAIL + "?subject=" + encodeURIComponent(subjectLine) + "&body=" + encodeURIComponent(text);
        status.className = "form-status ok";
        status.textContent = T("Votre logiciel de courriel s'ouvre avec la demande. Il ne reste qu'à l'envoyer.", "Your email app is opening with the request. Just hit send.");
      }
    });
  });
  /* ==========================================================================
     Animations
     ========================================================================== */
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Apparition au défilement ---------- */
  var REVEAL = ".section-head, .pillar, .module, .mode, .feature-grid > div, .why-grid > div, .tech-grid > div, " +
    ".product, .soon-card, .roles-card, .checks li, .platforms span, .values > div, .services > div, .story > *, " +
    ".form, .contact-wrap > div, .cta-inner > div, .quote-wrap > div, .split > div:not(.hero-visual), .chain-stage, .team > div, .faq > *";
  var items = [];
  document.querySelectorAll(REVEAL).forEach(function (el) {
    if (el.closest(".hero, .page-hero")) return;
    el.classList.add("reveal");
    var i = 0, sib = el;
    while ((sib = sib.previousElementSibling) && i < 8) { if (sib.classList.contains("reveal")) i++; }
    el.style.setProperty("--d", i);
    items.push(el);
  });
  var vh = window.innerHeight;
  items.forEach(function (el) { if (el.getBoundingClientRect().top < vh * .9) el.classList.add("in"); });
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: .12 });
    items.forEach(function (el) { if (!el.classList.contains("in")) io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- En-tête compact + chaîne qui glisse au défilement ---------- */
  var chain = document.querySelector(".chain-feature .chain-photo, .chain-feature .chain-art");
  var ticking = false;
  function onScroll() {
    body.classList.toggle("scrolled", window.scrollY > 24);
    // Filet de sécurité : tout élément déjà dépassé (saut d'ancre, touche Fin) devient visible
    if (items.length) {
      var h = window.innerHeight;
      items = items.filter(function (el) {
        if (el.classList.contains("in")) return false;
        if (el.getBoundingClientRect().top < h) { el.classList.add("in"); return false; }
        return true;
      });
    }
    if (chain && !reduce) {
      var r = chain.getBoundingClientRect();
      var p = (window.innerHeight - r.top) / (window.innerHeight + r.height); // 0 → 1 en traversant l'écran
      if (p > -0.2 && p < 1.2) chain.style.transform = "rotate(-3deg) translateX(" + ((p - .5) * -90).toFixed(1) + "px)";
    }
    ticking = false;
  }
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();
  document.querySelectorAll(".chain-art circle").forEach(function (c, i) { c.style.setProperty("--i", i % 19); });

  /* ---------- Téléphone : écrans qui défilent, inclinaison 3D, compteurs ---------- */
  document.querySelectorAll(".phone").forEach(function (phone) {
    var app = phone.querySelector(".app");
    var screens = Array.prototype.slice.call(phone.querySelectorAll(".app-screen"));
    var title = phone.querySelector("[data-title]");
    var navBtns = phone.querySelectorAll(".app-nav button[data-go]");
    var order = ["home", "map", "equipment"];
    var current = "home", timer, counted = false;

    function countUp() {
      if (counted) return; counted = true;
      phone.querySelectorAll("[data-count]").forEach(function (el) {
        var end = +el.getAttribute("data-count"), t0 = null;
        if (reduce) { el.textContent = end; return; }
        function step(t) {
          if (!t0) t0 = t;
          var k = Math.min(1, (t - t0) / 900);
          el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3)));
          if (k < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }
    function show(name) {
      if (name === current) return;
      screens.forEach(function (s) {
        var on = s.getAttribute("data-screen") === name;
        s.classList.toggle("is-out", s.classList.contains("is-on") && !on);
        s.classList.toggle("is-on", on);
        if (on) { title.textContent = s.getAttribute("data-title"); }
      });
      setTimeout(function () { screens.forEach(function (s) { s.classList.remove("is-out"); }); }, 500);
      navBtns.forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-go") === name); });
      app.classList.toggle("map-mode", name === "map"); // comme l'app : en-tête et nav cachés sur la carte
      current = name;
      if (name === "home") homeScroll();
    }
    // L'écran d'accueil défile doucement pour montrer le tableau de bord
    var scrollRaf;
    function homeScroll() {
      var home = phone.querySelector('[data-screen="home"]');
      cancelAnimationFrame(scrollRaf); home.scrollTop = 0;
      if (reduce) { countUp(); return; }
      var max = home.scrollHeight - home.clientHeight, t0 = null;
      function step(t) {
        if (!t0) t0 = t;
        var k = Math.min(1, (t - t0 - 1500) / 2200);
        if (k > 0) { home.scrollTop = max * (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2); if (k > .35) countUp(); }
        if (k < 1) scrollRaf = requestAnimationFrame(step);
      }
      scrollRaf = requestAnimationFrame(step);
    }
    function next() { show(order[(order.indexOf(current) + 1) % order.length]); }
    function schedule() { clearInterval(timer); if (!reduce) timer = setInterval(next, 5200); }

    phone.querySelectorAll("[data-go]").forEach(function (b) {
      b.addEventListener("click", function () { show(b.getAttribute("data-go")); schedule(); });
    });
    phone.addEventListener("mouseenter", function () { clearInterval(timer); });
    phone.addEventListener("mouseleave", schedule);

    // Hors ligne ↔ synchronisé : petite démo périodique
    if (!reduce) setInterval(function () { app.classList.add("offline"); setTimeout(function () { app.classList.remove("offline"); }, 2600); }, 9000);

    // Démarre seulement quand le téléphone est visible
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { if (current === "home") homeScroll(); schedule(); } else { clearInterval(timer); cancelAnimationFrame(scrollRaf); }
      }, { threshold: .3 }).observe(phone);
    } else { homeScroll(); schedule(); }

    // Inclinaison 3D qui suit la souris
    var shell = phone.querySelector(".phone-shell");
    if (shell && !reduce && window.matchMedia("(hover: hover)").matches) {
      var zone = phone.closest(".hero-visual") || phone;
      zone.addEventListener("mousemove", function (e) {
        var r = phone.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        shell.style.setProperty("--ry", (x * 14).toFixed(2) + "deg");
        shell.style.setProperty("--rx", (-y * 10).toFixed(2) + "deg");
      });
      zone.addEventListener("mouseleave", function () { shell.style.setProperty("--ry", "0deg"); shell.style.setProperty("--rx", "0deg"); });
    }
  });
  /* ---------- Ouverture : séquence vidéo pilotée par le défilement ----------
     Défilement lissé (inertie), fondu entre deux images voisines, jeu vertical sur cellulaire,
     ouverture en « rideau » au chargement, phrases mot par mot, sortie en carte vers le hero. */
  document.querySelectorAll(".reel").forEach(function (reel) {
    var sticky = reel.querySelector(".reel-sticky"), stage = reel.querySelector(".reel-stage");
    var media = reel.querySelector(".reel-media"), shade = reel.querySelector(".reel-shade"), ui = reel.querySelector(".reel-ui");
    var canvas = reel.querySelector(".reel-canvas"), ctx = canvas && canvas.getContext("2d");
    var titleEl = reel.querySelector(".reel-title"), steps = Array.prototype.slice.call(reel.querySelectorAll(".reel-title > span"));
    var lead = reel.querySelector(".reel-lead");
    var bars = reel.querySelectorAll(".reel-bars i"), stepNum = reel.querySelector("[data-step]"), tc = reel.querySelector("[data-tc]");
    var header = document.querySelector(".site-header"), overlay = body.classList.contains("has-reel");
    var n = +reel.getAttribute("data-frames") || 0, fps = +reel.getAttribute("data-fps") || 15;
    var srcSq = reel.getAttribute("data-src") || "", srcPt = reel.getAttribute("data-src-portrait") || srcSq;
    var portrait = window.matchMedia("(orientation: portrait)");
    var src = portrait.matches ? srcPt : srcSq;
    function pad(i) { return "f" + String(i).padStart(3, "0") + ".jpg"; }
    function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    function inOut(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    // Phrases alignées en bas : le surtitre et les chapitres glissent pour coller à la phrase active
    function placeLead(s) {
      if (!lead || !steps[s]) return;
      var gap = titleEl.offsetHeight - steps[s].offsetHeight;
      lead.style.transform = gap > 1 ? "translate3d(0," + gap + "px,0)" : "";
    }

    // En-tête transparent tant que le reel est dessous
    var headerH = header ? header.offsetHeight : 72;
    function onReel() { if (overlay) body.classList.toggle("on-reel", reel.getBoundingClientRect().bottom > headerH); }
    if (overlay) { window.addEventListener("scroll", onReel, { passive: true }); onReel(); }

    // « Réduire les animations » : le vidéo suit quand même le doigt (mouvement contrôlé par la personne),
    // mais sans ouverture en rideau, sans zoom, sans parallaxe ni grain (voir aussi style.css).
    if (!ctx || !n) {
      // Image fixe : l'affiche <picture> reste visible et suit déjà l'orientation de l'écran
      reel.classList.add("is-open", "no-intro");
      placeLead(0); window.addEventListener("resize", function () { placeLead(0); });
      if (document.fonts) document.fonts.ready.then(function () { placeLead(0); });
      return;
    }

    // Script en retard : si l'ouverture de secours en CSS (2,6 s) a déjà démarré, on ne la rejoue pas
    var fb = stage.getAnimations && stage.getAnimations().filter(function (a) { return a.animationName === "reel-open"; })[0];
    var fbT = fb ? (fb.currentTime || 0) : (window.performance && performance.now() > 4000 ? 1e9 : 0);

    // Découpe des phrases en mots masqués (la ponctuation reste collée au mot précédent)
    steps.forEach(function (el) {
      var words = [[]];
      Array.prototype.forEach.call(el.childNodes, function (node) {
        var gold = node.nodeType === 1; // <em> = mot-clé doré
        node.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { if (words[words.length - 1].length) words.push([]); }
          else words[words.length - 1].push({ t: part, g: gold });
        });
      });
      words = words.filter(function (w) { return w.length; }).reduce(function (acc, w) {
        var txt = w.map(function (x) { return x.t; }).join("");
        if (acc.length && /^[:;!?»]+$/.test(txt)) acc[acc.length - 1] = acc[acc.length - 1].concat([{ t: " ", g: false }], w);
        else acc.push(w);
        return acc;
      }, []);
      el.innerHTML = words.map(function (w, i) {
        var html = w.map(function (x) { return x.g ? "<em>" + esc(x.t) + "</em>" : esc(x.t); }).join("");
        return '<span class="w"><span class="wi" style="--i:' + i + '">' + html + "</span></span>";
      }).join(" ");
      el.classList.remove("on");
    });
    titleEl.classList.add("is-split");

    var INTRO_F = Math.min(12, n - 1), INTRO_MS = 1600, EXIT = .82;
    // Réseau : avant la fin du chargement, seulement les images d'ouverture (2 à la fois) pour ne pas voler la bande
    // passante à l'affiche et aux polices ; ensuite le reste, 4 à la fois. Économie de données / 2G : une image sur 4.
    var conn = navigator.connection || {};
    var STRIDE = conn.saveData || /2g/.test(conn.effectiveType || "") ? 4 : 1;
    var pageLoaded = document.readyState === "complete";
    if (!pageLoaded) window.addEventListener("load", function () { pageLoaded = true; pump(); });
    var frames = [], ok = [], queue = [], inflight = 0, sized = false;
    var top0 = 0, span = 1, tp = 0, sp = 0, lastF = -1, drawn = -1, dirty = true, cur = -1;
    var mx = 0, my = 0, mxs = 0, mys = 0;
    var opened = false, introE = 0, introT0 = 0, wordsOn = false, visible = true, running = false, last = 0;

    // Chargement : d'abord l'ouverture, puis une image sur 8, 4, 2, 1 (le défilement marche tout de suite, de plus en plus fin)
    function reset() {
      frames = new Array(n); ok = new Array(n); queue = []; inflight = 0; sized = false; dirty = true; lastF = -1; drawn = -1;
      var seen = {};
      function add(i) { if (!seen[i]) { seen[i] = 1; queue.push(i); } }
      for (var i = 0; i <= INTRO_F + 3 && i < n; i += STRIDE) add(i);
      [8, 4, 2, 1].forEach(function (s) { if (s < STRIDE) return; for (var k = 0; k < n; k += s) add(k); });
      pump();
    }
    function pump() {
      var max = pageLoaded ? 4 : 2;
      while (inflight < max && queue.length && (pageLoaded || queue[0] <= INTRO_F + 3)) fetchFrame(queue.shift(), src);
    }
    function fetchFrame(i, set) {
      var im = new Image(); im.decoding = "async"; frames[i] = im; inflight++;
      im.onload = function () {
        if (set !== src || frames[i] !== im) return; // chargement d'un tour précédent (rotation de l'écran)
        inflight--; ok[i] = true;
        if (!sized) { sized = true; canvas.width = im.naturalWidth; canvas.height = im.naturalHeight; dirty = true; wake(); }
        // redessiner si cette image est plus proche de la position que celle affichée
        if (lastF < 0 || Math.abs(i - lastF) < Math.max(1.5, drawn < 0 ? n : Math.abs(drawn - lastF))) { dirty = true; wake(); }
        pump(); gate();
      };
      im.onerror = function () { if (set !== src || frames[i] !== im) return; inflight--; pump(); };
      im.src = set + pad(i);
    }
    function near(i) {
      for (var d = 0; d < n; d++) { if (i - d >= 0 && ok[i - d]) return i - d; if (i + d < n && ok[i + d]) return i + d; }
      return -1;
    }
    // Position fractionnaire : l'image suivante est fondue par-dessus selon la fraction
    function paint(f) {
      var a = Math.floor(f), t = f - a, ia = near(a), ib = near(Math.min(n - 1, a + 1));
      if (ia < 0 || !frames[ia]) return false;
      if (ib >= 0 && !frames[ib]) ib = ia;
      var w = canvas.width, h = canvas.height; drawn = ia;
      ctx.globalAlpha = 1; ctx.drawImage(frames[ia], 0, 0, w, h);
      if (ib !== ia && t > .01) { ctx.globalAlpha = t; ctx.drawImage(frames[ib], 0, 0, w, h); ctx.globalAlpha = 1; }
      if (!reel.classList.contains("ready")) reel.classList.add("ready");
      return true;
    }

    function measure() {
      var r = reel.getBoundingClientRect();
      top0 = r.top + window.scrollY; span = Math.max(1, reel.offsetHeight - sticky.offsetHeight);
      if (header) headerH = header.offsetHeight;
    }
    function prog() { return clamp((window.scrollY - top0) / span); }
    function stepAt(p) { return Math.min(steps.length - 1, Math.floor(clamp(p / EXIT) * steps.length)); }

    function setStep(s) {
      if (s === cur) return;
      steps.forEach(function (el, k) {
        if (k === s) { clearTimeout(el._t); el.classList.remove("out"); el.classList.add("on"); }
        else if (el.classList.contains("on")) {
          el.classList.remove("on"); el.classList.add("out");
          clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove("out"); }, 1000);
        }
      });
      cur = s;
      placeLead(s);
    }

    function render() {
      var ie = opened ? inOut(introE) : 0;
      var f = INTRO_F * ie + sp * (n - 1 - INTRO_F);
      if (dirty || Math.abs(f - lastF) > .01) { if (paint(f)) { lastF = f; dirty = false; } }
      // Recul lent au défilement + poussée d'ouverture + légère parallaxe à la souris
      var zoom = reduce ? 1.04 : (1.1 - .07 * sp) * (1 + .14 * (1 - ie));
      media.style.transform = "translate3d(" + (-mxs * 18).toFixed(2) + "px," + (-mys * 12).toFixed(2) + "px,0) scale(" + zoom.toFixed(4) + ")";
      // Sortie : la vidéo devient une carte qui rapetisse et s'assombrit
      var e = clamp((sp - EXIT) / (1 - EXIT)), ee = e * e * (3 - 2 * e);
      shade.style.setProperty("--dim", (.55 * ee).toFixed(3));
      ui.style.transform = ee > 0 ? "translate3d(0," + (-80 * ee).toFixed(1) + "px,0)" : "";
      ui.style.opacity = ee > 0 ? Math.max(0, 1 - 1.6 * ee).toFixed(3) : "";
      // Chapitres
      var tq = clamp(sp / EXIT) * steps.length, s = stepAt(sp);
      if (wordsOn) setStep(s);
      for (var k = 0; k < bars.length; k++) bars[k].style.setProperty("--f", clamp(tq - k).toFixed(3));
      if (stepNum) { var sn = "0" + (s + 1); if (stepNum.textContent !== sn) stepNum.textContent = sn; }
      // Horodatage façon caméra (hh:ss:images à 30 i/s)
      if (tc) {
        var sec = f / fps, ss = Math.floor(sec), ff = Math.floor((sec - ss) * 30);
        var str = "00:" + (ss < 10 ? "0" : "") + ss + ":" + (ff < 10 ? "0" : "") + ff;
        if (tc.textContent !== str) tc.textContent = str;
      }
      reel.classList.toggle("is-moved", tp > .015);
      // État publié pour les modules fx (ex. fx-reel-map) : progression lissée, image courante, sortie 0→1
      reel._ltk = { sp: sp, f: f, ee: ee, n: n, fps: fps, portrait: src === srcPt, src: src, step: s };
      if (window.LTK && LTK.fx) LTK.fx.wake();
    }

    function wake() { if (!running && visible) { running = true; last = performance.now(); requestAnimationFrame(tick); } }
    function tick(now) {
      var dt = Math.min(.064, Math.max(0, (now - last) / 1000)); last = now;
      tp = prog();
      sp += (tp - sp) * (1 - Math.exp(-dt / .12)); // lissage indépendant de la fréquence d'affichage
      if (Math.abs(tp - sp) < .0003) sp = tp;
      var km = 1 - Math.exp(-dt / .35);
      mxs += (mx - mxs) * km; mys += (my - mys) * km;
      if (Math.abs(mx - mxs) < .002) mxs = mx;
      if (Math.abs(my - mys) < .002) mys = my;
      if (opened && introE < 1) introE = Math.min(1, Math.max(0, (performance.now() - introT0) / INTRO_MS));
      render();
      if (visible && (sp !== tp || mxs !== mx || mys !== my || (opened && introE < 1))) requestAnimationFrame(tick);
      else running = false;
    }

    // Ouverture : dès que les premières images et les polices sont prêtes (ou après 1,5 s au plus tard)
    var fontsOk = !document.fonts;
    if (document.fonts) document.fonts.ready.then(function () { fontsOk = true; gate(); });
    function gate() {
      if (opened) return;
      for (var i = 0; i <= INTRO_F; i += STRIDE) if (!ok[i]) return;
      if (fontsOk) openReel(false);
    }
    function openReel(skip) {
      if (opened) return; opened = true;
      reel.classList.add("is-open");
      if (skip) { reel.classList.add("no-intro"); introE = 1; wordsOn = true; setStep(stepAt(prog())); }
      else { introT0 = performance.now(); setTimeout(function () { wordsOn = true; setStep(stepAt(sp)); }, 700); }
      wake();
    }

    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", function () { measure(); dirty = true; placeLead(Math.max(0, cur)); wake(); });
    var swap = function () { var next = portrait.matches ? srcPt : srcSq; if (next !== src) { src = next; reset(); } };
    if (portrait.addEventListener) portrait.addEventListener("change", swap); else if (portrait.addListener) portrait.addListener(swap);
    if (!reduce && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      sticky.addEventListener("mousemove", function (e) { mx = e.clientX / window.innerWidth * 2 - 1; my = e.clientY / window.innerHeight * 2 - 1; wake(); });
      sticky.addEventListener("mouseleave", function () { mx = 0; my = 0; wake(); });
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) { dirty = true; wake(); } }).observe(reel);
    }

    measure(); reset(); placeLead(0);
    if (document.fonts) document.fonts.ready.then(function () { placeLead(Math.max(0, cur)); });
    if (reduce || window.scrollY > 40 || fbT >= 2500) openReel(true);
    else setTimeout(function () { openReel(false); }, Math.max(0, Math.min(1500, 2500 - fbT)));
    sp = tp = prog(); render();
  });
})();
