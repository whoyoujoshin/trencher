import { FEE_RATE, FLAT_AFTER_MS, GRADE_AFTER_MS, MAX_BUY_SOL, SCORE_FLOOR, STOP_LOSS, TAKE_PROFIT, TRAIL_ARM, TRAIL_GIVE } from "./types";
import type { ClosedTrade, KillGrade, KillKind, KillRecord, Lesson, MetaState, Playbook, PumpCoin, SellReason } from "./types";

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
  };
}

export function cheapKill(coin: PumpCoin, now: number): string | null {
  if (coin.banned || coin.nsfw) return "banned or flagged. not touching it.";
  if (coin.complete) return "already off the curve. too late.";
  if (!coin.symbol.trim() || coin.symbol.length > 14) return "ticker is garbage.";
  if (coin.name.trim().length < 2) return "nameless. skip.";
  const age = now - coin.createdAt;
  if (age > 45 * 60_000) return "older than 45m. not a snipe.";
  if (coin.usdMcap > 90_000) return `mcap ${Math.round(coin.usdMcap)} already. missed.`;
  if (coin.usdMcap > 0 && coin.usdMcap < 700) return "empty curve. nothing there.";
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

  if (coin.usdMcap < 2500) return "mcap under 2.5k. no tape.";
  if (coin.usdMcap > 55_000) return "already extended. no chase.";
  if (age > 20 * 60_000 && !lively) return "stale and quiet.";

  if (meta.source !== "open" && meta.keywords.length) {
    if (!matchesAny(text, meta.keywords)) {
      if (!(lively && coin.usdMcap >= 12_000 && hasSocial)) {
        return `doesn't match ${meta.keywords.slice(0, 3).join("/")}.`;
      }
    }
  } else {
    const quality = hasSocial || lively || coin.description.length > 40;
    if (!quality && coin.usdMcap < 10_000) {
      return "no socials, no replies, thin book.";
    }
  }
  return null;
}

export function scoreSetup(
  coin: PumpCoin,
  meta: MetaState,
  now: number,
  playbook?: Playbook,
): { score: number; why: string } {
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
    score += 22;
    bits.push("thesis");
  }
  if (now - coin.createdAt < 5 * 60_000) {
    score += 8;
    bits.push("fresh");
  }
  if (coin.usdMcap >= 5000 && coin.usdMcap <= 28000) {
    score += 12;
    bits.push("window");
  }
  if (coin.description.length > 40) score += 6;
  score = Math.max(1, Math.min(99, Math.round(score)));
  return { score, why: bits.slice(0, 3).join(" · ") || "thin tape" };
}

