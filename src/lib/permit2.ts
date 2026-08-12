import { parseAbi } from "viem"
import { CONTRACTS, publicClient } from "./chain"
import { ERC20_ABI } from "./swap"

/* Permit2 — what stands between a user and their first sell.
 *
 * Buying needs no approval at all: ETH arrives as msg.value and the router
 * spends what it was sent. Selling is the other direction — the router has to
 * pull an ERC-20 out of the user's wallet — and UniversalRouter does that
 * exclusively through Permit2 rather than a direct allowance. So two one-time
 * grants stand in front of the first sell of any given token:
 *
 *   1. ERC20.approve(Permit2, max) — lets Permit2 move that token at all.
 *   2. Permit2.approve(token, router, max, expiry) — lets THIS router spend it.
 *
 * There is a third way — signing an EIP-712 PermitSingle and passing it inside
 * the swap as command 0x0a — which saves the user one transaction. It is not
 * used here: it adds a signing surface, a nonce to get wrong, and a failure mode
 * where a wallet silently mangles typed data, in exchange for saving one cheap
 * transaction on a chain with 100ms blocks. Two plain approvals are legible in a
 * wallet prompt in a way typed data is not, and "approve this token" is a
 * sentence a person can check.
 *
 * Both grants are per-token and persist, so the cost is paid once and only
 * before the first sell of each token — never for a buy. */

export const PERMIT2_ABI = parseAbi([
  "function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
])

/** Permit2 stores allowances as uint160 and expiries as uint48. */
const MAX_UINT160 = (1n << 160n) - 1n
const MAX_UINT256 = (1n << 256n) - 1n

/* Roughly a year out. Permit2 treats expiration 0 as "this block only", so it
   has to be a real timestamp; far enough that nobody re-approves during a
   session, bounded so a forgotten allowance does not live forever. */
const EXPIRY_SECONDS = 365 * 24 * 60 * 60

/* "sushi" is a third grant, not a variant of the first two.
 *
 * The Universal Router never touches a token directly: the user approves
 * Permit2, Permit2 approves the router, which is why this was two steps.
 * SushiSwap's SwapRouter02 pulls with a plain `transferFrom`, so it needs one
 * allowance naming the router itself. Sending a Sushi seller down the Permit2
 * path would have them sign two grants the router they are about to use cannot
 * read, and the swap would still revert at the pull — two wasted signatures and
 * a failure that looks like ours. */
export type ApprovalStep = "erc20" | "permit2" | "sushi"

/**
 * Which grants are still missing before `amount` of `token` can be sold.
 * Empty means the sell can go straight through.
 */
export async function missingApprovals(
  token: string,
  owner: string,
  amount: bigint,
  /** Which venue will pull the token. Absent means the Uniswap path. */
  protocol?: string
): Promise<ApprovalStep[]> {
  const steps: ApprovalStep[] = []

  /* One grant, to the router itself, and it returns early — the Permit2 reads
     below are not just unnecessary here, they would report a missing grant for
     a contract this trade never touches. */
  if (protocol === "sushi") {
    const allowance = await publicClient
      .readContract({
        address: token as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [owner as `0x${string}`, CONTRACTS.sushiRouter02 as `0x${string}`],
      })
      .catch(() => 0n)
    return (allowance as bigint) < amount ? ["sushi"] : []
  }

  const [erc20Allowance, permit2Allowance] = await Promise.all([
    publicClient
      .readContract({
        address: token as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [owner as `0x${string}`, CONTRACTS.permit2 as `0x${string}`],
      })
      .catch(() => 0n),
    publicClient
      .readContract({
        address: CONTRACTS.permit2 as `0x${string}`,
        abi: PERMIT2_ABI,
        functionName: "allowance",
        args: [
          owner as `0x${string}`,
          token as `0x${string}`,
          CONTRACTS.universalRouter as `0x${string}`,
        ],
      })
      .catch(() => [0n, 0, 0] as const),
  ])

  if ((erc20Allowance as bigint) < amount) steps.push("erc20")

  const [allowed, expiration] = permit2Allowance as readonly [bigint, number, number]
  const now = Math.floor(Date.now() / 1000)
  // An expired grant is no grant, however large the number beside it.
  if (allowed < amount || Number(expiration) <= now) steps.push("permit2")

  return steps
}

export type ApprovalTx = { to: `0x${string}`; data: `0x${string}`; label: string }

/** The transaction for a given missing grant, ready to send. */
export function buildApproval(step: ApprovalStep, token: string): ApprovalTx {
  if (step === "sushi") {
    return {
      to: token as `0x${string}`,
      data: encodeErc20Approve(CONTRACTS.sushiRouter02, MAX_UINT256),
      label: "Allow SushiSwap's router to spend it",
    }
  }
  if (step === "erc20") {
    return {
      to: token as `0x${string}`,
      data: encodeErc20Approve(CONTRACTS.permit2, MAX_UINT256),
      label: "Allow Permit2 to move this token",
    }
  }
  return {
    to: CONTRACTS.permit2 as `0x${string}`,
    data: encodePermit2Approve(token, CONTRACTS.universalRouter, MAX_UINT160),
    label: "Allow Uniswap's router to spend it",
  }
}

/* Encoded by hand rather than through a viem helper so the two approvals read
   the same way and the argument order is visible at the call site. */
function encodeErc20Approve(spender: string, amount: bigint): `0x${string}` {
  const pad = (h: string) => h.replace(/^0x/, "").toLowerCase().padStart(64, "0")
  return `0x095ea7b3${pad(spender)}${pad(amount.toString(16))}` as `0x${string}`
}

function encodePermit2Approve(token: string, spender: string, amount: bigint): `0x${string}` {
  const pad = (h: string) => h.replace(/^0x/, "").toLowerCase().padStart(64, "0")
  const expiration = BigInt(Math.floor(Date.now() / 1000) + EXPIRY_SECONDS)
  // approve(address token, address spender, uint160 amount, uint48 expiration)
  return `0x87517c45${pad(token)}${pad(spender)}${pad(amount.toString(16))}${pad(expiration.toString(16))}` as `0x${string}`
}
