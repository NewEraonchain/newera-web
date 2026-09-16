/* ============================================================
   NewEra Studio — Make public (community) toggle
   Used on collection.html and profile.html (after sell.js).
   Matches owned cards by imageUrl (from /my-images), adds a
   "Make public" / "Public" toggle. POST /community/publish.
   No edits needed in collection.js / profile.js.
   ============================================================ */
(function () {
  "use strict";

  var API = "https://newerabackend-production.up.railway.app";

  function token() { return localStorage.getItem("newera_token"); }

  var imgMap = {}; // imageUrl -> { id, imageUrl, isPublic, ... }

  // ---- toast (own, so it works even without page toast) ----
  var toast = document.createElement("div");
  toast.className = "sell-toast"; // reuse sell.css toast styling
  document.body.appendChild(toast);
  function showToast(msg) {
    toast.textContent = msg || "Done";
    toast.classList.add("show");
    setTimeout(function () { toast.classList.remove("show"); }, 1600);
  }

  var LOCK = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  var GLOBE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/></svg>';

  function paint(btn, isPublic) {
    if (isPublic) {
      btn.classList.add("is-public");
      btn.innerHTML = GLOBE + " Public";
      btn.title = "Visible in Community. Click to make private.";
    } else {
      btn.classList.remove("is-public");
      btn.innerHTML = LOCK + " Make public";
      btn.title = "Show this in the Community feed.";
    }
  }

  async function toggle(data, btn) {
    if (!token()) { showToast("Connect your wallet first"); return; }
    var next = !data.isPublic;
    btn.disabled = true;
    try {
      var r = await fetch(API + "/community/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token() },
        body: JSON.stringify({ imageId: data.id, publish: next })
      });
      var out = await r.json();
      if (!r.ok || !out.success) { showToast((out && out.error) || "Couldn't update"); btn.disabled = false; return; }
      data.isPublic = out.image.isPublic;
      paint(btn, data.isPublic);
      showToast(data.isPublic ? "Added to Community" : "Removed from Community");
    } catch (e) {
      console.log("publish failed:", e);
      showToast("Couldn't update, try again");
    } finally {
      btn.disabled = false;
    }
  }

  function addControl(card, data) {
    var holder = card.querySelector(".cc-img");
    if (!holder) return;
    if (holder.querySelector(".pub-cta")) return; // already added
    var btn = document.createElement("button");
    btn.className = "pub-cta";
    paint(btn, !!data.isPublic);
    btn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); toggle(data, btn); });
    holder.appendChild(btn);
  }

  function decorate() {
    var cards = document.querySelectorAll(".col-card");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.__pubDone) continue;
      var img = card.querySelector(".cc-img img");
      if (!img) continue;
      var data = imgMap[img.getAttribute("src")];
      if (!data) continue;
      card.__pubDone = true;
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
    } catch (e) { console.log("publish: my-images load failed:", e); }
  }

  async function init() {
    await loadMine();
    decorate();
    var obs = new MutationObserver(function () { decorate(); });
    obs.observe(document.body, { childList: true, subtree: true });
  }
  init();
})();