/* ============================================================
   NewEra Studio — Profile / Portfolio
   Loads after wallet.js (connect + JWT login) and script.js (chrome).
   Real data: /me, /balance/:address, /my-images. No fake numbers.
   ============================================================ */
(function () {
  "use strict";

  // ---- config (same as studio-generate.js) ----
  var API = "https://newerabackend-production.up.railway.app"; // backend (change when deployed)
  var NEA_ADDRESS = "0xBcD3Efa389cBd00E424a6ca19929023B3F1DCFaD";
  // viem-style ABI (for gasless calls via window.newera)
  var NEA_ABI_V = [
    { type:"function", name:"claimWelcome", inputs:[], outputs:[], stateMutability:"nonpayable" },
    { type:"function", name:"hasClaimed", inputs:[{name:"",type:"address"}], outputs:[{type:"bool"}], stateMutability:"view" },
    { type:"function", name:"balanceOf", inputs:[{name:"owner",type:"address"}], outputs:[{type:"uint256"}], stateMutability:"view" }
  ];

  var NEA_ABI = [
    "function claimWelcome()",
    "function hasClaimed(address) view returns (bool)"
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
  function fmtBalance(bal) {
    if (bal == null) return "0";
    if (typeof bal === "string" && bal.length > 12 && /^[0-9]+$/.test(bal)) {
      bal = window.ethers ? window.ethers.formatUnits(bal, 18) : bal;
    }
    var n = parseFloat(bal);
    return isNaN(n) ? "0" : Math.floor(n).toLocaleString("en-US");
  }
  function monthYear(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "\u2014";
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }
  function fullDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "\u2014";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  // ---- elements ----
  var sbAddr = $("sbAddr"), sbAva = $("sbAva"), creditVal = $("creditVal");
  var pName = $("pName"), pHandle = $("pHandle"), pAvatar = $("pAvatar");
  var pAddrChip = $("pAddrChip"), pAddrText = $("pAddrText");
  var stCreations = $("stCreations"), stSince = $("stSince");
  var balVal = $("balVal"), pfTotal = $("pfTotal");
  var dvUser = $("dvUser"), dvSince = $("dvSince"), dvRef = $("dvRef");
  var dvAddr = $("dvAddr"), dvBal = $("dvBal"), dvWelcome = $("dvWelcome");
  var pfGrid = $("pfGrid"), pfEmpty = $("pfEmpty");
  var refCode = $("refCode"), refCopy = $("refCopy");
  var copyAddrBtn = $("copyAddrBtn");
  var claimWrap = $("claimWrap");
  var toast = $("toast");

  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- count-up for real numbers ----
  function countUp(el, to) {
    if (!el) return;
    to = +to || 0;
    if (reduceMotion) { el.textContent = to.toLocaleString("en-US"); return; }
    var start = performance.now(), dur = 900;
    (function step(now) {
      var p = Math.min((now - start) / dur, 1);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(to * e).toLocaleString("en-US");
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }

  // ---- toast + copy ----
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg || "Copied";
    toast.classList.add("show");
    setTimeout(function () { toast.classList.remove("show"); }, 1200);
  }
  document.addEventListener("click", function (e) {
    var c = e.target.closest(".copy");
    if (!c || c.disabled) return;
    var v = c.getAttribute("data-copy") || c.textContent;
    if (!v || v === "\u2014") return;
    if (navigator.clipboard) navigator.clipboard.writeText(v).catch(function () {});
    showToast("Copied");
  });

  // ---- identity (hero + sidebar) ----
  function setIdentity(addr, username) {
    var initial = (username || addr || "N").charAt(username ? 0 : 2) || "N";
    initial = initial.toUpperCase();
    if (sbAva) sbAva.textContent = initial;
    if (pAvatar) pAvatar.textContent = initial;
    if (sbAddr) sbAddr.textContent = addr ? shorten(addr) : "Not connected";

    if (pName) pName.textContent = username || (addr ? shorten(addr) : "Not connected");
    if (pHandle) pHandle.textContent = username ? "@" + username : (addr ? "on BNB Chain" : "connect to load your profile");

    if (addr) {
      if (pAddrChip) { pAddrChip.hidden = false; pAddrChip.setAttribute("data-copy", addr); }
      if (pAddrText) pAddrText.textContent = shorten(addr);
      if (copyAddrBtn) { copyAddrBtn.disabled = false; copyAddrBtn.setAttribute("data-copy", addr); }
      if (dvAddr) { dvAddr.textContent = shorten(addr); dvAddr.setAttribute("data-copy", addr); }
    }
  }

  // ---- /balance/:address (public) ----
  async function loadBalance(addr) {
    if (!addr) return;
    try {
      var r = await fetch(API + "/balance/" + addr);
      var data = await r.json();
      var bal = fmtBalance(data && data.neaBalance);
      if (creditVal) creditVal.textContent = bal;
      if (dvBal) dvBal.textContent = bal + " NEA";
      countUp(balVal, bal.replace(/,/g, ""));
      if (data && typeof data.welcomeClaimed === "boolean") renderWelcome(data.welcomeClaimed);
    } catch (e) { console.log("balance load failed:", e); }
  }

  // ---- /me (auth) ----
  async function loadMe() {
    if (!token()) return;
    try {
      var r = await fetch(API + "/me", { headers: { "Authorization": "Bearer " + token() } });
      if (!r.ok) return;
      var data = await r.json();
      var u = (data && data.user) || data || {};
      var addr = u.walletAddress || address();

      setIdentity(addr, u.username);

      if (dvUser) dvUser.textContent = u.username || "\u2014";
      if (stSince) stSince.textContent = u.createdAt ? monthYear(u.createdAt) : "\u2014";
      if (dvSince) dvSince.textContent = u.createdAt ? fullDate(u.createdAt) : "\u2014";

      if (u.referralCode) {
        if (dvRef) { dvRef.textContent = u.referralCode; dvRef.setAttribute("data-copy", u.referralCode); }
        if (refCode) refCode.textContent = u.referralCode;
        if (refCopy) { refCopy.disabled = false; refCopy.setAttribute("data-copy", u.referralCode); }
      }
    } catch (e) { console.log("/me load failed:", e); }
  }

  // ---- /my-images (auth) ----
  // ---- portfolio stat tiles: fill "Coming soon" with real numbers ----
  function setStat(label, value) {
    var tiles = document.querySelectorAll('.panel[data-panel="portfolio"] .stat');
    for (var i = 0; i < tiles.length; i++) {
      var lab = tiles[i].querySelector(".lab");
      if (lab && lab.textContent.trim().toLowerCase() === label.toLowerCase()) {
        var soon = tiles[i].querySelector(".soon");
        var num = tiles[i].querySelector(".num");
        if (soon) { var d = document.createElement("div"); d.className = "num"; d.textContent = value; soon.parentNode.replaceChild(d, soon); }
        else if (num) { num.textContent = value; }
        return;
      }
    }
  }

  async function loadPortfolioStats() {
    if (!token()) return;
    // Saved prompts -> /my-prompts published count
    try {
      var rp = await fetch(API + "/my-prompts", { headers: { "Authorization": "Bearer " + token() } });
      if (rp.ok) { var dp = await rp.json(); setStat("Saved prompts", (dp.published || []).length); }
    } catch (e) { console.log("my-prompts failed:", e); }
    // Sold -> /my-earnings salesCount
    try {
      var re = await fetch(API + "/my-earnings", { headers: { "Authorization": "Bearer " + token() } });
      if (re.ok) { var de = await re.json(); setStat("Sold", de.salesCount || 0); }
    } catch (e) { console.log("my-earnings failed:", e); }
  }

  async function loadImages() {
    if (!token()) { if (pfEmpty) pfEmpty.textContent = "Connect your wallet to see your creations."; return; }
    try {
      var r = await fetch(API + "/my-images", { headers: { "Authorization": "Bearer " + token() } });
      if (!r.ok) { if (pfEmpty) pfEmpty.textContent = "Couldn't load your creations. Try again."; return; }
      var data = await r.json();
      var imgs = (data && data.images) || [];

      countUp(stCreations, imgs.length);
      countUp(pfTotal, imgs.length);
      setStat("For sale", imgs.filter(function (x) { return x.isListed; }).length);

      if (!imgs.length) {
        if (pfGrid) pfGrid.innerHTML =
          '<div class="pf-empty">No creations yet. <a href="index.html">Generate your first image</a>.</div>';
        return;
      }
      // backend gives newest first; render in order. Reuses .col-card visual.
      var html = imgs.map(function (img) {
        return '<div class="col-card">' +
            '<div class="cc-img"><img src="' + img.imageUrl + '" alt="' + escapeHtml(img.prompt) + '" loading="lazy"></div>' +
            '<div class="cc-meta">' +
              '<div class="cc-prompt">' + escapeHtml(img.prompt) + '</div>' +
              '<div class="cc-model">' + escapeHtml(img.model || "") + '</div>' +
            '</div>' +
          '</div>';
      }).join("");
      if (pfGrid) pfGrid.innerHTML = html;
    } catch (e) {
      console.log("images load failed:", e);
      if (pfEmpty) pfEmpty.textContent = "Couldn't load your creations. Try again.";
    }
  }

  // ---- welcome bonus claim ----
  function renderWelcome(claimed) {
    if (dvWelcome) {
      dvWelcome.innerHTML = claimed
        ? '<span class="badge">Claimed</span>'
        : '<span class="badge neutral">' + (window.NEWERA_CLAIMS_PAUSED ? 'Paused' : 'Not claimed') + '</span>';
    }
    if (!claimWrap) return;
    if (claimed) {
      claimWrap.innerHTML =
        '<div class="claim-state done">' +
          '<div class="ct"><b>Welcome bonus claimed</b><span>You received your one-time 50 NEA.</span></div>' +
          '<span class="badge">50 NEA</span>' +
        '</div>';
    } else {
      claimWrap.innerHTML =
        '<div class="claim-state">' +
          '<div class="ct"><b>Claim your 50 NEA welcome bonus</b><span>One-time and free. You need NEA to generate images.</span></div>' +
          '<button class="btn primary" id="claimBtn">Claim 50 NEA</button>' +
        '</div>';
      var b = $("claimBtn");
      if (b) b.addEventListener("click", claimWelcome);
    }
  }

  async function claimWelcome() {
    var btn = $("claimBtn");
    if (!token()) { showToast("Connect your wallet first"); return; }
    if (btn) { btn.disabled = true; btn.textContent = "Claiming..."; }
    try {
      var r = await fetch(API + "/rewards/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token() },
        body: JSON.stringify({})
      });
      var out = await r.json();
      if (!r.ok || !out.success) throw new Error((out && out.error) || "Claim failed");
      renderWelcome(true);
      showToast("50 NEA claimed");
      loadBalance(address());
    } catch (err) {
      console.error(err);
      var msg = err && err.message ? err.message : "Claim failed";
      if (/already claimed|claimed/i.test(msg)) { renderWelcome(true); showToast("Already claimed"); return; }
      showToast(msg.length > 40 ? "Claim failed" : msg);
      if (btn) { btn.disabled = false; btn.textContent = "Claim 50 NEA"; }
    }
  }

  // ---- claims paused: take the Claim tab and its panel out entirely ----
  if (window.NEWERA_CLAIMS_PAUSED) {
    document.querySelectorAll('[data-tab="claim"], [data-panel="claim"]').forEach(function (el) { el.remove(); });
  }

  // ---- tabs ----
  var tabsEl = $("tabs");
  if (tabsEl) {
    tabsEl.addEventListener("click", function (e) {
      var t = e.target.closest(".tab");
      if (!t) return;
      var name = t.dataset.tab;
      document.querySelectorAll(".tab").forEach(function (x) { x.classList.toggle("on", x === t); });
      document.querySelectorAll(".panel").forEach(function (p) { p.classList.toggle("on", p.dataset.panel === name); });
    });
  }

  // ---- not-connected fallback ----
  function showDisconnected() {
    setIdentity(null, null);
    if (pfEmpty) pfEmpty.textContent = "Connect your wallet to see your creations.";
    if (refCode) refCode.textContent = "connect to load your code";
    if (claimWrap) claimWrap.innerHTML =
      '<div class="claim-state"><div class="ct"><b>Connect your wallet</b>' +
      '<span>Open Studio to connect and load your profile.</span></div>' +
      '<a class="btn primary" href="index.html">Open Studio</a></div>';
  }

  // ---- boot ----
  var loaded = false;
  function boot() {
    var addr = address();
    if (token() && addr) {
      loaded = true;
      setIdentity(addr, null); // instant address fill; /me refines with username
      loadBalance(addr);
      loadMe();
      loadImages();
      loadPortfolioStats();
    } else {
      showDisconnected();
    }
  }
  boot();

  // re-run once the wallet connects (wallet.js writes token/address to localStorage)
  if (!loaded) {
    var tries = 0;
    var iv = setInterval(function () {
      if (token() && address()) { clearInterval(iv); boot(); }
      else if (++tries > 30) clearInterval(iv); // ~15s
    }, 500);
    window.addEventListener("storage", function (e) {
      if (e.key === "newera_token" && token() && address()) { clearInterval(iv); boot(); }
    });
  }
  if (window.ethereum && window.ethereum.on) {
    window.ethereum.on("accountsChanged", function () { setTimeout(boot, 500); });
  }
})();