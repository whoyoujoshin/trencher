/** Hunt-wallet ceiling. Excess native is the operator's to move. Till never sends. */
export const LIVE_BANK_USD = 50;

/** Ignore a dollar of price flicker so a quote tick does not flap the latch. */
const DUST_USD = 1;

export type ColdRail = "sol" | "eth";

export type ColdDue = {
  rail: ColdRail;
  native: number;
  priceUsd: number;
  usd: number;
  keepNative: number;
  sweepNative: number;
  sweepUsd: number;
};

export type ColdHold = { sol: ColdDue | null; eth: ColdDue | null };

export function blankCold(): ColdHold {
  return { sol: null, eth: null };
}

function usdOf(native: number, priceUsd: number): number {
  return Math.round(native * priceUsd * 100) / 100;
}

function natOf(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * How much native sits above the hunt cap.
 * Returns null when the quote is unusable or the wallet is inside the cap (plus dust).
 * SOL price must be a pump-tape print. ETH may use the pons print or LIVE_ETH_USD.
 * Do not pass a pons `solUsd` in as the SOL price — that field is ETH while the tape is Pons.
 */
export function coldDue(
  rail: ColdRail,
  native: number,
  priceUsd: number,
  capUsd = LIVE_BANK_USD,
): ColdDue | null {
  if (!Number.isFinite(native) || native < 0) return null;
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  if (!Number.isFinite(capUsd) || capUsd <= 0) return null;
  const usd = usdOf(native, priceUsd);
  if (usd <= capUsd + DUST_USD) return null;
  const keepNative = natOf(capUsd / priceUsd);
  const sweepNative = natOf(native - keepNative);
  if (!(sweepNative > 0)) return null;
  const sweepUsd = usdOf(sweepNative, priceUsd);
  if (!(sweepUsd > 0)) return null;
  return { rail, native, priceUsd, usd, keepNative, sweepNative, sweepUsd };
}

export function coldLine(d: ColdDue): string {
  const unit = d.rail === "sol" ? "SOL" : "ETH";
  const places = d.rail === "sol" ? 4 : 5;
  return `SWEEP $${d.sweepUsd.toFixed(2)} to cold (${d.rail}). keep ${d.keepNative.toFixed(places)} ${unit} ($50) on the hunt. send ${d.sweepNative.toFixed(places)} ${unit}. HOT buys blocked until the hunt wallet is under $50.`;
}

function saneDue(v: unknown, rail: ColdRail): ColdDue | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Partial<ColdDue>;
  if (d.rail !== rail) return null;
  if (typeof d.native !== "number" || typeof d.priceUsd !== "number") return null;
  if (typeof d.sweepNative !== "number" || typeof d.sweepUsd !== "number") return null;
  if (!(d.native > 0) || !(d.priceUsd > 0) || !(d.sweepNative > 0) || !(d.sweepUsd > 0)) return null;
  if (!Number.isFinite(d.native) || !Number.isFinite(d.priceUsd)) return null;
  return {
    rail,
    native: d.native,
    priceUsd: d.priceUsd,
    usd: typeof d.usd === "number" && Number.isFinite(d.usd) ? d.usd : usdOf(d.native, d.priceUsd),
    keepNative:
      typeof d.keepNative === "number" && d.keepNative > 0 ? d.keepNative : natOf(LIVE_BANK_USD / d.priceUsd),
    sweepNative: d.sweepNative,
    sweepUsd: d.sweepUsd,
  };
}

export function saneCold(raw: unknown): ColdHold {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { sol: saneDue(o.sol, "sol"), eth: saneDue(o.eth, "eth") };
}
