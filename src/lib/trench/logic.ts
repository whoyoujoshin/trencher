import { blankWeather, cellHeat, FEE_RATE, FLAT_AFTER_MS, GRADE_AFTER_MS, GREEN_ARM, GREEN_KEEP, HARD_TAKE_PONS, HOT_TRADE_MS, HUNT_MCAP_MAX, HUNT_MCAP_MIN, isEvmMint, MAX_BUY_SOL, PULSE_MS, PULSE_PEAK, SCORE_FLOOR, STOP_LOSS, STOP_LOSS_PONS, TAKE_PROFIT, TRAIL_ARM, TRAIL_ARM_PONS, TRAIL_GIVE, TRAIL_GIVE_PONS, WEATHER_COOLDOWN_MS } from "./types";
import type { ClosedTrade, KillGrade, KillKind, KillRecord, LaneId, Lesson, MetaKnobTape, MetaScorecard, MetaState, Playbook, PumpCoin, SellReason, SourceTape, TapeHeat, TapePrint, TapeVenue, Weather, WeatherKind, WordStat } from "./types";

export const CLUSTERS: Record<string, string[]> = {
  stocks: [
    "hood",
    "robinhood",
    "nasdaq",
    "nyse",
    "spy",
    "qqq",
    "tesla",
    "apple",
    "stock",
    "ipo",
    "wallstreet",
    "sec",
  ],
  dogs: ["dog", "inu", "shib", "woof", "puppy", "bonk", "doge", "pup"],
  ai: ["grok", "gpt", "claude", "ai", "llm", "bot", "agent", "openai"],
  politics: ["trump", "vance", "maga", "biden", "harris", "potus", "vote"],
  frogs: ["pepe", "frog", "ape", "wojak", "chad"],
};

export function haystack(coin: PumpCoin): string {
  return `${coin.name} ${coin.symbol} ${coin.description}`.toLowerCase();
}

export function matchesAny(text: string, words: string[]): boolean {
  return words.some((w) => w.length > 1 && text.includes(w));
}

export function blankPlaybook(): Playbook {
  return {
    scoreFloor: SCORE_FLOOR,
    stopPct: STOP_LOSS,
    takePct: TAKE_PROFIT,
    socialBias: 0,
    bannedCreators: [],
    parole: [],
  };
}

export function climbPlaybook(book: Playbook): Playbook {
  const stop =
    book.stopPct < 0 ? Math.min(-0.35, book.stopPct + 0.02) : book.stopPct;
  return {
    ...book,
    scoreFloor: Math.min(78, book.scoreFloor + 3),
    stopPct: stop,
    bannedCreators: [...book.bannedCreators],
    parole: [...(book.parole ?? [])],
  };
}

export function heatPlaybook(book: Playbook, round: number, shift = 0): Playbook {
  const heat = cellHeat(round);
  const stop =
    book.stopPct < 0 ? Math.min(-0.35, book.stopPct + Math.min(0.15, heat * 0.01)) : book.stopPct;
  return {
    ...book,
    scoreFloor: Math.min(78, Math.max(32, book.scoreFloor + heat + shift)),
    stopPct: stop,
    bannedCreators: [...book.bannedCreators],
    parole: [...(book.parole ?? [])],
  };
}

export function cheapKill(coin: PumpCoin, now: number): string | null {
  if (coin.banned || coin.nsfw) return "banned or flagged. not touching it.";
  const pons = coin.venue === "pons";
  if (coin.complete && !pons && coin.usdMcap < HUNT_MCAP_MIN) {
    return "already off the curve. too late.";
  }
  if (!coin.symbol.trim() || coin.symbol.length > 14) return "ticker is garbage.";
  if (coin.name.trim().length < 2) return "nameless. skip.";
  const age = now - coin.createdAt;
  if (age > (pons ? 24 * 60 * 60_000 : 12 * 60 * 60_000)) {
    return pons ? "older than 24h. not a snipe." : "older than 12h. not a snipe.";
  }
  if (coin.usdMcap > HUNT_MCAP_MAX) return `mcap ${Math.round(coin.usdMcap)} already. missed.`;
  if (coin.usdMcap > 0 && coin.usdMcap < HUNT_MCAP_MIN) {
    return `mcap under ${Math.round(HUNT_MCAP_MIN / 1000)}k. waiting on size.`;
  }
  if (/^\d+$/.test(coin.symbol)) return "numeric ticker. usually a bundle.";
  return null;
}

export function serialKill(
  creatorCount: number,
  symbols: string[],
  coin: PumpCoin,
): string | null {
  if (creatorCount >= 5) {
    return `deployer minted ${creatorCount} coins. serial. ${symbols.slice(0, 3).join(", ")}.`;
  }
  if (creatorCount >= 3) {
    const copies = symbols.filter(
      (s) => s.toLowerCase() === coin.symbol.toLowerCase(),
    ).length;
    if (copies >= 2) return `same ticker minted ${copies}× by this wallet.`;
    return `deployer on coin #${creatorCount} this window. too busy.`;
  }
  return null;
}

export function setupMatch(coin: PumpCoin, meta: MetaState, now: number): string | null {
  const text = haystack(coin);
  if (meta.drop.length && matchesAny(text, meta.drop)) {
    return `playbook drop: '${meta.drop.find((w) => text.includes(w))}' already burned us.`;
  }
  const age = now - coin.createdAt;
  const hasSocial = Boolean(coin.twitter || coin.website || coin.telegram);
  const lively =
    coin.replyCount >= 2 ||
    coin.live ||
    (coin.lastTradeAt != null && now - coin.lastTradeAt < 60_000);

  if (coin.venue === "pons") {
    if (coin.usdMcap < HUNT_MCAP_MIN) return `mcap under ${Math.round(HUNT_MCAP_MIN / 1000)}k. no tape.`;
    if (coin.usdMcap > HUNT_MCAP_MAX) return "already extended. no chase.";
    if (age > 12 * 60 * 60_000 && !lively) return "stale and quiet.";
    if (coin.symbol === "???" || coin.name === "unnamed") return "unnamed. waiting on the mint.";
    return null;
  }

  if (coin.usdMcap < HUNT_MCAP_MIN) return `mcap under ${Math.round(HUNT_MCAP_MIN / 1000)}k. no tape.`;
  if (coin.usdMcap > HUNT_MCAP_MAX) return "already extended. no chase.";
  if (age > 6 * 60 * 60_000 && !lively) return "stale and quiet.";

  // keywords boost via scoreSetup only — no hard veto
  if (!(meta.source !== "open" && meta.keywords.length)) {
    const quality = hasSocial || lively || coin.description.length > 40;
    if (!quality && coin.usdMcap < 10_000) {
      return "no socials, no replies, thin book.";
    }
  }
  return null;
}

export function hotLiveBlock(
  coin: Pick<PumpCoin, "mint" | "symbol" | "usdMcap" | "lastTradeAt" | "venue">,
  now: number,
): string | null {
  const pons = coin.venue === "pons" || isEvmMint(coin.mint);
  if (pons) {
    if (coin.usdMcap < HUNT_MCAP_MIN) {
      return `live skip $${coin.symbol} — mcap ${Math.round(coin.usdMcap)} under ${HUNT_MCAP_MIN}. paper only.`;
    }
    if (coin.usdMcap > HUNT_MCAP_MAX) {
      return `live skip $${coin.symbol} — mcap ${Math.round(coin.usdMcap)} outside the window. paper only.`;
    }
    return null;
  }
  if (coin.usdMcap < HUNT_MCAP_MIN || coin.usdMcap > HUNT_MCAP_MAX) {
    return `live skip $${coin.symbol} — mcap ${Math.round(coin.usdMcap)} outside the window. paper only.`;
  }
  if (coin.lastTradeAt == null || now - coin.lastTradeAt > HOT_TRADE_MS) {
    return `live skip $${coin.symbol} — curve quiet. paper only.`;
  }
  return null;
}

