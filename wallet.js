// NewEra wallet connect: WalletConnect + MetaMask, used for SIGN-IN only. Nothing here sends a transaction.
// A user's account is their Safe smart-account address (derived from the connected wallet), which keeps
// every existing account valid. All balances and payments live in the NewEra database, behind the API.
import { EthereumProvider } from 'https://esm.sh/@walletconnect/ethereum-provider@2.17.0?bundle';
import { createPublicClient, createWalletClient, custom, http } from "https://esm.sh/viem@2.37.3";
import { bsc } from "https://esm.sh/viem@2.37.3/chains";
import { entryPoint07Address } from "https://esm.sh/viem@2.37.3/account-abstraction";
import { toSafeSmartAccount } from "https://esm.sh/permissionless@0.3.6/accounts";

const API = "https://newerabackend-production.up.railway.app";
const projectId = "b5c417441aeb7274081e5868eb7cdedb";

// ---- account identity ----
const RPC_URL = "https://bsc-dataseed.bnbchain.org";

// Derive the user's Safe address from the connected wallet. Read-only: used to identify the
// account and to sign the login message. It is never deployed or sent a transaction from here.
async function buildSmartAccount(rawProvider, ownerAddr){
  const publicClient = createPublicClient({ chain: bsc, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account: ownerAddr, chain: bsc, transport: custom(rawProvider) });
  const safeAccount = await toSafeSmartAccount({
    client: publicClient,
    owners: [walletClient],
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    version: "1.4.1",
  });
  return { safeAccount };
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

// ---- backend login (smart account) ----
// The Safe smart-account address is the user's account id. Signing in proves control of it.
// MetaMask/WalletConnect is only the owner (signs). Backend verifies via ERC-1271/6492.
async function backendLogin(ownerAddr, rawProvider){
  const { safeAccount } = await buildSmartAccount(rawProvider, ownerAddr);
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