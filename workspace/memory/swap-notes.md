# Swap notes (post-arb / execution)

**Date:** 2026-03-22

## What worked

- Pre-check: dry-run first (quote, slippage under 1%, fees under 0.5% of notional).
- Size: conservative (e.g. 0.1 SABTC ~1% holding; low price impact).
- Signal: clear premium threshold vs baseline (see `HEARTBEAT.md` if in use).
- Execution: Orca path felt fast; ATA handling automated.

## Improvements

- Simulations: label explicitly as hypothetical; avoid “all-in” examples.
- Factuality: verify balances after tools; no placeholder signatures—real or omit.
- Risk: consider dynamic slippage (e.g. ~50 bps in tight markets); cross-check oracles if strategy depends on them.
- Logging: append dated lines to `memory/YYYY-MM-DD.md` when you capture real run outcomes.

## Open items

- Watch premium/spread regime; size only when rules in workspace still apply.
- Treat dollar/PNL figures as historical notes unless refreshed with current tool data.

*Timestamp: 2026-03-22T21:20:00Z*
