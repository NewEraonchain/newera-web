/* ============================================================
   NewEra Studio — Sell prompt flow (shared)
   Used on collection.html and profile.html (after sell.js).
   Adds a "Sell prompt" button on owned cards. Opens a modal:
   title + price + prompt (prefilled from the image's prompt,
   editable). On submit: on-chain list() -> POST /prompts with
   preview = imageUrl, content = prompt (hidden until bought).
   Hides the button for images already prompt-listed.
   ============================================================ */
(function () {
  "use strict";

  // ---- config ----
  var API = "https://newerabackend-production.up.railway.app";
  var MARKET_ADDRESS = "0x8f585e8c9f8784cEC2D92f328046303240f35769";
  var MIN_PRICE = 5;
  // viem-style ABI (for gasless calls via window.newera)
  var MARKET_ABI_V = [
    { type:"function", name:"list", inputs:[{name:"price",type:"uint256"},{name:"metadataId",type:"string"}], outputs:[{type:"uint256"}], stateMutability:"nonpayable" },
    { type:"event", name:"Listed", inputs:[
      {name:"id",type:"uint256",indexed:true},{name:"seller",type:"address",indexed:true},
      {name:"price",type:"uint256",indexed:false},{name:"metadataId",type:"string",indexed:false}] }
  ];

  var MARKET_ABI = [
    "function list(uint256 price, string metadataId) returns (uint256)",
    "event Listed(uint256 indexed id, address indexed seller, uint256 price, string metadataId)"
  ];

  function token() { return localStorage.getItem("newera_token"); }
  function escapeHtml(s) {
    return (s || "").replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  var imgMap = {};      // imageUrl -> { id, prompt, imageUrl, ... }
  var listedSet = {};   // imageUrl -> true  (already has a prompt listing)
  var current = null;

  // ---- toast (reuse sell.css toast) ----
  var toast = document.createElement("div");
  toast.className = "sell-toast";
  document.body.appendChild(toast);
  function showToast(msg) {
    toast.textContent = msg || "Done";
    toast.classList.add("show");
    setTimeout(function () { toast.classList.remove("show"); }, 1600);
  }

  // ---- modal (built once) ----
  var overlay = document.createElement("div");
  overlay.className = "sp-overlay";
  overlay.innerHTML =
    '<div class="sp-modal" role="dialog" aria-modal="true">' +
      '<div class="sp-head">' +
        '<div class="sp-thumb"><img id="spThumb" alt=""></div>' +
        '<div><h3>Sell this prompt</h3><p>image shows, prompt stays locked until bought</p></div>' +
      '</div>' +
      '<div class="sp-field">' +
        '<label for="spTitle">Title</label>' +
        '<input class="sp-input" id="spTitle" maxlength="80" placeholder="e.g. Cyberpunk Cat Master Prompt" autocomplete="off">' +
      '</div>' +
      '<div class="sp-field">' +
        '<label for="spPrice">Price (NEA)</label>' +
        '<input class="sp-input" id="spPrice" type="number" min="' + (MIN_PRICE + 1) + '" step="1" placeholder="e.g. 50" autocomplete="off">' +
        '<div class="sp-hint">Must be more than ' + MIN_PRICE + ' NEA. On sale: 95% you, 5% platform fee.</div>' +
      '</div>' +
      '<div class="sp-field">' +
        '<label for="spPrompt">Prompt (hidden until purchased)</label>' +
        '<textarea class="sp-textarea" id="spPrompt" placeholder="The full prompt buyers unlock after paying"></textarea>' +
        '<div class="sp-hint">Pre-filled from this image. Edit it however you like.</div>' +
      '</div>' +
      '<div class="sp-status" id="spStatus"></div>' +
      '<div class="sp-actions">' +
        '<button class="sp-cancel" id="spCancel">Cancel</button>' +
        '<button class="sp-go" id="spGo">List prompt</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  var spThumb = overlay.querySelector("#spThumb");
  var spTitle = overlay.querySelector("#spTitle");
  var spPrice = overlay.querySelector("#spPrice");
  var spPrompt = overlay.querySelector("#spPrompt");
  var spStatus = overlay.querySelector("#spStatus");
  var spGo = overlay.querySelector("#spGo");
  var spCancel = overlay.querySelector("#spCancel");

  function setStatus(msg, kind) {
    spStatus.textContent = msg || "";
    spStatus.className = "sp-status" + (kind ? " " + kind : "");
  }
  function openModal(data) {
    current = data;
    spThumb.src = data.imageUrl;
    spTitle.value = "";
    spPrice.value = "";
    spPrompt.value = data.prompt || "";   // prefilled, editable
    setStatus("");
    spGo.disabled = false; spGo.textContent = "List prompt";
    overlay.classList.add("show");
    setTimeout(function () { spTitle.focus(); }, 50);
  }
  function closeModal() { overlay.classList.remove("show"); current = null; }
  spCancel.addEventListener("click", closeModal);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && overlay.classList.contains("show")) closeModal(); });

  // remove the Sell-prompt button from the card matching this imageUrl
  function removeBtnFor(url) {
    var cards = document.querySelectorAll(".col-card");
    for (var i = 0; i < cards.length; i++) {
      var img = cards[i].querySelector(".cc-img img");
      if (img && img.getAttribute("src") === url) {
        var b = cards[i].querySelector(".sp-cta");
        if (b) b.remove();
      }
    }
  }

  // ---- submit: on-chain list -> POST /prompts ----
  spGo.addEventListener("click", doSell);
  async function doSell() {
    if (!current) return;
    var title = (spTitle.value || "").trim();
    var priceNum = parseFloat(spPrice.value);
    var content = (spPrompt.value || "").trim();

    if (title.length < 2) { setStatus("Please add a title (at least 2 characters).", "warn"); spTitle.focus(); return; }
    if (isNaN(priceNum) || priceNum <= MIN_PRICE) { setStatus("Price must be more than " + MIN_PRICE + " NEA.", "warn"); spPrice.focus(); return; }
    if (content.length < 3) { setStatus("Prompt can't be empty.", "warn"); spPrompt.focus(); return; }
    if (!token()) { setStatus("Connect your wallet first.", "warn"); return; }
    if (!window.newera || !window.newera.smartClient) { setStatus("Wallet still connecting, try again in a moment.", "warn"); return; }

    spGo.disabled = true;
    try {
      var nw = window.newera;
      var priceWei = nw.parseEther(priceNum);
      setStatus("Listing your prompt (no gas needed)...", "work");
      var txHash = await nw.write(MARKET_ADDRESS, MARKET_ABI_V, "list", [priceWei, current.id]);
      setStatus("Confirming on-chain...", "work");
      var receipt = await nw.waitReceipt(txHash);
      var listingId = null;
      var ev = nw.parseEvent(MARKET_ABI_V, "Listed", receipt.logs);
      if (ev && ev.id != null) listingId = ev.id.toString();

      setStatus("Saving your prompt\u2026", "work");
      var r = await fetch(API + "/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token() },
        body: JSON.stringify({
          title: title,
          content: content,
          preview: current.imageUrl,
          price: String(priceNum),
          onchainListingId: listingId
        })
      });
      var out = await r.json();
      if (!r.ok || !out.success) { setStatus((out && out.error) || "Could not save the prompt.", "warn"); spGo.disabled = false; return; }

      setStatus("Listed!", "ok");
      listedSet[current.imageUrl] = true;
      removeBtnFor(current.imageUrl);   // hide the button now that it's listed
      showToast("Prompt listed for sale");
      setTimeout(closeModal, 700);
    } catch (err) {
      console.error(err);
      var msg = err && err.message ? err.message : "Listing failed";
      if (/user rejected|denied/i.test(msg)) msg = "You cancelled the listing.";
      setStatus(msg.length > 60 ? "Listing failed. Please try again." : msg, "warn");
      spGo.disabled = false;
    }
  }

  // ---- card decoration ----
  function addControl(card, data) {
    var holder = card.querySelector(".cc-img");
    if (!holder) return;
    if (holder.querySelector(".sp-cta")) return;
    var btn = document.createElement("button");
    btn.className = "sp-cta";
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h12M4 12h16M4 17h9"/></svg> Sell prompt';
    btn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); openModal(data); });
    holder.appendChild(btn);
  }

  function decorate() {
    var cards = document.querySelectorAll(".col-card");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.__spDone) continue;
      var img = card.querySelector(".cc-img img");
      if (!img) continue;
      var url = img.getAttribute("src");
      var data = imgMap[url];
      if (!data) continue;
      card.__spDone = true;
      if (listedSet[url]) continue;   // already prompt-listed -> no button
      addControl(card, data);
    }
  }

  async function loadMine() {
    if (!token()) return;
    try {
      var r = await fetch(API + "/my-images", { headers: { "Authorization": "Bearer " + token() } });
      if (!r.ok) return;
      var data = await r.json();
      (data.images || []).forEach(function (im) {
        if (im && im.imageUrl) imgMap[im.imageUrl] = im;
      });
    } catch (e) { console.log("sell-prompt: my-images load failed:", e); }
  }

  async function loadMyPrompts() {
    if (!token()) return;
    try {
      var r = await fetch(API + "/my-prompts", { headers: { "Authorization": "Bearer " + token() } });
      if (!r.ok) return;
      var data = await r.json();
      (data.published || []).forEach(function (p) {
        if (p && p.preview) listedSet[p.preview] = true;
      });
    } catch (e) { console.log("sell-prompt: my-prompts load failed:", e); }
  }

  async function init() {
    await loadMine();
    await loadMyPrompts();
    decorate();
    var obs = new MutationObserver(function () { decorate(); });
    obs.observe(document.body, { childList: true, subtree: true });
  }
  init();
})();