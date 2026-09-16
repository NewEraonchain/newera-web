/* ============================================================
   NewEra Studio — Collection page
   Loads the logged-in user's generated images into a grid.
   ============================================================ */
(function () {
  "use strict";

  var API = "https://newerabackend-production.up.railway.app";

  function token() { return localStorage.getItem("newera_token"); }
  function address() { return localStorage.getItem("newera_address"); }
  function shorten(a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : ""; }
  function escapeHtml(s) {
    return (s || "").replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  var sbAddr = document.getElementById("sbAddr");
  var creditVal = document.getElementById("creditVal");
  var grid = document.getElementById("colGrid");
  var empty = document.getElementById("colEmpty");

  // account info (address + balance)
  async function refreshAccount() {
    var addr = address();
    if (!addr) { if (sbAddr) sbAddr.textContent = "Not connected"; return; }
    if (sbAddr) sbAddr.textContent = shorten(addr);
    try {
      var r = await fetch(API + "/balance/" + addr);
      var data = await r.json();
      if (data && data.neaBalance != null && creditVal) {
        var bal = data.neaBalance;
        if (typeof bal === "string" && bal.length > 12 && /^[0-9]+$/.test(bal)) {
          bal = window.ethers ? window.ethers.formatUnits(bal, 18) : bal;
        }
        creditVal.textContent = Math.floor(parseFloat(bal)).toString();
      }
    } catch (e) { console.log("balance failed:", e); }
  }

  // load images into the grid
  async function loadCollection() {
    if (!token()) {
      if (empty) empty.textContent = "Connect your wallet to see your collection.";
      return;
    }
    try {
      var r = await fetch(API + "/my-images", {
        headers: { "Authorization": "Bearer " + token() }
      });
      if (!r.ok) { if (empty) empty.textContent = "Could not load your collection."; return; }
      var data = await r.json();
      if (!data.images || !data.images.length) {
        if (empty) empty.innerHTML = 'No images yet. <a href="index.html" style="color:var(--acc)">Generate your first one →</a>';
        return;
      }
      grid.innerHTML = "";
      data.images.forEach(function (img) {
        var card = document.createElement("div");
        card.className = "col-card";
        card.innerHTML =
          '<div class="cc-img"><img src="' + img.imageUrl + '" alt="' + escapeHtml(img.prompt) + '" loading="lazy"></div>' +
          '<div class="cc-meta">' +
            '<div class="cc-prompt">' + escapeHtml(img.prompt) + '</div>' +
            '<div class="cc-model">NewEra AI</div>' +
          '</div>';
        grid.appendChild(card);
      });
    } catch (e) {
      console.log("collection load failed:", e);
      if (empty) empty.textContent = "Could not load your collection.";
    }
  }

  refreshAccount();
  loadCollection();
})();