/** Hunt play bank. Excess native is reserved in the same wallet. Till never sends. */
export const LIVE_BANK_USD = 50;

/** Ignore a dollar of price flicker so a quote tick does not flap the reserve. */
const DUST_USD = 1;

export type ColdRail = "sol" | "eth";

export type ColdDue = {
  rail: ColdRail;
  native: number;
  priceUsd: number;
  usd: number;
  /** Native HOT may still spend. This is the $50 play bank, drawn down by buys. */
  keepNative: number;
  /** Native Till is holding back. Not ammo. */
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
 * Park anything above the $50 play bank into a sticky reserve.
 * A later smaller balance spends the play bank first — the reserve does not refill it.
 * A balance at or under $50 (plus $1 dust) clears the reserve.
 * Pass null `prev` for the first look. SOL price must be a pump-tape print.
 * Do not pass a pons `solUsd` as the SOL price — that field is ETH while the tape is Pons.
 */
export function settleReserve(
  prev: ColdDue | null,
  rail: ColdRail,
  native: number,
  priceUsd: number,
  capUsd = LIVE_BANK_USD,
): ColdDue | null {
  if (!Number.isFinite(native) || native < 0) return prev && prev.rail === rail ? prev : null;
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return prev && prev.rail === rail ? prev : null;
  if (!Number.isFinite(capUsd) || capUsd <= 0) return null;
  const usd = usdOf(native, priceUsd);
  if (usd <= capUsd + DUST_USD) return null;
  const capNative = natOf(capUsd / priceUsd);
  const dustNative = DUST_USD / priceUsd;
  const prevReserved = prev && prev.rail === rail && prev.sweepNative > 0 ? prev.sweepNative : 0;
  let reserved = Math.min(prevReserved, native);
  let playable = native - reserved;
  if (playable > capNative + dustNative) {
    reserved = natOf(native - capNative);
    playable = natOf(native - reserved);
  } else {
    reserved = natOf(reserved);
    playable = natOf(Math.max(0, playable));
  }
  if (!(reserved > 0)) return null;
  const sweepUsd = usdOf(reserved, priceUsd);
  if (!(sweepUsd > 0)) return null;
  return {
    rail,
    native,
    priceUsd,
    usd,
    keepNative: playable,
    sweepNative: reserved,
    sweepUsd,
  };
}

/** First look: the whole excess over $50 is reserved and the play bank is $50. */
export function coldDue(
  rail: ColdRail,
  native: number,
  priceUsd: number,
  capUsd = LIVE_BANK_USD,
): ColdDue | null {
  return settleReserve(null, rail, native, priceUsd, capUsd);
}

export function playCoversClip(playableNative: number, clipNative: number, feeNative: number): boolean {
  if (!Number.isFinite(playableNative) || playableNative < 0) return false;
  if (!Number.isFinite(clipNative) || !(clipNative > 0)) return false;
  if (!Number.isFinite(feeNative) || feeNative < 0) return false;
  return playableNative + 1e-9 >= clipNative + feeNative;
}

export function coldLine(d: ColdDue): string {
  const unit = d.rail === "sol" ? "SOL" : "ETH";
  const places = d.rail === "sol" ? 4 : 5;
  const full = natOf(LIVE_BANK_USD / d.priceUsd);
  const playUsd = usdOf(d.keepNative, d.priceUsd);
  const bank =
    d.keepNative + 1e-9 >= full
      ? `HOT plays with $${LIVE_BANK_USD}.`
      : `HOT play bank ${d.keepNative.toFixed(places)} ${unit} ($${playUsd.toFixed(2)}).`;
  return `Till reserved ${d.sweepNative.toFixed(places)} ${unit} ($${d.sweepUsd.toFixed(2)}). ${bank} Nothing sent.`;
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
      typeof d.keepNative === "number" && d.keepNative >= 0 ? d.keepNative : natOf(LIVE_BANK_USD / d.priceUsd),
    sweepNative: d.sweepNative,
    sweepUsd: d.sweepUsd,
  };
}

export function saneCold(raw: unknown): ColdHold {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { sol: saneDue(o.sol, "sol"), eth: saneDue(o.eth, "eth") };
}