export function scoreSetup(
  coin: PumpCoin,
  meta: MetaState,
  now: number,
  playbook?: Playbook,
): { score: number; why: string } {
  if (coin.venue === "pons") return scorePons(coin, meta, now);
  let score = 18;
  const bits: string[] = [];
  const text = haystack(coin);
  const bias = playbook?.socialBias ?? 0;
  if (coin.twitter || coin.website || coin.telegram) {
    score += 16 + bias;
    bits.push(bias < 0 ? "socials (discounted)" : "money behind the name");
  }
  if (coin.replyCount >= 2) {
    score += Math.min(18, coin.replyCount * 2);
    bits.push(`${coin.replyCount} replies`);
  }
  if (coin.live) {
    score += 10;
    bits.push("live");
  }
  if (meta.keywords.length && matchesAny(text, meta.keywords)) {
    let thesisBonus = 22;
    const matchedKws = meta.keywords.filter((k) => k.length > 1 && text.includes(k));
    const scarred = matchedKws.some((k) => {
      const c = meta.card?.byKeyword?.[k];
      return !!c && c.n >= 3 && c.pnl < 0 && c.w / c.n <= 0.4;
    });
    if (scarred) thesisBonus = Math.round(thesisBonus / 2);
    score += thesisBonus;
    bits.push("thesis");
  }
  {
    const boost = ledgerBoost(coin, meta);
    score += boost.delta;
    if (boost.label) bits.push(boost.delta < 0 ? `scar ${boost.label}` : `ledger ${boost.label}`);
  }
  if (now - coin.createdAt < 5 * 60_000) {
    score += 8;
    bits.push("fresh");
  }
  if (coin.usdMcap >= HUNT_MCAP_MIN && coin.usdMcap <= 200_000) {
    score += 12;
    bits.push("window");
  }
  if (coin.description.length > 40) score += 6;
  score = Math.max(1, Math.min(99, Math.round(score)));
  return { score, why: bits.slice(0, 3).join(" · ") || "thin tape" };
}

function scorePons(
  coin: PumpCoin,
  meta: MetaState,
  now: number,
): { score: number; why: string } {
  let score = 30;
  const bits: string[] = [];
  const named =
    coin.symbol.trim().length > 1 &&
    coin.symbol !== "???" &&
    coin.name.trim().length >= 2 &&
    coin.name !== "unnamed";
  if (named) {
    score += 8;
    bits.push("named");
  }
  if (!coin.complete) {
    score += 12;
    bits.push("on curve");
  } else {
    score += 6;
    bits.push("listed");
  }
  if (now - coin.createdAt < 45 * 60_000) {
    score += 8;
    bits.push("fresh");
  }
  if (coin.usdMcap >= HUNT_MCAP_MIN && coin.usdMcap <= 200_000) {
    score += 12;
    bits.push("window");
  }
  const text = haystack(coin);
  if (meta.keywords.length && matchesAny(text, meta.keywords)) {
    let thesisBonus = 10;
    const matchedKws = meta.keywords.filter((k) => k.length > 1 && text.includes(k));
    const scarred = matchedKws.some((k) => {
      const c = meta.card?.byKeyword?.[k];
      return !!c && c.n >= 3 && c.pnl < 0 && c.w / c.n <= 0.4;
    });
    if (scarred) thesisBonus = Math.round(thesisBonus / 2);
    score += thesisBonus;
    bits.push("thesis");
  }
  {
    const boost = ledgerBoost(coin, meta);
    score += boost.delta;
    if (boost.label) bits.push(boost.delta < 0 ? `scar ${boost.label}` : `ledger ${boost.label}`);
  }
  score = Math.max(1, Math.min(99, Math.round(score)));
  return { score, why: bits.slice(0, 3).join(" · ") || "pons tape" };
}

export function ponsWake(
  fresh: PumpCoin[],
  traded: PumpCoin[],
  seen: Set<string>,
  occupied: Set<string>,
  kills: Pick<KillRecord, "mint" | "kind">[],
  already: Set<string>,
  venue: TapeVenue = "pons",
): PumpCoin[] {
  const serial = new Set(
    kills.filter((k) => k.kind === "serial" || k.kind === "memory").map((k) => k.mint),
  );
  const minMcap = HUNT_MCAP_MIN;
  const cap = venue === "pons" ? 8 : 6;
  const extra: PumpCoin[] = [];
  for (const c of traded) {
    if (occupied.has(c.mint) || serial.has(c.mint) || already.has(c.mint)) continue;
    if (fresh.some((f) => f.mint === c.mint)) continue;
    if (!seen.has(c.mint)) continue;
    if (c.usdMcap < minMcap || c.usdMcap > HUNT_MCAP_MAX || c.symbol === "???" || c.name === "unnamed") continue;
    extra.push(c);
  }
  const map = new Map<string, PumpCoin>();
  for (const c of [...fresh, ...extra]) map.set(c.mint, c);
  return Array.from(map.values()).slice(0, cap);
}

