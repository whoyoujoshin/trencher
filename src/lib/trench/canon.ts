import {
  SCORE_FLOOR,
  STOP_LOSS,
  TAKE_PROFIT,
  type BookFile,
  type KillGrade,
  type KillRecord,
  type Lesson,
  type MetaScorecard,
  type MetaState,
  type Playbook,
  type SourceTape,
  type WordStat,
} from "./types";
import { pruneKnobMap, pruneWords } from "./logic";

export type SpiritCanon = {
  scoreFloor: number;
  stopPct: number;
  takePct: number;
  socialBias: number;
  bannedCreators: string[];
  thesis: string;
  keywords: string[];
  drop: string[];
  lessons: Lesson[];
  kills: KillRecord[];
  absorbed: number;
  updatedAt: number;
  words?: Record<string, WordStat>;
  card?: MetaScorecard;
  grokTape?: SourceTape;
  localTape?: SourceTape;
};

export function blankCanon(): SpiritCanon {
  return {
    scoreFloor: SCORE_FLOOR,
    stopPct: STOP_LOSS,
    takePct: TAKE_PROFIT,
    socialBias: 0,
    bannedCreators: [],
    thesis: "open book",
    keywords: [],
    drop: [],
    lessons: [],
    kills: [],
    absorbed: 0,
    updatedAt: 0,
  };
}

function uniq(xs: string[]): string[] {
  return Array.from(new Set(xs.filter(Boolean)));
}

const GRADE_RANK: Record<KillGrade, number> = {
  rugged: 3,
  ran: 2,
  flat: 1,
  pending: 0,
};

function mergeKills(a: KillRecord[], b: KillRecord[]): KillRecord[] {
  const map = new Map<string, KillRecord>();
  for (const k of [...a, ...b]) {
    if (!k?.mint) continue;
    const prev = map.get(k.mint);
    if (!prev || (GRADE_RANK[k.grade] ?? 0) >= (GRADE_RANK[prev.grade] ?? 0)) {
      map.set(k.mint, k);
    }
  }
  return Array.from(map.values())
    .sort((x, y) => y.killedAt - x.killedAt)
    .slice(0, 80);
}

function mergeWordMaps(
  a?: Record<string, WordStat>,
  b?: Record<string, WordStat>,
): Record<string, WordStat> | undefined {
  if (!a && !b) return undefined;
  const out: Record<string, WordStat> = { ...(a ?? {}) };
  for (const [tok, s] of Object.entries(b ?? {})) {
    const prev = out[tok];
    out[tok] = prev
      ? {
          n: prev.n + s.n,
          w: prev.w + s.w,
          pnl: Math.round((prev.pnl + s.pnl) * 100) / 100,
        }
      : { ...s };
  }
  return pruneWords(out, 48);
}

function mergeTape(a?: SourceTape, b?: SourceTape): SourceTape | undefined {
  if (!a && !b) return undefined;
  return {
    n: (a?.n ?? 0) + (b?.n ?? 0),
    pnl: Math.round(((a?.pnl ?? 0) + (b?.pnl ?? 0)) * 100) / 100,
  };
}

function mergeKnobMaps(
  a: Record<string, { n: number; w: number; pnl: number }> | undefined,
  b: Record<string, { n: number; w: number; pnl: number }> | undefined,
  cap: number,
): Record<string, { n: number; w: number; pnl: number }> {
  const out: Record<string, { n: number; w: number; pnl: number }> = { ...(a ?? {}) };
  for (const [k, s] of Object.entries(b ?? {})) {
    const prev = out[k];
    out[k] = prev
      ? {
          n: prev.n + s.n,
          w: prev.w + s.w,
          pnl: Math.round((prev.pnl + s.pnl) * 100) / 100,
        }
      : { ...s };
  }
  return pruneKnobMap(out, cap);
}

