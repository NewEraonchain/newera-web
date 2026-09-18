/* ============================================================
   NewEra Studio — Prompt marketplace (frontend)
   GET /prompts (content hidden) -> cards. Buy: on-chain
   buy(listingId) -> POST /prompts/buy -> reveal content.
   ============================================================ */
(function () {
  "use strict";

  var API = "https://newerabackend-production.up.railway.app";
  var NEA_ADDRESS = "0xBcD3Efa389cBd00E424a6ca19929023B3F1DCFaD";
  var MARKET_ADDRESS = "0x8f585e8c9f8784cEC2D92f328046303240f35769";
  // viem-style ABIs (for gasless calls via window.newera)
  var MARKET_ABI_V = [
    { type:"function", name:"buy", inputs:[{name:"id",type:"uint256"}], outputs:[], stateMutability:"nonpayable" }
  ];
  var NEA_ABI_V = [
    { type:"function", name:"approve", inputs:[{name:"spender",type:"address"},{name:"amount",type:"uint256"}], outputs:[{type:"bool"}], stateMutability:"nonpayable" },
    { type:"function", name:"allowance", inputs:[{name:"owner",type:"address"},{name:"spender",type:"address"}], outputs:[{type:"uint256"}], stateMutability:"view" },
    { type:"function", name:"balanceOf", inputs:[{name:"owner",type:"address"}], outputs:[{type:"uint256"}], stateMutability:"view" }
  ];

  var MARKET_ABI = ["function buy(uint256 id) external"];
  var NEA_ABI = [
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
  ];

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
    var str = String(price == null ? "0" : price).trim();
    if (/^[0-9]+$/.test(str) && str.length >= 13) return BigInt(str);
    return window.ethers.parseUnits(str, 18);
  }

  var grid = $("grid"), searchInput = $("search");
  var creditVal = $("creditVal"), sbAddr = $("sbAddr"), sbAva = $("sbAva");
  var toast = $("toast");
  var allItems = [];
  var myUserId = null;
  var unlocked = {}; // promptId -> revealed content

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg || "Done";
    toast.classList.add("show");
    setTimeout(function () { toast.classList.remove("show"); }, 1600);
  }

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

  function cardHtml(it) {
    var mine = myUserId != null && it.ownerId != null && it.ownerId === myUserId;
    var revealed = unlocked[it.id];

    var body;
    if (revealed) {
      body = '<div class="pr-reveal">' +
          '<div class="rv-text">' + escapeHtml(revealed) + '</div>' +
          '<button class="pr-copy" data-copy="' + escapeHtml(it.id) + '">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg> Copy prompt</button>' +
        '</div>';
    } else {
      body = '<div class="pr-lock">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>' +
          'Prompt unlocks after purchase</div>';
    }

    var action;
    if (revealed) action = '<div class="pr-own">Unlocked</div>';
    else if (mine) action = '<div class="pr-own">Your prompt</div>';
    else action = '<button class="pr-buy" data-id="' + escapeHtml(it.id) +
        '" data-price="' + escapeHtml(String(it.price)) +
        '" data-listing="' + escapeHtml(it.onchainListingId != null ? String(it.onchainListingId) : "") + '">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg> Buy to unlock</button>';

    return '<div class="pr-card">' +
        '<div class="pr-img">' +
          '<img src="' + it.preview + '" alt="' + escapeHtml(it.title) + '" loading="lazy" onload="this.classList.add(\'loaded\')" onerror="this.classList.add(\'loaded\')">' +
          '<span class="pr-tag"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h12M4 12h16M4 17h9"/></svg> Prompt</span>' +
        '</div>' +
        '<div class="pr-meta">' +
          '<div class="pr-title">' + escapeHtml(it.title) + '</div>' +
          body +
          '<div class="pr-sub">' +
            '<span class="pr-seller">' + (it.ownerId ? "by " + shorten(it.ownerId) : "") + '</span>' +
            '<span class="pr-price">' + fmtNea(it.price) + '<small>NEA</small></span>' +
          '</div>' +
          action +
        '</div>' +
      '</div>';
  }

  function render(list) {
    if (!grid) return;
    if (!list.length) {
      grid.innerHTML = '<div class="pr-empty">No prompts listed yet. Sell one from your ' +
        '<a href="collection.html">collection</a> (hover an image \u2192 Sell prompt).</div>';
      return;
    }
    grid.innerHTML = list.map(cardHtml).join("");
  }

  async function loadPrompts() {
    try {
      var r = await fetch(API + "/prompts");
      if (!r.ok) throw new Error("HTTP " + r.status);
      var data = await r.json();
      allItems = ((data && data.prompts) || []).filter(function (it) { return it.preview; });
      render(allItems);
    } catch (e) {
      console.log("prompts load failed:", e);
      if (grid) grid.innerHTML =
        '<div class="pr-empty">Couldn\u2019t load prompts right now. Please try again.</div>';
    }
  }

  // search
  if (searchInput) {
    searchInput.addEventListener("input", function () {
      var q = this.value.toLowerCase().trim();
      if (!q) { render(allItems); return; }
      render(allItems.filter(function (it) {
        return it.title && it.title.toLowerCase().indexOf(q) >= 0;
      }));
    });
  }

  // relocate the search into a big bar under the heading (premium placement)
  (function relocateSearch(){
    var head = document.querySelector(".col-head");
    var inp = document.getElementById("search");
    if (!head || !inp) return;
    var big = document.createElement("div");
    big.className = "pr-search-big";
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

  // buy + reveal
  async function buyPrompt(promptId, price, listingId) {
    if (!token() || !address()) { showToast("Connect your wallet to buy"); return; }
    if (!window.ethereum || !window.ethers) { showToast("Wallet not ready"); return; }
    if (listingId === "" || listingId == null) {
      showToast("This prompt is missing its on-chain id");
      return;
    }
    try {
      var nw = window.newera;
      if (!nw || !nw.smartClient) { showToast("Wallet still connecting, try again"); return; }
      var me = nw.safeAddress;
      var amount = toWei(price);

      var allowance = await nw.read(NEA_ADDRESS, NEA_ABI_V, "allowance", [me, MARKET_ADDRESS]);
      if (allowance < amount) {
        showToast("Approving NEA...");
        await nw.write(NEA_ADDRESS, NEA_ABI_V, "approve", [MARKET_ADDRESS, amount]);
      }

      showToast("Confirming your purchase...");
      var txHash = await nw.write(MARKET_ADDRESS, MARKET_ABI_V, "buy", [BigInt(listingId)]);
      var receipt = await nw.waitReceipt(txHash);

      showToast("Unlocking your prompt\u2026");
      var r = await fetch(API + "/prompts/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token() },
        body: JSON.stringify({ promptId: promptId, txHash: txHash })
      });
      var out = await r.json();
      if (!r.ok || !out.success) { showToast((out && out.error) || "Purchase could not be verified"); return; }

      unlocked[promptId] = out.prompt.content;   // revealed
      render(allItems);
      refreshAccount();
      showToast("Prompt unlocked");
    } catch (err) {
      console.error(err);
      var msg = err && err.message ? err.message : "Purchase failed";
      if (/user rejected|denied/i.test(msg)) { showToast("Purchase cancelled"); return; }
      if (/Not active|4e6f74206163746976/i.test(msg)) { showToast("Just sold - refreshing"); loadPrompts(); return; }
      if (/your own|Cannot buy/i.test(msg)) { showToast("You cannot buy your own prompt"); return; }
      showToast(msg.length > 48 ? "Purchase failed, try another prompt" : msg);
    }
  }

  if (grid) {
    grid.addEventListener("click", function (e) {
      var buy = e.target.closest(".pr-buy");
      if (buy) { buyPrompt(buy.dataset.id, buy.dataset.price, buy.dataset.listing); return; }
      var cp = e.target.closest(".pr-copy");
      if (cp) {
        var txt = unlocked[cp.dataset.copy];
        if (txt && navigator.clipboard) navigator.clipboard.writeText(txt).catch(function () {});
        showToast("Prompt copied");
      }
    });
  }

  async function init() {
    refreshAccount();
    await loadMe();
    loadPrompts();
  }
  init();

  if (window.ethereum && window.ethereum.on) {
    window.ethereum.on("accountsChanged", function () {
      setTimeout(function () { refreshAccount(); loadMe().then(function () { render(allItems); }); }, 400);
    });
  }
})();