export function tapeHeat(coins: PumpCoin[], venue: TapeVenue, now: number): TapeHeat {
  const born = 10 * 60_000;
  const boardMs = venue === "pons" ? 12 * 60 * 60_000 : 12 * 60 * 60_000;
  const fresh = coins.filter((c) => now - c.createdAt < born);
  const board = coins.filter((c) => now - c.createdAt < boardMs);
  const named = fresh.filter(
    (c) => c.symbol.trim() && c.symbol !== "???" && c.name.trim().toLowerCase() !== "unnamed",
  );
  const hunt = (c: PumpCoin) =>
    c.usdMcap >= HUNT_MCAP_MIN && c.usdMcap <= HUNT_MCAP_MAX;
  const live = board.filter(hunt);
  const runners = board.filter((c) => c.usdMcap >= 8_000);
  const flowUsd = board.reduce((s, c) => s + Math.max(0, c.usdMcap), 0);
  const newest = coins.reduce((m, c) => Math.max(m, c.createdAt), 0);
  const launches = fresh.length;
  const score =
    launches * 2 +
    named.length +
    live.length * 4 +
    runners.length * 10 +
    Math.min(40, Math.round(flowUsd / 8_000));
  return {
    venue,
    at: now,
    ok: true,
    launches,
    named: named.length,
    live: live.length,
    runners: runners.length,
    flowUsd,
    newestAgeMs: newest ? now - newest : 0,
    score,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function emptyPrint(venue: TapeVenue): TapePrint {
  return {
    n: 0,
    takePct: 0,
    stopPct: 0,
    timePct: 0,
    flatPct: 0,
    runnerPct: 0,
    gaveBackPct: 0,
    modestGavePct: 0,
    source: "paper",
    avgHold: 0,
    scarStreak: 0,
    launches: 0,
    live: 0,
    runners: 0,
    heatScore: 0,
    venue,
  };
}

export function isHotFill(t: { rail?: string }): boolean {
  return t.rail === "sol" || t.rail === "eth";
}

export function takeWindow(closed: ClosedTrade[], now: number): ClosedTrade[] {
  const hot = closed.filter(isHotFill);
  const useHot = hot.length >= 4;
  const pool = useHot ? hot : closed;
  const windowMs = useHot ? 40 * 60_000 : 20 * 60_000;
  const cap = useHot ? 10 : 12;
  const recent = pool.filter((t) => now - t.closedAt <= windowMs).slice(0, cap);
  if (useHot) {
    if (recent.length >= 4) return recent;
    return pool.slice(0, 8);
  }
  if (recent.length >= 8) return recent;
  return pool.slice(0, 10);
}

export function windowPrint(
  closed: ClosedTrade[],
  heat: TapeHeat | null | undefined,
  venue: TapeVenue,
): TapePrint {
  const n = closed.length;
  if (!n) return emptyPrint(venue);
  const take = closed.filter((t) => t.reason === "take").length;
  const stop = closed.filter((t) => t.reason === "stop").length;
  const time = closed.filter((t) => t.reason === "time").length;
  const flat = closed.filter((t) => Math.abs(t.pnlPct) <= 0.05).length;
  const runner = closed.filter((t) => (t.peakPct ?? t.pnlPct) >= 0.45).length;
  const gave = closed.filter((t) => (t.peakPct ?? 0) >= 0.45 && t.pnlPct <= 0.1).length;
  const modest = closed.filter((t) => (t.peakPct ?? 0) >= GREEN_ARM && t.pnlPct <= GREEN_KEEP).length;
  let scar = 0;
  for (const t of closed) {
    if (t.pnlUsd < 0) scar += 1;
    else break;
  }
  const avgHold = closed.reduce((s, t) => s + t.heldMs, 0) / n;
  const hotN = closed.filter(isHotFill).length;
  return {
    n,
    takePct: take / n,
    stopPct: stop / n,
    timePct: time / n,
    flatPct: flat / n,
    runnerPct: runner / n,
    gaveBackPct: runner ? gave / runner : 0,
    modestGavePct: modest / n,
    source: hotN === n && n > 0 ? "hot" : "paper",
    avgHold,
    scarStreak: scar,
    launches: heat?.ok ? heat.launches : 0,
    live: heat?.ok ? heat.live : 0,
    runners: heat?.ok ? heat.runners : 0,
    heatScore: heat?.ok ? heat.score : 0,
    venue,
  };
}

export function regimeShift(
  prior: TapePrint,
  now: TapePrint,
  other?: TapeHeat | null,
): WeatherKind[] {
  const flags: WeatherKind[] = [];
  const minN = now.source === "hot" ? 4 : 6;
  const timeJump = now.timePct - prior.timePct >= 0.3;
  const flatHeavy = now.flatPct >= 0.6;
  const heatDead = prior.launches > 0 && now.launches <= prior.launches * 0.5;
  const liveGone = now.live <= 1 && prior.live >= 3;
  if (now.n >= minN && (timeJump || flatHeavy || heatDead || liveGone)) flags.push("died");

  const heatUp = prior.heatScore > 0 && now.heatScore >= prior.heatScore * 1.5;
  const launchUp = prior.launches > 0 && now.launches >= prior.launches * 1.5;
  const timeDrop = prior.timePct - now.timePct >= 0.25;
  if (now.n >= minN && (heatUp || launchUp || (timeDrop && now.live >= 3))) flags.push("woke");

  if (now.n >= minN && now.runnerPct >= 0.25 && now.gaveBackPct >= 0.5) flags.push("rip");
  if (now.n >= minN && (now.modestGavePct ?? 0) >= 0.35 && !flags.includes("rip")) flags.push("rip");

  if (now.n >= minN && now.stopPct >= 0.6 && now.takePct <= 0.1) flags.push("bleed");
  if (now.scarStreak >= 3 && !flags.includes("bleed")) flags.push("bleed");

  if (now.n >= minN && now.takePct >= 0.25 && now.gaveBackPct < 0.35) flags.push("harvest");

  if (
    other?.ok &&
    other.launches >= 4 &&
    now.heatScore >= 0 &&
    other.score > Math.max(1, now.heatScore) * 1.5
  ) {
    flags.push("venue");
  }
  if (flags.includes("died")) {
    return flags.filter((k) => k !== "harvest" && k !== "woke");
  }
  return flags;
}

export function writeWeather(
  prev: Weather,
  kinds: WeatherKind[],
  print: TapePrint,
  spirit: number,
  other?: TapeHeat | null,
  now = Date.now(),
): Weather {
  let bar = prev.bar;
  if (kinds.includes("died")) bar += 8;
  else if (kinds.includes("bleed")) bar += 4;
  if (kinds.includes("woke")) bar -= 8;
  bar = clamp(bar, prev.bar - 8, prev.bar + 8);
  bar = clamp(bar, 40, Math.max(40, spirit));

  let size = prev.size;
  if (kinds.includes("bleed")) size = 0.7;
  else if (kinds.includes("died")) size = 0.8;
  else if (kinds.includes("harvest") || kinds.includes("woke")) size = 1;
  size = clamp(size, 0.7, 1);

  let sitMs = prev.sitMs;
  let trailArm = prev.trailArm;
  let trailArmPump = prev.trailArmPump ?? TRAIL_ARM;
  let trailGivePump = prev.trailGivePump ?? TRAIL_GIVE;
  let greenArm = prev.greenArm ?? GREEN_ARM;
  let greenKeep = prev.greenKeep ?? GREEN_KEEP;

  if (print.venue === "pons") {
    if (kinds.includes("died")) sitMs = 60_000;
    else if (kinds.includes("woke")) sitMs = 90_000;
    else if (kinds.includes("bleed")) sitMs = 120_000;
    sitMs = clamp(sitMs, 60_000, 4 * 60_000);
    if (kinds.includes("rip") || kinds.includes("died") || kinds.includes("bleed")) trailArm = 0.22;
    else if (kinds.includes("harvest")) trailArm = Math.max(trailArm, 0.28);
    trailArm = clamp(trailArm, 0.2, 0.35);
    if (kinds.includes("rip") || kinds.includes("died") || kinds.includes("bleed")) greenArm = 0.08;
    else if (kinds.includes("harvest")) greenArm = 0.1;
    greenArm = clamp(greenArm, 0.08, 0.12);
  } else {
    if (kinds.includes("rip")) {
      trailArmPump = 0.2;
      trailGivePump = 0.14;
      greenArm = 0.08;
    } else if (kinds.includes("died") || kinds.includes("bleed")) {
      trailArmPump = 0.22;
      trailGivePump = 0.16;
      greenArm = 0.08;
    } else if (kinds.includes("harvest")) {
      trailArmPump = clamp(trailArmPump + 0.04, 0.18, 0.32);
      trailGivePump = TRAIL_GIVE;
      greenArm = 0.1;
    } else if (kinds.includes("woke")) {
      trailArmPump = clamp(Math.min(trailArmPump, 0.28), 0.18, 0.35);
    }
    trailArmPump = clamp(trailArmPump, 0.18, 0.35);
    trailGivePump = clamp(trailGivePump, 0.12, 0.2);
    greenArm = clamp(greenArm, 0.08, 0.12);
  }
  greenKeep = 0.02;

  let venue: Weather["venue"] = "stay";
  if (kinds.includes("venue") && other?.ok && other.venue !== print.venue) {
    venue = other.venue;
  }

  const next: Weather = {
    at: now,
    kind: kinds,
    venue,
    bar,
    size,
    sitMs,
    trailArm,
    trailArmPump,
    trailGivePump,
    greenArm,
    greenKeep,
    line: "",
    print,
  };
  next.line = formatWeather(next, print.venue);
  return next;
}

export function formatWeather(w: Weather, tape: TapeVenue): string {
  const spec = trailSpec(tape, w);
  const bits = [w.kind.join("+") || "hold", `bar ${w.bar}`, `size ${w.size.toFixed(1)}`];
  if (tape === "pons") bits.push(`sit ${Math.round(w.sitMs / 1000)}s`);
  bits.push(`arm +${Math.round(spec.arm * 100)}`);
  bits.push(`protect +${Math.round((w.greenArm ?? GREEN_ARM) * 100)}`);
  bits.push(w.venue);
  return bits.join(" · ");
}

export function weatherHolds(prev: Weather, next: Weather): boolean {
  return (
    prev.bar === next.bar &&
    prev.size === next.size &&
    prev.sitMs === next.sitMs &&
    prev.trailArm === next.trailArm &&
    prev.trailArmPump === next.trailArmPump &&
    prev.trailGivePump === next.trailGivePump &&
    prev.greenArm === next.greenArm &&
    prev.venue === next.venue
  );
}

export function canWriteWeather(prev: Weather, now: number): boolean {
  if (!prev.at) return true;
  return now - prev.at >= WEATHER_COOLDOWN_MS;
}

export function paperFloor(book: Playbook, weather: Weather, spirit: number): number {
  const spiritCap = Math.max(40, spirit);
  const cloneOffset = book.scoreFloor < SCORE_FLOOR ? book.scoreFloor - SCORE_FLOOR : 0;
  return clamp(weather.bar + cloneOffset, 40, spiritCap);
}

export function liveFloor(book: Playbook, weather: Weather, spirit: number): number {
  const paper = paperFloor(book, weather, spirit);
  const cap = Math.max(paper, Math.max(40, spirit));
  return clamp(paper + 4, paper, cap);
}

export function minClip(venue?: TapeVenue): number {
  return venue === "pons" ? 2 : 4;
}

export function sizeByScore(
  cash: number,
  solUsd: number,
  score: number,
  venue?: TapeVenue,
  weather?: Weather,
): number {
  const wx = weather ?? blankWeather();
  if (venue === "pons") {
    const cap = Math.min(8, cash * 0.1);
    const weight = score >= 70 ? 1 : 0.7;
    return Math.floor(cap * weight * wx.size * 100) / 100;
  }
  const conviction = score >= 70;
  const cap = Math.min(
    MAX_BUY_SOL * solUsd,
    cash * (conviction ? 0.5 : 0.36),
    conviction ? 40 : 26,
  );
  const weight = conviction
    ? Math.min(0.95, 0.82 + (score - 70) * 0.008)
    : 0.52 + 0.35 * (score / 100);
  return Math.floor(cap * weight * wx.size * 100) / 100;
}

export function paperSlip(usdMcap: number): number {
  const t = Math.min(1, Math.max(0, (40_000 - usdMcap) / 37_000));
  return Math.round((0.004 + t * 0.01) * 1000) / 1000;
}

export function paperFee(fillUsd: number): number {
  return Math.round(fillUsd * FEE_RATE * 100) / 100;
}

export function detectMeta(runners: PumpCoin[], now: number): MetaState | null {
  const recent = runners.filter((c) => now - c.createdAt < 6 * 60 * 60_000 && c.usdMcap >= 12_000);
  if (recent.length < 6) return null;
  const scores: { name: string; n: number }[] = [];
  for (const [name, words] of Object.entries(CLUSTERS)) {
    const n = recent.filter((c) => matchesAny(haystack(c), words)).length;
    scores.push({ name, n });
  }
  scores.sort((a, b) => b.n - a.n);
  const top = scores[0];
  if (!top || top.n / recent.length < 0.35) return null;
  const keywords = CLUSTERS[top.name] ?? [];
  const thesis =
    top.name === "stocks"
      ? "stock memes only"
      : top.name === "dogs"
        ? "sol dogs"
        : top.name === "ai"
          ? "ai agents"
          : top.name === "politics"
            ? "political names"
            : "frog/ape meta";
  return {
    thesis,
    keywords,
    drop: [],
    source: "local",
    updatedAt: now,
  };
}

export function reviewLosersLocal(
  closed: Pick<ClosedTrade, "symbol" | "name" | "pnlUsd">[],
  meta: MetaState,
): { drop: string[]; note: string } | null {
  const losses = closed.filter((t) => t.pnlUsd < 0);
  if (losses.length < 2) return null;
  const hits: Record<string, number> = {};
  for (const t of losses) {
    for (const tok of tokensFrom(t.name, t.symbol)) {
      hits[tok] = (hits[tok] ?? 0) + 1;
    }
  }
  const extra = Object.entries(hits)
    .filter(([tok, n]) => {
      if (n < 2) return false;
      const stat = meta.words?.[tok];
      if (stat) return wordShouldDrop(stat);
      return n >= 2;
    })
    .map(([tok]) => tok);
  const drop = Array.from(new Set([...meta.drop, ...extra])).slice(0, 12);
  if (drop.length === meta.drop.length) {
    return {
      drop,
      note: `${losses.length} losers reread. no word with a sample. holding ${meta.thesis}.`,
    };
  }
  return {
    drop,
    note: `${losses.length} losers reread. dropping ${extra.slice(0, 4).join(", ") || "the cluster"} after a repeat.`,
  };
}

function clusterOf(text: string): string | null {
  for (const [name, words] of Object.entries(CLUSTERS)) {
    if (matchesAny(text, words)) return name;
  }
  return null;
}

export function tokensFrom(name: string, symbol: string): string[] {
  const raw = `${name} ${symbol}`.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const words = raw.split(/\s+/).filter((w) => w.length >= 3 && w.length <= 12);
  const extra: string[] = [];
  for (const list of Object.values(CLUSTERS)) {
    extra.push(...list.filter((w) => raw.includes(w)));
  }
  return Array.from(new Set([...extra, ...words])).slice(0, 6);
}


export function blankScorecard(): MetaScorecard {
  return { bySource: {}, byThesis: {}, byKeyword: {}, updatedAt: 0 };
}

export function matchedMetaTokens(coin: PumpCoin, meta: MetaState): string[] {
  const text = haystack(coin);
  const fromName = tokensFrom(coin.name, coin.symbol);
  const fromKw = (meta.keywords ?? []).filter((k) => k.length > 1 && text.includes(k.toLowerCase()));
  return Array.from(new Set([...fromKw, ...fromName])).slice(0, 6);
}

export function wordEdge(s: WordStat): number {
  if (s.n < 2) return 0;
  const expectancy = s.pnl / s.n;
  const winRate = s.w / s.n;
  return clamp(Math.round(expectancy * 1.5 + (winRate - 0.4) * 10), -10, 14);
}

export function ledgerBoost(coin: PumpCoin, meta: MetaState): { delta: number; label?: string } {
  const words = meta.words ?? {};
  const toks = matchedMetaTokens(coin, meta);
  let delta = 0;
  let topTok = "";
  let topAbs = 0;
  for (const tok of toks) {
    const s = words[tok];
    if (!s) continue;
    const edge = wordEdge(s);
    delta += edge;
    if (Math.abs(edge) > topAbs) {
      topAbs = Math.abs(edge);
      topTok = tok;
    }
  }
  delta = clamp(delta, -12, 18);
  if (Math.abs(delta) >= 3 && topTok) return { delta, label: topTok };
  return { delta };
}

export function bumpKnob(prev: MetaKnobTape | undefined, win: boolean, pnl: number): MetaKnobTape {
  const cur = prev ?? { n: 0, w: 0, pnl: 0 };
  return {
    n: cur.n + 1,
    w: cur.w + (win ? 1 : 0),
    pnl: Math.round((cur.pnl + pnl) * 100) / 100,
  };
}

function pruneKnobMap(map: Record<string, MetaKnobTape>, cap = 24): Record<string, MetaKnobTape> {
  const keys = Object.keys(map);
  if (keys.length <= cap) return map;
  const ranked = keys.sort((a, b) => map[a].n - map[b].n || map[a].pnl - map[b].pnl);
  const drop = new Set(ranked.slice(0, keys.length - cap));
  const next: Record<string, MetaKnobTape> = {};
  for (const k of keys) {
    if (!drop.has(k)) next[k] = map[k];
  }
  return next;
}

export function absorbScorecard(card: MetaScorecard | undefined, trade: ClosedTrade, thesis: string): MetaScorecard {
  const next: MetaScorecard = card
    ? {
        bySource: { ...card.bySource },
        byThesis: { ...card.byThesis },
        byKeyword: { ...card.byKeyword },
        updatedAt: card.updatedAt,
      }
    : blankScorecard();
  const win = trade.pnlUsd > 0;
  const src = trade.metaSource ?? "open";
  const key = thesis.trim().slice(0, 40);
  const hits = (trade.metaHits ?? []).filter(Boolean);
  const times = isHotFill(trade) ? 2 : 1;
  for (let i = 0; i < times; i++) {
    next.bySource[src] = bumpKnob(next.bySource[src], win, trade.pnlUsd);
    if (key) next.byThesis[key] = bumpKnob(next.byThesis[key], win, trade.pnlUsd);
    for (const tok of hits) next.byKeyword[tok] = bumpKnob(next.byKeyword[tok], win, trade.pnlUsd);
  }
  next.byThesis = pruneKnobMap(next.byThesis, 24);
  next.byKeyword = pruneKnobMap(next.byKeyword, 24);
  next.updatedAt = Date.now();
  return next;
}

export function wordShouldDrop(s: WordStat): boolean {
  return s.n >= 3 && s.w / s.n <= 0.34 && s.pnl < 0;
}

export function wordShouldLift(s: WordStat): boolean {
  return s.n >= 3 && s.w / s.n >= 0.5 && s.pnl >= 0;
}

export function onParole(book: Playbook, creator: string): boolean {
  return !!creator && (book.parole ?? []).includes(creator);
}

function markWord(
  words: Record<string, WordStat>,
  tok: string,
  win: boolean,
  pnl: number,
): Record<string, WordStat> {
  const cur = words[tok] ?? { n: 0, w: 0, pnl: 0 };
  return {
    ...words,
    [tok]: {
      n: cur.n + 1,
      w: cur.w + (win ? 1 : 0),
      pnl: Math.round((cur.pnl + pnl) * 100) / 100,
    },
  };
}

function pruneWords(words: Record<string, WordStat>, cap = 48): Record<string, WordStat> {
  const keys = Object.keys(words);
  if (keys.length <= cap) return words;
  const ranked = keys.sort((a, b) => words[a].n - words[b].n || words[a].pnl - words[b].pnl);
  const drop = new Set(ranked.slice(0, keys.length - cap));
  const next: Record<string, WordStat> = {};
  for (const k of keys) {
    if (!drop.has(k)) next[k] = words[k];
  }
  return next;
}

function bumpTape(prev: SourceTape | undefined, pnl: number): SourceTape {
  const n = (prev?.n ?? 0) + 1;
  return { n, pnl: Math.round(((prev?.pnl ?? 0) + pnl) * 100) / 100 };
}

export function grokTrust(meta: MetaState): "grok" | "local" | "open" {
  const g = meta.grokTape;
  const l = meta.localTape;
  if (!g || !l || g.n < 4 || l.n < 4) return meta.source === "open" ? "open" : meta.source;
  const gAvg = g.pnl / g.n;
  const lAvg = l.pnl / l.n;
  if (gAvg + 0.4 < lAvg) return "local";
  return "grok";
}

export function wilsonLow(wins: number, n: number, z = 1.44): number {
  if (n <= 0) return 0;
  const p = Math.min(1, Math.max(0, wins / n));
  const z2 = z * z;
  const den = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return Math.max(0, (centre - margin) / den);
}

export function absorbTrade(
  trade: ClosedTrade,
  playbook: Playbook,
  meta: MetaState,
  recent: ClosedTrade[] = [],
): { playbook: Playbook; meta: MetaState; lessons: Omit<Lesson, "id">[] } {
  const now = Date.now();
  const lessons: Omit<Lesson, "id">[] = [];
  const next: Playbook = {
    ...playbook,
    bannedCreators: [...(playbook.bannedCreators ?? [])],
    parole: [...(playbook.parole ?? [])],
  };
  let drop = [...(meta.drop ?? [])];
  let keywords = [...(meta.keywords ?? [])];
  let words = { ...(meta.words ?? {}) };
  const text = `${trade.name} ${trade.symbol}`.toLowerCase();
  const cluster = clusterOf(text);
  const win = trade.pnlUsd > 0;
  const wordWin = trade.pnlUsd > (trade.feeUsd ?? 0);
  const toks = tokensFrom(trade.name, trade.symbol);
  for (const tok of toks) words = markWord(words, tok, wordWin, trade.pnlUsd);
  words = pruneWords(words);
  const card = absorbScorecard(meta.card, trade, meta.thesis);

  const newlyDropped: string[] = [];
  const lifted: string[] = [];
  for (const tok of toks) {
    const stat = words[tok];
    if (!stat) continue;
    if (wordShouldDrop(stat) && !drop.includes(tok)) {
      drop.push(tok);
      newlyDropped.push(tok);
    }
    if (wordShouldLift(stat) && drop.includes(tok)) {
      drop = drop.filter((d) => d !== tok);
      lifted.push(tok);
    }
  }
  drop = drop.slice(0, 12);

  const src = trade.metaSource === "grok" ? "grok" : trade.metaSource === "local" ? "local" : meta.source;
  const grokTape = src === "grok" ? bumpTape(meta.grokTape, trade.pnlUsd) : meta.grokTape;
  const localTape = src === "local" || src === "open" ? bumpTape(meta.localTape, trade.pnlUsd) : meta.localTape;

  if (!win) {
    // evidence-gate: skip pulse (time) dumps; ban only never-ran stops or repeat losses
    if (
      trade.reason !== "time" &&
      trade.creator &&
      !next.bannedCreators.includes(trade.creator) &&
      !onParole(next, trade.creator)
    ) {
      const neverRan = trade.reason === "stop" && (trade.peakPct ?? 0) < 0.08;
      const creatorLosses = [trade, ...recent].filter(
        (t) => t.creator === trade.creator && t.pnlUsd < 0,
      ).length;
      if (neverRan || creatorLosses >= 2) {
        next.bannedCreators = [...next.bannedCreators, trade.creator].slice(-40);
        lessons.push({
          at: now,
          agent: "WARDEN",
          text: neverRan
            ? `memory: deployer of $${trade.symbol} never ran. burned. next coin from that wallet dies.`
            : `memory: deployer of $${trade.symbol} is burned after repeat losses. next coin from that wallet dies.`,
        });
      }
    }
    if (next.scoreFloor < SCORE_FLOOR) {
      next.scoreFloor = Math.min(SCORE_FLOOR, next.scoreFloor + (trade.score >= 60 ? 2 : 1));
    }
    lessons.push({
      at: now,
      agent: "SNIPER",
      text:
        next.scoreFloor < SCORE_FLOOR
          ? `$${trade.symbol} scored ${trade.score} and lost. floor is ${next.scoreFloor}.`
          : `$${trade.symbol} scored ${trade.score} and lost. META holds the bar.`,
    });
    const peak = trade.peakPct ?? 0;
    if (trade.reason === "stop") {
      if (peak < 0.08) {
        next.stopPct = Math.max(-0.5, Math.min(-0.18, next.stopPct + 0.05));
        lessons.push({
          at: now,
          agent: "RISK",
          text: `tightened stop to ${(next.stopPct * 100).toFixed(0)}%. never ran.`,
        });
      } else {
        const window = [trade, ...recent].slice(0, 6);
        const greenStops = window.filter((t) => t.reason === "stop" && (t.peakPct ?? 0) >= 0.12);
        if (greenStops.length >= 3) {
          const eased = Math.max(-0.5, next.stopPct - 0.03);
          if (eased < next.stopPct - 0.001) {
            next.stopPct = eased;
            lessons.push({
              at: now,
              agent: "RISK",
              text: `eased stop to ${(next.stopPct * 100).toFixed(0)}%. three greens died on the written stop.`,
            });
          }
        }
      }
    }
    if (trade.reason === "time") {
      next.takePct = Math.max(0.5, next.takePct - 0.1);
      lessons.push({
        at: now,
        agent: "RISK",
        text: `time-stopped $${trade.symbol}. take is now +${(next.takePct * 100).toFixed(0)}%.`,
      });
    }
    next.socialBias = Math.max(-8, next.socialBias - 1);
    if (newlyDropped.length) {
      lessons.push({
        at: now,
        agent: "META",
        text: `scar with a sample. dropping ${newlyDropped.slice(0, 3).join(", ")}.`,
      });
    }
    if (cluster && newlyDropped.length) {
      lessons.push({
        at: now,
        agent: "META",
        text: `${cluster} is losing on the ledger. cooling it.`,
      });
    }
  } else {
    if (cluster) {
      const clusterWords = CLUSTERS[cluster] ?? [];
      keywords = Array.from(new Set([...keywords, ...clusterWords.slice(0, 4)])).slice(0, 10);
      lessons.push({
        at: now,
        agent: "META",
        text: `$${trade.symbol} paid. leaning ${cluster}.`,
      });
    } else {
      lessons.push({
        at: now,
        agent: "SNIPER",
        text: `$${trade.symbol} paid. score ${trade.score} held. keeping the floor.`,
      });
    }
    next.scoreFloor = Math.max(40, next.scoreFloor - 1);
    next.socialBias = Math.min(8, next.socialBias + 1);
    if (lifted.length) {
      lessons.push({
        at: now,
        agent: "META",
        text: `ledger flipped. lifting drop on ${lifted.slice(0, 2).join(", ")}.`,
      });
    }
  }

  return {
    playbook: next,
    meta: {
      ...meta,
      drop,
      keywords,
      words,
      card,
      grokTape,
      localTape,
      source: meta.source === "open" ? "local" : meta.source,
      updatedAt: now,
    },
    lessons,
  };
}


export function makeKill(coin: PumpCoin, kind: KillKind, reason: string, now: number): KillRecord {
  const mcap = Math.max(coin.usdMcap, 1);
  return {
    mint: coin.mint,
    symbol: coin.symbol,
    name: coin.name,
    creator: coin.creator,
    kind,
    reason,
    mcapAt: mcap,
    killedAt: now,
    lastMcap: mcap,
    grade: "pending",
    gradedAt: null,
  };
}

export function decideGrade(k: KillRecord, now: number): KillGrade {
  const age = now - k.killedAt;
  if (age < GRADE_AFTER_MS) return "pending";
  const at = Math.max(k.mcapAt, 1);
  const last = k.lastMcap;
  const multiple = last / at;
  if (last <= 0 || last < 600 || multiple <= 0.45) return "rugged";
  if (multiple >= 2 && last >= 6000) return "ran";
  if (age >= FLAT_AFTER_MS) return "flat";
  return "pending";
}

export function absorbKill(
  k: KillRecord,
  playbook: Playbook,
  meta: MetaState,
  kills: KillRecord[] = [],
): { playbook: Playbook; meta: MetaState; lessons: Omit<Lesson, "id">[] } {
  const now = Date.now();
  const at = Math.max(k.mcapAt, 1);
  const multiple = k.lastMcap / at;
  const lessons: Omit<Lesson, "id">[] = [];
  const next: Playbook = {
    ...playbook,
    bannedCreators: [...(playbook.bannedCreators ?? [])],
    parole: [...(playbook.parole ?? [])],
  };
  let drop = [...(meta.drop ?? [])];

  if (k.grade === "flat" || k.grade === "pending") {
    return { playbook, meta, lessons };
  }

  const scored = wardenScore([...kills.filter((x) => x.mint !== k.mint), k]);
  const judged = scored.held + scored.missed;

  if (k.grade === "rugged") {
    const pct = Math.round((multiple - 1) * 100);
    if (k.kind === "score" || k.kind === "meta") {
      if (judged >= 6 && scored.acc >= 0.7) {
        if (next.scoreFloor < SCORE_FLOOR) {
          next.scoreFloor = Math.min(SCORE_FLOOR, next.scoreFloor + 2);
        }
        lessons.push({
          at: now,
          agent: "WARDEN",
          text:
            next.scoreFloor < SCORE_FLOOR
              ? `grade $${k.symbol} rugged (${pct}%). warden is holding ${(scored.acc * 100).toFixed(0)}%. floor ${next.scoreFloor}.`
              : `grade $${k.symbol} rugged (${pct}%). warden is holding ${(scored.acc * 100).toFixed(0)}%. META holds the bar.`,
        });
      } else {
        lessons.push({
          at: now,
          agent: "WARDEN",
          text: `grade $${k.symbol} rugged (${pct}%). the no held.`,
        });
      }
    } else if (k.kind === "serial") {
      if (onParole(next, k.creator)) {
        next.parole = (next.parole ?? []).filter((c) => c !== k.creator);
        if (k.creator && !next.bannedCreators.includes(k.creator)) {
          next.bannedCreators = [...next.bannedCreators, k.creator].slice(-40);
        }
        lessons.push({
          at: now,
          agent: "WARDEN",
          text: `grade $${k.symbol} rugged. parole revoked. factory confirmed.`,
        });
      } else {
        lessons.push({
          at: now,
          agent: "WARDEN",
          text: `grade $${k.symbol} rugged. serial dump. factory confirmed.`,
        });
      }
    } else {
      if (onParole(next, k.creator)) {
        next.parole = (next.parole ?? []).filter((c) => c !== k.creator);
        if (k.creator && !next.bannedCreators.includes(k.creator)) {
          next.bannedCreators = [...next.bannedCreators, k.creator].slice(-40);
        }
        lessons.push({
          at: now,
          agent: "WARDEN",
          text: `grade $${k.symbol} rugged. parole revoked. memory held.`,
        });
      } else {
        lessons.push({
          at: now,
          agent: "WARDEN",
          text: `grade $${k.symbol} rugged. memory held.`,
        });
      }
    }
    return { playbook: next, meta, lessons };
  }

  if (k.kind === "serial" || k.kind === "memory") {
    const prior = kills.filter(
      (x) =>
        x.creator === k.creator &&
        (x.kind === "serial" || x.kind === "memory") &&
        x.grade === "ran" &&
        x.mint !== k.mint,
    ).length;
    const ranN = prior + 1;
    if (ranN >= 2 && k.creator) {
      next.parole = Array.from(new Set([...(next.parole ?? []), k.creator])).slice(-20);
      next.bannedCreators = next.bannedCreators.filter((c) => c !== k.creator);
      lessons.push({
        at: now,
        agent: "WARDEN",
        text: `grade $${k.symbol} ran ${multiple.toFixed(1)}x. ${ranN} misses on this wallet. parole — serial/memory sleeps.`,
      });
    } else {
      lessons.push({
        at: now,
        agent: "WARDEN",
        text: `grade $${k.symbol} ran ${multiple.toFixed(1)}x. still a factory. ${ranN}/2 before parole.`,
      });
    }
    return { playbook: next, meta, lessons };
  }

  if (k.kind === "score") {
    const cut = judged >= 6 && scored.acc < 0.45 ? 4 : 2;
    next.scoreFloor = Math.max(40, next.scoreFloor - cut);
    lessons.push({
      at: now,
      agent: "WARDEN",
      text:
        cut >= 4
          ? `grade $${k.symbol} ran ${multiple.toFixed(1)}x. warden is missing. floor ${next.scoreFloor}.`
          : `grade $${k.symbol} ran ${multiple.toFixed(1)}x. floor is ${next.scoreFloor}. late, not reckless.`,
    });
  }

  if (k.kind === "meta") {
    const hay = `${k.name} ${k.symbol}`.toLowerCase();
    const hit = drop.filter((d) => hay.includes(d));
    if (hit.length) {
      drop = drop.filter((d) => !hit.includes(d));
      lessons.push({
        at: now,
        agent: "META",
        text: `grade $${k.symbol} ran. lifting drop on ${hit.slice(0, 2).join(", ")}.`,
      });
    } else {
      const cut = judged >= 6 && scored.acc < 0.45 ? 3 : 1;
      next.scoreFloor = Math.max(40, next.scoreFloor - cut);
      lessons.push({
        at: now,
        agent: "WARDEN",
        text: `grade $${k.symbol} ran ${multiple.toFixed(1)}x. setup veto missed. floor ${next.scoreFloor}.`,
      });
    }
  }

  return {
    playbook: next,
    meta: { ...meta, drop, updatedAt: now },
    lessons,
  };
}

export function wardenScore(kills: KillRecord[]): {
  held: number;
  missed: number;
  pending: number;
  acc: number;
} {
  const judged = kills.filter((k) => k.grade === "rugged" || k.grade === "ran");
  const held = judged.filter((k) => k.grade === "rugged").length;
  const missed = judged.filter((k) => k.grade === "ran").length;
  return {
    held,
    missed,
    pending: kills.filter((k) => k.grade === "pending").length,
    acc: judged.length ? held / judged.length : 0,
  };
}

export function masteryOf(input: {
  lessons: number;
  killed: number;
  wins: number;
  takes: number;
  closed: number;
  pnlUsd: number;
  rentPaid: boolean;
  survivedMs: number;
  heldKills?: number;
  lossStreak: number;
}): { rank: string; label: string } {
  const closed = input.closed;
  const winPct = closed ? input.wins / closed : 0;
  const takePct = closed ? input.takes / closed : 0;
  const pnl = input.pnlUsd;

  let rank: "hatchling" | "degen" | "veteran" | "master" = "hatchling";

  if (closed >= 3 && (winPct >= 0.28 || pnl >= 8)) rank = "degen";
  if (
    closed >= 5 &&
    winPct >= 0.38 &&
    pnl >= 18 &&
    input.takes >= 1
  ) {
    rank = "veteran";
  }
  if (
    closed >= 8 &&
    winPct >= 0.45 &&
    takePct >= 0.18 &&
    pnl >= 40 &&
    input.takes >= 3
  ) {
    rank = "master";
  }
  if (input.rentPaid && pnl >= 40 && winPct >= 0.4 && input.takes >= 2) {
    rank = "master";
  }

  if (input.lossStreak >= 4) rank = "hatchling";
  else if (input.lossStreak >= 3) {
    if (rank === "master") rank = "veteran";
    else if (rank === "veteran") rank = "degen";
    else rank = "hatchling";
  }

  const label =
    rank === "master"
      ? "trench master"
      : rank === "veteran"
        ? "veteran"
        : rank === "degen"
          ? "degen"
          : "hatchling";
  return { rank, label };
}

export function positionValue(costUsd: number, entryMcap: number, lastMcap: number): number {
  if (entryMcap <= 0) return costUsd;
  return costUsd * (lastMcap / entryMcap);
}

export function pnlPct(costUsd: number, entryMcap: number, lastMcap: number): number {
  if (costUsd <= 0 || entryMcap <= 0) return 0;
  return lastMcap / entryMcap - 1;
}

export function trailSpec(
  venue?: TapeVenue,
  weather?: Weather,
): { arm: number; give: number; hard: number | null } {
  if (venue === "pons") {
    return {
      arm: weather?.trailArm ?? TRAIL_ARM_PONS,
      give: TRAIL_GIVE_PONS,
      hard: HARD_TAKE_PONS,
    };
  }
  return {
    arm: weather?.trailArmPump ?? TRAIL_ARM,
    give: weather?.trailGivePump ?? TRAIL_GIVE,
    hard: null,
  };
}

export function protectSpec(weather?: Weather): { arm: number; keep: number } {
  return {
    arm: weather?.greenArm ?? GREEN_ARM,
    keep: weather?.greenKeep ?? GREEN_KEEP,
  };
}

export function exitMcap(
  p: { entryMcap: number; lastMcap: number; peakMcap: number; stopPct?: number },
  venue?: TapeVenue,
  weather?: Weather,
): number {
  const last = p.lastMcap;
  const peak = p.peakMcap;
  const entry = p.entryMcap;
  if (!(entry > 0)) return last;
  const { arm, give } = trailSpec(venue, weather);
  const peakPct = peak > 0 ? peak / entry - 1 : 0;
  if (peakPct >= arm && peak > 0) {
    const trailAt = peak * (1 - give);
    if (last < trailAt) return trailAt;
  }
  const green = protectSpec(weather);
  if (peakPct >= green.arm) {
    const keepAt = entry * (1 + green.keep);
    if (last < keepAt) return keepAt;
  }
  const stop = p.stopPct ?? (venue === "pons" ? STOP_LOSS_PONS : STOP_LOSS);
  const stopAt = entry * (1 + stop);
  if (last < stopAt) return stopAt;
  return last;
}

export function scarSit(closed: { pnlUsd: number; closedAt: number }[], now: number): boolean {
  const last = closed.slice(0, 3);
  if (last.length < 3) return false;
  if (last.some((t) => t.pnlUsd >= 0)) return false;
  return now - (last[0]?.closedAt ?? 0) < 4 * 60_000;
}

export function decideSell(
  p: {
    costUsd: number;
    entryMcap: number;
    lastMcap: number;
    peakMcap: number;
    openedAt: number;
    stopPct?: number;
    takePct?: number;
  },
  now: number,
  book: Playbook,
  venue?: TapeVenue,
  weather?: Weather,
): SellReason | null {
  const pct = pnlPct(p.costUsd, p.entryMcap, p.lastMcap);
  const stop = p.stopPct ?? book.stopPct;
  const spec = trailSpec(venue, weather);
  const peakPct = p.entryMcap > 0 ? p.peakMcap / p.entryMcap - 1 : 0;
  const fromPeak = p.peakMcap > 0 ? p.lastMcap / p.peakMcap - 1 : 0;
  if (spec.hard != null && pct >= spec.hard) return "take";
  const take = p.takePct ?? book.takePct;
  if (take > 0 && pct >= take) return "take";
  if (peakPct >= spec.arm && fromPeak <= -spec.give) return "take";
  if (peakPct >= spec.arm && pct <= stop) return "take";
  const green = protectSpec(weather);
  if (peakPct >= green.arm && pct <= green.keep) return "take";
  if (pct <= stop) return "stop";
  const held = now - p.openedAt;
  if (held >= PULSE_MS && peakPct < PULSE_PEAK && pct <= 0) return "time";
  if (venue === "pons") {
    const sit = weather?.sitMs ?? 90_000;
    if (held > sit && pct < 0.05) return "time";
    if (held > 4 * 60_000 && pct < 0.12) return "time";
    if (held > 10 * 60_000 && pct < 0.4) return "time";
    return null;
  }
  if (held > 8 * 60_000 && (pct < 0.05 || peakPct < 0.08)) return "time";
  if (held > 12 * 60_000 && pct < 0.12) return "time";
  if (held > 18 * 60_000 && pct < 0.25) return "time";
  return null;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

export function stampDayHits(hits: number[] | undefined, now: number): number[] {
  return [now, ...(hits ?? [])].filter((t) => now - t < DAY_MS).slice(0, 400);
}

export function clipsInDay(
  hits: number[] | undefined,
  closed: { closedAt: number }[],
  now: number,
): number {
  const fromHits = (hits ?? []).filter((t) => now - t < DAY_MS).length;
  const fromClosed = closed.filter((t) => now - t.closedAt < DAY_MS).length;
  return Math.max(fromHits, fromClosed);
}

export type GmgnSnap = {
  isHoneypot?: string;
  sellTax?: number;
  buyTax?: number;
  top10?: number;
  rugRatio?: number;
};

export function gmgnVeto(snap: GmgnSnap): string | null {
  const honey = (snap.isHoneypot ?? "").toLowerCase();
  if (honey === "yes" || honey === "true" || honey === "1") {
    return "honeypot. GMGN confirmed.";
  }
  if ((snap.sellTax ?? 0) > 0.1) {
    return `sell tax ${Math.round((snap.sellTax ?? 0) * 100)}%. GMGN.`;
  }
  if ((snap.top10 ?? 0) > 0.55) {
    return `top ten owns ${Math.round((snap.top10 ?? 0) * 100)}%. GMGN.`;
  }
  if ((snap.rugRatio ?? 0) > 0.35) {
    return `rug ratio ${Math.round((snap.rugRatio ?? 0) * 100)}%. GMGN.`;
  }
  return null;
}

export function gmgnLine(snap: GmgnSnap): string {
  const honey = snap.isHoneypot ? snap.isHoneypot : "n/a";
  const tax =
    snap.sellTax != null && Number.isFinite(snap.sellTax)
      ? `${Math.round(snap.sellTax * 100)}%`
      : "—";
  const top =
    snap.top10 != null && Number.isFinite(snap.top10) ? `${Math.round(snap.top10 * 100)}%` : "—";
  return `honey ${honey} · tax ${tax} · top10 ${top}`;
}

export function deadChair(
  positions: {
    mint: string;
    costUsd: number;
    entryMcap: number;
    lastMcap: number;
    openedAt: number;
  }[],
  now: number,
  sitMs = 90_000,
): (typeof positions)[number] | null {
  if (!positions.length) return null;
  const ranked = positions
    .map((p) => ({
      p,
      pct: pnlPct(p.costUsd, p.entryMcap, p.lastMcap),
      held: now - p.openedAt,
    }))
    .filter((x) => x.held >= sitMs && x.pct < 0.12)
    .sort((a, b) => a.pct - b.pct || b.held - a.held);
  return ranked[0]?.p ?? null;
}

export function formatBlotter(closed: ClosedTrade[], n = 8): string {
  const hot = closed.filter(isHotFill).slice(0, n);
  if (!hot.length) return "";
  return hot
    .map((t) => {
      const fill = `${t.pnlPct >= 0 ? "+" : ""}${(t.pnlPct * 100).toFixed(0)}%`;
      const peak =
        typeof t.peakPct === "number" ? ` peak +${(t.peakPct * 100).toFixed(0)}%` : "";
      const miss =
        typeof t.peakPct === "number" && t.peakPct - t.pnlPct > 0.05
          ? ` miss +${((t.peakPct - t.pnlPct) * 100).toFixed(0)}%`
          : "";
      return `$${t.symbol} ${fill}${peak}${miss} ${t.reason} ${t.rail}`;
    })
    .join("\n");
}

export function snapshotText(input: {
  thesis: string;
  cash: number;
  equity: number;
  scanned: number;
  killed: number;
  trades: number;
  coins: { symbol: string; name: string; usdMcap: number; replies: number }[];
  losses?: string;
  playbook?: string;
  blotter?: string;
}): string {
  const tape = input.coins
    .slice(0, 18)
    .map(
      (c) =>
        `$${c.symbol} ${c.name} mcap=${Math.round(c.usdMcap)} replies=${c.replies}`,
    )
    .join("\n");
  const loss = input.losses ? `\nLosing trades:\n${input.losses}` : "";
  const book = input.playbook ? `\nPlaybook: ${input.playbook}` : "";
  const blotter = input.blotter ? `\nHot blotter (live fills, peak vs booked):\n${input.blotter}` : "";
  return `Current thesis: ${input.thesis}
Cash ${input.cash.toFixed(2)} equity ${input.equity.toFixed(2)} scanned ${input.scanned} killed ${input.killed} trades ${input.trades}${book}${loss}${blotter}
Live tape:
${tape}`;
}

export function pickHotLane(
  now: number,
  seats: Array<{
    id: LaneId;
    hunting: boolean;
    closed: { pnlUsd: number }[];
    startedAt: number | null;
  }>,
): LaneId | null {
  const rows = seats
    .filter((s) => s.hunting)
    .map((s) => {
      const n = s.closed.length;
      const wins = s.closed.filter((t) => t.pnlUsd > 0).length;
      const win = n ? wins / n : 0;
      const ageDays = s.startedAt ? Math.max(0, now - s.startedAt) / 86_400_000 : 0;
      const floor = wilsonLow(wins, n);
      return { id: s.id, n, win, ageDays, merit: floor * 100 + ageDays };
    });
  if (!rows.length) return null;
  rows.sort((a, b) => b.merit - a.merit || b.n - a.n || b.ageDays - a.ageDays);
  return rows[0].id;
}
