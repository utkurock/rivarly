# Mainnet & Production Readiness

Starcast runs on Stellar **testnet by default**. This is the checklist to switch
to mainnet and to ship safely.

## Switching network

The network is env-driven (`VITE_STELLAR_NETWORK`), used by both the client and
the trusted reward endpoints:

| Value | Client wallet + tx | Horizon | Server verification |
| --- | --- | --- | --- |
| `testnet` (default) | Test SDF Network | horizon-testnet | testnet |
| `mainnet` | Public Global Stellar Network | horizon | mainnet |

To go live:

1. Set `VITE_STELLAR_NETWORK=mainnet` in the deploy environment.
2. Redeploy. The wallet chip and connect modal show the active network, so a
   mismatch is visible.

**Funding:** on testnet, brand-new accounts are auto-funded via friendbot. There
is **no friendbot on mainnet** — a user's wallet must already hold a little XLM
to pay the (tiny, ~0.00001 XLM) network fee for a claim/prediction. The claim
flow surfaces a clear "needs a small XLM balance" message when it can't load a
funded account.

## Environment variables

Client (safe to expose, `VITE_` prefix):
- `VITE_FIREBASE_*` — Firebase web config
- `VITE_STELLAR_NETWORK` — `testnet` | `mainnet`
- `VITE_ADMIN_PASSWORD` — admin panel gate

Server-only (NEVER `VITE_`, never commit):
- `FIREBASE_SERVICE_ACCOUNT` — service-account JSON on a **single line**. Required
  by `/api/claim` and `/api/bet`; without it, rewards return 503. Add it to
  Vercel → Settings → Environment Variables (Production).

## Firebase setup

1. **Authentication → Anonymous → Enable** (every visitor gets a uid; without it
   the composer/claim/bet won't appear).
2. **Firestore → Rules → publish `firestore.rules`** (re-publish after any change
   here).

## Security model

- **Points are server-authoritative.** They are written only by the trusted Node
  endpoints via the Firebase Admin SDK, after verifying a memo-tagged, recent,
  correctly-sourced on-chain tx on Horizon. Firestore rules make
  `points/streak/lastClaimAt/claimCount/lastClaimTxHash` unwritable from the
  client, and `bets` / `dailyPoints` server-write-only.
- **Markets** can be created/edited by their owner, but tallies (`yesBets`/
  `noBets`), `status`, `volumeUSD`, `metrics` and `creator` are not client-
  writable — the bet endpoint keeps tallies in sync via Admin.
- **Anti-replay:** each claim/bet tx can be used once; claim txs must be < 15 min
  old; the daily claim has a server-enforced 24h cooldown; bet points are granted
  only on a user's first prediction per market.

## Pre-launch checklist

- [ ] `VITE_STELLAR_NETWORK=mainnet` set in prod
- [ ] `FIREBASE_SERVICE_ACCOUNT` set in Vercel (single line)
- [ ] `firestore.rules` published (latest version)
- [ ] Anonymous auth enabled
- [ ] Service-account key rotated if it was ever shared/committed
- [ ] Verified: claim + a market prediction award points on mainnet with a funded
      wallet
- [ ] Verified: a non-owner cannot alter a market's tally/status (rules)

## Not yet done (future)

- On-chain escrow / real-money settlement (would need Soroban contracts + audit)
- Proof-of-ownership when linking a wallet to a profile (today, a linked address
  can't be abused because claims require a signed tx from it, but two accounts
  could point at the same address)
- Points as a transferable Stellar asset (currently an off-chain score)
