/* ============================================================
   NewEra Studio — Marketplace
   Loads after wallet.js (connect + JWT) and script.js (chrome).
   No fake data. Listings come from GET /listings.
   ============================================================ */
(function () {
  "use strict";

  // ---- config ----
  var API = "https://newerabackend-production.up.railway.app"; // change when deployed
  var NEA_ADDRESS = "0xBcD3Efa389cBd00E424a6ca19929023B3F1DCFaD";
  var MARKET_ADDRESS = "0x8f585e8c9f8784cEC2D92f328046303240f35769";

  // Set BUY_ENABLED = true once the buy() signature below is confirmed AND
  // /listings returns an on-chain listing id (see note in chat).
  var BUY_ENABLED = true;
  // viem-style ABIs (for gasless calls via window.newera)
  var MARKET_ABI_V = [
    { type:"function", name:"buy", inputs:[{name:"id",type:"uint256"}], outputs:[], stateMutability:"nonpayable" }
  ];
  var NEA_ABI_V = [
    { type:"function", name:"approve", inputs:[{name:"spender",type:"address"},{name:"amount",type:"uint256"}], outputs:[{type:"bool"}], stateMutability:"nonpayable" },
    { type:"function", name:"allowance", inputs:[{name:"owner",type:"address"},{name:"spender",type:"address"}], outputs:[{type:"uint256"}], stateMutability:"view" },
    { type:"function", name:"balanceOf", inputs:[{name:"owner",type:"address"}], outputs:[{type:"uint256"}], stateMutability:"view" }
  ];

  var MARKET_ABI = [
    "function buy(uint256 id) external"   // Marketplace.sol: buy(listing id); split enforced on-chain
  ];
  var NEA_ABI = [
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
  ];

  // ---- helpers ----
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

  function toWei(price) {
    // DB price may be stored in wei (big) or plain NEA (small). Auto-detect.
    var str = String(price == null ? "0" : price).trim();
    if (/^[0-9]+$/.test(str) && str.length >= 13) {
      return BigInt(str);                 // already wei
    }
    return window.ethers.parseUnits(str, 18); // plain NEA -> wei
  }

  // ---- elements ----
  var grid = $("grid"), searchInput = $("search");
  var creditVal = $("creditVal"), sbAddr = $("sbAddr"), sbAva = $("sbAva");
  var toast = $("toast");
  var allItems = [];
  var myUserId = null;

  // ---- toast ----
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg || "Done";
    toast.classList.add("show");
    setTimeout(function () { toast.classList.remove("show"); }, 1500);
  }

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

  // ---- who am I (to flag my own listings) ----
  async function loadMe() {
    if (!token()) return;
    try {
      var r = await fetch(API + "/me", { headers: { "Authorization": "Bearer " + token() } });
      if (!r.ok) return;
      var data = await r.json();
      var u = (data && data.user) || data || {};
      myUserId = u.id != null ? u.id : null;
    } catch (e) { console.log("/me load failed:", e); }
  }

  // ---- map a /listings row to card fields ----
  function mapItem(it) {
    return {
      imageId:   it.id,                          // image id (used by POST /buy)
      imageUrl:  it.imageUrl || "",
      prompt:    it.prompt || "Untitled creation",
      price:     it.price,
      ownerId:   it.ownerId,
      listingId: it.onchainListingId,            // present once backend returns it
      title:     it.title
    };
  }

  // ---- render ----
  function cardHtml(it) {
    var name = it.title || it.prompt;
    var mine = myUserId != null && it.ownerId != null && it.ownerId === myUserId;
    var action = mine
      ? '<div class="mk-own">Your listing</div>'
      : '<button class="mk-buy" data-img="' + escapeHtml(String(it.imageId)) +
          '" data-price="' + escapeHtml(String(it.price)) +
          '" data-listing="' + escapeHtml(it.listingId != null ? String(it.listingId) : "") + '">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 12.3a2 2 0 0 0 2 1.7h8.2a2 2 0 0 0 2-1.6L22 7H6"/></svg>' +
          'Buy</button>';
    return '<div class="mk-card">' +
        '<div class="mk-img">' +
          '<span class="mk-badge"><i></i> For sale</span>' +
          '<img src="' + it.imageUrl + '" alt="' + escapeHtml(name) + '" loading="lazy" onload="this.classList.add(\'loaded\')" onerror="this.classList.add(\'loaded\')">' +
        '</div>' +
        '<div class="mk-meta">' +
          '<div class="mk-title">' + escapeHtml(it.title || it.prompt) + '</div>' +
          '<div class="mk-sub">' +
            '<span class="mk-seller">on-chain</span>' +
            '<span class="mk-price">' + fmtNea(it.price) + '<small>NEA</small></span>' +
          '</div>' +
          action +
        '</div>' +
      '</div>';
  }

  function render(list) {
    if (!grid) return;
    if (!list.length) {
      grid.innerHTML = '<div class="mk-empty">No listings yet. List one from your ' +
        '<a href="collection.html">collection</a>.</div>';
      return;
    }
    grid.innerHTML = list.map(cardHtml).join("");
  }

  // ---- load listings (GET /listings -> { count, listings }) ----
  async function loadMarket() {
    try {
      var r = await fetch(API + "/listings");
      if (!r.ok) throw new Error("HTTP " + r.status);
      var data = await r.json();
      var raw = (data && data.listings) || [];
      allItems = raw.map(mapItem).filter(function (it) { return it.imageUrl; });
      render(allItems);
    } catch (e) {
      console.log("market load failed:", e);
      if (grid) grid.innerHTML =
        '<div class="mk-empty">Couldn\u2019t load listings right now. Please try again.</div>';
    }
  }

  // ---- search (client-side over loaded listings) ----
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
  document.addEventListener("keydown", function (e) {
    var tag = document.activeElement && document.activeElement.tagName;
    if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
      e.preventDefault();
      if (searchInput) searchInput.focus();
    }
  });

  // ---- buy: POST /buy charges the listing's price from your NEA balance ----
  async function buyItem(imageId, price) {
    if (!token() || !address()) { showToast("Connect your wallet to buy"); return; }
    try {
      showToast("Confirming your purchase...");
      var r = await fetch(API + "/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token() },
        body: JSON.stringify({ imageId: imageId })
      });
      var out = await r.json();
      if (r.status === 409) { showToast((out && out.error) || "Just sold - refreshing the market"); loadMarket(); return; }
      if (!r.ok || !out.success) { showToast((out && out.error) || "Purchase failed, try another item"); return; }

      showToast("Purchased. It is now in your collection.");
      refreshAccount();
      loadMarket();
    } catch (err) {
      console.error(err);
      showToast("Purchase failed, please try again");
    }
  }

  if (grid) {
    grid.addEventListener("click", function (e) {
      var b = e.target.closest(".mk-buy");
      if (b) buyItem(b.dataset.img, b.dataset.price, b.dataset.listing);
    });
  }

  // relocate the search into a big bar under the heading (premium placement)
  (function relocateSearch(){
    var head = document.querySelector(".col-head");
    var inp = document.getElementById("search");
    if (!head || !inp) return;
    var big = document.createElement("div");
    big.className = "mk-search-big";
    big.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>';
    // move the real input (keeps all its event listeners) into the big bar
    big.appendChild(inp);
    var kbd = document.createElement("kbd");
    kbd.textContent = "/";
    big.appendChild(kbd);
    head.insertAdjacentElement("afterend", big);
  })();

  // ---- init ----
  async function init() {
    refreshAccount();
    await loadMe();   // so "Your listing" is correct on first paint
    loadMarket();
  }
  init();

  if (window.ethereum && window.ethereum.on) {
    window.ethereum.on("accountsChanged", function () {
      setTimeout(function () { refreshAccount(); loadMe().then(function () { render(allItems); }); }, 400);
    });
  }
})();