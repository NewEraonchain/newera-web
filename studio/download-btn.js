/* ============================================================
   NewEra Studio — Download button on owned image cards
   Used on collection.html and profile.html. Adds a "Download"
   button to each owned card image. Decoupled (matches by
   imageUrl from /my-images). No edits to collection.js/profile.js.
   ============================================================ */
(function () {
  "use strict";

  var API = "https://newerabackend-production.up.railway.app";
  function token() { return localStorage.getItem("newera_token"); }

  var imgMap = {}; // imageUrl -> image obj

  // ---- toast (reuse sell.css toast styling) ----
  var toast = document.createElement("div");
  toast.className = "sell-toast";
  document.body.appendChild(toast);
  function showToast(msg) {
    toast.textContent = msg || "Done";
    toast.classList.add("show");
    setTimeout(function () { toast.classList.remove("show"); }, 1500);
  }

  function download(url, name, btn) {
    if (btn) btn.disabled = true;
    showToast("Preparing download\u2026");
    fetch(url).then(function (r) { return r.blob(); }).then(function (blob) {
      var a = document.createElement("a");
      var obj = URL.createObjectURL(blob);
      a.href = obj;
      a.download = (name || "newera-image") + ".png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(obj); }, 4000);
      if (btn) btn.disabled = false;
    }).catch(function () {
      window.open(url, "_blank"); // fallback
      if (btn) btn.disabled = false;
    });
  }

  function addControl(card, data) {
    var holder = card.querySelector(".cc-img");
    if (!holder) return;
    if (holder.querySelector(".dl-cta")) return;
    var btn = document.createElement("button");
    btn.className = "dl-cta";
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 11l5 4 5-4M5 21h14"/></svg> Download';
    btn.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      download(data.imageUrl, "newera-" + (data.id || "image"), btn);
    });
    holder.appendChild(btn);
  }

  function decorate() {
    var cards = document.querySelectorAll(".col-card");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.__dlDone) continue;
      var img = card.querySelector(".cc-img img");
      if (!img) continue;
      var data = imgMap[img.getAttribute("src")];
      if (!data) continue;
      card.__dlDone = true;
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
    } catch (e) { console.log("download: my-images load failed:", e); }
  }

  async function init() {
    await loadMine();
    decorate();
    var obs = new MutationObserver(function () { decorate(); });
    obs.observe(document.body, { childList: true, subtree: true });
  }
  init();
})();