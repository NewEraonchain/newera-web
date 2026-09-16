// NewEra wallet connect � WalletConnect + MetaMask, gasless via ERC-4337 Safe smart accounts
import { EthereumProvider } from 'https://esm.sh/@walletconnect/ethereum-provider@2.17.0?bundle';
import { createPublicClient, createWalletClient, custom, http, encodeFunctionData, parseEther, formatEther, parseEventLogs } from "https://esm.sh/viem@2.37.3";
import { bsc } from "https://esm.sh/viem@2.37.3/chains";
import { entryPoint07Address } from "https://esm.sh/viem@2.37.3/account-abstraction";
import { createSmartAccountClient } from "https://esm.sh/permissionless@0.3.6";
import { createPimlicoClient } from "https://esm.sh/permissionless@0.3.6/clients/pimlico";
import { toSafeSmartAccount } from "https://esm.sh/permissionless@0.3.6/accounts";

const API = "https://newerabackend-production.up.railway.app";
const projectId = "b5c417441aeb7274081e5868eb7cdedb";

// ---- gasless (ERC-4337) config ----
const PIMLICO_KEY = "REVOKED";
const PIMLICO_POLICY = "REVOKED";
const PIMLICO_URL = `https://api.pimlico.io/v2/56/rpc?apikey=${PIMLICO_KEY}`;
const RPC_URL = "https://bsc-dataseed.bnbchain.org";

async function buildSmartAccount(rawProvider, ownerAddr){
  const publicClient = createPublicClient({ chain: bsc, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account: ownerAddr, chain: bsc, transport: custom(rawProvider) });
  const pimlicoClient = createPimlicoClient({
    transport: http(PIMLICO_URL),
    entryPoint: { address: entryPoint07Address, version: "0.7" },
  });
  const safeAccount = await toSafeSmartAccount({
    client: publicClient,
    owners: [walletClient],
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    version: "1.4.1",
  });
  const smartClient = createSmartAccountClient({
    account: safeAccount,
    chain: bsc,
    paymaster: pimlicoClient,
    bundlerTransport: http(PIMLICO_URL),
    paymasterContext: { sponsorshipPolicyId: PIMLICO_POLICY },
    userOperation: { estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast },
  });
  return { safeAccount, smartClient, publicClient };
}

let wcProvider = null;                                   // shared WalletConnect provider
let loggedInFor = localStorage.getItem("newera_address"); // who we're logged in as

function short(a){ return a.slice(0,6) + "…" + a.slice(-4); }

function setConnectedUI(addr){
  document.querySelectorAll('.nav-cta, .btn.primary').forEach(function(b){
    if (/connect wallet/i.test(b.textContent) || b.dataset.nwAddr) {
      b.textContent = short(addr);
      b.dataset.nwAddr = addr;
    }
  });
}

function setDisconnectedUI(){
  document.querySelectorAll('[data-nw-addr]').forEach(function(b){
    b.textContent = "Connect wallet";
    delete b.dataset.nwAddr;
  });
}

// restore UI if already logged in
const savedAddr = localStorage.getItem("newera_address");
if (savedAddr) setConnectedUI(savedAddr);

