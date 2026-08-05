/* Wallet connect — identity only.
 *
 * The previous product minted a Safe smart account per user and sponsored gas
 * through Pimlico, because generating an image was an on-chain transaction.
 * Launch intelligence performs no transactions at all, so none of that is
 * needed: connecting exists solely to prove which address you are, so
 * preferences can be saved against it.
 *
 * Dropping it removes the ERC-4337 stack, the paymaster, and the API key that
 * was readable in client JS. Signing here authorises nothing and can move no
 * funds.
 */
import { API } from "./api"

const CHAIN_ID = Number(import.meta.env.VITE_NEWERA_CHAIN_ID || 4663)
const WC_PROJECT_ID =
  (import.meta.env.VITE_WC_PROJECT_ID as string | undefined) ||
  "b5c417441aeb7274081e5868eb7cdedb"

export type ConnectKind = "metamask" | "walletconnect"

export type Session = {
  address: string
  token: string
  isNewUser: boolean
}

export type Eip1193 = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
}

declare global {
  interface Window {
    ethereum?: Eip1193
  }
}

/** 4001 is the EIP-1193 "user rejected" code — not an error worth shouting about. */
export function isRejection(err: unknown): boolean {
  const e = err as { code?: number; message?: string }
  return e?.code === 4001 || /reject|denied|cancell?ed/i.test(e?.message || "")
}

let wcProvider: (Eip1193 & { connect(): Promise<void>; accounts: string[]; disconnect?(): Promise<void> }) | null = null

async function getWalletConnect() {
  if (wcProvider) return wcProvider
  const { EthereumProvider } = await import("@walletconnect/ethereum-provider")
  wcProvider = (await EthereumProvider.init({
    projectId: WC_PROJECT_ID,
    chains: [CHAIN_ID],
    showQrModal: true,
    metadata: {
      name: "NewEra",
      description: "Launch intelligence for Robinhood Chain",
      url: window.location.origin,
      icons: [`${window.location.origin}/favicon.svg`],
    },
  })) as unknown as typeof wcProvider
  return wcProvider!
}

/**
 * Connect a wallet and nothing more — no nonce, no signature, no session.
 *
 * Trading needs an account to send from, not an identity. Routing it through
 * connect() would demand a personal_sign and a backend round-trip before anyone
 * could swap, which is friction for no benefit and conflates "who you are" with
 * "whose funds these are". A trade is authorised by the transaction signature
 * itself.
 */
export async function connectForTrading(
  kind: ConnectKind
): Promise<{ provider: Eip1193; address: string }> {
  return getProvider(kind)
}

async function getProvider(kind: ConnectKind): Promise<{ provider: Eip1193; address: string }> {
  if (kind === "walletconnect") {
    const wc = await getWalletConnect()
    await wc.connect()
    const address = wc.accounts?.[0]
    if (!address) throw new Error("No account returned by the wallet.")
    return { provider: wc, address }
  }

  if (!window.ethereum) {
    throw new Error("No browser wallet found. Use WalletConnect for mobile wallets.")
  }
  const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[]
  if (!accounts?.length) throw new Error("No account returned by the wallet.")
  return { provider: window.ethereum, address: accounts[0] }
}

/**
 * Connect, prove control of the address, and exchange that for a session.
 * Throws on failure; callers distinguish rejection with isRejection().
 */
export async function connect(
  kind: ConnectKind,
  opts: { anonId?: string | null; intent?: string | null } = {},
): Promise<Session> {
  const { provider, address } = await getProvider(kind)

  const nonceRes = await fetch(`${API}/auth/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, chainId: CHAIN_ID }),
  })
  if (!nonceRes.ok) throw new Error("Could not start sign-in. Please try again.")
  const { message } = (await nonceRes.json()) as { message: string }

  const signature = (await provider.request({
    method: "personal_sign",
    params: [message, address],
  })) as string

  const verifyRes = await fetch(`${API}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address,
      signature,
      chainId: CHAIN_ID,
      // For a plain EOA the signer and the account are the same address. The
      // backend scores this one for wallet history.
      ownerAddress: address,
      anonId: opts.anonId ?? null,
      intent: opts.intent ?? null,
    }),
  })
  const data = (await verifyRes.json()) as { token?: string; isNewUser?: boolean; error?: string }
  if (!verifyRes.ok || !data.token) throw new Error(data.error || "Sign-in failed.")

  const lower = address.toLowerCase()
  localStorage.setItem("newera_token", data.token)
  localStorage.setItem("newera_address", lower)
  window.dispatchEvent(new CustomEvent("newera:connected", { detail: { address: lower } }))

  return { address: lower, token: data.token, isNewUser: !!data.isNewUser }
}

export async function disconnect() {
  try {
    if (wcProvider?.disconnect) await wcProvider.disconnect()
  } catch {
    /* the session may already be gone on the wallet side */
  }
  localStorage.removeItem("newera_token")
  localStorage.removeItem("newera_address")
  window.dispatchEvent(new CustomEvent("newera:disconnected"))
}

/**
 * The account the injected wallet is on RIGHT NOW, or null.
 *
 * `currentAddress()` is the address that signed in — it is written once and
 * never revisited, so it goes stale the moment somebody switches accounts in
 * MetaMask. Anything that shows a BALANCE has to use this instead: the trade
 * executes from whatever account the wallet is on, so sizing a sell against the
 * signed-in account's balance can offer a "Max" the signer does not hold.
 *
 * `eth_accounts`, not `eth_requestAccounts` — this must never raise a prompt.
 */
export async function connectedAddress(): Promise<string | null> {
  try {
    if (!window.ethereum) return currentAddress()
    const accounts = (await window.ethereum.request({ method: "eth_accounts" })) as string[]
    return accounts?.[0]?.toLowerCase() || currentAddress()
  } catch {
    return currentAddress()
  }
}

/** Subscribe to account switches. Returns an unsubscribe function. */
export function onAccountsChanged(cb: (address: string | null) => void): () => void {
  const eth = window.ethereum as
    | (Eip1193 & { on?: (e: string, h: (a: string[]) => void) => void; removeListener?: (e: string, h: (a: string[]) => void) => void })
    | undefined
  if (!eth?.on) return () => {}
  const handler = (accounts: string[]) => cb(accounts?.[0]?.toLowerCase() || null)
  eth.on("accountsChanged", handler)
  return () => eth.removeListener?.("accountsChanged", handler)
}

export function currentAddress(): string | null {
  return localStorage.getItem("newera_address")
}

export function hasSession(): boolean {
  return !!localStorage.getItem("newera_token")
}
