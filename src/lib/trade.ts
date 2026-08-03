import { formatUnits } from "viem"
import { CHAIN_ID, publicClient, robinhoodChain } from "./chain"
import { connectForTrading, type ConnectKind, type Eip1193 } from "./wallet"
import { buildTrade, ERC20_ABI, needsApproval, type Pool, type Quote } from "./swap"
import { buildApproval, missingApprovals } from "./permit2"

/* Sending the trade.
 *
 * Everything here happens in the user's wallet. NewEra builds calldata, the
 * wallet signs it, and the chain executes it against Uniswap's router. We never
 * hold the funds, never hold a key, and cannot move anything after the fact —
 * which is the whole reason this can exist without us becoming a venue. */

export type TradeState =
  | { phase: "idle" }
  | { phase: "connecting" }
  | { phase: "switching" }
  | { phase: "checking" }
  | { phase: "approving"; step: number; total: number; label: string }
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
     taken effect, and sending to the wrong chain with real value attached is not
     a mistake that can be undone. */
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

async function sendAndWait(
  provider: Eip1193,
  from: string,
  tx: { to: `0x${string}`; data: `0x${string}`; value?: bigint }
): Promise<string> {
  const hash = (await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from,
        to: tx.to,
        data: tx.data,
        ...(tx.value !== undefined && tx.value > 0n ? { value: `0x${tx.value.toString(16)}` } : {}),
      },
    ],
  })) as string
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: hash as `0x${string}`,
    timeout: 120_000,
  })
  if (receipt.status !== "success") throw new Error("A required approval transaction reverted.")
  return hash
}

/**
 * Execute a trade end-to-end, reporting each phase so the UI can say what the
 * wallet is waiting for. Resolves once the receipt is in; throws only on genuine
 * failure, with a message written for a person rather than a debugger.
 */
export async function executeTrade(
  opts: { kind: ConnectKind; token: string; pool: Pool; quote: Quote },
  onState: (s: TradeState) => void
): Promise<void> {
  const { kind, token, pool, quote } = opts
  const selling = quote.side === "sell"

  try {
    onState({ phase: "connecting" })
    const { provider, address } = await connectForTrading(kind)

    onState({ phase: "switching" })
    await ensureChain(provider)

    /* Check the balance against the real cost. The wallet would reject an
       underfunded send anyway, but its error is unreadable and arrives only
       after the user has already been asked to sign. */
    if (selling) {
      const held = await getTokenBalance(token, address)
      if (held < quote.amountInWei) {
        throw new Error(
          `You do not hold that much. This sells ${formatUnits(quote.amountInWei, quote.inDecimals)} and you have ${formatUnits(held, quote.inDecimals)}.`
        )
      }
    } else {
      const balance = await getEthBalance(address)
      if (balance < quote.amountInWei) {
        throw new Error(
          `Not enough ETH. This costs ${formatUnits(quote.amountInWei, 18)} plus gas, and you have ${Number(formatUnits(balance, 18)).toFixed(5)}.`
        )
      }
    }

    /* Approvals, when the router has to pull a token rather than spend ETH it
       was sent. Each is a real transaction and is announced before it appears. */
    if (needsApproval(pool, token, quote.side)) {
      onState({ phase: "checking" })
      const steps = await missingApprovals(token, address, quote.amountInWei)
      for (let i = 0; i < steps.length; i++) {
        const approval = buildApproval(steps[i], token)
        onState({ phase: "approving", step: i + 1, total: steps.length, label: approval.label })
        await sendAndWait(provider, address, approval)
      }
    }

    const tx = buildTrade({ pool, token, recipient: address, quote })

    /* Simulate before asking anyone to sign. A revert caught here costs nothing;
       the same revert after signing costs the gas and reads as our bug. This
       runs after approvals because a sell cannot simulate until the router is
       actually permitted to pull the token. */
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
       taken after the send can land after the swap has already been mined,
       making the difference zero and reporting a good trade as receiving
       nothing. */
    const before = selling
      ? await getEthBalance(address)
      : await getTokenBalance(token, address)

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

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: hash as `0x${string}`,
      timeout: 120_000,
    })
    if (receipt.status !== "success") {
      throw new Error("The transaction was mined but reverted. Nothing was traded; the gas was spent.")
    }

    /* Measure what actually arrived rather than reporting the quote. They differ
       by design — the quote is a prediction and the balance change is the fact.
       On a sell the proceeds are ETH, so gas comes out of the same balance and
       the difference understates the trade slightly; better to understate than
       to claim a number nobody can verify. */
    const after = selling
      ? await getEthBalance(address)
      : await getTokenBalance(token, address)
    const gained = after > before ? after - before : 0n

    onState({
      phase: "done",
      hash,
      received: gained > 0n ? formatUnits(gained, quote.outDecimals) : null,
    })
  } catch (err) {
    const e = err as { code?: number; message?: string }
    if (e?.code === 4001 || /reject|denied|cancell?ed/i.test(e?.message || "")) {
      onState({ phase: "idle" })
      return
    }
    onState({ phase: "error", message: e?.message || "The trade could not be completed." })
  }
}
