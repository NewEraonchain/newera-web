/* A choice is a row in a record, not a card: index, name, note, and the
   aperture's hairline snapping to whatever the pointer is on.
 *
 * Shared because the onboarding dialog and the account page ask the same
 * question — which wallet — and two different-looking answers to one question
 * is how a design starts drifting. */
export function ScanRow({
  index,
  title,
  note,
  selected,
  disabled,
  onClick,
  arrow,
}: {
  index: string
  title: string
  note: string
  selected?: boolean
  disabled?: boolean
  onClick: () => void
  arrow?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`scan-row group flex w-full items-baseline gap-4 border-b border-edge py-4 pl-3 pr-1 text-left disabled:cursor-not-allowed disabled:opacity-45 ${
        selected ? "is-on" : ""
      }`}
    >
      <span className={`font-mono text-micro ${selected ? "text-acid-500" : "text-fg-dim"}`}>
        {index}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-fg">{title}</span>
        <span className="mt-1 block font-mono text-micro text-fg-dim">{note}</span>
      </span>
      {arrow && (
        <span
          aria-hidden
          className="font-mono text-sm text-fg-dim transition-transform duration-200 group-hover:translate-x-1 group-hover:text-acid-500"
        >
          →
        </span>
      )}
    </button>
  )
}

/** The two ways in, in the order most people will use them. */
export const WALLETS = [
  { kind: "metamask" as const, title: "MetaMask", note: "Browser extension" },
  { kind: "walletconnect" as const, title: "WalletConnect", note: "Trust, OKX, Binance & mobile" },
]
