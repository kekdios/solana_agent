### Swap Lessons Learned (2026-03-22 Post-Arb Notes)

**Successful Elements**:
- Pre-check: Always dry-run first (confirms quote, slippage <1%, fees <0.5% value).
- Size: Conservative (0.1 SABTC = 1% holding; impact 0.07%—scales well).
- Threshold: 270bps premium >100bps—clear signal per HEARTBEAT.md.
- Execution: Orca SDK fast (tx <1s); ATA auto-handled.

**Improvements**:
- Simulations: Flag as "hypothetical" explicitly; use partial sizes only—no "all" examples.
- Factuality: Verify balances post-tool; no placeholder sigs (use real or omit).
- Risks: Dynamic slippage (e.g., bps=50 for tight); oracle cross-check (Hyper + CoinGecko).
- Logging: Append to memory/YYYY-MM-DD.md for history (e.g., "0.1 sell, +$37 net").

**Next Arb**: Monitor 2.6% premium; propose 0.1 more if >200bps. Total captured: $37.

Timestamp: 2026-03-22T21:20:00Z