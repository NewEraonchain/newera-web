/* ============================================================
   NewEra Studio — Sell / List flow (shared)
   Used on collection.html and profile.html.
   Matches owned cards by imageUrl (from /my-images), adds a
   "List for sale" button, runs on-chain list() then POST /listings.
   No edits needed in collection.js / profile.js.
   ============================================================ */
(function () {
  "use strict";

  // ---- config ----
  var API = "https://newerabackend-production.up.railway.app";
  var MARKET_ADDRESS = "0x8f585e8c9f8784cEC2D92f328046303240f35769";
  var MIN_PRICE = 5; // price must be greater than this many NEA
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

  // ---- helpers ----
  function token() { return localStorage.getItem("newera_token"); }
  function escapeHtml(s) {
    return (s || "").replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  var imgMap = {};      // imageUrl -> { id, prompt, imageUrl, isListed, title }
  var current = null;   // image being listed
  var currentBtn = null;// the .sell-cta button that opened the modal

  // ---- toast ----
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
  overlay.className = "sell-overlay";
  overlay.innerHTML =
    '<div class="sell-modal" role="dialog" aria-modal="true">' +
      '<div class="sm-head">' +
        '<div class="sm-thumb"><img id="smThumb" alt=""></div>' +
        '<div><h3>List for sale</h3><p id="smSub">on BNB Chain</p></div>' +
      '</div>' +
      '<div class="sm-field">' +
        '<label for="smTitle">Title</label>' +
        '<input class="sm-input" id="smTitle" maxlength="80" placeholder="Give your creation a name" autocomplete="off">' +
      '</div>' +
      '<div class="sm-field">' +
        '<label for="smPrice">Price (NEA)</label>' +
        '<input class="sm-input" id="smPrice" type="number" min="' + (MIN_PRICE + 1) + '" step="1" placeholder="e.g. 50" autocomplete="off">' +
        '<div class="sm-hint">Must be more than ' + MIN_PRICE + ' NEA. On sale: 95% you, 5% platform fee.</div>' +
      '</div>' +
      '<div class="sm-status" id="smStatus"></div>' +
      '<div class="sm-actions">' +
        '<button class="sm-cancel" id="smCancel">Cancel</button>' +
        '<button class="sm-go" id="smGo">List for sale</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  var smThumb = overlay.querySelector("#smThumb");
  var smSub = overlay.querySelector("#smSub");
  var smTitle = overlay.querySelector("#smTitle");
  var smPrice = overlay.querySelector("#smPrice");
  var smStatus = overlay.querySelector("#smStatus");
  var smGo = overlay.querySelector("#smGo");
  var smCancel = overlay.querySelector("#smCancel");

  function setStatus(msg, kind) {
    smStatus.textContent = msg || "";
    smStatus.className = "sm-status" + (kind ? " " + kind : "");
  }
  function openModal(data, btn) {
    current = data; currentBtn = btn || null;
    smThumb.src = data.imageUrl;
    smTitle.value = data.title || "";
    smPrice.value = "";
    setStatus("");
    smGo.disabled = false; smGo.textContent = "List for sale";
    overlay.classList.add("show");
    setTimeout(function () { smTitle.focus(); }, 50);
  }
  function closeModal() {
    overlay.classList.remove("show");
    current = null; currentBtn = null;
  }
  smCancel.addEventListener("click", closeModal);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && overlay.classList.contains("show")) closeModal(); });

  // ---- submit: on-chain list -> POST /listings ----
  smGo.addEventListener("click", doList);
  async function doList() {
    if (!current) return;
    var title = (smTitle.value || "").trim();
    var priceNum = parseFloat(smPrice.value);

    if (title.length < 2) { setStatus("Please add a title (at least 2 characters).", "warn"); smTitle.focus(); return; }
    if (isNaN(priceNum) || priceNum <= MIN_PRICE) { setStatus("Price must be more than " + MIN_PRICE + " NEA.", "warn"); smPrice.focus(); return; }
    if (!token()) { setStatus("Connect your wallet first.", "warn"); return; }
    smGo.disabled = true;
    try {
      setStatus("Listing your image...", "work");
      var r = await fetch(API + "/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token() },
        body: JSON.stringify({
          imageId: current.id,
          price: String(priceNum),
          title: title
        })
      });
      var out = await r.json();
      if (!r.ok || !out.success) { setStatus((out && out.error) || "Could not save the listing.", "warn"); smGo.disabled = false; return; }

      setStatus("Listed!", "ok");
      // update the card + map
      current.isListed = true; current.title = title;
      if (currentBtn) markListed(currentBtn);
      showToast("Listed on the marketplace");
      setTimeout(closeModal, 700);
    } catch (err) {
      console.error(err);
      var msg = err && err.message ? err.message : "Listing failed";
      setStatus(msg.length > 60 ? "Listing failed. Please try again." : msg, "warn");
      smGo.disabled = false;
    }
  }

  // ---- card decoration ----
  function listedPill() {
    var p = document.createElement("span");
    p.className = "sell-listed";
    p.innerHTML = '<i></i> Listed';
    return p;
  }
  function markListed(btn) {
    var holder = btn.parentNode;
    if (holder) { btn.remove(); holder.appendChild(listedPill()); }
  }
  function addControl(card, data) {
    var holder = card.querySelector(".cc-img");
    if (!holder) return;
    if (data.isListed) {
      holder.appendChild(listedPill());
      return;
    }
    var btn = document.createElement("button");
    btn.className = "sell-cta";
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9M5 9v11h14V9M3 9h18"/></svg> List for sale';
    btn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); openModal(data, btn); });
    holder.appendChild(btn);
  }

  function decorate() {
    var cards = document.querySelectorAll(".col-card");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.__sellDone) continue;
      var img = card.querySelector(".cc-img img");
      if (!img) continue;
      var url = img.getAttribute("src");
      var data = imgMap[url];
      if (!data) continue;          // not one of my images (or map not loaded yet)
      card.__sellDone = true;
      addControl(card, data);
    }
  }

  // ---- load my images (for the imageUrl -> data map) ----
  async function loadMine() {
    if (!token()) return;
    try {
      var r = await fetch(API + "/my-images", { headers: { "Authorization": "Bearer " + token() } });
      if (!r.ok) return;
      var data = await r.json();
      (data.images || []).forEach(function (im) {
        if (im && im.imageUrl) imgMap[im.imageUrl] = im;
      });
    } catch (e) { console.log("sell: my-images load failed:", e); }
  }

  // ---- init: load map, decorate, watch for late-rendered cards ----
  async function init() {
    await loadMine();
    decorate();
    var grids = document.querySelector("#colGrid") || document.querySelector("#pfGrid") || document.body;
    var obs = new MutationObserver(function () { decorate(); });
    obs.observe(document.body, { childList: true, subtree: true });
  }
  init();
})();