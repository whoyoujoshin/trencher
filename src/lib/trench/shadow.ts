import type { LaneId, MetaState, Playbook, Position, PumpCoin, TapeVenue } from "./types";
import { paperFee, paperSlip } from "./logic";
import { LIVE_CAP_SOL, shadowQuote } from "./wallet";

const KEY = "trencher-shadow-learn";

/** Default ON so the desk keeps learning when HOT is idle or a live send skips. */
export function shadowLearnOn(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "0" || v === "false" || v === "off") return false;
    return true;
  } catch {
    return true;
  }
}

export function setShadowLearn(on: boolean): boolean {
  if (typeof window === "undefined") return on;
  try {
    if (on) window.localStorage.setItem(KEY, "1");
    else window.localStorage.setItem(KEY, "0");
  } catch {
    /* ignore */
  }
  return on;
}

export type ShadowFill = {
  pos: Position;
  debit: number;
  feeUsd: number;
  fillUsd: number;
  slipPct: number;
  shadowSol: number;
  shadowUsd: number;
};

export function buildShadowFill(input: {
  coin: PumpCoin;
  score: number;
  intendedUsd: number;
  book: Playbook;
  stopPct: number;
  takePct: number;
  meta: MetaState;
  metaHits: string[];
  solUsd: number;
  now?: number;
}): ShadowFill {
  const now = input.now ?? Date.now();
  const slipPct = paperSlip(input.coin.usdMcap);
  const fillUsd = Math.round(input.intendedUsd * (1 + slipPct) * 100) / 100;
  const feeUsd = paperFee(fillUsd);
  const debit = fillUsd + feeUsd;
  const mcap = Math.max(input.coin.usdMcap, 1);
  const shadow = shadowQuote(fillUsd, input.solUsd);
  const pos: Position = {
    mint: input.coin.mint,
    name: input.coin.name,
    symbol: input.coin.symbol,
    image: input.coin.image,
    creator: input.coin.creator,
    costUsd: fillUsd,
    entryMcap: mcap,
    peakMcap: mcap,
    lastMcap: mcap,
    openedAt: now,
    score: input.score,
    stopPct: input.stopPct,
    takePct: input.takePct,
    intendedUsd: input.intendedUsd,
    slipPct,
    feeUsd,
    live: false,
    metaSource: input.meta.source,
    metaHits: input.metaHits,
  };
  return { pos, debit, feeUsd, fillUsd, slipPct, shadowSol: shadow.sol, shadowUsd: shadow.usd };
}

export function shadowTillLine(input: {
  laneTag: string;
  coin: PumpCoin;
  fillUsd: number;
  score: number;
  venue: TapeVenue;
  shadowSol: number;
  shadowUsd: number;
  why?: string;
}): string {
  const who = input.laneTag ? `${input.laneTag} · ` : "";
  if (input.venue === "pons") {
    return `SHADOW · ${who}PONS paper $${input.coin.symbol} ${input.fillUsd.toFixed(2)} usd · score ${input.score}. learning only.`;
  }
  const why = input.why ? ` · ${input.why}` : "";
  return `SHADOW · ${who}would spend ${input.shadowSol.toFixed(3)} SOL ($${input.shadowUsd.toFixed(2)}) on $${input.coin.symbol} · cap ${LIVE_CAP_SOL}${why}.`;
}

export type { LaneId };