// rebuild the smart client on page load, so every page can send gasless txs
async function restoreSmartAccount(){
  const owner = localStorage.getItem("newera_owner");
  const saved = localStorage.getItem("newera_address");
  if (!owner || !saved || !window.ethereum) { console.log("[newera] restore skipped"); return; }
  try {
    const accts = await window.ethereum.request({ method: "eth_accounts" });
    if (!accts || !accts.length) { console.log("[newera] wallet locked"); return; }
    if (accts[0].toLowerCase() !== owner.toLowerCase()) { console.log("[newera] different account"); return; }
    const { safeAccount, smartClient, publicClient } = await buildSmartAccount(window.ethereum, accts[0]);
    if (safeAccount.address.toLowerCase() !== saved.toLowerCase()) { console.log("[newera] safe mismatch"); return; }
    window.newera = {
      smartClient, safeAccount, publicClient,
      safeAddress: safeAccount.address, ownerAddress: accts[0],
      write: async (to, abi, functionName, args) => {
        const data = encodeFunctionData({ abi, functionName, args: args || [] });
        return smartClient.sendTransaction({ to, data });
      },
      read: async (to, abi, functionName, args) =>
        publicClient.readContract({ address: to, abi, functionName, args: args || [] }),
      parseEther: (n) => parseEther(String(n)),
      formatEther: (n) => formatEther(n),
      waitReceipt: (hash) => publicClient.waitForTransactionReceipt({ hash }),
      parseEvent: (abi, eventName, logs) => {
        try {
          const evts = parseEventLogs({ abi, eventName, logs });
          return (evts && evts.length) ? evts[0].args : null;
        } catch (e) { return null; }
      },
    };
    window.dispatchEvent(new CustomEvent("newera:ready", { detail: { address: safeAccount.address } }));
    console.log("[newera] smart account restored:", safeAccount.address);
  } catch (e) { console.log("[newera] restore failed:", e.message); }
}
restoreSmartAccount();

// ---- backend login (smart account) ----
// The Safe smart account is the user's on-chain identity: NEA, images, listings live there.
// MetaMask/WalletConnect is only the owner (signs). Backend verifies via ERC-1271/6492.
async function backendLogin(ownerAddr, rawProvider){
  const { safeAccount, smartClient, publicClient } = await buildSmartAccount(rawProvider, ownerAddr);
  const address = safeAccount.address;

  const { message } = await (await fetch(API + "/auth/nonce", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  })).json();

  const signature = await safeAccount.signMessage({ message });

  const data = await (await fetch(API + "/auth/verify", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, signature }),
  })).json();

  if (data.token) {
    localStorage.setItem("newera_token", data.token);
    localStorage.setItem("newera_address", address);
    localStorage.setItem("newera_owner", ownerAddr);
    loggedInFor = address;
    setConnectedUI(address);
    window.newera = {
      smartClient, safeAccount, publicClient,
      safeAddress: address, ownerAddress: ownerAddr,
      write: async (to, abi, functionName, args) => {
        const data = encodeFunctionData({ abi, functionName, args: args || [] });
        return smartClient.sendTransaction({ to, data });
      },
      read: async (to, abi, functionName, args) =>
        publicClient.readContract({ address: to, abi, functionName, args: args || [] }),
      parseEther: (n) => parseEther(String(n)),
      formatEther: (n) => formatEther(n),
      waitReceipt: (hash) => publicClient.waitForTransactionReceipt({ hash }),
      parseEvent: (abi, eventName, logs) => {
        try {
          const evts = parseEventLogs({ abi, eventName, logs });
          return (evts && evts.length) ? evts[0].args : null;
        } catch (e) { return null; }
      },
    };
    window.dispatchEvent(new CustomEvent("newera:ready", { detail: { address } }));
  }
}

// ---- WalletConnect (QR for Trust / OKX / Binance / mobile) ----
async function connectWalletConnect(){
  if (!wcProvider) {
    wcProvider = await EthereumProvider.init({
      projectId,
      chains: [56],
      showQrModal: true,
      rpcMap: { 56: "https://bsc-dataseed.bnbchain.org" },
      metadata: {
        name: "NewEra",
        description: "AI Creation On-Chain",
        url: window.location.origin,
        icons: ["https://avatars.githubusercontent.com/u/179229932"],
      },
    });
  }
  await wcProvider.connect();
  const address = wcProvider.accounts[0];
  await backendLogin(address, wcProvider);
}

