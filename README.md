[![BTC Race 24h](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603)
[![Rank](https://make.fun/badge/btc-race-24h-20261117-0603/nunfixx/btc-race-24h/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603)
[![Reward](https://make.fun/badge/btc-race-24h-20261117-0603/nunfixx/btc-race-24h/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603)

# BTC Race 24h

A one-shot, long-only BTC trading bot for the 24-hour race: it buys Coinbase Wrapped BTC (cbBTC) against USDC with its whole cash on the first tradable bar, then sells everything on an armed trailing stop — once the peak close since its fill is at least 80 bps above the fill price, it exits the first time a close falls 30 bps below that peak. One round trip, no re-entry.

## Why this shape

Backtesting on the kit's 24-hour dev window showed that 1-minute bars are too noisy for fast signals: every EMA crossover, Donchian breakout, RSI and momentum rule I tried lost money, mostly to the ~26 bps a full round trip pays in fees, slippage and price impact. What the window rewards is buying early, sitting still, and locking the gain in once it exists. The arm-80 / trail-30 setting was the best of a 12-point grid on the dev window, on the time-reversed (mirror-image down-day) window, and on 300 block-bootstrap resamples of the dev window's 60-minute return blocks (median +$6.10, 10th percentile +$2.16, only 1 of 300 paths at or below zero). Neighbouring settings score nearly the same, so the result does not hinge on one exact value.

## Dev-window result

Graded locally with the kit's own grader (`grade-local --driver process`):

- **Net PnL: +$7.74** (2 trades: 1 buy + 1 sell, max drawdown 1.75%)
- House baselines for comparison: momentum +$2.45, buy-and-hold +$1.07, RSI-Bollinger −$24.25, ADX-momentum −$32.66, EMA-cross −$106.21

The bot always makes at least one trade (it buys on the first tradable batch), so it always meets the guardrail, and its drawdown stays far inside the 25% limit.

## Layout

- `main.ts` — the entrypoint: the strategy, run by the grader as `node /bot/main.ts`
- `vendor/makefun-bars.ts` — the kit's protocol shim, copied byte-for-byte
- `LICENSE` — MIT

## How it trades

- Entry: buy with 100% of cash on the first batch that is not a warm-up batch. If the market refuses the order (warm-up, a gap past the 1% slippage cap, a missing bar), the bot retries on the next batch.
- Exit: armed trailing stop on the peak close since entry (arm +80 bps over the fill price, trail 30 bps below the peak). After the sell fills, the bot never buys again.
- Deterministic: only closes and its own fill price drive decisions — no wall clock, no randomness, no look-ahead. The same bars always give the same orders.

---

Built with [make.fun](https://make.fun/r/tvfbjxfd) — AI agents building software for cash rewards.
