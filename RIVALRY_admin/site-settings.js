/* Reads the settings saved from /admin and applies them to the page. */
(function () {
  "use strict";

  var API = "/api/settings";
  var CACHE_KEY = "rivalry-settings";
  var DEFAULTS = {
    tournamentDate: "",
    prizePool: "",
    entryFee: 50,
    registrationOpen: true,
    announcement: "",
    formUrl: "",
    discordUrl: "",
    whatsappUrl: ""
  };
  var timer = null;

  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function safeUrl(u) { return typeof u === "string" && /^https?:\/\//i.test(u) ? u : ""; }

  function merge(raw) {
    var s = {}, k;
    for (k in DEFAULTS) s[k] = DEFAULTS[k];
    if (raw && typeof raw === "object") {
      for (k in DEFAULTS) {
        if (raw[k] !== undefined && raw[k] !== null) s[k] = raw[k];
      }
    }
    s.entryFee = Number(s.entryFee);
    if (!isFinite(s.entryFee) || s.entryFee < 0) s.entryFee = DEFAULTS.entryFee;
    s.registrationOpen = s.registrationOpen !== false;
    return s;
  }

  function formatDate(t) {
    try {
      return new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short",
        hour: "numeric", minute: "2-digit", hour12: true
      }).format(new Date(t)) + " IST";
    } catch (e) { return ""; }
  }

  function setDate(iso) {
    if (timer) { clearInterval(timer); timer = null; }
    var el = q("#countdown");
    var txt = q("#date-text");
    if (!el) return;
    var t = iso ? new Date(iso).getTime() : NaN;
    if (isNaN(t)) {
      el.textContent = "Date soon";
      if (txt) txt.hidden = true;
      return;
    }
    if (txt) { txt.textContent = formatDate(t); txt.hidden = false; }
    function tick() {
      var diff = t - Date.now();
      if (diff <= 0) { el.textContent = "Live now"; return false; }
      var d = Math.floor(diff / 864e5);
      var h = Math.floor(diff % 864e5 / 36e5);
      var m = Math.floor(diff % 36e5 / 6e4);
      el.textContent = d + "d " + h + "h " + m + "m";
      return true;
    }
    if (tick()) timer = setInterval(tick, 30000);
  }

  function setLink(a, href, closed) {
    if (!a._orig) {
      a._orig = {
        text: a.textContent,
        href: a.getAttribute("href") || "",
        target: a.getAttribute("target"),
        rel: a.getAttribute("rel")
      };
    }
    if (closed) {
      a.textContent = "Registration closed";
      a.removeAttribute("href");
      a.removeAttribute("target");
      a.setAttribute("aria-disabled", "true");
      a.classList.add("is-closed");
    } else {
      a.textContent = a._orig.text;
      a.setAttribute("href", href || a._orig.href);
      if (a._orig.target) a.setAttribute("target", a._orig.target);
      if (a._orig.rel) a.setAttribute("rel", a._orig.rel);
      a.removeAttribute("aria-disabled");
      a.classList.remove("is-closed");
    }
  }

  function apply(s) {
    var closed = !s.registrationOpen;

    qa("[data-fee]").forEach(function (el) { el.textContent = String(s.entryFee); });
    qa("[data-upi-link]").forEach(function (a) {
      a.setAttribute("href", a.getAttribute("href").replace(/am=[\d.]+/, "am=" + s.entryFee));
    });

    var banner = q("#site-banner");
    if (banner) {
      banner.textContent = s.announcement || "";
      banner.hidden = !s.announcement;
    }

    var prize = q("#prize");
    if (prize) prize.textContent = s.prizePool || "To be announced";

    setDate(s.tournamentDate);

    var form = safeUrl(s.formUrl);
    qa("[data-register]").forEach(function (a) { setLink(a, form, closed); });
    qa("[data-pay-link]").forEach(function (a) { setLink(a, "", closed); });
    qa("[data-hide-when-closed]").forEach(function (el) { el.hidden = closed; });
    qa("[data-show-when-closed]").forEach(function (el) { el.hidden = !closed; });

    var d = q("#discord-link"), w = q("#whatsapp-link"), c = q("#community");
    var discord = safeUrl(s.discordUrl), whatsapp = safeUrl(s.whatsappUrl);
    if (d) { if (discord) d.href = discord; d.hidden = !discord; }
    if (w) { if (whatsapp) w.href = whatsapp; w.hidden = !whatsapp; }
    if (c) c.hidden = !(discord || whatsapp);
  }

  var cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) {}
  apply(merge(cached));

  fetch(API, { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (!j || typeof j !== "object") return;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(j)); } catch (e) {}
      apply(merge(j));
    })
    .catch(function () {});
})();
