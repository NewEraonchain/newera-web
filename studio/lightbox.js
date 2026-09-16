/* ============================================================
   NewEra Studio — Image lightbox
   Click a card image to view it large in a dim overlay.
   Works on: marketplace (.mk-img), community (.cm-img),
   prompts (.pr-img). NOT on collection (owned images).
   Standalone — include after the page's main script.
   ============================================================ */
(function () {
  "use strict";

  // build overlay once
  var lb = document.createElement("div");
  lb.className = "lb-overlay";
  lb.innerHTML =
    '<button class="lb-close" aria-label="Close">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
    '</button>' +
    '<figure class="lb-fig">' +
      '<span class="lb-imgwrap"><img class="lb-img" src="" alt=""></span>' +
      '<figcaption class="lb-cap"></figcaption>' +
    '</figure>';
  document.body.appendChild(lb);

  var lbImg = lb.querySelector(".lb-img");
  var lbCap = lb.querySelector(".lb-cap");
  var closeBtn = lb.querySelector(".lb-close");

  function open(src, caption) {
    lbImg.src = src;
    lbCap.textContent = caption || "";
    lbCap.style.display = caption ? "" : "none";
    lb.classList.add("show");
    document.body.style.overflow = "hidden";
  }
  function close() {
    lb.classList.remove("show");
    document.body.style.overflow = "";
    setTimeout(function () { lbImg.src = ""; }, 250);
  }

  // image containers that should open the lightbox (collection .cc-img excluded)
  var IMG_SEL = ".mk-img img, .cm-img img, .pr-img img";
  var CARD_SEL = ".mk-card, .cm-card, .pr-card";
  var TITLE_SEL = ".mk-title, .cm-title, .pr-title";

  document.addEventListener("click", function (e) {
    // ignore clicks on any button/link inside a card
    if (e.target.closest("button, a")) return;
    var img = e.target.closest(IMG_SEL);
    if (!img) return;
    var card = img.closest(CARD_SEL);
    var titleEl = card ? card.querySelector(TITLE_SEL) : null;
    open(img.getAttribute("src"), titleEl ? titleEl.textContent.trim() : "");
  });

  closeBtn.addEventListener("click", close);
  lb.addEventListener("click", function (e) { if (e.target === lb) close(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && lb.classList.contains("show")) close();
  });
})();