import { formatUnits } from "viem"
import { CHAIN_ID, publicClient, robinhoodChain } from "./chain"
import { connectForTrading, type ConnectKind, type Eip1193 } from "./wallet"
import { buildBuy, ERC20_ABI, type Quote } from "./swap"

/* Sending the swap.
 *
 * Everything here happens in the user's wallet. NewEra builds calldata, the
 * wallet signs it, and the chain executes it against Uniswap's router. We never
 * hold the funds, never hold a key, and cannot move anything after the fact —
 * which is the whole reason this can exist without us becoming a venue. */

export type TradeState =
  | { phase: "idle" }
  | { phase: "connecting" }
  | { phase: "switching" }
  | { phase: "signing" }
  | { phase: "pending"; hash: string }
  | { phase: "done"; hash: string; received: string | null }
  | { phase: "error"; message: string }

const hexChainId = `0x${CHAIN_ID.toString(16)}`

/** 4902 = "chain not added to this wallet". The only case where adding is right. */
async function ensureChain(provider: Eip1193) {
  const current = (await provider.request({ method: "eth_chainId" })) as string
  if (parseInt(current, 16) === CHAIN_ID) return

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChainId }],
    })
  } catch (err) {
    const code = (err as { code?: number })?.code
    if (code !== 4902) throw err
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hexChainId,
          chainName: robinhoodChain.name,
          nativeCurrency: robinhoodChain.nativeCurrency,
          rpcUrls: [robinhoodChain.rpcUrls.default.http[0]],
          blockExplorerUrls: [robinhoodChain.blockExplorers.default.url],
        },
      ],
    })
  }

  /* Verify rather than trust. Some wallets resolve the switch before it has
     taken effect, and sending to the wrong chain with a real value attached is
     not a mistake that can be undone. */
  const after = (await provider.request({ method: "eth_chainId" })) as string
  if (parseInt(after, 16) !== CHAIN_ID) {
    throw new Error(`Your wallet is still on another network. Switch it to ${robinhoodChain.name} and try again.`)
  }
}

export async function getEthBalance(address: string): Promise<bigint> {
  return publicClient.getBalance({ address: address as `0x${string}` })
}

export async function getTokenBalance(token: string, owner: string): Promise<bigint> {
  try {
    return (await publicClient.readContract({
      address: token as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [owner as `0x${string}`],
    })) as bigint
  } catch {
    return 0n
  }
}

/**
 * Execute a buy end-to-end, reporting each phase so the UI can say what the
 * wallet is waiting for. Resolves with the receipt outcome; throws only on
 * genuine failure, with a message written for a person rather than a debugger.
 */
export async function executeBuy(
  opts: {
    kind: ConnectKind
    token: string
    quote: Quote
    decimals: number
  },
  onState: (s: TradeState) => void
): Promise<void> {
  const { kind, token, quote, decimals } = opts
  try {
    onState({ phase: "connecting" })
    const { provider, address } = await connectForTrading(kind)

    onState({ phase: "switching" })
    await ensureChain(provider)

    /* Re-check the balance against the real cost. The wallet will reject an
       underfunded send anyway, but its error is unreadable and arrives after
       the user has already been asked to sign. */
    const balance = await getEthBalance(address)
    if (balance < quote.amountInWei) {
      throw new Error(
        `Not enough ETH. This costs ${formatUnits(quote.amountInWei, 18)} plus gas, and you have ${Number(formatUnits(balance, 18)).toFixed(5)}.`
      )
    }

    if (!quote.pool.fee) throw new Error("No pool fee tier on this quote — refusing to send.")
    const tx = buildBuy({
      token,
      recipient: address,
      amountInWei: quote.amountInWei,
      minOutWei: quote.minOutWei,
      fee: quote.pool.fee,
    })

    /* Simulate before asking anyone to sign. A revert caught here costs nothing;
       the same revert caught after signing costs the gas and reads as our bug. */
    try {
      await publicClient.call({
        account: address as `0x${string}`,
        to: tx.to,
        data: tx.data,
        value: tx.value,
      })
    } catch {
      throw new Error(
        "This swap would fail right now — the pool moved, or there is not enough liquidity at this size. Try a smaller amount or a higher slippage."
      )
    }

    /* Read the balance BEFORE broadcasting. Blocks here are ~100ms, so a read
       taken after the send can easily land after the swap has already been
       mined, making the difference zero and reporting a successful buy as
       having received nothing. */
    const before = await getTokenBalance(token, address)

    onState({ phase: "signing" })
    const hash = (await provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: address,
          to: tx.to,
          data: tx.data,
          value: `0x${tx.value.toString(16)}`,
        },
      ],
    })) as string

    onState({ phase: "pending", hash })

    /* Measure what actually arrived rather than reporting the quote. They differ
       by design — the quote is a prediction and the balance change is the fact. */
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: hash as `0x${string}`,
      timeout: 120_000,
    })
    if (receipt.status !== "success") {
      throw new Error("The transaction was mined but reverted. No tokens were bought; the gas was spent.")
    }
    const after = await getTokenBalance(token, address)
    const gained = after > before ? after - before : 0n

    onState({
      phase: "done",
      hash,
      received: gained > 0n ? formatUnits(gained, decimals) : null,
    })
  } catch (err) {
    const e = err as { code?: number; message?: string }
    if (e?.code === 4001 || /reject|denied|cancell?ed/i.test(e?.message || "")) {
      onState({ phase: "idle" })
      return
    }
    onState({ phase: "error", message: e?.message || "The swap could not be completed." })
  }
}
