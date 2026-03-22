# Native agent tokens (`solana_agent_token_send`)

The Solana Agent is **born with**:

- **`solana_agent_token_send`** — send **SABTC**, **SAETH**, or **SAUSD** by **symbol** (canonical mints built in).
- **`treasury_pool_info`** — **read-only** Whirlpool snapshot for **SABTC/SAUSD** or **SAETH/SAUSD** (or any `pool_address`): Orca API then on-chain fallback (aligned with **solanaagent.app**). Vault balances, spot price (token B per 1 token A), tick, liquidity, fees. Use for monitoring / market-making context; use **`treasury_pool_swap`** + **`dry_run:true`** for an executable quote at a chosen size.
- **`treasury_pool_swap`** — swap **SABTC↔SAUSD** or **SAETH↔SAUSD** on Orca Whirlpools (**Orca SDK only**), same app wallet. Complements balance checks and sends. **Tier 4**; needs Swaps enabled for live execution; **`dry_run:true`** simulates without sending. See **`docs/TREASURY_POOL_TRADING.md`**.

| Symbol | Role |
|--------|------|
| **SABTC** | Solana Agent BTC |
| **SAETH** | Solana Agent ETH |
| **SAUSD** | Solana Agent USD (in chat/UX you may say **agent dollars**—same token, symbol **SAUSD**) |

## Balances (`solana_token_balance`)

**Preferred for SABTC / SAETH / SAUSD:** pass **`token_symbol`** only, e.g. `{ "token_symbol": "SABTC" }`. The server uses the same canonical mint map as **`solana_agent_token_send`** (Settings overrides included). This avoids **Non-base58** / **BLOCKED** when models paste broken mints from docs.

**Optional:** pass the **full** mint instead (no `…`). Handy for operators or scripts:

| Token | Mint (base58) |
|-------|----------------|
| **SAUSD** | `CK9PodBifHymLBGeZujExFnpoLCsYxAw7t8c8LsDKLxG` |
| **SABTC** | `2kR1UKhrXq6Hef6EukLyzdD5ahcezRqwURKdtCJx2Ucy` |
| **SAETH** | `AhyZRrDrN3apDzZqdRHtpxWmnqYDdL8VnJ66ip1KbiDS` |

The server **strips** common invisible / trailing junk from `mint` when you do paste it.

### Verifying diagnostics (facts)

- For **`token_symbol": "SAETH"`**, a **correct** tool response from this app includes **`built_in_mint": "AhyZRrDrN3apDzZqdRHtpxWmnqYDdL8VnJ66ip1KbiDS"`** (same string as the table). If a chat reply shows any other `built_in_mint` for SAETH, that reply did **not** faithfully copy the server JSON (wrong model summary or wrong app version).
- **SAETH** / **SABTC** here mean **Solana Agent** branded SPL tokens only—not Wormhole / Portal / other “ETH” or “BTC” SPL mints you may see on explorers. Those are different mints and different symbols.

### Troubleshooting: `token_symbol` shows 0 but you expect a balance

1. Check the tool result fields **`mint`**, **`built_in_mint`**, and **`mint_matches_built_in`** (returned when you used `token_symbol` for SABTC / SAETH / SAUSD).
2. If **`mint_matches_built_in`** is **false**, your app is using an **override** (not the compiled-in default): **`SA_AGENT_TOKENS`** in Settings, a **`SABTC`** / **`SAETH`** / **`SAUSD`** config key, or **`SABTC`** / etc. in **`process.env`**. The balance query is correct for **`mint`**; holdings may live on **`built_in_mint`** or another mint entirely.
3. **`solana_balance`** may **omit** these three mints from the generic token table (to avoid duplicating the agent-tokens panel)—that does **not** mean chain balance is missing; use **`solana_token_balance`** for each symbol.

**Sending:** **`solana_agent_token_send`** — **`token_symbol`**, **`to`**, **`amount_ui`** or **`amount`**. **Tier 4.** Prefer this over **`solana_transfer_spl`** for these three unless the user names a different mint.

---

## Optional overrides (operators only)

Canonical mint addresses are **compiled into the app** for **SABTC**, **SAETH**, and **SAUSD**. Operators can **repoint** a symbol via Settings—**overrides replace** the built-in default for that symbol only.

### 1. Block: `SA_AGENT_TOKENS`

One mapping per line (`=` or `:` between symbol and mint):

```text
SABTC=2kR1UKhrXq6Hef6EukLyzdD5ahcezRqwURKdtCJx2Ucy
SAETH=AhyZRrDrN3apDzZqdRHtpxWmnqYDdL8VnJ66ip1KbiDS
SAUSD=CK9PodBifHymLBGeZujExFnpoLCsYxAw7t8c8LsDKLxG
```

Lines starting with `#` are ignored.

### 2. Per-symbol keys (`SA` + letters/digits)

Store each mint under **`SA` + 2–20 alphanumeric characters** (e.g. `SABTC`, `SAETH`). Values must look like a Solana mint (base58, 32–44 chars).

### Merge order (overrides)

1. Parse **`SA_AGENT_TOKENS`** (if set).  
2. Overlay matching config DB keys (except `SA_AGENT_TOKENS` itself).  
3. Overlay matching **`process.env`** (dev / CLI).  
4. **Built-in defaults** for any symbol still unset.

---

## Safety & policy

1. **Network fee:** If estimated fee **> 0.001 SOL** (1,000,000 lamports), the tool **does not send**.  
2. **Token balance:** Source ATA must hold at least the requested amount.  
3. **SOL:** Enough for fee + **rent** if recipient needs a new ATA + buffer.

**Security tier:** **Tier 4** (same as `solana_transfer` / `solana_transfer_spl`).

---

## Wallet UI

**`agentTokens`** on **`GET /api/solana-wallet/balance`** powers the **Solana Agent tokens** panel (same derivation as **`solanaBalance`**; avoids extra RPC per mint).

If you hit **429** (or occasional **403**) on the default public RPC:

1. **Better RPC:** set **`SOLANA_RPC_URL`** in **Settings → Environment** (e.g. [PublicNode](https://solana.publicnode.com/), [Helius](https://www.helius.dev/docs/rpc/quickstart), Alchemy, etc.).
2. **Stay on public RPC but slow down:** in **Settings → Environment**, set **`SOLANA_RPC_PACE_MS`** to **150–300** (minimum gap between Solana-heavy tools: balances, treasury read/swap). Optionally **`SOLANA_RPC_STAGGER_MS`** **40–80** to space RPCs *inside* **`treasury_pool_info`** on-chain decode (reduces parallel bursts). Leave empty or **0** to disable.

Smoke tests: **`npm run test:publicnode-agent-tools`**, **`npm run test:helius-agent-tools`** (`HELIUS_API_KEY` in `.env`; app UI still needs full **`SOLANA_RPC_URL`** — no auto-read of `HELIUS_API_KEY`).

The generic **Token accounts** table **hides** these three mints so they are not duplicated.

---

## Example: send

```json
{
  "token_symbol": "SAUSD",
  "to": "RecipientBase58...",
  "amount_ui": 100
}
```

**Dev test:** `npm run test:agent-token-send` (uses **`TEST_PRIV_KEY`** in repo `.env` if set).
