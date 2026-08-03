import { createPublicClient, defineChain, http } from "viem"

/* Robinhood Chain, and the contracts we route through.
 *
 * Every address here was read off the chain before being written down —
 * `eth_getCode` returns real bytecode for all of them at chain id 4663. The
 * Uniswap docs list them, but a docs page is not a deployment, and this file is
 * the one place where being wrong costs somebody money. */

export const CHAIN_ID = 4663

export const robinhoodChain = defineChain({
  id: CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
})

export const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(),
})

/** Uniswap's official deployments. Verified on-chain 2026-08-02. */
export const CONTRACTS = {
  /** Handles v2, v3 and v4 through one entrypoint. */
  universalRouter: "0x8876789976decbfcbbbe364623c63652db8c0904",
  swapRouter02: "0xcaf681a66d020601342297493863e78c959e5cb2",
  quoterV2: "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7",
  v4Quoter: "0x8dc178efb8111bb0973dd9d722ebeff267c98f94",
  v4PoolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
  v3Factory: "0x1f7d7550b1b028f7571e69a784071f0205fd2efa",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
} as const

/** The chain's wrapped native token — every pool we can reach quotes against it. */
export const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as const

/* The four v3 fee tiers, cheapest first. Measured on live pools: these launches
   overwhelmingly sit at 0.01% or 1% and almost never in between, so probing in
   this order finds the pool in one or two calls most of the time. */
export const V3_FEE_TIERS = [100, 10000, 3000, 500] as const

export const explorerTx = (hash: string) =>
  `${robinhoodChain.blockExplorers.default.url}/tx/${hash}`
