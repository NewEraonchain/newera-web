/* ============================================================
   NEwera Studio — Task rewards inside the Claim tab (profile.html)
   Fetches /rewards, renders the task list under the welcome card,
   and lets the user claim each completed task (paid on-chain by
   the treasury via the backend). Decoupled — no profile.js edits.
   ============================================================ */
(function () {
  "use strict";
  var API = "https://newerabackend-production.up.railway.app";
  function token() { return localStorage.getItem("newera_token"); }

  var toast = document.createElement("div");
  toast.className = "rw-toast";
  document.body.appendChild(toast);
  function showToast(m) { toast.textContent = m || "Done"; toast.classList.add("show"); setTimeout(function () { toast.classList.remove("show"); }, 3200); }

  var ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var GIFT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v8H4v-8M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>';

  function findMount() {
    // place it inside the Claim tab, right after the welcome claim card
    var cw = document.getElementById("claimWrap");
    if (cw && cw.parentNode) return cw;
    return null;
  }

  var wrap = null;
  function ensureWrap() {
    if (wrap && document.body.contains(wrap)) return wrap;
    var mount = findMount();
    if (!mount) return null;
    wrap = document.createElement("div");
    wrap.className = "rw-wrap";
    mount.parentNode.insertBefore(wrap, mount.nextSibling);
    return wrap;
  }

  function render(data) {
    var w = ensureWrap();
    if (!w) return;
    var rows = (data.tasks || []).map(function (t) {
      var right;
      if (t.claimed) right = '<span class="rw-badge done">Claimed</span>';
      else if (t.done) right = '<button class="rw-btn" data-task="' + t.task + '">Claim ' + t.amount + ' NEA</button>';
      else right = '<span class="rw-badge locked">Do this first</span>';
      return '<div class="rw-item">' +
        '<div class="rw-ic">' + (t.claimed ? ICON : GIFT) + '</div>' +
        '<div class="rw-main"><div class="rw-label">' + t.label + '</div>' +
        '<div class="rw-amt">+' + t.amount + ' NEA \u00b7 one-time</div></div>' +
        '<div class="rw-act">' + right + '</div></div>';
    }).join("");

    w.innerHTML =
      '<div class="rw-head"><h3>Bonus tasks</h3>' +
      '<span class="rw-earned">earned <b>' + (data.earnedSoFar || 0) + '</b> / ' + (data.totalPossible || 40) + ' NEA</span></div>' +
      '<div class="rw-list">' + rows + '</div>';

    var btns = w.querySelectorAll(".rw-btn");
    for (var i = 0; i < btns.length; i++) btns[i].addEventListener("click", onClaim);
  }

  async function onClaim(e) {
    var btn = e.currentTarget;
    var task = btn.getAttribute("data-task");
    btn.disabled = true; btn.textContent = "Sending\u2026";
    try {
      var r = await fetch(API + "/rewards/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token() },
        body: JSON.stringify({ task: task })
      });
      var out = await r.json();
      if (!r.ok || !out.success) { showToast(out.error || "Could not claim"); btn.disabled = false; btn.textContent = "Claim"; return; }
      showToast("+" + out.amount + " NEA sent to your wallet");
      load(); // refresh list
    } catch (err) {
      showToast("Network error, try again"); btn.disabled = false; btn.textContent = "Claim";
    }
  }

  async function load() {
    if (window.NEWERA_CLAIMS_PAUSED || !token()) return;
    try {
      var r = await fetch(API + "/rewards", { headers: { "Authorization": "Bearer " + token() } });
      if (!r.ok) return;
      var data = await r.json();
      render(data);
    } catch (e) { /* ignore */ }
  }

  // the Claim tab may render after load; watch for claimWrap to appear
  function init() {
    load();
    var obs = new MutationObserver(function () { if (findMount() && (!wrap || !document.body.contains(wrap))) load(); });
    obs.observe(document.body, { childList: true, subtree: true });
  }
  init();
})();