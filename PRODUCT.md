# PRODUCT.md

Durable product truth for NewEra. Visual decisions do not live here — see
`DESIGN.md`.

## What this is

NewEra indexes every token created on Robinhood Chain at the moment of
creation — at block zero, before the token has a price, a chart, a holder or a
follower. It groups launches into themes by what they mean, flags near-copies
and ticker impersonation, and scores risk. It reads the chain and signs nothing.

## The unique mechanism

Every other analytics tool starts indexing when a token starts trading, because
their inputs are price, volume and holders. For the first minutes of a token's
life none of those exist. NewEra reads the only thing that does exist yet: what
the token *means* — its name, ticker, creator, and its similarity to everything
else created in the same few minutes.

This is why the live tape is the product's proof. A competitor cannot show a
token at block zero, because they have not indexed it yet.

## Who it is for

People who watch launches on Robinhood Chain and currently make decisions with
no information at all for the first minutes — the window where the outcome is
already determined. They read in the dark, at speed, with a tape moving.

## What must be true of every claim

Every number on any surface must be reproducible from a live API call. If a
figure cannot be pulled from `/intel/stats` or `/intel/feed`, it does not ship.
No projections, no forecasts, no invented demonstration data on a page whose
entire argument is that the data is honest.

Measured, live, at time of writing: ~8,000 launches/24h, 48.1% near-duplicates,
32.6% high-risk, ~200 active themes.

## Constraints that do not get reopened

- **Robinhood.** Never use Robinhood's name, marks or branding, and never imply
  affiliation. Nominative use of "Robinhood Chain" to name the network is
  permitted. The disclaimer stays in the footer and on the legal pages.
- **No token listing agency, ever.** Contact means disqualification and
  blacklisting under Binance's September 2025 policy.
- **No market maker offering guaranteed volume or price support.** That is a
  federal crime; the DOJ has indicted firms and imprisoned a founder for it.
- **No liquidity pool for NEA.**
- **The token launch is the team's remit**, roughly a month after product
  launch. Product work does not wait on it and does not reference it.
- **The product reads; it never signs.** It holds no keys and performs no
  transactions. The legal pages commit to this and the UI must not contradict it.

## Known limits, stated plainly

- Ingest runs roughly 9–10 minutes behind the chain head. The tape is live, not
  instant, and the UI should not imply otherwise.
- Whether theme emergence leads price is **untested**. It is not claimed
  anywhere and must not be.
- The RPC prunes state at 30,000 blocks; the watcher clamps to stay inside it.

## Surfaces and modes

| Surface | Mode |
|---|---|
| `/` landing | Persuade |
| `/app`, `/app/theme/:slug` | Operate |
| `/how-it-works`, `/detection`, `/about`, legal | Read |

## What the product must never feel like

A hype page. The argument is that everything else is noise and this is
measurement — a surface that behaves like the thing it criticises loses the
argument before the copy is read.