export function sizeByScore(cash: number, solUsd: number, score: number): number {
  const conviction = score >= 70;
  const cap = Math.min(
    MAX_BUY_SOL * solUsd,
    cash * (conviction ? 0.5 : 0.36),
    conviction ? 40 : 26,
  );
  const weight = conviction
    ? Math.min(0.95, 0.82 + (score - 70) * 0.008)
    : 0.52 + 0.35 * (score / 100);
  return Math.floor(cap * weight * 100) / 100;
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
  const drop = scores
    .filter((s) => s.name !== top.name)
    .flatMap((s) => CLUSTERS[s.name] ?? [])
    .slice(0, 8);
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
    drop,
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
  const text = losses.map((t) => `${t.symbol} ${t.name}`).join(" ").toLowerCase();
  const extra: string[] = [];
  for (const words of Object.values(CLUSTERS)) {
    extra.push(...words.filter((w) => text.includes(w)));
  }
  const drop = Array.from(new Set([...meta.drop, ...extra])).slice(0, 12);
  if (drop.length === meta.drop.length) {
    return {
      drop,
      note: `${losses.length} losers reread. no new drop list. holding ${meta.thesis}.`,
    };
  }
  return {
    drop,
    note: `${losses.length} losers reread. dropping ${extra.slice(0, 4).join(", ") || "the cluster"}.`,
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

export function absorbTrade(
  trade: ClosedTrade,
  playbook: Playbook,
  meta: MetaState,
): { playbook: Playbook; meta: MetaState; lessons: Omit<Lesson, "id">[] } {
  const now = Date.now();
  const lessons: Omit<Lesson, "id">[] = [];
  const next: Playbook = {
    ...playbook,
    bannedCreators: [...(playbook.bannedCreators ?? [])],
  };
  let drop = [...(meta.drop ?? [])];
  let keywords = [...(meta.keywords ?? [])];
  const text = `${trade.name} ${trade.symbol}`.toLowerCase();
  const cluster = clusterOf(text);

  if (trade.pnlUsd < 0) {
    const toks = tokensFrom(trade.name, trade.symbol);
    const added = toks.filter((t) => !drop.includes(t));
    drop = Array.from(new Set([...drop, ...toks])).slice(0, 12);
    if (trade.creator && !next.bannedCreators.includes(trade.creator)) {
      next.bannedCreators = [...next.bannedCreators, trade.creator].slice(-40);
      lessons.push({
        at: now,
        agent: "WARDEN",
        text: `memory: deployer of $${trade.symbol} is burned. next coin from that wallet dies.`,
      });
    }
    next.scoreFloor = Math.min(72, next.scoreFloor + (trade.score >= 60 ? 4 : 2));
    lessons.push({
      at: now,
      agent: "SNIPER",
      text: `$${trade.symbol} scored ${trade.score} and lost. floor is ${next.scoreFloor}.`,
    });
    if (trade.reason === "stop") {
      next.stopPct = Math.max(-0.5, Math.min(-0.35, next.stopPct + 0.05));
      lessons.push({
        at: now,
        agent: "RISK",
        text: `tightened stop to ${(next.stopPct * 100).toFixed(0)}%. never widening.`,
      });
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
    if (added.length) {
      lessons.push({
        at: now,
        agent: "META",
        text: `scar on the book. dropping ${added.slice(0, 3).join(", ")}.`,
      });
    }
    if (cluster) {
      lessons.push({
        at: now,
        agent: "META",
        text: `${cluster} paid us nothing. cooling that cluster.`,
      });
    }
  } else {
    if (cluster) {
      const words = CLUSTERS[cluster] ?? [];
      keywords = Array.from(new Set([...keywords, ...words.slice(0, 4)])).slice(0, 10);
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
  }

  return {
    playbook: next,
    meta: {
      ...meta,
      drop,
      keywords,
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
): { playbook: Playbook; meta: MetaState; lessons: Omit<Lesson, "id">[] } {
  const now = Date.now();
  const at = Math.max(k.mcapAt, 1);
  const multiple = k.lastMcap / at;
  const lessons: Omit<Lesson, "id">[] = [];
  const next: Playbook = { ...playbook, bannedCreators: [...(playbook.bannedCreators ?? [])] };
  let drop = [...(meta.drop ?? [])];

  if (k.grade === "flat" || k.grade === "pending") {
    return { playbook, meta, lessons };
  }

  if (k.grade === "rugged") {
    const pct = Math.round((multiple - 1) * 100);
    if (k.kind === "score" || k.kind === "meta") {
      lessons.push({
        at: now,
        agent: "WARDEN",
        text: `grade $${k.symbol} rugged (${pct}%). the no held.`,
      });
    } else if (k.kind === "serial") {
      lessons.push({
        at: now,
        agent: "WARDEN",
        text: `grade $${k.symbol} rugged. serial dump. factory confirmed.`,
      });
    } else {
      lessons.push({
        at: now,
        agent: "WARDEN",
        text: `grade $${k.symbol} rugged. memory held.`,
      });
    }
    return { playbook: next, meta, lessons };
  }

  if (k.kind === "serial" || k.kind === "memory") {
    lessons.push({
      at: now,
      agent: "WARDEN",
      text: `grade $${k.symbol} ran ${multiple.toFixed(1)}x. still a factory. rule stays.`,
    });
    return { playbook: next, meta, lessons };
  }

  if (k.kind === "score") {
    next.scoreFloor = Math.max(40, next.scoreFloor - 2);
    lessons.push({
      at: now,
      agent: "WARDEN",
      text: `grade $${k.symbol} ran ${multiple.toFixed(1)}x. floor is ${next.scoreFloor}. late, not reckless.`,
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
      next.scoreFloor = Math.max(40, next.scoreFloor - 1);
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

export function wardenScore(kills: KillRecord[]): { held: number; missed: number; pending: number } {
  const judged = kills.filter(
    (k) => (k.kind === "score" || k.kind === "meta") && (k.grade === "rugged" || k.grade === "ran"),
  );
  return {
    held: judged.filter((k) => k.grade === "rugged").length,
    missed: judged.filter((k) => k.grade === "ran").length,
    pending: kills.filter((k) => k.grade === "pending" && (k.kind === "score" || k.kind === "meta")).length,
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

export function decideSell(
  p: {
    costUsd: number;
    entryMcap: number;
    lastMcap: number;
    peakMcap: number;
    openedAt: number;
    stopPct?: number;
  },
  now: number,
  book: Playbook,
): SellReason | null {
  const pct = pnlPct(p.costUsd, p.entryMcap, p.lastMcap);
  const stop = p.stopPct ?? book.stopPct;
  if (pct <= stop) return "stop";
  const peakPct = p.entryMcap > 0 ? p.peakMcap / p.entryMcap - 1 : 0;
  const fromPeak = p.peakMcap > 0 ? p.lastMcap / p.peakMcap - 1 : 0;
  if (peakPct >= TRAIL_ARM && fromPeak <= -TRAIL_GIVE) return "take";
  const held = now - p.openedAt;
  if (held > 8 * 60_000 && pct < 0) return "time";
  if (held > 25 * 60_000 && pct < 0.25) return "time";
  return null;
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
  return `Current thesis: ${input.thesis}
Cash ${input.cash.toFixed(2)} equity ${input.equity.toFixed(2)} scanned ${input.scanned} killed ${input.killed} trades ${input.trades}${book}${loss}
Live tape:
${tape}`;
}
