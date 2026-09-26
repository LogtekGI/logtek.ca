/* Logtek — scripts du site (aucune dépendance) */
(function () {
  "use strict";
  var body = document.body;
  var lang = body.getAttribute("data-lang") || "fr";
  var EMAIL = body.getAttribute("data-email");
  var ENDPOINT = body.getAttribute("data-endpoint");
  var T = function (fr, en) { return lang === "fr" ? fr : en; };

  /* ---------- Menu mobile ---------- */
  var toggle = document.querySelector(".nav-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var open = body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.querySelectorAll(".main-nav a").forEach(function (a) {
      a.addEventListener("click", function () { body.classList.remove("nav-open"); toggle.setAttribute("aria-expanded", "false"); });
    });
  }

  /* ---------- Soumission (panier sans paiement) ---------- */
  var KEY = "logtek_quote";
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function save(items) { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* stockage indisponible */ } }
  var quote = load();

  var list = document.getElementById("quote-list");
  var bar = document.getElementById("quote-bar");
  var count = document.getElementById("quote-count");
  var TRASH = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13.5h9l1-13.5"/></svg>';

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
        var qty = Math.max(1, parseInt(card.querySelector("input").value, 10) || 1);
        var sku = card.getAttribute("data-sku");
        var found = quote.filter(function (it) { return it.sku === sku; })[0];
        if (found) found.qty += qty; else quote.push({ sku: sku, name: card.getAttribute("data-name"), qty: qty });
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
})();
