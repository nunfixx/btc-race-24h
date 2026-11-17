// BtcRace: a one-shot, long-only BTC trend catcher for the 24h race.
//
// The idea, in one paragraph: the dev window's 1-minute bars are far too noisy
// for fast signals (every EMA crossover, Donchian breakout, RSI and momentum
// rule I backtested lost money on it, mostly to the ~26 bps a full round trip
// pays in fees, slippage and price impact), while the window's one big move --
// a sharp +1.5% spike in hour 8, then a slow grind to a +1.6% peak -- rewards
// a bot that buys early, sits still, and locks the gain in once it exists.
// So this bot does exactly one round trip: it buys with its whole cash on the
// first tradable batch, then watches the peak close since its fill. Once the
// peak is at least 80 bps above the fill price the trailing stop arms, and the
// bot sells everything the first time a close falls 30 bps below that peak.
// If the peak never arms, the bot simply holds to the end like buy-and-hold.
// It never buys again after it sells: re-entry rules all lost money in
// backtesting, because every re-entry paid another round trip into chop.
//
// Why these numbers, and why they are not tuned to one lucky spike:
//   - arm 80 bps / trail 30 bps was the best of a 12-point grid on the dev
//     window, on the time-reversed (mirror-image down-day) window, and on
//     300 block-bootstrap resamples of the dev window's 60-minute return
//     blocks (median +$6.10, 10th percentile +$2.16, only 1 of 300 paths at
//     or below zero). Neighbouring settings (70/35, 80/40, 90/45) score
//     nearly the same, so the result does not hinge on one exact value.
//   - The bot always makes at least one trade, so it always meets the
//     guardrail, and its worst drawdown on the dev window is 1.75%, far
//     inside the 25% guardrail.
//   - The rules use only closes and the bot's own fill price: no wall clock,
//     no randomness, no look-ahead. The same bars always give the same
//     orders, run after run.
//
// Dev-window result (kit grade-local, process driver): net PnL +$7.74,
// 2 trades (1 buy + 1 sell), max drawdown 1.75% -- against +$2.45 for the
// house momentum bot, +$1.07 for buy-and-hold, and negative for every other
// house baseline.

import { runBars, type BarsState } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** The peak close must be this far above the fill price before the trailing stop arms. */
const ARM_BPS = 80;
/** Once armed, sell when a close falls this far below the peak close. */
const TRAIL_BPS = 30;
/** Slippage cap on every order, 1% past the close it was decided on. */
const MAX_SLIPPAGE_BPS = 100;
/** Smallest buy the market accepts: 1 USDC, in quote units (USDC has 6 decimals). */
const MIN_NOTIONAL = 1_000_000n;

/** Fill price of the buy, in USDC per BTC (float64, like the baselines). */
let fillPrice: number | null = null;
/** Highest close seen since the entry. */
let peakClose: number | null = null;
/** True once a position has been observed. */
let entered = false;
/** True once the trailing-stop sell has filled. */
let exited = false;
/** Client id of the buy order currently in flight, so its fill can be recognised. */
let buyId: string | null = null;

await runBars({
  onBatch(state: BarsState, batch) {
    // Learn the buy's exact fill price from the fill record (price_scale units).
    for (const f of batch.fills) {
      if (f.client_id === buyId && f.status === 'filled') {
        const scale = state.symbols.get(SYMBOL)?.price_scale ?? 5;
        fillPrice = Number(f.price) / 10 ** scale;
      }
    }

    const held = state.positions.get(SYMBOL);
    const latest = state.latest.get(SYMBOL);
    if (held !== undefined) {
      entered = true;
      if (latest !== undefined) {
        const close = Number(latest.c) / 10 ** (state.symbols.get(SYMBOL)?.price_scale ?? 5);
        peakClose = peakClose === null ? close : Math.max(peakClose, close);
      }
    } else if (entered && !exited) {
      // The position is gone after having held one: the trailing-stop sell filled.
      exited = true;
    }
    if (state.warmingUp) return [];

    // Exit: armed trailing stop on the peak close since entry.
    if (held !== undefined && fillPrice !== null && peakClose !== null && latest !== undefined) {
      const scale = state.symbols.get(SYMBOL)?.price_scale ?? 5;
      const close = Number(latest.c) / 10 ** scale;
      const armed = peakClose >= fillPrice * (1 + ARM_BPS / 10000);
      const pulledBack = close < peakClose * (1 - TRAIL_BPS / 10000);
      if (armed && pulledBack) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Entry: one round trip only. Buy with the whole cash on the first
    // tradable batch. If the market refuses the order (warm-up, a gap past
    // the slippage cap, no bar), the position stays empty and the bot tries
    // again on the next batch; once the buy fills, `entered` stops retries.
    if (!entered && !exited && state.cash >= MIN_NOTIONAL) {
      const id = state.clientId();
      buyId = id;
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS, client_id: id }];
    }
    return [];
  },
});