// ---- make sure the wallet is on BNB Smart Chain (chainId 56) ----
async function ensureBscTestnet(){
  const BSC_MAINNET = "0x38"; // 56 in hex (mainnet)
  try {
    const current = await window.ethereum.request({ method: "eth_chainId" });
    if (current === BSC_MAINNET) return true;
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BSC_MAINNET }],
    });
    return true;
  } catch (err) {
    // 4902 = chain not added to the wallet yet -> add it
    if (err && (err.code === 4902 || (err.data && err.data.originalError && err.data.originalError.code === 4902))) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: "0x38",
            chainName: "BNB Smart Chain",
            nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
            rpcUrls: ["https://bsc-dataseed.bnbchain.org"],
            blockExplorerUrls: ["https://bscscan.com"],
          }],
        });
        return true;
      } catch (addErr) {
        console.error("add chain failed:", addErr);
        alert("Please switch your wallet to BNB Smart Chain to continue.");
        return false;
      }
    }
    console.error("switch chain failed:", err);
    alert("Please switch your wallet to BNB Smart Chain to continue.");
    return false;
  }
}

// ---- MetaMask / injected browser wallet ----
async function connectInjected(){
  if (typeof window.ethereum === "undefined") {
    alert("No browser wallet found. Use WalletConnect for mobile wallets.");
    return;
  }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const ok = await ensureBscTestnet();
  if (!ok) return;
  await backendLogin(accounts[0], window.ethereum);
}

// ---- disconnect ----
async function disconnectWallet(){
  try {
    if (wcProvider && wcProvider.disconnect) await wcProvider.disconnect();
  } catch(e){ console.log("disconnect:", e); }
  localStorage.removeItem("newera_token");
  localStorage.removeItem("newera_address");
  loggedInFor = null;
  setDisconnectedUI();
}

