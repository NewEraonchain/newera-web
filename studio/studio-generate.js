/* ============================================================
   NewEra Studio — generate flow (wallet + contracts + backend)
   Loads after wallet.js (which sets up connect + JWT login).
   ============================================================ */
(function () {
  "use strict";

  // ---- config ----
  var API = "https://newerabackend-production.up.railway.app";
  var NEA_ADDRESS = "0xBcD3Efa389cBd00E424a6ca19929023B3F1DCFaD";
  var GENERATION_ADDRESS = "0x53277A0660547Cda3206b0C9D6dD0212CC46D74a";
  var COST_NEA = "10"; // 10 NEA per image

  // minimal ABIs (only what we call)
  // viem-style ABIs (for gasless calls via window.newera)
  var NEA_ABI_V = [
    { type:"function", name:"approve", inputs:[{name:"spender",type:"address"},{name:"amount",type:"uint256"}], outputs:[{type:"bool"}], stateMutability:"nonpayable" },
    { type:"function", name:"allowance", inputs:[{name:"owner",type:"address"},{name:"spender",type:"address"}], outputs:[{type:"uint256"}], stateMutability:"view" },
    { type:"function", name:"balanceOf", inputs:[{name:"owner",type:"address"}], outputs:[{type:"uint256"}], stateMutability:"view" },
    { type:"function", name:"claimWelcome", inputs:[], outputs:[], stateMutability:"nonpayable" },
    { type:"function", name:"hasClaimed", inputs:[{name:"",type:"address"}], outputs:[{type:"bool"}], stateMutability:"view" }
  ];
  var GEN_ABI_V = [{ type:"function", name:"generate", inputs:[], outputs:[{type:"uint256"}], stateMutability:"nonpayable" }];

  var NEA_ABI = [
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address owner) view returns (uint256)",
    "function claimWelcome()",
    "function hasClaimed(address) view returns (bool)"
  ];
  var GEN_ABI = [
    "function generate() returns (uint256)",
    "function COST() view returns (uint256)"
  ];

  // ---- helpers ----
  function token() { return localStorage.getItem("newera_token"); }
  function address() { return localStorage.getItem("newera_address"); }
  function shorten(a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : ""; }

  // grab elements
  var input = document.getElementById("compIn");
  var genBtn = document.getElementById("genBig");
  var creditVal = document.getElementById("creditVal");
  var sbAddr = document.getElementById("sbAddr");
  var center = document.querySelector(".center .inner");

  // ---- feed (chat-style: oldest on top, newest below) ----
  var centerInner = document.querySelector(".center .inner");
  var centerSec = document.querySelector(".center");
  var heroWrap = centerInner; // the welcome text

  // build a feed container that lives in the main area, above the composer
  var feed = document.createElement("div");
  feed.className = "gen-feed";
  feed.hidden = true;
  var composer = document.querySelector(".composer");
  if (composer && composer.parentNode) {
    composer.parentNode.insertBefore(feed, composer);
  }

  // a transient status line (loading / errors) shown at the top of the feed
  var statusEl = null;
  function scrollFeedToBottom(){
    try { window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); } catch (e) { window.scrollTo(0, document.body.scrollHeight); }
  }
  function setStatus(html, kind){
    hideHero();
    feed.hidden = false;
    if (!statusEl) {
      statusEl = document.createElement("div");
      statusEl.className = "gen-status";
      feed.appendChild(statusEl);
    }
    statusEl.className = "gen-status" + (kind ? " " + kind : "");
    statusEl.innerHTML = html;
  }
  function setLoading(msg){
    setStatus(
      '<div class="gen-loading">' +
        '<div class="gl-box">' +
          '<div class="gl-center">' +
            '<div class="gl-spin"></div>' +
            '<div class="gl-tag">GENERATING</div>' +
          '</div>' +
          '<div class="gl-badge"><i></i><span>NewEra AI</span></div>' +
        '</div>' +
        '<div class="gl-msg">' + escapeHtml(msg || "Working�") + '</div>' +
      '</div>', "loading");
  }
  function clearStatus(){
    if (statusEl && statusEl.parentNode) statusEl.parentNode.removeChild(statusEl);
    statusEl = null;
    if (!feed.querySelector(".feed-card")) { feed.hidden = true; showHero(); }
  }
  function hideHero(){ if (heroWrap) heroWrap.style.display = "none"; }
  function showHero(){ if (heroWrap) heroWrap.style.display = ""; }

  // add a finished image to the top of the feed
  function addToFeed(img){
    hideHero();
    feed.hidden = false;
    var card = document.createElement("div");
    card.className = "feed-card";
    card.innerHTML =
      '<div class="fc-prompt-row"><div class="fc-bubble">' + escapeHtml(img.prompt) + '</div></div>' +
      '<div class="fc-img"><img src="' + img.imageUrl + '" alt="' + escapeHtml(img.prompt) + '" loading="lazy"></div>' +
      '<div class="fc-foot"><span class="fc-model">NewEra AI</span></div>';
    // newest at bottom (chat-style): card goes above the loading line
    if (statusEl && statusEl.parentNode === feed) feed.insertBefore(card, statusEl);
    else feed.appendChild(card);
    scrollFeedToBottom();
  }

  // ---- load balance + address into the UI ----
  async function refreshAccount() {
    var addr = address();
    if (!addr) {
      if (sbAddr) sbAddr.textContent = "Not connected";
      if (creditVal) creditVal.textContent = "0";
      return;
    }
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
      // show welcome-claim banner if not claimed yet
      if (data && data.welcomeClaimed === false && !window.NEWERA_CLAIMS_PAUSED) {
        showClaimBanner();
      } else {
        hideClaimBanner();
      }
    } catch (e) {
      console.log("balance load failed:", e);
    }
  }

  // ---- welcome claim banner ----
  var claimBanner = null;
  function showClaimBanner() {
    if (claimBanner) return;
    claimBanner = document.createElement("div");
    claimBanner.className = "claim-banner";
    claimBanner.innerHTML =
      '<div class="cb-tx"><b>Claim your 50 NEA welcome bonus</b>' +
      '<span>One-time, free. You need NEA to generate images.</span></div>' +
      '<button class="cb-btn" id="claimBtn">Claim 50 NEA</button>';
    var main = document.querySelector(".main");
    var topbar = document.querySelector(".topbar");
    if (main && topbar) main.insertBefore(claimBanner, topbar.nextSibling);
    document.getElementById("claimBtn").addEventListener("click", claimWelcome);
  }
  function hideClaimBanner() {
    if (claimBanner && claimBanner.parentNode) claimBanner.parentNode.removeChild(claimBanner);
    claimBanner = null;
  }

  async function claimWelcome() {
    if (!token()) { setStatus("Please connect your wallet first.", "warn"); return; }
    var btn = document.getElementById("claimBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Claiming..."; }
    try {
      var r = await fetch(API + "/rewards/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token() },
        body: JSON.stringify({})
      });
      var out = await r.json();
      if (!r.ok || !out.success) throw new Error((out && out.error) || "Claim failed");
      hideClaimBanner();
      setStatus("50 NEA claimed. You're ready to generate!", "done");
      setTimeout(clearStatus, 4000);
      refreshAccount();
    } catch (err) {
      console.error(err);
      var msg = err && err.message ? err.message : "Claim failed";
      if (/already claimed|claimed/i.test(msg)) { msg = "Welcome bonus already claimed."; hideClaimBanner(); }
      setStatus(msg, "warn");
      if (btn) { btn.disabled = false; btn.textContent = "Claim 50 NEA"; }
    }
  }

  // ---- the main generate flow ----
  var busy = false;
  async function runGenerate() {
    if (busy) return;
    var prompt = (input && input.value || "").trim();

    // 1) checks
    if (prompt.length < 3) {
      if (input) input.focus();
      setStatus("Please type a prompt first (at least 3 characters).", "warn");
      return;
    }
    if (!token() || !address()) {
      setStatus("Please connect your wallet first to generate.", "warn");
      return;
    }
    busy = true;
    genBtn.style.pointerEvents = "none";
    genBtn.style.opacity = ".7";

    try {
      // the API charges the generation fee, generates, and refunds automatically if generation fails
      setLoading("Creating your image...");
      var resp = await fetch(API + "/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token() },
        body: JSON.stringify({ prompt: prompt })
      });
      var out = await resp.json();

      if (resp.status === 402) {
        setStatus((out && out.error) || ("Not enough NEA. You need " + COST_NEA + " NEA to generate one image."), "warn");
      } else if (!resp.ok || !out.success) {
        setStatus((out && out.error) || "Generation failed, please try again.", "warn");
      } else {
        var img = out.image;
        clearStatus();        // remove the loading line
        addToFeed(img);       // newest image on top
        if (input) { input.value = ""; input.style.height = "36px"; }
        refreshAccount();     // balance went down by 10
      }
    } catch (err) {
      console.error(err);
      var msg = err && err.message ? err.message : "Something went wrong";
      setStatus(msg, "warn");
    } finally {
      busy = false;
      genBtn.style.pointerEvents = "";
      genBtn.style.opacity = "";
    }
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // ---- wire the generate button (replaces the demo handler) ----
  if (genBtn) {
    var fresh = genBtn.cloneNode(true);   // strip old demo listeners from script.js
    genBtn.parentNode.replaceChild(fresh, genBtn);
    genBtn = fresh;
    creditVal = document.getElementById("creditVal");
    genBtn.addEventListener("click", runGenerate);
  }
  if (input) {
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runGenerate(); }
    });
  }

  // ---- load existing images into the feed (so refresh keeps them) ----
  async function loadMyImages(){
    if (!token()) return;
    try {
      var r = await fetch(API + "/my-images", {
        headers: { "Authorization": "Bearer " + token() }
      });
      if (!r.ok) return;
      var data = await r.json();
      if (data && data.images && data.images.length) {
        hideHero();
        feed.hidden = false;
        // backend gives newest first; chat-style feed shows oldest first, so reverse
        data.images.slice().reverse().forEach(function(img){
          var card = document.createElement("div");
          card.className = "feed-card";
          card.innerHTML =
            '<div class="fc-prompt-row"><div class="fc-bubble">' + escapeHtml(img.prompt) + '</div></div>' +
            '<div class="fc-img"><img src="' + img.imageUrl + '" alt="' + escapeHtml(img.prompt) + '" loading="lazy"></div>' +
            '<div class="fc-foot"><span class="fc-model">NewEra AI</span></div>';
          feed.appendChild(card);
        });
        scrollFeedToBottom();
      }
    } catch(e){ console.log("load images failed:", e); }
  }

  // ---- on load: show account info ----
  refreshAccount();
  loadMyImages();

  // ---- New chat: clear the feed, fresh start (images stay in Collection) ----
  var newChatBtn = document.getElementById("newChat");
  if (newChatBtn) {
    newChatBtn.addEventListener("click", function () {
      feed.innerHTML = "";
      statusEl = null;
      feed.hidden = true;
      showHero();
      if (input) { input.value = ""; input.style.height = "36px"; input.focus(); }
    });
  }
  // refresh when wallet connects/changes
  if (window.ethereum && window.ethereum.on) {
    window.ethereum.on("accountsChanged", function () {
      setTimeout(refreshAccount, 400);
    });
  }
})();