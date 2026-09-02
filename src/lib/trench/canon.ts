import {
  SCORE_FLOOR,
  STOP_LOSS,
  TAKE_PROFIT,
  type BookFile,
  type KillGrade,
  type KillRecord,
  type Lesson,
  type Playbook,
} from "./types";

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
  return {
    scoreFloor: Math.max(canon.scoreFloor, play.scoreFloor ?? 0),
    stopPct: Math.max(canon.stopPct, play.stopPct ?? canon.stopPct),
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
  return !!c && (c.absorbed > 0 || c.bannedCreators.length > 0);
}
