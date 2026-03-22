# Heartbeat Checklist (Peg Trading Practice)

On trigger:

- **SABTC Peg Check**: Call hyperliquid_price (BTC), treasury_pool_info (SABTC_SAUSD). Calc deviation (pool_spot / HL_BTC * 1e6 bps). If >100bps (premium: sell 0.1 SABTC → SAUSD; discount: buy via SAUSD → 0.1 SABTC), dry_run treasury_pool_swap, log to memory/peg-state.json (deviation, suggested_action). Live trade only on explicit confirm.
- **SAETH Peg Check**: Same for SAETH_SAUSD vs HL ETH. Threshold >100bps (sell/buy 1 SAETH equiv).
- **Balances**: solana_token_balance (SABTC/SAETH/SAUSD), solana_balance. Alert if SOL <0.05 or skew >20%.
- **Cleanup**: clear_expired_swap_intents; solana_tx_history (last 5) for issues.
- **If Action**: Write alert to memory/YYYY-MM-DD.md (e.g., "SAETH +1.2%—propose sell 1"). Reply with summary.
- **Else**: HEARTBEAT_OK.
- **Rotate**: Full checks alternate with quick scans to save tokens.
- Track in memory/heartbeat-state.json (lastChecks: {sbtc: timestamp, saeth: timestamp}).