// ---- wallet chooser popup ----
function openWalletChooser(){
  let overlay = document.getElementById("nw-wallet-overlay");
  if (overlay) { overlay.style.display = "flex"; return; }

  overlay = document.createElement("div");
  overlay.id = "nw-wallet-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)";
  overlay.innerHTML = `
    <div style="background:linear-gradient(180deg,#0e1016,#0a0c12);border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:32px 28px;width:min(390px,90vw);font-family:Inter,sans-serif;box-shadow:0 40px 100px -30px rgba(0,0,0,.9);position:relative">
      <span id="nw-close" style="position:absolute;top:24px;right:26px;color:#9aa1ad;cursor:pointer;font-size:24px;line-height:1">&times;</span>
      <div style="text-align:center;margin-bottom:28px">
        <div style="width:54px;height:54px;border-radius:15px;margin:0 auto 16px;display:grid;place-items:center;background:rgba(205,255,77,.1);border:1px solid rgba(205,255,77,.28)">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#cdff4d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10.5h18"/><circle cx="16.5" cy="13.8" r="1.15" fill="#cdff4d" stroke="none"/></svg>
        </div>
        <h3 style="color:#f5f7fa;font-size:21px;margin:0;font-family:'Space Grotesk',sans-serif;font-weight:700;letter-spacing:-.01em">Connect a wallet</h3>
      </div>
      <button id="nw-mm" style="width:100%;display:flex;align-items:center;gap:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);color:#f5f7fa;padding:17px 18px;border-radius:14px;cursor:pointer;font-size:15px;font-weight:600;margin-bottom:14px;transition:all .2s;text-align:left" onmouseover="this.style.borderColor='rgba(255,255,255,.25)';this.style.background='rgba(255,255,255,.06)'" onmouseout="this.style.borderColor='rgba(255,255,255,.1)';this.style.background='rgba(255,255,255,.03)'">
        <span style="width:40px;height:40px;border-radius:11px;background:#fff;display:grid;place-items:center;flex:0 0 auto;overflow:hidden"><img src="images/MetaMask.png" alt="MetaMask" style="width:28px;height:28px;object-fit:contain"></span>
        <span style="display:flex;flex-direction:column;gap:3px">
          <span style="line-height:1.2">MetaMask</span>
          <span style="font-size:12.5px;color:#5e646f;font-weight:400;line-height:1.2">Browser extension wallet</span>
        </span>
      </button>
      <button id="nw-wc" style="width:100%;display:flex;align-items:center;gap:16px;background:rgba(205,255,77,.06);border:1px solid rgba(205,255,77,.28);color:#f5f7fa;padding:17px 18px;border-radius:14px;cursor:pointer;font-size:15px;font-weight:600;transition:all .2s;text-align:left" onmouseover="this.style.borderColor='rgba(205,255,77,.6)';this.style.background='rgba(205,255,77,.1)'" onmouseout="this.style.borderColor='rgba(205,255,77,.28)';this.style.background='rgba(205,255,77,.06)'">
        <span style="width:40px;height:40px;border-radius:11px;background:rgba(205,255,77,.12);display:grid;place-items:center;flex:0 0 auto">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#cdff4d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12a6 6 0 0 1 12 0M9 12a3 3 0 0 1 6 0"/><circle cx="12" cy="12" r="1" fill="#cdff4d" stroke="none"/></svg>
        </span>
        <span style="display:flex;flex-direction:column;gap:3px">
          <span style="line-height:1.2">WalletConnect</span>
          <span style="font-size:12.5px;color:#5e646f;font-weight:400;line-height:1.2">Trust, OKX, Binance &amp; mobile wallets</span>
        </span>
      </button>

    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector("#nw-close").onclick = () => overlay.style.display = "none";
  overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = "none"; };
  overlay.querySelector("#nw-mm").onclick = async () => { overlay.style.display="none"; try{ await connectInjected(); }catch(e){ console.error(e); } };
  overlay.querySelector("#nw-wc").onclick = async () => { overlay.style.display="none"; try{ await connectWalletConnect(); }catch(e){ console.error(e); } };
  
}

// ---- faucet popup: user enters address, claims free tBNB ----
function openFaucetPopup(){
  let ov = document.getElementById("nw-faucet-overlay");
  if (ov) { ov.style.display = "flex"; return; }

  ov = document.createElement("div");
  ov.id = "nw-faucet-overlay";
  ov.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)";
  const saved = localStorage.getItem("newera_address") || "";
  ov.innerHTML = `
    <div style="background:linear-gradient(180deg,#0e1016,#0a0c12);border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:32px 28px;width:min(400px,90vw);font-family:Inter,sans-serif;box-shadow:0 40px 100px -30px rgba(0,0,0,.9);position:relative">
      <span id="nwf-close" style="position:absolute;top:22px;right:24px;color:#9aa1ad;cursor:pointer;font-size:24px;line-height:1">&times;</span>
      <div style="text-align:center;margin-bottom:22px">
        <div style="width:54px;height:54px;border-radius:15px;margin:0 auto 16px;display:grid;place-items:center;background:rgba(205,255,77,.1);border:1px solid rgba(205,255,77,.28)">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#cdff4d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v6M12 22v-6M5 9l2 2M17 13l2 2M2 12h6M16 12h6"/></svg>
        </div>
        <h3 style="color:#f5f7fa;font-size:20px;margin:0 0 8px;font-family:'Space Grotesk',sans-serif;font-weight:700">Claim free tBNB</h3>
        <p style="color:#9aa1ad;font-size:13px;margin:0;line-height:1.5">Get a little test BNB to cover gas fees. One claim per wallet every 24 hours.</p>
      </div>
      <input id="nwf-addr" type="text" placeholder="Your wallet address (0x…)" value="${saved}" spellcheck="false" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.14);color:#f5f7fa;padding:14px 15px;border-radius:12px;font-size:14px;font-family:'JetBrains Mono',monospace;margin-bottom:14px;outline:none" />
      <button id="nwf-claim" style="width:100%;background:#cdff4d;border:0;color:#0a0d05;padding:14px;border-radius:12px;cursor:pointer;font-size:15px;font-weight:700;transition:.18s" onmouseover="this.style.filter='brightness(1.05)'" onmouseout="this.style.filter='none'">Claim 0.01 tBNB</button>
      <div id="nwf-msg" style="margin-top:14px;font-size:13px;text-align:center;line-height:1.5;display:none"></div>
    </div>`;
  document.body.appendChild(ov);

  const close = () => ov.style.display = "none";
  ov.querySelector("#nwf-close").onclick = close;
  ov.onclick = (e) => { if (e.target === ov) close(); };

  const msg = ov.querySelector("#nwf-msg");
  function showMsg(text, color){ msg.style.display="block"; msg.style.color = color; msg.textContent = text; }

  ov.querySelector("#nwf-claim").onclick = async () => {
    const addr = (ov.querySelector("#nwf-addr").value || "").trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) { showMsg("Please enter a valid wallet address.", "#ff8a97"); return; }
    const btn = ov.querySelector("#nwf-claim");
    btn.disabled = true; btn.textContent = "Sending…";
    showMsg("Sending tBNB to your wallet…", "#cdff4d");
    try {
      const r = await fetch(API + "/faucet", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addr }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        showMsg("Success! 0.01 tBNB sent. It'll arrive in a few seconds.", "#cdff4d");
        btn.textContent = "Claimed ✓";
      } else {
        showMsg(d.error || "Could not claim right now.", "#ff8a97");
        btn.disabled = false; btn.textContent = "Claim 0.01 tBNB";
      }
    } catch (e) {
      showMsg("Network error, please try again.", "#ff8a97");
      btn.disabled = false; btn.textContent = "Claim 0.01 tBNB";
    }
  };
}

// ---- disconnect menu (when clicking the address) ----
function openDisconnectMenu(btn){
  let m = document.getElementById("nw-disc-menu");
  if (m) { m.remove(); return; } // toggle off

  const addr = btn.dataset.nwAddr;
  m = document.createElement("div");
  m.id = "nw-disc-menu";
  const r = btn.getBoundingClientRect();
  m.style.cssText = "position:fixed;z-index:10000;background:#0e1016;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:10px;width:230px;box-shadow:0 24px 60px -20px rgba(0,0,0,.85);font-family:Inter,sans-serif";
  m.style.top = (r.bottom + 8) + "px";
  m.style.left = Math.max(12, r.right - 230) + "px";
  m.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;margin-bottom:8px;background:rgba(255,255,255,.03);border-radius:10px">
      <span style="width:9px;height:9px;border-radius:50%;background:#cdff4d;flex:0 0 auto"></span>
      <span style="color:#f5f7fa;font-size:13px;font-weight:600">${short(addr)}</span>
    </div>
    <button id="nw-copy" style="width:100%;text-align:left;background:none;border:0;color:#9aa1ad;font-size:13.5px;padding:9px 10px;border-radius:9px;cursor:pointer" onmouseover="this.style.background='rgba(255,255,255,.05)';this.style.color='#f5f7fa'" onmouseout="this.style.background='none';this.style.color='#9aa1ad'">📋 Copy address</button>
    <button id="nw-disc" style="width:100%;text-align:left;background:none;border:0;color:#f6465d;font-size:13.5px;font-weight:600;padding:9px 10px;border-radius:9px;cursor:pointer" onmouseover="this.style.background='rgba(246,70,93,.08)'" onmouseout="this.style.background='none'">⏻ Disconnect</button>
  `;
  document.body.appendChild(m);

  m.querySelector("#nw-copy").onclick = () => { navigator.clipboard.writeText(addr); m.remove(); };
  m.querySelector("#nw-disc").onclick = () => { m.remove(); disconnectWallet(); };

  setTimeout(() => {
    document.addEventListener("click", function closer(ev){
      if (!m.contains(ev.target) && ev.target !== btn) { m.remove(); document.removeEventListener("click", closer); }
    });
  }, 50);
}

// ---- wire up the buttons ----
// mark connect buttons once (so refresh-with-saved-address still works)
document.querySelectorAll('.nav-cta, .btn.primary').forEach(function(b){
  if (/connect wallet/i.test(b.textContent) || b.dataset.nwAddr) {
    b.dataset.nwBtn = "1"; // permanent marker
  }
});

document.querySelectorAll('[data-nw-btn]').forEach(function(b){
  b.addEventListener("click", function(e){
    e.preventDefault();
    if (this.dataset.nwAddr) {
      openDisconnectMenu(this);   // connected -> disconnect menu
    } else {
      openWalletChooser();        // not connected -> wallet options
    }
  });
});