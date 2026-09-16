/* ============================================================
   NewEra Studio — Community (frontend page)
   Loads after wallet.js + script.js. Public gallery from
   GET /community. No fake data.
   ============================================================ */
(function () {
  "use strict";

  var API = "https://newerabackend-production.up.railway.app";

  function token() { return localStorage.getItem("newera_token"); }
  function address() { return localStorage.getItem("newera_address"); }
  function $(id) { return document.getElementById(id); }
  function shorten(a) { return a ? a.slice(0, 6) + "\u2026" + a.slice(-4) : ""; }
  function escapeHtml(s) {
    return (s || "").replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function fmtNea(v) {
    if (v == null) return "0";
    if (typeof v === "string" && v.length > 12 && /^[0-9]+$/.test(v)) {
      v = window.ethers ? window.ethers.formatUnits(v, 18) : v;
    }
    var n = parseFloat(v);
    return isNaN(n) ? "0" : Math.floor(n).toLocaleString("en-US");
  }

  var grid = $("grid"), searchInput = $("search");
  var creditVal = $("creditVal"), sbAddr = $("sbAddr"), sbAva = $("sbAva");
  var allItems = [];

  // ---- account (sidebar + topbar NEA) ----
  async function refreshAccount() {
    var addr = address();
    if (!addr) {
      if (sbAddr) sbAddr.textContent = "Not connected";
      if (creditVal) creditVal.textContent = "0";
      return;
    }
    if (sbAddr) sbAddr.textContent = shorten(addr);
    if (sbAva) sbAva.textContent = (addr.charAt(2) || "N").toUpperCase();
    try {
      var r = await fetch(API + "/balance/" + addr);
      var data = await r.json();
      if (creditVal) creditVal.textContent = fmtNea(data && data.neaBalance);
    } catch (e) { console.log("balance load failed:", e); }
  }

  // ---- render ----
  function cardHtml(it) {
    var name = it.title || it.prompt || "Untitled creation";
    return '<div class="cm-card">' +
        '<div class="cm-img">' +
          '<span class="cm-badge"><i></i> Public</span>' +
          '<img src="' + it.imageUrl + '" alt="' + escapeHtml(name) + '" loading="lazy" onload="this.classList.add(\'loaded\')" onerror="this.classList.add(\'loaded\')">' +
        '</div>' +
        '<div class="cm-meta">' +
          '<div class="cm-title">' + escapeHtml(name) + '</div>' +
          '<div class="cm-by">by <b>' + escapeHtml(shorten(it.ownerId || "")) + '</b></div>' +
        '</div>' +
      '</div>';
  }
  function render(list) {
    if (!grid) return;
    if (!list.length) {
      grid.innerHTML = '<div class="cm-empty">Nothing public yet. Make one of your creations public from your ' +
        '<a href="collection.html">collection</a>.</div>';
      return;
    }
    grid.innerHTML = list.map(cardHtml).join("");
  }

  // ---- load feed (GET /community -> { count, images }) ----
  async function loadFeed() {
    try {
      var r = await fetch(API + "/community");
      if (!r.ok) throw new Error("HTTP " + r.status);
      var data = await r.json();
      allItems = (data && data.images) || [];
      render(allItems);
    } catch (e) {
      console.log("community load failed:", e);
      if (grid) grid.innerHTML =
        '<div class="cm-empty">Couldn\u2019t load the community feed right now. Please try again.</div>';
    }
  }

  // ---- search ----
  if (searchInput) {
    searchInput.addEventListener("input", function () {
      var q = this.value.toLowerCase().trim();
      if (!q) { render(allItems); return; }
      render(allItems.filter(function (it) {
        var n = (it.title || it.prompt || "").toLowerCase();
        return n.indexOf(q) >= 0;
      }));
    });
  }

  // relocate the search into a big bar under the heading (premium placement)
  (function relocateSearch(){
    var head = document.querySelector(".col-head");
    var inp = document.getElementById("search");
    if (!head || !inp) return;
    var big = document.createElement("div");
    big.className = "cm-search-big";
    big.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>';
    big.appendChild(inp);
    var kbd = document.createElement("kbd");
    kbd.textContent = "/";
    big.appendChild(kbd);
    head.insertAdjacentElement("afterend", big);
  })();

  // focus search on "/"
  document.addEventListener("keydown", function (e) {
    var tag = document.activeElement && document.activeElement.tagName;
    if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
      e.preventDefault();
      var inp = document.getElementById("search");
      if (inp) inp.focus();
    }
  });

  // ---- init ----
  refreshAccount();
  loadFeed();
  if (window.ethereum && window.ethereum.on) {
    window.ethereum.on("accountsChanged", function () { setTimeout(refreshAccount, 400); });
  }
})();