function mergeCards(a?: MetaScorecard, b?: MetaScorecard): MetaScorecard | undefined {
  if (!a && !b) return undefined;
  const bySourceKeys = new Set([
    ...Object.keys(a?.bySource ?? {}),
    ...Object.keys(b?.bySource ?? {}),
  ]) as Set<string>;
  const bySource: MetaScorecard["bySource"] = {};
  for (const k of bySourceKeys) {
    const key = k as keyof MetaScorecard["bySource"];
    const x = a?.bySource?.[key];
    const y = b?.bySource?.[key];
    if (!x && !y) continue;
    bySource[key] = {
      n: (x?.n ?? 0) + (y?.n ?? 0),
      w: (x?.w ?? 0) + (y?.w ?? 0),
      pnl: Math.round(((x?.pnl ?? 0) + (y?.pnl ?? 0)) * 100) / 100,
    };
  }
  return {
    bySource,
    byThesis: mergeKnobMaps(a?.byThesis, b?.byThesis, 24),
    byKeyword: mergeKnobMaps(a?.byKeyword, b?.byKeyword, 24),
    updatedAt: Math.max(a?.updatedAt ?? 0, b?.updatedAt ?? 0, Date.now()),
  };
}

export function mergeCanon(canon: SpiritCanon, book: BookFile | null | undefined): SpiritCanon {
  if (!book || book.kind !== "trencher-book") return canon;
  const play = book.playbook ?? book.house?.playbook;
  if (!play) return canon;
  const incomingLessons = book.lessons ?? book.house?.lessons ?? [];
  const incomingKills = book.kills ?? book.house?.kills ?? [];
  const seen = new Set(canon.lessons.map((l) => l.text));
  const lessons = [...canon.lessons];
  for (const l of incomingLessons) {
    if (l?.text && !seen.has(l.text)) {
      seen.add(l.text);
      lessons.unshift(l);
    }
  }
  const incomingThesis = book.meta?.thesis || book.house?.thesis || "";
  const thesis =
    canon.thesis && canon.thesis !== "open book"
      ? canon.thesis
      : incomingThesis || canon.thesis;
  const words = mergeWordMaps(canon.words, book.meta?.words);
  const card = mergeCards(canon.card, book.meta?.card);
  const grokTape = mergeTape(canon.grokTape, book.meta?.grokTape);
  const localTape = mergeTape(canon.localTape, book.meta?.localTape);
  return {
    scoreFloor: Math.max(canon.scoreFloor, play.scoreFloor ?? 0),
    stopPct: Math.min(canon.stopPct, play.stopPct ?? canon.stopPct),
    takePct: Math.min(canon.takePct, play.takePct ?? canon.takePct),
    socialBias: Math.max(canon.socialBias, play.socialBias ?? 0),
    bannedCreators: uniq([...canon.bannedCreators, ...(play.bannedCreators ?? [])]),
    thesis,
    keywords: uniq([
      ...canon.keywords,
      ...(book.meta?.keywords ?? book.house?.keywords ?? []),
    ]),
    drop: uniq([...canon.drop, ...(book.meta?.drop ?? book.house?.drop ?? [])]),
    lessons: lessons.slice(0, 36),
    kills: mergeKills(canon.kills, incomingKills),
    absorbed: canon.absorbed + 1,
    updatedAt: Date.now(),
    ...(words ? { words } : {}),
    ...(card ? { card } : {}),
    ...(grokTape ? { grokTape } : {}),
    ...(localTape ? { localTape } : {}),
  };
}

export function canonToPlaybook(c: SpiritCanon): Playbook {
  return {
    scoreFloor: c.scoreFloor,
    stopPct: c.stopPct,
    takePct: c.takePct,
    socialBias: c.socialBias,
    bannedCreators: [...c.bannedCreators],
  };
}

export function canonHasBlood(c: SpiritCanon | null | undefined): boolean {
  if (!c) return false;
  if (c.absorbed > 0 || c.bannedCreators.length > 0) return true;
  if (c.words && Object.values(c.words).some((w) => w.n > 0)) return true;
  if (c.card?.updatedAt) return true;
  return false;
}

export function canonToMetaSeed(c: SpiritCanon): Partial<MetaState> {
  const blood = canonHasBlood(c);
  const seed: Partial<MetaState> = {
    thesis: c.thesis,
    keywords: [...c.keywords],
    drop: [...c.drop],
    source: blood ? "local" : "open",
  };
  if (c.words) seed.words = { ...c.words };
  if (c.card) {
    seed.card = {
      bySource: { ...c.card.bySource },
      byThesis: { ...c.card.byThesis },
      byKeyword: { ...c.card.byKeyword },
      updatedAt: c.card.updatedAt,
    };
  }
  if (c.grokTape) seed.grokTape = { ...c.grokTape };
  if (c.localTape) seed.localTape = { ...c.localTape };
  return seed;
}
