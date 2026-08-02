import { Component, type ErrorInfo, type ReactNode } from "react"

/* The thing that makes a wrong guess survivable.
 *
 * There was no boundary anywhere in the app. Every `|| []` in the codebase is a
 * guess about which API field will drift, and without a boundary a single wrong
 * guess takes the whole site: feeding `samples` as a string instead of an array
 * emptied `#root` completely — no header, no footer, no way back, just white.
 *
 * The second case is routine rather than exotic. Every route but `/` is a lazy
 * chunk, and `<Suspense>` does not catch a rejected import. So any visitor with
 * the tab open across a redeploy gets a blank page the moment they navigate,
 * because their hashed chunk no longer exists. That is a normal Tuesday, not an
 * edge case, and it is why the reload action is offered by name. */

type Props = { children: ReactNode; scope?: string }
type State = { error: Error | null }

const isStaleChunk = (e: Error) =>
  /dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(
    `${e.name} ${e.message}`
  )

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Silent failure is how the onboarding funnel stayed broken for hours.
    console.error(`[boundary${this.props.scope ? ":" + this.props.scope : ""}]`, error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const stale = isStaleChunk(error)
    return (
      <section className="mx-auto max-w-[42rem] px-[4vw] py-[18vh]">
        <h1 className="font-display text-[clamp(1.8rem,4vw,3rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em]">
          {stale ? "This page moved on" : "Something broke on this page"}
        </h1>
        <p className="measure mt-6 text-base leading-relaxed text-fg-muted">
          {stale
            ? "NewEra was updated while this tab was open, so the page it tried to load no longer exists. Reloading picks up the new version."
            : "The page hit an error it could not recover from. The rest of the site is unaffected, and nothing you did caused it."}
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="block-btn bg-acid-500 font-semibold text-ink-950"
          >
            Reload the page
          </button>
          <a href="/app" className="block-btn border border-edge-strong text-fg-muted">
            Go to the live feed
          </a>
        </div>
        {/* The message, not the stack: enough for a bug report, no wall of build output. */}
        <p className="mt-8 font-mono text-xs text-fg-dim">{error.message}</p>
      </section>
    )
  }
}
