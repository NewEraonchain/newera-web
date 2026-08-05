import { formatUnits } from "viem"
import { CHAIN_ID, publicClient, robinhoodChain } from "./chain"
import { connectForTrading, type ConnectKind, type Eip1193 } from "./wallet"
import { approvalAsset, buildTrade, ERC20_ABI, type Pool, type Quote } from "./swap"
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
  // Re-checked here, not just once at the start — see the note on the swap send.
  await ensureChain(provider)
  const hash = (await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from,
        chainId: hexChainId,
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
  const { kind, token, quote } = opts
  /* The pool the quote was priced in. See the note in buildTrade: the caller's
     copy can be stale or missing a fee tier the quoter resolved. */
  const pool = quote.pool ?? opts.pool
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
    /* Approve what the router will actually pull. This was always `token`,
       which is right for a sell and wrong for a v4 buy against a WETH-sided
       pool: that pulls WETH, so the user signed two grants for the token they
       were trying to BUY and the swap then failed at the pull with nothing on
       screen to explain why. */
    const pulls = approvalAsset(pool, token, quote.side)
    if (pulls) {
      onState({ phase: "checking" })
      const steps = await missingApprovals(pulls, address, quote.amountInWei)
      for (let i = 0; i < steps.length; i++) {
        const approval = buildApproval(steps[i], pulls)
        onState({ phase: "approving", step: i + 1, total: steps.length, label: approval.label })
        await sendAndWait(provider, address, approval)
      }
    }

    /* The chain's clock. A deadline built from a browser clock that is even a
       few minutes slow is already expired when it arrives, and the router's
       revert for that reads as our bug. One extra read, on the send path only. */
    const nowSeconds = await publicClient
      .getBlock({ blockTag: "latest" })
      .then((b) => b.timestamp)
      .catch(() => undefined)

    const tx = buildTrade({ pool, token, recipient: address, quote, nowSeconds })

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

    /* The chain is checked again, immediately before signing.
       Checking once at the start was not enough: this flow sends up to three
       transactions, each separated by a human confirming a wallet prompt, and a
       wallet can change network in between — from its own UI, or from a phone
       over WalletConnect, which the page is never told about. The pre-sign
       simulation cannot catch it either, because it runs against our own
       publicClient, which is hardwired to this chain and so always passes.
       A sell on the wrong chain costs gas. A BUY carries value, so it would
       send real ETH to the router's address on a chain where that address may
       hold no contract at all. `chainId` in the params makes a mismatched
       wallet refuse rather than sign. */
    onState({ phase: "switching" })
    await ensureChain(provider)

    onState({ phase: "signing" })
    const hash = (await provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: address,
          chainId: hexChainId,
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
