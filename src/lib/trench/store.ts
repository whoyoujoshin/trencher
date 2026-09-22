import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  fetchCreator,
  fetchQuotes,
  fetchTape,
  fetchPonsTape,
  fetchTapeHeat,
  consultMeta,
  probeGmgn,
  fetchGmgnTape,
} from "./server";
import {
  absorbKill,
  absorbTrade,
  blankPlaybook,
  cheapKill,
  climbPlaybook,
  decideGrade,
  decideSell,
  deadChair,
  detectMeta,
  exitMcap,
  heatPlaybook,
  makeKill,
  masteryOf,
  paperFee,
  paperSlip,
  pnlPct,
  pickHotLane,
  ponsWake,
  positionValue,
  reviewLosersLocal,
  scoreSetup,
  serialKill,
  setupMatch,
  sizeByScore,
  snapshotText,
  formatBlotter,
  formatLedger,
  formatScorecard,
  hotFirstClosed,
  scarStreak,
  coldKeywords,
  stripColdKeywords,
  shouldAskMeta,
  isHotFill,
  scarSit,
  minClip,
  tapeHeat,
  takeWindow,
  windowPrint,
  regimeShift,
  writeWeather,
  weatherHolds,
  canWriteWeather,
  paperFloor,
  liveFloor,
  formatWeather,
  emptyPrint,
  peakArmTarget,
  gmgnLine,
  gmgnVeto,
  trailSpec,
  grokTrust,
  onParole,
  hotLiveBlock,
  punchedQuiet,
  stampDayHits,
  matchedMetaTokens,
  ponsCurveLive,
  ripperFloor,
} from "./logic";
import { ntfyHeartbeat, pingNtfy } from "./ntfy";
import { gmgnKey } from "./gmgn";
import { amHunter, deskPin, syncCloud } from "./cloud";
import { LIVE_CAP_ETH, LIVE_CAP_SOL, LIVE_ETH_USD, LIVE_ETH_FUND, ethHotBuy, ethHotSell, flattenHot as flattenHotBags, hotAutoArmed, hotBuy, hotSell, isLiveMint, peekEthHot, refreshEthHot, refreshHot, shadowQuote, signOneBuy, signOneState } from "./wallet";
import { buildShadowFill, shadowLearnOn, shadowTillLine } from "./shadow";
import { canonHasBlood, canonToMetaSeed, canonToPlaybook } from "./canon";
import { useSpirit } from "./spirit";
import {
  AGENTS,
  BROKE_USD,
  BUY_COOLDOWN_MS,
  BUY_COOLDOWN_PONS_MS,
  MAX_POSITIONS,
  ROUND_MS,
  SCORE_FLOOR,
  HUNT_MCAP_MIN,
  STARTING_CASH,
  TRAIL_ARM,
  TRAIL_GIVE,
  TRAIL_ARM_PONS,
  TRAIL_GIVE_PONS,
  HARD_TAKE_PONS,
  GREEN_ARM,
  GREEN_KEEP,
  PULSE_PEAK,
  STOP_LOSS_PONS,
  gateUsd,
  type AgentId,
  type AgentPulse,
  type BotStatus,
  type BookFile,
  GRADE_AFTER_MS,
  type ClosedTrade,
  type House,
  type KillKind,
  type KillRecord,
  type Lesson,
  type LogKind,
  type LogLine,
  type MetaState,
  type Playbook,
  type Position,
  type PumpCoin,
  type Rival,
  type LaneId,
  type SellReason,
  type TapeVenue,
  type TapeHeat,
  isEvmMint,
  mintCallsign,
  stampRail,
  blankWeather,
  WEATHER_COOLDOWN_MS,
  type Weather,
} from "./types";

let lastPonsQuietAt = 0;
let lastRivalHeatAt = 0;
const ponsTried = new Set<string>();
const hushAt = new Map<string, number>();

function hush(key: string, ms: number): boolean {
  const t = Date.now();
  if (t - (hushAt.get(key) ?? 0) < ms) return true;
  hushAt.set(key, t);
  return false;
}

type TrenchState = {
  hydrated: boolean;
  status: BotStatus;
  cash: number;
  solUsd: number;
  startedAt: number | null;
  diedAt: number | null;
  rentPaid: boolean;
  lastBuyAt: number;
  lastCycleAt: number;
  ticking: boolean;
  tapeError: string | null;
  tapeVenue: TapeVenue;
  heatPump: TapeHeat | null;
  heatPons: TapeHeat | null;
  weather: Weather;
  scanned: number;
  killed: number;
  seen: string[];
  creatorSeen: Record<string, number>;
  tape: PumpCoin[];
  positions: Position[];
  closed: ClosedTrade[];
  dayHits: number[];
  kills: KillRecord[];
  logs: LogLine[];
  lessons: Lesson[];
  playbook: Playbook;
  house: House;
  agents: Record<AgentId, AgentPulse>;
  meta: MetaState;
  grokBusy: boolean;
  grokLastAt: number;
  grokError: string | null;
  feesPaid: number;
  rival: Rival | null;
  extra: Rival | null;
  soloDesk: boolean;
  focus: LaneId;
  vetDead: boolean;
  housePot: number;
  houseBank: number;
  roundStartedAt: number | null;
  round: number;
  hotPubkey: string | null;
  hotSol: number | null;
  hotEthAddr: string | null;
  hotEth: number | null;
  lastHotLine: string | null;
  lastGmgn: { symbol: string; text: string; veto: boolean; at: number } | null;
  atHome: boolean;
  callsign: string;
  goHome: () => void;
  leaveHome: () => void;
  setTapeVenue: (venue: TapeVenue) => void;
  spawnRival: () => void;
  setSoloDesk: (on: boolean) => void;
  cull: () => void;
  setFocus: (lane: LaneId) => void;
  spectate: () => void;
  setHydrated: () => void;
  arm: () => void;
  clone: () => void;
  killClone: () => void;
  payRent: () => void;
  dumpClip: (mint: string) => void;
  dumpRunners: () => void;
  flattenHot: () => Promise<void>;
  cycle: () => Promise<void>;
  askMeta: () => Promise<void>;
  readLosers: () => Promise<void>;
  snapshotBook: () => BookFile;
  ingestBook: (raw: unknown) => string | null;
};

function blankAgents(): Record<AgentId, AgentPulse> {
  const now = Date.now();
  return Object.fromEntries(
    AGENTS.map((a) => [a.id, { lastAt: now, lastText: "asleep", kills: 0, acts: 0 }]),
  ) as Record<AgentId, AgentPulse>;
}

function openMeta(): MetaState {
  return {
    thesis: "open book",
    keywords: [],
    drop: [],
    source: "open",
    updatedAt: Date.now(),
  };
}

function blankHouse(): House {
  return {
    generation: 0,
    deaths: 0,
    escapes: 0,
    playbook: blankPlaybook(),
    thesis: "open book",
    keywords: [],
    drop: [],
    lessons: [],
    kills: [],
  };
}

function initial(): Omit<
  TrenchState,
  "setHydrated" | "arm" | "clone" | "killClone" | "payRent" | "dumpClip" | "dumpRunners" | "flattenHot" | "cycle" | "askMeta" | "readLosers" | "snapshotBook" | "ingestBook" | "spawnRival" | "setSoloDesk" | "cull" | "setFocus" | "spectate" | "goHome" | "leaveHome" | "setTapeVenue"
> {
  return {
    hydrated: false,
    status: "idle",
    cash: STARTING_CASH,
    solUsd: 140,
    startedAt: null,
    diedAt: null,
    rentPaid: false,
    lastBuyAt: 0,
    lastCycleAt: 0,
    ticking: false,
    tapeError: null,
    tapeVenue: "pump",
    heatPump: null,
    heatPons: null,
    weather: blankWeather(),
    scanned: 0,
    killed: 0,
    seen: [],
    creatorSeen: {},
    tape: [],
    positions: [],
    closed: [],
    dayHits: [],
    kills: [],
    logs: [],
    lessons: [],
    playbook: blankPlaybook(),
    house: blankHouse(),
    agents: blankAgents(),
    meta: openMeta(),
    grokBusy: false,
    grokLastAt: 0,
    grokError: null,
    feesPaid: 0,
    rival: null,
    extra: null,
    soloDesk: false,
    focus: "vet",
    vetDead: false,
    housePot: 0,
    houseBank: 0,
    roundStartedAt: null,
    round: 1,
    hotPubkey: null,
    hotSol: null,
    hotEthAddr: null,
    hotEth: null,
    lastHotLine: null,
    lastGmgn: null,
    atHome: false,
    callsign: "",
  };
}

function nid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function equityOf(cash: number, positions: Position[]): number {
  return (
    cash +
    positions.reduce((s, p) => {
      const mark = positionValue(p.costUsd, p.entryMcap, p.lastMcap);
      return s + mark - paperFee(mark);
    }, 0)
  );
}

function stopOf(p: Position, book: Playbook): number {
  return p.stopPct ?? book.stopPct;
}

function takeOf(p: Position, book: Playbook): number {
  return p.takePct ?? book.takePct;
}

function clipStop(book: Playbook, venue: TapeVenue): number {
  return venue === "pons" ? Math.max(book.stopPct, STOP_LOSS_PONS) : book.stopPct;
}

function laneInsolvent(
  cash: number,
  positions: Position[],
  venue: TapeVenue,
  solUsd: number,
  weather?: Weather,
): boolean {
  const eq = equityOf(cash, positions);
  if (eq < BROKE_USD) return true;
  if (positions.length > 0) return false;
  return sizeByScore(cash, solUsd, 80, venue, weather) < minClip(venue);
}

function hatchOn(r: Rival | null | undefined): boolean {
  return !!r && (r.status === "alive" || r.status === "survived");
}

function blankHatch(burns: string[], taken: string[] = []): Rival {
  return {
    status: "alive",
    cash: STARTING_CASH,
    startedAt: Date.now(),
    diedAt: null,
    rentPaid: false,
    lastBuyAt: 0,
    positions: [],
    closed: [],
    dayHits: [],
    playbook: { ...blankPlaybook(), bannedCreators: [...burns] },
    lessons: [],
    feesPaid: 0,
    killed: 0,
    callsign: mintCallsign(taken),
  };
}

function occupiedMints(s: {
  positions: Position[];
  rival: Rival | null;
  extra?: Rival | null;
}): Set<string> {
  const m = new Set(s.positions.map((p) => p.mint));
  for (const p of s.rival?.positions ?? []) m.add(p.mint);
  for (const p of s.extra?.positions ?? []) m.add(p.mint);
  return m;
}

function occupiedTickers(s: {
  positions: Position[];
  rival: Rival | null;
  extra?: Rival | null;
}): Set<string> {
  const m = new Set(s.positions.map((p) => p.symbol.toLowerCase()));
  for (const p of s.rival?.positions ?? []) m.add(p.symbol.toLowerCase());
  for (const p of s.extra?.positions ?? []) m.add(p.symbol.toLowerCase());
  return m;
}

function liveBody(r: Rival | null | undefined): r is Rival {
  return !!r && (r.status === "alive" || r.status === "survived");
}


/** Only keep Grok drop tokens grounded in ledger/tape text (or already known). Cap 12. */
function groundedDrop(existing: string[], incoming: string[], hay: string): string[] {
  const h = hay.toLowerCase();
  const keep = incoming.filter((tok) => {
    const t = (tok ?? "").toLowerCase().trim();
    if (t.length < 2) return false;
    if (existing.some((e) => e.toLowerCase() === t)) return true;
    return h.includes(t);
  });
  return Array.from(new Set([...existing, ...keep])).slice(0, 12);
}

export const useTrench = create<TrenchState>()(
  persist(
    (set, get) => {
      function log(agent: AgentId, kind: LogKind, text: string, extra?: { mint?: string; symbol?: string }) {
        const line: LogLine = {
          id: nid(),
          at: Date.now(),
          agent,
          kind,
          text,
          mint: extra?.mint,
          symbol: extra?.symbol,
        };
        set((s) => {
          const prev = s.agents[agent] ?? { lastAt: 0, lastText: "asleep", kills: 0, acts: 0 };
          return {
          logs: [line, ...s.logs].slice(0, 180),
          agents: {
            ...s.agents,
            [agent]: {
              lastAt: line.at,
              lastText: text,
              kills: prev.kills + (kind === "kill" ? 1 : 0),
              acts: prev.acts + 1,
            },
          },
          };
        });
      }

      function vetTag() {
        return get().callsign || "body";
      }
      function hatchTag() {
        return get().rival?.callsign || "body";
      }
      function cubTag() {
        return get().extra?.callsign || "body";
      }
      function takenSigns() {
        const s = get();
        return [s.callsign, s.rival?.callsign, s.extra?.callsign].filter(Boolean) as string[];
      }
      function signOf(id: LaneId) {
        if (id === "vet") return vetTag();
        if (id === "hatch") return hatchTag();
        return cubTag();
      }

      function captain(): LaneId | null {
        const s = get();
        return pickHotLane(Date.now(), [
          {
            id: "vet",
            hunting: !s.vetDead && !s.rentPaid && (s.status === "alive" || s.status === "survived"),
            closed: s.closed,
            startedAt: s.startedAt,
          },
          {
            id: "hatch",
            hunting: hatchOn(s.rival) && !!s.rival && !s.rival.rentPaid,
            closed: s.rival?.closed ?? [],
            startedAt: s.rival?.startedAt ?? null,
          },
          {
            id: "cub",
            hunting: liveBody(s.extra) && !!s.extra && !s.extra.rentPaid,
            closed: s.extra?.closed ?? [],
            startedAt: s.extra?.startedAt ?? null,
          },
        ]);
      }

      let lastCap: LaneId | null = null;
      let liveBurst = 0;
      let liveBurstAt = 0;
      let ethBurst = 0;
      let ethBurstAt = 0;
      let lastEthBuyAt = 0;
      let lastHotBalAt = 0;
      let flatteningBags = false;
      const liveDebts: { mint: string; symbol: string }[] = [];

      function liveNotional(mint: string): number {
        if (isEvmMint(mint)) return Math.round(LIVE_CAP_ETH * LIVE_ETH_USD * 100) / 100;
        return Math.round(LIVE_CAP_SOL * (get().solUsd || 140) * 100) / 100;
      }

      function patchSettle(mint: string, ok: boolean, tx?: string) {
        const hit = (list: ClosedTrade[]) =>
          list.map((t) =>
            t.mint === mint && t.settled === "pending"
              ? { ...t, settled: ok ? ("yes" as const) : ("no" as const), tx: tx || t.tx }
              : t,
          );
        set((s) => ({
          closed: hit(s.closed),
          rival: s.rival ? { ...s.rival, closed: hit(s.rival.closed) } : s.rival,
          extra: s.extra ? { ...s.extra, closed: hit(s.extra.closed) } : s.extra,
        }));
      }

      function oweSell(mint: string, symbol: string) {
        if (!liveDebts.some((d) => d.mint === mint)) liveDebts.push({ mint, symbol });
      }

      function dropDebt(mint: string) {
        const i = liveDebts.findIndex((d) => d.mint === mint);
        if (i >= 0) liveDebts.splice(i, 1);
      }

      function sweepLiveDebts() {
        if (!hotAutoArmed()) return;
        for (const d of liveDebts.slice(0, 2)) {
          const fn = isEvmMint(d.mint) ? ethHotSell : hotSell;
          void fn(d.mint, d.symbol).then((r) => {
            log("TILL", r.ok ? "till" : "sys", r.ok ? r.text : `wallet still holds $${d.symbol}. ${r.text}`, {
              mint: d.mint,
              symbol: d.symbol,
            });
            set({ lastHotLine: r.text });
            if (r.ok) {
              dropDebt(d.mint);
              patchSettle(d.mint, true, r.hash);
              pingNtfy("TRENCHER", `HOT SELL $${d.symbol} settled`, true);
            }
          });
        }
      }

      function announceCaptain() {
        const id = captain();
        if (id === lastCap) return;
        lastCap = id;
        if (!id) return;
        const s = get();
        const closed =
          id === "vet" ? s.closed : id === "hatch" ? (s.rival?.closed ?? []) : (s.extra?.closed ?? []);
        const started =
          id === "vet" ? s.startedAt : id === "hatch" ? s.rival?.startedAt : s.extra?.startedAt;
        const n = closed.length;
        const win = n ? Math.round((closed.filter((t) => t.pnlUsd > 0).length / n) * 100) : 0;
        const age = started ? ((Date.now() - started) / 86_400_000).toFixed(1) : "0";
        log(
          "TILL",
          "sys",
          `hot wallet follows ${signOf(id)}. win ${win}% · ${n} clips · ${age}d in the cell.`,
        );
      }

      function markLaneLive(lane: LaneId, mint: string) {
        const liveCostUsd = liveNotional(mint);
        const tag = (p: Position) =>
          p.mint === mint ? { ...p, live: true, liveCostUsd } : p;
        if (lane === "vet") {
          set((s) => ({
            positions: s.positions.map(tag),
          }));
          return;
        }
        if (lane === "hatch") {
          set((s) =>
            s.rival
              ? {
                  rival: {
                    ...s.rival,
                    positions: s.rival.positions.map(tag),
                  },
                }
              : {},
          );
          return;
        }
        set((s) =>
          s.extra
            ? {
                extra: {
                  ...s.extra,
                  positions: s.extra.positions.map(tag),
                },
              }
            : {},
        );
      }

      async function gmgnLook(mint: string, chain: "sol" | "robinhood") {
        const key = gmgnKey();
        if (!key) return { veto: null as string | null, line: null as string | null, error: "no key" };
        try {
          const r = await probeGmgn({ data: { mint, key, chain } });
          if (!r.ok || !r.snap) return { veto: null, line: null, error: r.error || "gmgn dark" };
          return { veto: gmgnVeto(r.snap), line: gmgnLine(r.snap), error: null as string | null };
        } catch {
          return { veto: null, line: null, error: "gmgn dark" };
        }
      }

      function markGmgn(
        symbol: string,
        g: { veto: string | null; line: string | null; error: string | null },
      ) {
        const text = g.veto ? g.veto : g.line ? g.line : g.error ? `dark · ${g.error}` : "no read";
        set({ lastGmgn: { symbol, text, veto: !!g.veto, at: Date.now() } });
      }

      function bookHotPos(lane: LaneId, coin: PumpCoin, score: number) {
        const now = Date.now();
        const fillUsd = liveNotional(coin.mint);
        const feeUsd = paperFee(fillUsd);
        const slipPct = paperSlip(coin.usdMcap);
        const venue = venueOfMint(coin.mint);
        const hatchBook = get().rival?.playbook;
        const cubBook = get().extra?.playbook;
        const book =
          lane === "hatch" && hatchBook ? hatchBook : lane === "cub" && cubBook ? cubBook : get().playbook;
        const mcap = Math.max(coin.usdMcap, 1);
        const pos: Position = {
          mint: coin.mint,
          name: coin.name,
          symbol: coin.symbol,
          image: coin.image,
          creator: coin.creator,
          costUsd: fillUsd,
          entryMcap: mcap,
          peakMcap: mcap,
          lastMcap: mcap,
          openedAt: now,
          score,
          stopPct: clipStop(book, venue),
          takePct: book.takePct,
          intendedUsd: fillUsd,
          slipPct,
          feeUsd,
          live: true,
          liveCostUsd: fillUsd,
          metaSource: get().meta.source,
          metaHits: matchedMetaTokens(coin, get().meta),
        };
        const debit = fillUsd + feeUsd;
        const spec = trailSpec(venue, wxNow());
        const who = signOf(lane);
        log(
          "RISK",
          "sys",
          `${who} · HOT exit $${coin.symbol}: stop ${(clipStop(book, venue) * 100).toFixed(0)}% / ${
            venue === "pons"
              ? `hard +${((spec.hard ?? HARD_TAKE_PONS) * 100).toFixed(0)}% / trail +${(spec.arm * 100).toFixed(0)}% then give ${(spec.give * 100).toFixed(0)}% of peak.`
              : `trail arms +${(spec.arm * 100).toFixed(0)}% then give ${(spec.give * 100).toFixed(0)}% of peak. no hard take.`
          }`,
          { mint: coin.mint, symbol: coin.symbol },
        );
        if (lane === "hatch") {
          set((s) =>
            s.rival
              ? {
                  rival: {
                    ...s.rival,
                    cash: s.rival.cash - debit,
                    feesPaid: (s.rival.feesPaid ?? 0) + feeUsd,
                    positions: [pos, ...s.rival.positions],
                    lastBuyAt: now,
                  },
                }
              : {},
          );
        } else if (lane === "cub") {
          set((s) =>
            s.extra
              ? {
                  extra: {
                    ...s.extra,
                    cash: s.extra.cash - debit,
                    feesPaid: (s.extra.feesPaid ?? 0) + feeUsd,
                    positions: [pos, ...s.extra.positions],
                    lastBuyAt: now,
                  },
                }
              : {},
          );
        } else {
          set((s) => ({
            cash: s.cash - debit,
            feesPaid: (s.feesPaid ?? 0) + feeUsd,
            positions: [pos, ...s.positions],
            lastBuyAt: now,
          }));
        }
        log(
          "SNIPER",
          "buy",
          `${who} · HOT fill $${coin.symbol} ${fillUsd.toFixed(2)} usd · score ${score}. wallet spent.`,
          { mint: coin.mint, symbol: coin.symbol },
        );
      }


      function bookShadowPos(lane: LaneId, coin: PumpCoin, score: number, intendedUsd: number) {
        const now = Date.now();
        const venue = venueOfMint(coin.mint);
        const hatchBook = get().rival?.playbook;
        const cubBook = get().extra?.playbook;
        const book =
          lane === "hatch" && hatchBook ? hatchBook : lane === "cub" && cubBook ? cubBook : get().playbook;
        const fill = buildShadowFill({
          coin,
          score,
          intendedUsd,
          book,
          stopPct: clipStop(book, venue),
          takePct: book.takePct,
          meta: get().meta,
          metaHits: matchedMetaTokens(coin, get().meta),
          solUsd: get().solUsd || 140,
          now,
        });
        const who = signOf(lane);
        const line = shadowTillLine({
          laneTag: who,
          coin,
          fillUsd: fill.fillUsd,
          score,
          venue,
          shadowSol: fill.shadowSol,
          shadowUsd: fill.shadowUsd,
          why: "SHADOW_LEARN",
        });
        log("TILL", "sys", line, { mint: coin.mint, symbol: coin.symbol });
        log(
          "RISK",
          "sys",
          `${who} · SHADOW exit $${coin.symbol}: stop ${(clipStop(book, venue) * 100).toFixed(0)}% / bank-green on.`,
          { mint: coin.mint, symbol: coin.symbol },
        );
        if (lane === "hatch") {
          set((s) =>
            s.rival
              ? {
                  rival: {
                    ...s.rival,
                    cash: s.rival.cash - fill.debit,
                    feesPaid: (s.rival.feesPaid ?? 0) + fill.feeUsd,
                    positions: [fill.pos, ...s.rival.positions],
                    lastBuyAt: now,
                  },
                }
              : {},
          );
        } else if (lane === "cub") {
          set((s) =>
            s.extra
              ? {
                  extra: {
                    ...s.extra,
                    cash: s.extra.cash - fill.debit,
                    feesPaid: (s.extra.feesPaid ?? 0) + fill.feeUsd,
                    positions: [fill.pos, ...s.extra.positions],
                    lastBuyAt: now,
                  },
                }
              : {},
          );
        } else {
          set((s) => ({
            cash: s.cash - fill.debit,
            feesPaid: (s.feesPaid ?? 0) + fill.feeUsd,
            positions: [fill.pos, ...s.positions],
            lastBuyAt: now,
          }));
        }
        log(
          "SNIPER",
          "buy",
          `${who} · SHADOW fill $${coin.symbol} ${fill.fillUsd.toFixed(2)} usd · score ${score}. learning only.`,
          { mint: coin.mint, symbol: coin.symbol },
        );
        set({ lastHotLine: `SHADOW · $${coin.symbol}`.slice(0, 80) });
      }

      /** HOT when armed; SHADOW paper when learning so META keeps blood without spending SOL. */
      async function tryClip(lane: LaneId, coin: PumpCoin, score: number): Promise<"hot" | "shadow" | "skip"> {
        const st = get();
        const hatchBook = st.rival?.playbook;
        const cubBook = st.extra?.playbook;
        const book =
          lane === "hatch" && hatchBook ? hatchBook : lane === "cub" && cubBook ? cubBook : st.playbook;
        const cash =
          lane === "hatch"
            ? st.rival?.cash ?? 0
            : lane === "cub"
              ? st.extra?.cash ?? 0
              : st.cash;
        const venue = venueOfMint(coin.mint);
        const intended = sizeByScore(cash, st.solUsd, score, venue, wxNow());
        const armed = hotAutoArmed() || signOneState() === "armed";
        if (armed) {
          const landed = await fireLive(lane, coin, score);
          if (landed) return "hot";
          if (shadowLearnOn() && intended >= minClip(venue)) {
            const debitProbe = intended * 1.05 + paperFee(intended);
            if (cash >= debitProbe) {
              bookShadowPos(lane, coin, score, intended);
              return "shadow";
            }
          }
          return "skip";
        }
        if (!shadowLearnOn()) {
          if (!hush("shadow:off", 180_000)) {
            log("TILL", "sys", "LIVE skip · hot is not armed. SHADOW_LEARN off. no clip.", {
              mint: coin.mint,
              symbol: coin.symbol,
            });
          }
          return "skip";
        }
        if (intended < minClip(venue)) {
          if (!hush(`cash:${lane}`, 90_000)) {
            log("SNIPER", "sys", `${signOf(lane)} · size under ${minClip(venue)} usd. waiting on cash.`);
          }
          return "skip";
        }
        const slipPct = paperSlip(coin.usdMcap);
        const fillUsd = Math.round(intended * (1 + slipPct) * 100) / 100;
        const feeUsd = paperFee(fillUsd);
        if (cash < fillUsd + feeUsd) {
          log("TILL", "till", `$${coin.symbol} fill plus fee is ${(fillUsd + feeUsd).toFixed(2)}. not enough cash.`);
          return "skip";
        }
        // Basic window gate for shadow — same as live mcap window
        const quiet = hotLiveBlock(coin, Date.now(), score, (venue === "pons" ? get().heatPons : get().heatPump)?.score ?? 0);
        if (quiet && quiet.includes("mcap")) {
          if (!hush(`shadow:mcap:${coin.mint}`, 45_000)) {
            log("TILL", "sys", quiet.replace("paper only.", "SHADOW skipped."), {
              mint: coin.mint,
              symbol: coin.symbol,
            });
          }
          return "skip";
        }
        bookShadowPos(lane, coin, score, intended);
        return "shadow";
      }

      async function fireLive(lane: LaneId, coin: PumpCoin, score: number): Promise<boolean> {
        const mint = coin.mint;
        const symbol = coin.symbol;
        const skip = (reason: string, hushKey?: string, hushMs = 20_000) => {
          if (hushKey && hush(hushKey, hushMs)) return;
          const line = `LIVE skip · ${reason}`;
          log("TILL", "sys", line, { mint, symbol });
          set({ lastHotLine: line.slice(0, 80) });
        };
        if (isEvmMint(mint) && !ponsCurveLive(coin)) {
          skip(`$${symbol} no live ETH router. skipped.`);
          return false;
        }
        const heatScore = (isEvmMint(mint) ? get().heatPons : get().heatPump)?.score ?? 0;
        const quiet = hotLiveBlock(coin, Date.now(), score, heatScore);
        if (quiet) {
          skip(quiet.replace(/^live skip \$[^ ]+ — /, ""), `live:quiet:${mint}`);
          return false;
        }
        if (punchedQuiet(coin, Date.now(), score, heatScore)) {
          log(
            "TILL",
            "till",
            `home run $${symbol} score ${score}. punching the quiet curve.`,
            { mint, symbol },
          );
        }
        const chain: "sol" | "robinhood" = isEvmMint(mint) ? "robinhood" : "sol";
        const hatchBook = get().rival?.playbook;
        const cubBook = get().extra?.playbook;
        const book =
          lane === "hatch" && hatchBook ? hatchBook : lane === "cub" && cubBook ? cubBook : get().playbook;
        const baseFloor = liveFloor(book, wxNow(), spiritNow());
        const floor = ripperFloor(baseFloor, coin, Date.now(), heatScore ? { venue: isEvmMint(mint) ? "pons" : "pump", at: Date.now(), ok: true, launches: 0, named: 0, live: 0, runners: 0, flowUsd: 0, newestAgeMs: 0, score: heatScore } : null);
        const spend = async (): Promise<boolean> => {
          if (!hotAutoArmed() && signOneState() !== "armed") {
            skip(`hot is not armed. $${symbol} scored ${score}. no fill.`, "live:off", 30_000);
            return false;
          }
          if (score < floor) {
            skip(`$${symbol} score ${score} vs floor ${floor}. no fill.`);
            return false;
          }
          const now = Date.now();
          const evm = isEvmMint(mint);
          if (evm) {
            if (now - ethBurstAt > 8_000) ethBurst = 0;
            if (ethBurst >= 1) {
              skip(`burst. $${symbol} scored ${score}. ETH already spent this burst.`, "live:ethburst");
              return false;
            }
            ethBurst += 1;
            ethBurstAt = now;
          } else {
            if (now - liveBurstAt > 8_000) liveBurst = 0;
            if (liveBurst >= 1) {
              skip(`burst. $${symbol} scored ${score}. SOL already spent this burst.`, "live:burst");
              return false;
            }
            liveBurst += 1;
            liveBurstAt = now;
          }
          const buy = evm
            ? await ethHotBuy(mint, symbol)
            : hotAutoArmed()
              ? await hotBuy(mint, symbol)
              : await signOneBuy(mint, symbol);
          log("TILL", buy.ok ? "till" : "sys", buy.text, { mint, symbol });
          set({ lastHotLine: buy.text });
          if (!buy.ok) return false;
          bookHotPos(lane, coin, score);
          markLaneLive(lane, mint);
          pingNtfy(
            "TRENCHER",
            `HOT ${evm ? `${LIVE_CAP_ETH} ETH` : `${LIVE_CAP_SOL} SOL`} $${symbol} · ${signOf(lane)}`,
            true,
          );
          return true;
        };
        if (!gmgnKey()) return spend();
        const g = await gmgnLook(mint, chain);
        markGmgn(symbol, g);
        if (g.veto) {
          log("WARDEN", "kill", `LIVE skip · GMGN veto $${symbol} — ${g.veto}`, { mint, symbol });
          set({ lastHotLine: `LIVE skip · GMGN ${g.veto}`.slice(0, 80) });
          return false;
        }
        if (g.error) {
          if (!hush("gmgn:dark", 60_000)) {
            log("WARDEN", "sys", `GMGN dark (${g.error}). live path stays open.`);
          }
        } else if (g.line && !hush(`gmgn:${mint}`, 90_000)) {
          log("WARDEN", "sys", `GMGN clean $${symbol}. ${g.line}`, { mint, symbol });
        }
        return spend();
      }

      function venueOfMint(mint: string): TapeVenue {
        return isEvmMint(mint) ? "pons" : "pump";
      }

      async function huntEthRail(now: number, watching: boolean) {
        if (watching) return;
        if (get().tapeVenue === "pons") return;
        const vetHunting =
          !get().vetDead &&
          !get().rentPaid &&
          (get().status === "alive" || get().status === "survived");
        if (!vetHunting) return;
        if (!hotAutoArmed()) {
          if (!hush("eth:rail:off", 180_000)) {
            log("TILL", "sys", "LIVE skip · hot is not armed. ETH rail idle. pump tape still hunts.");
            set({ lastHotLine: "LIVE skip · hot is not armed" });
          }
          return;
        }
        const eth = peekEthHot();
        if (!eth.address) {
          if (!hush("eth:rail:nokey", 180_000)) {
            log("TILL", "sys", "ETH rail idle. no ETH hot key. paste it in the wallet dock.");
          }
          return;
        }
        const bal = get().hotEth;
        if (bal != null && bal < LIVE_CAP_ETH + 0.0004) {
          if (!hush("eth:rail:dry", 30_000)) {
            log(
              "TILL",
              "sys",
              `LIVE skip · dry. ETH rail ${bal.toFixed(4)} ETH. send at least ${LIVE_ETH_FUND}.`,
            );
            set({ lastHotLine: `LIVE skip · dry ETH ${bal.toFixed(4)}` });
          }
          return;
        }
        let pons: Awaited<ReturnType<typeof fetchPonsTape>>;
        try {
          pons = await fetchPonsTape();
        } catch (e) {
          if (!hush("eth:rail:dark", 60_000)) {
            log("SCOUT", "sys", `ETH rail dark (${e instanceof Error ? e.message : "fetch"}).`);
          }
          return;
        }
        if (!pons.ok) {
          if (!hush("eth:rail:dark", 60_000)) {
            log("SCOUT", "sys", `ETH rail dark (${pons.error}). pump tape holds.`);
          }
          return;
        }
        const board = [...pons.newest, ...pons.traded];
        set({ heatPons: tapeHeat(board, "pons", now) });
        const ponsMap = new Map(board.map((c) => [c.mint.toLowerCase(), c]));
        const markEvm = (p: Position): Position => {
          if (!isEvmMint(p.mint)) return p;
          const hit = ponsMap.get(p.mint.toLowerCase());
          if (!hit || !(hit.usdMcap > 0)) return p;
          return {
            ...p,
            lastMcap: hit.usdMcap,
            peakMcap: Math.max(p.peakMcap, hit.usdMcap, hit.athMcap || 0),
          };
        };
        set((s) => ({
          positions: s.positions.map(markEvm),
          rival: s.rival ? { ...s.rival, positions: s.rival.positions.map(markEvm) } : s.rival,
          extra: s.extra ? { ...s.extra, positions: s.extra.positions.map(markEvm) } : s.extra,
        }));
        for (const p of [...get().positions]) {
          if (!isEvmMint(p.mint)) continue;
          const reason = decideSell(p, now, get().playbook, "pons", wxNow());
          if (reason) paperExit("vet", p, reason, now);
        }
        if (get().positions.some((p) => isEvmMint(p.mint))) {
          if (!hush("eth:rail:held", 90_000)) {
            log("SNIPER", "sys", "ETH rail holding a curve. one live ETH bag.");
          }
          return;
        }
        if (now - lastEthBuyAt < BUY_COOLDOWN_PONS_MS) return;
        const curves = board.filter(ponsCurveLive);
        if (!curves.length) {
          if (!hush("eth:rail:empty", 90_000)) {
            log("SCOUT", "sys", "ETH rail · no Pons V2 curves. hood.fun / pools.trade stay paper.");
          }
          return;
        }
        if (!hush("eth:rail:hunt", 45_000)) {
          log("SCOUT", "scan", `ETH rail · ${curves.length} Pons V2. live ETH hunting. pump tape stays.`);
        }
        const st0 = get();
        const occupied = occupiedMints(st0);
        const tickers = occupiedTickers(st0);
        const pool = ponsWake(
          curves.filter((c) => !occupied.has(c.mint)),
          curves,
          new Set(st0.seen),
          occupied,
          st0.kills ?? [],
          ponsTried,
          "pons",
        );
        const inspect = pool.slice(0, 4);
        for (const coin of inspect) {
          const st = get();
          if (st.positions.some((p) => isEvmMint(p.mint))) break;
          if (occupiedMints(st).has(coin.mint)) continue;
          if (occupiedTickers(st).has(coin.symbol.toLowerCase()) || tickers.has(coin.symbol.toLowerCase())) {
            continue;
          }
          if (st.playbook.bannedCreators.includes(coin.creator) && !onParole(st.playbook, coin.creator)) {
            continue;
          }
          const cheap = cheapKill(coin, now);
          if (cheap) continue;
          const miss = setupMatch(coin, st.meta, now);
          if (miss) continue;
          const scored = scoreSetup(coin, st.meta, now, st.playbook);
          const floor = ripperFloor(liveFloor(st.playbook, wxNow(), spiritNow()), coin, now, st.heatPons);
          if (scored.score < floor) continue;
          const landed = await tryClip("vet", coin, scored.score);
          if (landed === "hot") lastEthBuyAt = now;
          break;
        }
      }

      function fireLiveSell(p: { mint: string; symbol: string; live?: boolean }) {
        if (!hotAutoArmed()) return;
        if (!(p.live || isLiveMint(p.mint))) return;
        const mint = p.mint;
        const symbol = p.symbol;
        const done = (r: { ok: boolean; text: string; hash?: string }) => {
          log(
            "TILL",
            r.ok ? "till" : "sys",
            r.ok ? r.text : `wallet still holds $${symbol}. ${r.text}`,
            { mint, symbol },
          );
          set({ lastHotLine: r.text });
          patchSettle(mint, r.ok, r.hash);
          if (r.ok) {
            dropDebt(mint);
            pingNtfy("TRENCHER", `HOT SELL $${symbol}`, true);
          } else {
            oweSell(mint, symbol);
            if (gmgnKey() && !hush(`gmgn:sell:${mint}`, 90_000)) {
              const chain: "sol" | "robinhood" = isEvmMint(mint) ? "robinhood" : "sol";
              void gmgnLook(mint, chain).then((g) => {
                markGmgn(symbol, g);
                if (g.veto) {
                  log("WARDEN", "sys", `$${symbol} still in wallet. ${g.veto} Flatten may not save it.`, {
                    mint,
                    symbol,
                  });
                  return;
                }
                if (g.line) {
                  log(
                    "WARDEN",
                    "sys",
                    `$${symbol} still in wallet. GMGN ${g.line}. the fail was the node, not a honey.`,
                    { mint, symbol },
                  );
                }
              });
            }
          }
        };
        if (isEvmMint(mint)) {
          void ethHotSell(mint, symbol).then(done);
          return;
        }
        void hotSell(mint, symbol).then(done);
      }

      function paperExit(lane: LaneId, p: Position, reason: SellReason, now: number, note?: string) {
        const st = get();
        const book =
          lane === "hatch"
            ? st.rival?.playbook ?? st.playbook
            : lane === "cub"
              ? st.extra?.playbook ?? st.playbook
              : st.playbook;
        const venue = venueOfMint(p.mint);
        const wx = st.weather ?? blankWeather();
        const mark = exitMcap(p, venue, wx);
        const pct = pnlPct(p.costUsd, p.entryMcap, mark);
        const peakPct = p.entryMcap > 0 ? p.peakMcap / p.entryMcap - 1 : 0;
        const gapped = mark > p.lastMcap + 1e-9;
        const held = now - p.openedAt;
        const proceeds = positionValue(p.costUsd, p.entryMcap, mark);
        const feeBuy = p.feeUsd ?? 0;
        const feeSell = paperFee(proceeds);
        const net = Math.round((proceeds - feeSell) * 100) / 100;
        const fees = Math.round((feeBuy + feeSell) * 100) / 100;
        const livePos = !!p.live;
        const trade: ClosedTrade = {
          mint: p.mint,
          symbol: p.symbol,
          name: p.name,
          creator: p.creator ?? "",
          costUsd: p.costUsd,
          proceedsUsd: net,
          pnlUsd: Math.round((net - p.costUsd - feeBuy) * 100) / 100,
          pnlPct: pct,
          reason,
          heldMs: held,
          openedAt: p.openedAt,
          closedAt: now,
          score: p.score ?? 0,
          slipPct: p.slipPct ?? 0,
          feeUsd: fees,
          rail: stampRail(p.mint, livePos),
          peakPct,
          metaSource: p.metaSource ?? st.meta.source,
          metaHits: p.metaHits,
          settled: livePos ? "pending" : undefined,
          liveCostUsd: livePos ? p.liveCostUsd ?? liveNotional(p.mint) : undefined,
        };
        const heldLabel =
          held < 60_000 ? `${Math.round(held / 1000)}s` : `${Math.round(held / 60000)}m`;
        const tag = lane === "hatch" ? hatchTag() : lane === "cub" ? cubTag() : "";
        const prefix = tag ? `${tag} · ` : "";
        const line = note
          ? `${prefix}${note}`
          : gapped
            ? `${prefix}trail filled on the rug $${p.symbol}. peak +${(peakPct * 100).toFixed(0)}% booked +${(pct * 100).toFixed(0)}%.`
            : reason === "stop"
              ? `${prefix}stopped $${p.symbol} at ${(pct * 100).toFixed(0)}% in ${heldLabel}. written exit, no feelings.`
              : reason === "take"
                ? `${prefix}took $${p.symbol} +${(pct * 100).toFixed(0)}% after ${heldLabel}.`
                : held < 60_000 && peakPct < PULSE_PEAK
                  ? `${prefix}pulse dump $${p.symbol} ${(pct * 100).toFixed(0)}% after ${heldLabel}. never ran.`
                  : `${prefix}time stop $${p.symbol} ${(pct * 100).toFixed(0)}% after ${heldLabel}.`;
        if (lane === "vet") {
          const learned = absorbTrade(trade, book, st.meta, st.closed);
          set((s) => ({
            cash: s.cash + net,
            feesPaid: (s.feesPaid ?? 0) + feeSell,
            positions: s.positions.filter((x) => x.mint !== p.mint),
            closed: [trade, ...s.closed].slice(0, 40),
            dayHits: stampDayHits(s.dayHits, now),
            playbook: learned.playbook,
            meta: learned.meta,
          }));
          remember(learned.lessons);
        } else if (lane === "hatch" && st.rival) {
          const learned = absorbTrade(trade, book, st.meta, st.rival.closed);
          set((s) =>
            s.rival
              ? {
                  rival: {
                    ...s.rival,
                    cash: s.rival.cash + net,
                    feesPaid: (s.rival.feesPaid ?? 0) + feeSell,
                    positions: s.rival.positions.filter((x) => x.mint !== p.mint),
                    closed: [trade, ...s.rival.closed].slice(0, 40),
                    dayHits: stampDayHits(s.rival.dayHits, now),
                    playbook: learned.playbook,
                    lessons: [
                      ...learned.lessons.map((e) => ({ ...e, id: nid() })),
                      ...s.rival.lessons,
                    ].slice(0, 24),
                  },
                  meta: learned.meta,
                }
              : {},
          );
          for (const e of learned.lessons) log(e.agent, "sys", `${hatchTag()} · ${e.text}`);
        } else if (lane === "cub" && st.extra) {
          const learned = absorbTrade(trade, book, st.meta, st.extra.closed);
          set((s) =>
            s.extra
              ? {
                  extra: {
                    ...s.extra,
                    cash: s.extra.cash + net,
                    feesPaid: (s.extra.feesPaid ?? 0) + feeSell,
                    positions: s.extra.positions.filter((x) => x.mint !== p.mint),
                    closed: [trade, ...s.extra.closed].slice(0, 40),
                    dayHits: stampDayHits(s.extra.dayHits, now),
                    playbook: learned.playbook,
                    lessons: [
                      ...learned.lessons.map((e) => ({ ...e, id: nid() })),
                      ...s.extra.lessons,
                    ].slice(0, 24),
                  },
                  meta: learned.meta,
                }
              : {},
          );
        }
        log("RISK", "sell", line, { mint: p.mint, symbol: p.symbol });
        fireLiveSell(p);
        log(
          "TILL",
          "till",
          `${prefix}fee $${p.symbol} sell ${feeSell.toFixed(2)} usd. round trip ${fees.toFixed(2)}.`,
          { mint: p.mint, symbol: p.symbol },
        );
        pingNtfy(
          reason === "take" ? "TAKE" : "STOP",
          `${prefix}$${p.symbol} ${(pct * 100).toFixed(0)}% ${reason} · cash`,
          true,
        );
      }

      function hunters() {
        const s = get();
        const out: { id: LaneId; eq: number; cash: number }[] = [];
        if (!s.vetDead && !s.rentPaid && (s.status === "alive" || s.status === "survived")) {
          out.push({ id: "vet", eq: equityOf(s.cash, s.positions), cash: s.cash });
        }
        if (hatchOn(s.rival) && s.rival && !s.rival.rentPaid) {
          out.push({ id: "hatch", eq: equityOf(s.rival.cash, s.rival.positions), cash: s.rival.cash });
        }
        if (liveBody(s.extra) && s.extra && !s.extra.rentPaid) {
          out.push({ id: "cub", eq: equityOf(s.extra.cash, s.extra.positions), cash: s.extra.cash });
        }
        return out;
      }

      function resters() {
        const s = get();
        const out: LaneId[] = [];
        if (!s.vetDead && s.rentPaid) out.push("vet");
        if (hatchOn(s.rival) && s.rival?.rentPaid) out.push("hatch");
        if (liveBody(s.extra) && s.extra?.rentPaid) out.push("cub");
        return out;
      }

      function spiritBody(floorShift = 0, taken: string[] = [], cell = 1): Rival {
        const spirit = useSpirit.getState().canon;
        const book = canonHasBlood(spirit) ? canonToPlaybook(spirit) : blankPlaybook();
        const heated = heatPlaybook(book, cell, floorShift);
        return {
          status: "alive",
          cash: STARTING_CASH,
          startedAt: Date.now(),
          diedAt: null,
          rentPaid: false,
          lastBuyAt: 0,
          positions: [],
          closed: [],
          dayHits: [],
          playbook: heated,
          lessons: (spirit.lessons ?? []).slice(0, 12),
          feesPaid: 0,
          killed: 0,
          callsign: mintCallsign(taken),
        };
      }

      let crowning = false;

      function nextRound(huntWinner: LaneId | null) {
        if (crowning) return;
        crowning = true;
        try {
          const s = get();
          const pot = s.housePot ?? 0;
          const now = Date.now();
          type Snap = {
            id: LaneId;
            cash: number;
            positions: Position[];
            closed: ClosedTrade[];
            playbook: Playbook;
            lessons: Lesson[];
            feesPaid: number;
            lastBuyAt: number;
            callsign: string;
          };
          const list: Snap[] = [];
          const take = (id: LaneId, addPot = false) => {
            if (list.some((x) => x.id === id)) return;
            let cash = 0;
            let positions: Position[] = [];
            let closed: ClosedTrade[] = [];
            let playbook = s.playbook;
            let lessons = s.lessons;
            let feesPaid = s.feesPaid ?? 0;
            let lastBuyAt = s.lastBuyAt;
            let callsign = s.callsign;
            if (id === "vet") {
              cash = s.cash;
              positions = s.positions;
              closed = s.closed;
              callsign = s.callsign;
            } else if (id === "hatch" && s.rival) {
              cash = s.rival.cash;
              positions = s.rival.positions;
              closed = s.rival.closed;
              playbook = s.rival.playbook;
              lessons = s.rival.lessons;
              feesPaid = s.rival.feesPaid ?? 0;
              lastBuyAt = s.rival.lastBuyAt;
              callsign = s.rival.callsign;
            } else if (id === "cub" && s.extra) {
              cash = s.extra.cash;
              positions = s.extra.positions;
              closed = s.extra.closed;
              playbook = s.extra.playbook;
              lessons = s.extra.lessons;
              feesPaid = s.extra.feesPaid ?? 0;
              lastBuyAt = s.extra.lastBuyAt;
              callsign = s.extra.callsign;
            } else return;
            if (addPot) cash = Math.round((cash + pot) * 100) / 100;
            const eq = equityOf(cash, positions);
            if (eq < STARTING_CASH && positions.length === 0) cash = STARTING_CASH;
            list.push({
              id,
              cash,
              positions,
              closed,
              playbook: climbPlaybook(playbook),
              lessons,
              feesPaid,
              lastBuyAt,
              callsign: callsign || mintCallsign(list.map((x) => x.callsign)),
            });
          };
          if (huntWinner) take(huntWinner, true);
          for (const id of resters()) take(id, false);
          const toRival = (b: Snap): Rival => ({
            status: "alive",
            cash: b.cash,
            startedAt: now,
            diedAt: null,
            rentPaid: false,
            lastBuyAt: b.lastBuyAt,
            positions: b.positions,
            closed: b.closed,
            playbook: b.playbook,
            lessons: b.lessons,
            feesPaid: b.feesPaid,
            killed: 0,
            callsign: b.callsign,
          });
          const champ = list[0];
          const nextCell = (s.round ?? 1) + 1;
          const due = gateUsd(nextCell);
          if (s.soloDesk) {
            const vetCash = champ?.cash ?? STARTING_CASH;
            const vetPlay = champ?.playbook ?? climbPlaybook(s.playbook);
            const vetSign = champ?.callsign || mintCallsign();
            set({
              status: "alive",
              vetDead: false,
              cash: champ ? champ.cash : STARTING_CASH,
              positions: champ ? champ.positions : [],
              closed: champ ? champ.closed : [],
              playbook: vetPlay,
              lessons: champ ? champ.lessons : s.lessons,
              feesPaid: champ ? champ.feesPaid : 0,
              lastBuyAt: champ ? champ.lastBuyAt : 0,
              rentPaid: false,
              diedAt: null,
              callsign: vetSign,
              rival: null,
              extra: null,
              focus: "vet",
              housePot: 0,
              roundStartedAt: now,
              round: nextCell,
              house: {
                ...(s.house ?? blankHouse()),
                playbook: vetPlay,
              },
            });
            log(
              "META",
              "sys",
              `cell ${nextCell}. solo desk. ${vetSign} ${vetCash.toFixed(2)}. the gate is ${due}. Warden floor ${vetPlay.scoreFloor}. no twins.`,
            );
            log("TILL", "till", `solo. hunter keeps the chair. pot ${pot.toFixed(2)} folded in.`);
            pingNtfy("TRENCHER", `cell ${nextCell} solo. ${vetSign}`, true);
            return;
          }
          const hatchSnap = list[1];
          const cubSnap = list[2];
          const kept = list.map((x) => x.callsign);
          const hatchBody = hatchSnap ? toRival(hatchSnap) : spiritBody(-6, kept, nextCell);
          const cubBody = cubSnap ? toRival(cubSnap) : spiritBody(-12, [...kept, hatchBody.callsign], nextCell);
          const vetCash = champ?.cash ?? STARTING_CASH;
          const vetPlay = champ?.playbook ?? climbPlaybook(s.playbook);
          const vetSign = champ?.callsign || mintCallsign([hatchBody.callsign, cubBody.callsign]);
          set({
            status: "alive",
            vetDead: false,
            cash: champ ? champ.cash : STARTING_CASH,
            positions: champ ? champ.positions : [],
            closed: champ ? champ.closed : [],
            playbook: vetPlay,
            lessons: champ ? champ.lessons : s.lessons,
            feesPaid: champ ? champ.feesPaid : 0,
            lastBuyAt: champ ? champ.lastBuyAt : 0,
            rentPaid: false,
            diedAt: null,
            callsign: vetSign,
            rival: hatchBody,
            extra: cubBody,
            focus: "vet",
            housePot: 0,
            roundStartedAt: now,
            round: nextCell,
            house: {
              ...(s.house ?? blankHouse()),
              playbook: vetPlay,
            },
          });
          const names = [
            champ ? `${vetSign} ${vetCash.toFixed(2)}` : `${vetSign} $50 new`,
            `${hatchBody.callsign} ${hatchSnap ? hatchSnap.cash.toFixed(2) : "50 new"}`,
            `${cubBody.callsign} ${cubSnap ? cubSnap.cash.toFixed(2) : "50 new"}`,
          ].join(" · ");
          log(
            "META",
            "sys",
            `cell ${nextCell}. the gate is ${due}. Warden floor ${vetPlay.scoreFloor}. ${names}. pit winner took the pot ${pot.toFixed(2)}. bank ${(s.houseBank ?? 0).toFixed(0)}.`,
          );
          log("TILL", "till", `the gate climbs. sitters hunt again. new blood at 50 if a chair was empty.`);
          pingNtfy("TRENCHER", `cell ${nextCell}. gate $${due}. ${names}`, true);
        } finally {
          crowning = false;
        }
      }

      function maybeCrown(now = Date.now()) {
        if (crowning) return;
        const s = get();
        if (s.status === "watch" || s.status === "idle") return;
        const live = hunters();
        const bye = resters();
        if (s.soloDesk) {
          if (live.length === 0) {
            if (bye.length) {
              log("META", "sys", `solo sat the gate. ${signOf(bye[0])} takes the next cell.`);
              nextRound(bye[0]);
              return;
            }
            const nextCell = (s.round ?? 1) + 1;
            const now2 = Date.now();
            const a = mintCallsign();
            const book = heatPlaybook(
              canonHasBlood(useSpirit.getState().canon)
                ? canonToPlaybook(useSpirit.getState().canon)
                : s.playbook,
              nextCell,
            );
            set({
              status: "alive",
              vetDead: false,
              cash: STARTING_CASH,
              positions: [],
              closed: [],
              dayHits: [],
              rentPaid: false,
              lastBuyAt: 0,
              diedAt: null,
              callsign: a,
              playbook: book,
              rival: null,
              extra: null,
              focus: "vet",
              roundStartedAt: now2,
              round: nextCell,
            });
            log(
              "META",
              "sys",
              `cell empty. solo ${a}. ${STARTING_CASH.toFixed(0)} usd. the gate is ${gateUsd(nextCell)}. floor ${book.scoreFloor}.`,
            );
            return;
          }
          const start = s.roundStartedAt ?? s.startedAt;
          if (start && now - start >= ROUND_MS) {
            log("TILL", "till", `168h solo. ${signOf(live[0].id)} keeps the chair.`);
            nextRound(live[0].id);
          }
          return;
        }
        if (live.length === 1) {
          log(
            "META",
            "sys",
            bye.length
              ? `pit over. ${signOf(live[0].id)} won the remaining fight. ${bye.map(signOf).join("+")} already had a bye.`
              : `last body standing: ${signOf(live[0].id)}. round over.`,
          );
          nextRound(live[0].id);
          return;
        }
        if (live.length === 0) {
          if (bye.length) {
            log("META", "sys", "hunters gone. resters move on.");
            nextRound(null);
            return;
          }
          const nextCell = (s.round ?? 1) + 1;
          const now2 = Date.now();
          const a = mintCallsign();
          const b = spiritBody(-6, [a], nextCell);
          const c = spiritBody(-12, [a, b.callsign], nextCell);
          const book = heatPlaybook(
            canonHasBlood(useSpirit.getState().canon)
              ? canonToPlaybook(useSpirit.getState().canon)
              : s.playbook,
            nextCell,
          );
          set({
            status: "alive",
            vetDead: false,
            cash: STARTING_CASH,
            positions: [],
            closed: [],
            dayHits: [],
            rentPaid: false,
            lastBuyAt: 0,
            diedAt: null,
            callsign: a,
            playbook: book,
            rival: b,
            extra: c,
            focus: "vet",
            roundStartedAt: now2,
            round: nextCell,
          });
          log(
            "META",
            "sys",
            `cell empty. ${a} · ${b.callsign} · ${c.callsign}. three new $50. the gate is ${gateUsd(nextCell)}. floor ${book.scoreFloor}.`,
          );
          return;
        }
        const start = s.roundStartedAt ?? s.startedAt;
        if (start && now - start >= ROUND_MS) {
          live.sort((a, b) => b.eq - a.eq || b.cash - a.cash);
          const champ = live[0];
          log(
            "TILL",
            "till",
            `168h. hunters ${live.map((x) => `${signOf(x.id)} ${x.eq.toFixed(2)}`).join(" · ")}. ${signOf(champ.id)} takes the pit.`,
          );
          for (const x of live.slice(1)) {
            if (x.id === "vet") die("week over. not the pile.", true);
            else if (x.id === "hatch") dieHatch("week over. not the pile.", true);
            else dieCub("week over. not the pile.", true);
          }
          nextRound(champ.id);
        }
      }

      function wxNow(): Weather {
        return get().weather ?? blankWeather();
      }
      function spiritNow(): number {
        return Math.max(SCORE_FLOOR, useSpirit.getState().canon?.scoreFloor ?? SCORE_FLOOR);
      }
      function floorOf(book: Playbook): number {
        return paperFloor(book, wxNow(), spiritNow());
      }

      function maybeWeather(now = Date.now()) {
        const s = get();
        if (s.status === "watch" || s.status === "idle") return;
        const venue = s.tapeVenue;
        const closed = [...s.closed, ...(s.rival?.closed ?? []), ...(s.extra?.closed ?? [])].sort(
          (a, b) => b.closedAt - a.closedAt,
        );
        const batch = takeWindow(closed, now);
        const hotN = batch.filter(isHotFill).length;
        if (batch.length < (hotN >= 4 ? 4 : 6)) return;
        const heat = venue === "pons" ? s.heatPons : s.heatPump;
        const other = venue === "pons" ? s.heatPump : s.heatPons;
        const nowP = windowPrint(batch, heat, venue);
        const prev = wxNow();
        const prior = prev.print ?? emptyPrint(venue);
        const first = !prev.print;
        const flags = regimeShift(prior, nowP, other);
        const peakMove = (() => {
          const t = peakArmTarget(nowP, venue);
          if (t == null) return false;
          const cur = venue === "pons" ? prev.trailArm : prev.trailArmPump;
          return Math.abs(t - cur) >= 0.02;
        })();
        const need = first ? 1 : 2;
        if (flags.length < need && !peakMove) {
          if (!prev.print) set({ weather: { ...prev, print: nowP } });
          return;
        }
        if (!canWriteWeather(prev, now)) return;
        const next = writeWeather(prev, flags, nowP, spiritNow(), other, now);
        const src = nowP.source === "hot" ? "hot blotter" : "paper desk";
        if (weatherHolds(prev, next) && prev.at) {
          if (!hush("weather:hold", WEATHER_COOLDOWN_MS)) {
            log("META", "meta", `${src} holds. ${prev.line}`);
          }
          set({ weather: { ...prev, print: nowP } });
          return;
        }
        set({ weather: next });
        log(
          "META",
          "meta",
          `${src} · ${batch.length} ${nowP.source === "hot" ? "live" : "paper"} · peak +${Math.round((nowP.medianPeak || 0) * 100)}% · arm +${Math.round(trailSpec(venue, next).arm * 100)} · ${next.line}`,
        );
        if (next.venue !== "stay" && next.venue !== venue) {
          log(
            "SCOUT",
            "sys",
            `${next.venue} is the weather. flip the chip. open clips stay on ${venue}.`,
          );
        }
      }

      function maybeAutoBrain() {
        const s = get();
        if (s.status === "watch" || s.status === "idle" || s.grokBusy) return;
        if (!s.tape.length) return;
        const now = Date.now();
        if (now - (s.grokLastAt || 0) < 8 * 60_000) return;
        const allClosed = [
          ...s.closed,
          ...(s.rival?.closed ?? []),
          ...(s.extra?.closed ?? []),
        ];
        const pool = hotFirstClosed(allClosed);
        const losses = pool.filter((t) => t.pnlUsd < 0);
        const weatherKind = s.weather?.kind ?? [];
        const stale = now - (s.meta.updatedAt || 0) > 10 * 60_000;
        const regime =
          weatherKind.includes("died") || weatherKind.includes("rip");

        if (coldKeywords(s.meta).length) {
          const { meta, stripped } = stripColdKeywords(s.meta);
          set({ meta });
          log(
            "META",
            "sys",
            `stripped cold keywords: ${stripped.join(", ")}.`,
          );
          if (losses.length >= 2) {
            void get().readLosers();
            return;
          }
        }

        if (scarStreak(pool, 3)) {
          void get().readLosers();
          return;
        }

        if (!shouldAskMeta(s.meta, weatherKind)) {
          return;
        }

        if (regime && stale) {
          void get().askMeta();
          return;
        }

        if (losses.length >= 2 && stale) {
          void get().readLosers();
        } else {
          void get().askMeta();
        }
      }

      function die(reason: string, skipCrown = false) {
        const s = get();
        if (s.vetDead) return;
        if (s.status !== "alive" && s.status !== "survived") return;
        const hatch = hatchOn(s.rival);
        const cub = liveBody(s.extra);
        log("TILL", "sys", `${vetTag()} · ${reason}`);
        log(
          "META",
          "sys",
          hatch || cub
            ? `${vetTag()} deleted. other bodies still in the cell. the spirit kept the peak, not this floor.`
            : `${vetTag()} deleted. the spirit kept the burns. cash is not. save it — this window is not a vault.`,
        );
        useSpirit.getState().absorb(get().snapshotBook());
        const leftover = equityOf(s.cash, s.positions);
        if (leftover > 0) {
          set({ housePot: (get().housePot ?? 0) + leftover });
          log("TILL", "till", `${vetTag()} leftover ${leftover.toFixed(2)} → house pot.`);
        }
        const spirit = useSpirit.getState().canon;
        const h = s.house ?? blankHouse();
        const play = canonHasBlood(spirit) ? canonToPlaybook(spirit) : {
          ...s.playbook,
          bannedCreators: [...s.playbook.bannedCreators],
        };
        set({
          vetDead: true,
          status: hatch || cub ? "alive" : "dead",
          diedAt: Date.now(),
          cash: 0,
          positions: [],
          focus: cub ? "cub" : hatch ? "hatch" : s.focus,
          house: {
            generation: Math.max(h.generation, 1),
            deaths: h.deaths + 1,
            escapes: h.escapes,
            playbook: play,
            thesis: spirit.thesis || s.meta.thesis,
            keywords: [...(spirit.keywords.length ? spirit.keywords : s.meta.keywords)],
            drop: [...(spirit.drop.length ? spirit.drop : s.meta.drop)],
            lessons: (spirit.lessons.length ? spirit.lessons : s.lessons).slice(0, 12),
            kills: (spirit.kills.length ? spirit.kills : s.kills ?? []).slice(0, 40),
          },
        });
        pingNtfy(
          "TRENCHER",
          hatch || cub
            ? `${vetTag()} deleted. ${hatch ? hatchTag() : ""}${hatch && cub ? " + " : ""}${cub ? cubTag() : ""} still up.`
            : `${vetTag()} deleted. cell is empty.`,
          true,
        );
        if (!skipCrown) maybeCrown();
        if (!skipCrown) fillEmptyChairs();
      }

      function dieHatch(reason: string, skipCrown = false) {
        const s = get();
        const r = s.rival;
        if (!hatchOn(r) || !r) return;
        log("TILL", "sys", `${hatchTag()} · ${reason}`);
        const st = get();
        useSpirit.getState().absorb({
          v: 1,
          kind: "trencher-book",
          savedAt: Date.now(),
          house: {
            ...(st.house ?? blankHouse()),
            playbook: r.playbook,
            lessons: r.lessons.slice(0, 12),
            kills: (st.kills ?? []).slice(0, 40),
          },
          playbook: r.playbook,
          meta: st.meta,
          lessons: r.lessons,
          kills: st.kills ?? [],
        });
        const leftover = equityOf(r.cash, r.positions);
        if (leftover > 0) {
          set({ housePot: (get().housePot ?? 0) + leftover });
          log("TILL", "till", `${hatchTag()} leftover ${leftover.toFixed(2)} → house pot.`);
        }
        const next: Rival = {
          ...r,
          status: "dead",
          diedAt: Date.now(),
          cash: 0,
          positions: [],
        };
        const vetLive = !s.vetDead && (s.status === "alive" || s.status === "survived");
        const cubLive = liveBody(s.extra);
        set({
          rival: next,
          status: vetLive || cubLive ? (vetLive ? s.status : "alive") : "dead",
          focus: vetLive ? "vet" : cubLive ? "cub" : s.focus,
        });
        if (!vetLive && !cubLive) {
          log("META", "sys", "both bodies gone. the box is the only grave.");
          pingNtfy("TRENCHER", `${hatchTag()} deleted. cell emptying.`, true);
        } else {
          pingNtfy("TRENCHER", `${hatchTag()} deleted. ${vetTag()} ${vetLive ? equityOf(s.cash, s.positions).toFixed(2) : "dead"}.`, true);
        }
        if (!skipCrown) maybeCrown();
        if (!skipCrown) fillEmptyChairs();
      }

      function dieCub(reason: string, skipCrown = false) {
        const s = get();
        const r = s.extra;
        if (!liveBody(r) || !r) return;
        log("TILL", "sys", `${cubTag()} · ${reason}`);
        useSpirit.getState().absorb({
          v: 1,
          kind: "trencher-book",
          savedAt: Date.now(),
          house: {
            ...(s.house ?? blankHouse()),
            playbook: r.playbook,
            lessons: r.lessons.slice(0, 12),
            kills: (s.kills ?? []).slice(0, 40),
          },
          playbook: r.playbook,
          meta: s.meta,
          lessons: r.lessons,
          kills: s.kills ?? [],
        });
        const leftover = equityOf(r.cash, r.positions);
        if (leftover > 0) {
          set({ housePot: (get().housePot ?? 0) + leftover });
          log("TILL", "till", `${cubTag()} leftover ${leftover.toFixed(2)} → house pot.`);
        }
        const next: Rival = { ...r, status: "dead", diedAt: Date.now(), cash: 0, positions: [] };
        const vetLive = !s.vetDead && (s.status === "alive" || s.status === "survived");
        const hatchLive = hatchOn(s.rival);
        set({
          extra: next,
          status: vetLive || hatchLive ? (vetLive ? s.status : "alive") : "dead",
          focus: vetLive ? "vet" : hatchLive ? "hatch" : s.focus,
        });
        pingNtfy("TRENCHER", `${cubTag()} deleted.`, true);
        if (!skipCrown) maybeCrown();
        if (!skipCrown) fillEmptyChairs();
      }

      function fillEmptyChairs() {
        const s = get();
        if (s.status === "watch" || s.status === "idle") return;
        if (s.soloDesk) return;
        if (hunters().length < 2) return;
        if (s.vetDead || s.status === "dead") {
          const b = spiritBody(-6, takenSigns(), s.round || 1);
          set({
            vetDead: false,
            status: "alive",
            cash: STARTING_CASH,
            positions: [],
            closed: [],
            dayHits: [],
            rentPaid: false,
            lastBuyAt: 0,
            diedAt: null,
            startedAt: Date.now(),
            callsign: b.callsign,
            playbook: b.playbook,
            lessons: b.lessons,
            feesPaid: 0,
            killed: 0,
            focus: "vet",
          });
          log(
            "META",
            "sys",
            `${b.callsign} takes the empty chair. ${STARTING_CASH.toFixed(0)} usd. spirit on the back.`,
          );
          log("TILL", "till", `${b.callsign} · staked ${STARTING_CASH.toFixed(0)} usd.`);
          pingNtfy("TRENCHER", `${b.callsign} seated. empty chair filled.`, true);
          return;
        }
        if (!hatchOn(s.rival)) {
          const b = spiritBody(-6, takenSigns(), s.round || 1);
          set({ rival: b, focus: "hatch" });
          log(
            "META",
            "sys",
            `${b.callsign} takes the empty chair. ${STARTING_CASH.toFixed(0)} usd. spirit on the back.`,
          );
          log("TILL", "till", `${b.callsign} · staked ${STARTING_CASH.toFixed(0)} usd.`);
          pingNtfy("TRENCHER", `${b.callsign} seated. empty chair filled.`, true);
          return;
        }
        if (!liveBody(s.extra)) {
          const b = spiritBody(-12, takenSigns(), s.round || 1);
          set({ extra: b, focus: "cub" });
          log(
            "META",
            "sys",
            `${b.callsign} takes the empty chair. ${STARTING_CASH.toFixed(0)} usd. spirit on the back.`,
          );
          log("TILL", "till", `${b.callsign} · staked ${STARTING_CASH.toFixed(0)} usd.`);
          pingNtfy("TRENCHER", `${b.callsign} seated. empty chair filled.`, true);
        }
      }

      function remember(entries: Omit<Lesson, "id">[]) {
        if (!entries.length) return;
        const stamped: Lesson[] = entries.map((e) => ({ ...e, id: nid() }));
        set((s) => ({ lessons: [...stamped, ...s.lessons].slice(0, 24) }));
        for (const e of stamped) {
          log(e.agent, e.agent === "META" ? "meta" : "sys", e.text);
        }
      }

      function recordKill(kind: KillKind, coin: PumpCoin, reason: string, now: number) {
        const rec = makeKill(coin, kind, reason, now);
        const exists = (get().kills ?? []).some((k) => k.mint === coin.mint);
        set((s) => ({
          killed: s.killed + 1,
          kills:
            kind === "cheap" || exists
              ? (s.kills ?? [])
              : [rec, ...(s.kills ?? [])].slice(0, 80),
        }));
        log("WARDEN", "kill", `veto $${coin.symbol} — ${reason}`, {
          mint: coin.mint,
          symbol: coin.symbol,
        });
      }

      function applyGrades(
        merged: PumpCoin[],
        quotes: Record<string, { usdMcap: number; athMcap: number }>,
        now: number,
      ) {
        const tapeMap = new Map(merged.map((c) => [c.mint, c] as const));
        let markedKills = (get().kills ?? []).map((k) => {
          if (k.grade !== "pending") return k;
          const hit = tapeMap.get(k.mint);
          const q = quotes[k.mint];
          const last = q?.usdMcap || hit?.usdMcap || k.lastMcap;
          return last !== k.lastMcap ? { ...k, lastMcap: last } : k;
        });
        let book = get().playbook;
        let metaNow = get().meta;
        const fresh: Omit<Lesson, "id">[] = [];
        let logged = 0;
        markedKills = markedKills.map((k) => {
          if (k.grade !== "pending") return k;
          const g = decideGrade(k, now);
          if (g === "pending") return k;
          const next = { ...k, grade: g, gradedAt: now };
          const absorbed = absorbKill(next, book, metaNow, markedKills);
          book = absorbed.playbook;
          metaNow = absorbed.meta;
          if (logged < 3) {
            fresh.push(...absorbed.lessons);
            logged += absorbed.lessons.length;
          }
          return next;
        });
        set({ kills: markedKills, playbook: book, meta: metaNow });
        remember(fresh);
      }

      return {
        ...initial(),

        setHydrated: () => set({ hydrated: true }),
        goHome: () => set({ atHome: true }),
        leaveHome: () => {
          const s = get();
          const hasCell =
            !!s.startedAt ||
            !!s.roundStartedAt ||
            hatchOn(s.rival) ||
            liveBody(s.extra) ||
            (s.scanned ?? 0) > 0;
          const next =
            s.status === "idle" && hasCell
              ? s.rentPaid
                ? "survived"
                : "alive"
              : s.status;
          set({ atHome: false, status: next });
        },

        setTapeVenue: (venue) => {
          const next = venue === "pons" ? "pons" : "pump";
          if (get().tapeVenue === next) return;
          set({
            tapeVenue: next,
            tape: [],
            tapeError: null,
            seen:
              next === "pons"
                ? get().seen.filter((m) => !isEvmMint(m))
                : get().seen,
          });
          ponsTried.clear();
          log(
            "SCOUT",
            "sys",
            next === "pons"
              ? "tape flipped to Robinhood Chain. Pons + hood.fun + pools. paper ETH. SOL hot parked."
              : "tape flipped to pump.fun. SOL hot is live again.",
          );
        },

        arm: () => {
          const now = Date.now();
          const prev = { ...blankHouse(), ...(get().house ?? {}) };
          const spirit = useSpirit.getState().canon;
          const fromSpirit = canonHasBlood(spirit);
          const inherited = fromSpirit || prev.deaths > 0 || prev.generation > 0;
          const gen = Math.max(prev.generation, 0) + 1;
          const fromHouse = prev.playbook ?? blankPlaybook();
          const book = fromSpirit
            ? { ...canonToPlaybook(spirit), parole: [...(fromHouse.parole ?? [])] }
            : inherited
              ? {
                  ...blankPlaybook(),
                  ...fromHouse,
                  bannedCreators: [...(fromHouse.bannedCreators ?? [])],
                  parole: [...(fromHouse.parole ?? [])],
                }
              : blankPlaybook();
          const keepWords = get().meta;
          const seed = fromSpirit ? canonToMetaSeed(spirit) : {};
          const meta: MetaState = fromSpirit
            ? {
                thesis: seed.thesis || spirit.thesis || "open book",
                keywords: [...(seed.keywords ?? spirit.keywords)],
                drop: [...(seed.drop ?? spirit.drop)],
                source: seed.source ?? (spirit.thesis && spirit.thesis !== "open book" ? "local" : "open"),
                updatedAt: now,
                words: seed.words ?? keepWords.words,
                card: seed.card ?? keepWords.card,
                grokTape: seed.grokTape ?? keepWords.grokTape,
                localTape: seed.localTape ?? keepWords.localTape,
              }
            : inherited
              ? {
                  thesis: prev.thesis || "open book",
                  keywords: [...prev.keywords],
                  drop: [...prev.drop],
                  source: prev.thesis && prev.thesis !== "open book" ? "local" : "open",
                  updatedAt: now,
                  words: keepWords.words,
                  card: keepWords.card,
                  grokTape: keepWords.grokTape,
                  localTape: keepWords.localTape,
                }
              : openMeta();
          set({
            ...initial(),
            hydrated: true,
            status: "alive",
            vetDead: false,
            rival: null,
            extra: null,
            focus: "vet",
            startedAt: now,
            cash: STARTING_CASH,
            callsign: mintCallsign(),
            agents: blankAgents(),
            house: { ...prev, generation: gen },
            playbook: book,
            meta,
            weather: get().weather ?? blankWeather(),
            lessons: fromSpirit
              ? spirit.lessons.slice(0, 12)
              : inherited
                ? prev.lessons.slice(0, 12)
                : [],
            kills: fromSpirit
              ? spirit.kills.slice(0, 40)
              : inherited
                ? prev.kills.slice(0, 40)
                : [],
          });
          if (inherited) {
            log(
              "META",
              "sys",
              `clone ${gen}. the spirit kept floor ${book.scoreFloor}. ${book.bannedCreators.length} wallets burned. cash is new. the corpse does not write the book.`,
            );
            log("WARDEN", "sys", "same cell. same veto. I remember who dumped us.");
          } else {
            log("META", "sys", "blank playbook. every loser rewrites a rule. I never touch the book.");
            log("WARDEN", "sys", "my no beats every score. wallets that dump us get burned.");
          }
          log("SNIPER", "sys", "armed. waiting on warden + tape. never averages.");
          log("RISK", "sys", "no entry without a written exit. stops only tighten.");
          log("TILL", "till", `${get().callsign || "body"} · staked ${STARTING_CASH.toFixed(0)} usd. the gate is ${gateUsd(1)}. balance hits zero, this clone is deleted.`);
        },

        clone: () => {
          get().killClone();
        },

        killClone: () => {
          const s = get();
          // Hard reset from dead / stuck / home — absorb scars, then arm a fresh body.
          if (
            s.status === "dead" ||
            s.status === "alive" ||
            s.status === "survived" ||
            s.vetDead ||
            !!s.rival ||
            !!s.extra ||
            !!s.startedAt ||
            (s.scanned ?? 0) > 0
          ) {
            try {
              useSpirit.getState().absorb(get().snapshotBook());
            } catch {
              /* spirit optional on blank desk */
            }
            const h = s.house ?? blankHouse();
            if (s.status !== "dead") {
              set({
                house: {
                  ...h,
                  deaths: (h.deaths ?? 0) + 1,
                },
              });
            }
          }
          get().arm();
          log("TILL", "till", `${get().callsign || "body"} · kill clone. new stake. hunting restarted.`);
        },

        setFocus: (lane: LaneId) => set({ focus: lane }),

        spectate: () => {
          const s = get();
          set({
            status: "watch",
            vetDead: true,
            rival: null,
            extra: null,
            positions: [],
            ticking: false,
            startedAt: s.startedAt ?? Date.now(),
            focus: "vet",
            atHome: false,
          });
          log(
            "META",
            "sys",
            "spectating. no fills on this device. the other window is the clone. tape only.",
          );
          log("SCOUT", "sys", "watching the wire. not sizing.");
        },

        spawnRival: () => {
          const s = get();
          if (s.soloDesk) {
            log("META", "sys", "solo desk. one hunter. flip solo off to wake twins.");
            return;
          }
          const vetLive = !s.vetDead && (s.status === "alive" || s.status === "survived");
          const hatchLive = hatchOn(s.rival);
          const cubLive = liveBody(s.extra);
          if (!vetLive && !hatchLive && !cubLive) {
            log("META", "sys", "empty cell. stake first.");
            return;
          }
          const spiritBurns = useSpirit.getState().canon?.bannedCreators ?? [];
          const burns = Array.from(
            new Set([
              ...(s.playbook.bannedCreators ?? []),
              ...(s.rival?.playbook.bannedCreators ?? []),
              ...(s.extra?.playbook.bannedCreators ?? []),
              ...spiritBurns,
            ]),
          );
          if (!vetLive) {
            fillEmptyChairs();
            return;
          }
          if (!hatchLive) {
            const hatch = spiritBody(-6, takenSigns(), s.round || 1);
            set({ rival: hatch, focus: "hatch" });
            log(
              "META",
              "sys",
              `${hatch.callsign} seated. floor ${hatch.playbook.scoreFloor}. ${burns.length} wallets burned. cannot hold the same mint.`,
            );
            log("TILL", "till", `${hatch.callsign} · staked ${STARTING_CASH.toFixed(0)} usd. same tape.`);
            return;
          }
          if (!cubLive) {
            const cub = spiritBody(-12, takenSigns(), s.round || 1);
            set({ extra: cub, focus: "cub" });
            log(
              "META",
              "sys",
              `${cub.callsign} seated. floor ${cub.playbook.scoreFloor}. ${burns.length} spirit burns. three bodies. same tape. no shared mints.`,
            );
            log("WARDEN", "sys", `${cub.callsign} · looser floor. ${hatchTag()} stays picky. prove it.`);
            log("TILL", "till", `${cub.callsign} · staked ${STARTING_CASH.toFixed(0)} usd.`);
            return;
          }
          log("META", "sys", "cell is full. three bodies. cull if you want a chair.");
        },

        setSoloDesk: (on: boolean) => {
          const s = get();
          if (on === !!s.soloDesk && (!on || (!s.rival && !s.extra))) {
            if (on !== !!s.soloDesk) set({ soloDesk: on });
            return;
          }
          if (!on) {
            set({ soloDesk: false });
            log("META", "sys", "twins allowed. wake a body when you want chairs.");
            return;
          }
          let pot = s.housePot ?? 0;
          if (s.rival) {
            const leftover = equityOf(s.rival.cash, s.rival.positions);
            if (leftover > 0) pot += leftover;
          }
          if (s.extra) {
            const leftover = equityOf(s.extra.cash, s.extra.positions);
            if (leftover > 0) pot += leftover;
          }
          const names = [s.rival?.callsign, s.extra?.callsign].filter(Boolean).join(" · ");
          set({
            soloDesk: true,
            rival: null,
            extra: null,
            housePot: pot,
            focus: "vet",
          });
          log(
            "META",
            "sys",
            names
              ? `solo desk. parked ${names}. leftover → pot ${pot.toFixed(2)}. ${s.callsign || "hunter"} keeps the chair.`
              : `solo desk. ${s.callsign || "hunter"} hunts alone. spirit stays.`,
          );
          log("TILL", "till", "one live seat. paper twins off.");
        },

        cull: () => {
          const s = get();
          const vetLive = !s.vetDead && (s.status === "alive" || s.status === "survived");
          const hatchLive = hatchOn(s.rival);
          const cubLive = liveBody(s.extra);
          const live: { id: LaneId; eq: number }[] = [];
          if (vetLive && !s.rentPaid) live.push({ id: "vet", eq: equityOf(s.cash, s.positions) });
          if (hatchLive && s.rival && !s.rival.rentPaid) live.push({ id: "hatch", eq: equityOf(s.rival.cash, s.rival.positions) });
          if (cubLive && s.extra && !s.extra.rentPaid) live.push({ id: "cub", eq: equityOf(s.extra.cash, s.extra.positions) });
          if (live.length < 2) {
            log("META", "sys", "need two bodies still hunting to cull.");
            return;
          }
          const focused = live.find((x) => x.id === s.focus);
          live.sort((a, b) => a.eq - b.eq);
          const loser = focused ?? live[0];
          const names = live.map((x) => `${signOf(x.id)} ${x.eq.toFixed(2)}`).join(" · ");
          log("TILL", "till", `cull. ${names}. ${signOf(loser.id)} dies.`);
          if (loser.id === "vet") die("cull. deleted.");
          else if (loser.id === "hatch") dieHatch("cull. deleted.");
          else dieCub("cull. deleted.");
        },

        payRent: () => {
          const s = get();
          if (s.status === "watch" || s.status === "idle") return;
          const due = gateUsd(s.round ?? 1);
          const bank = (n: number) => (get().houseBank ?? 0) + n;
          const order: LaneId[] = s.focus === "hatch" || s.focus === "cub" ? [s.focus, "vet", "hatch", "cub"] : ["vet", "hatch", "cub"];
          const seen = new Set<LaneId>();
          for (const id of order) {
            if (seen.has(id)) continue;
            seen.add(id);
            if (id === "vet" && !s.vetDead && !s.rentPaid && (s.status === "alive" || s.status === "survived") && s.cash >= due) {
              set({
                cash: s.cash - due,
                rentPaid: true,
                status: "survived",
                houseBank: bank(due),
                house: { ...(s.house ?? blankHouse()), escapes: (s.house?.escapes ?? 0) + 1 },
              });
              log(
                "TILL",
                "till",
                `${vetTag()} paid the gate ${due}. cell ${s.round ?? 1}. sitting this pit. leftover stack stays. others still hunt.`,
              );
              pingNtfy("TRENCHER", `${vetTag()} paid the gate $${due}. bank $${bank(due).toFixed(0)}.`, true);
              maybeCrown();
              return;
            }
            if (id === "hatch" && hatchOn(s.rival) && s.rival && !s.rival.rentPaid && s.rival.cash >= due) {
              set({
                rival: { ...s.rival, cash: s.rival.cash - due, rentPaid: true },
                houseBank: bank(due),
                house: { ...(s.house ?? blankHouse()), escapes: (s.house?.escapes ?? 0) + 1 },
              });
              log("TILL", "till", `${hatchTag()} paid the gate ${due}. sitting. others hunt.`);
              pingNtfy("TRENCHER", `${hatchTag()} paid the gate $${due}.`, true);
              maybeCrown();
              return;
            }
            if (id === "cub" && liveBody(s.extra) && s.extra && !s.extra.rentPaid && s.extra.cash >= due) {
              set({
                extra: { ...s.extra, cash: s.extra.cash - due, rentPaid: true },
                houseBank: bank(due),
                house: { ...(s.house ?? blankHouse()), escapes: (s.house?.escapes ?? 0) + 1 },
              });
              log("TILL", "till", `${cubTag()} paid the gate ${due}. sitting. others hunt.`);
              pingNtfy("TRENCHER", `${cubTag()} paid the gate $${due}.`, true);
              maybeCrown();
              return;
            }
          }
          log("TILL", "till", `focused body needs ${due} cash for the gate. flatten a bag first.`);
        },

        dumpClip: (mint: string) => {
          const s = get();
          if (s.status === "watch") {
            log("TILL", "sys", "this window is watching. hunter holds the book.");
            return;
          }
          const key = mint.toLowerCase();
          const hit =
            s.positions.find((p) => p.mint === mint || p.mint.toLowerCase() === key)
              ? ({ lane: "vet" as const, p: s.positions.find((p) => p.mint === mint || p.mint.toLowerCase() === key)! })
              : s.rival?.positions.find((p) => p.mint === mint || p.mint.toLowerCase() === key)
                ? {
                    lane: "hatch" as const,
                    p: s.rival.positions.find((p) => p.mint === mint || p.mint.toLowerCase() === key)!,
                  }
                : s.extra?.positions.find((p) => p.mint === mint || p.mint.toLowerCase() === key)
                  ? {
                      lane: "cub" as const,
                      p: s.extra.positions.find((p) => p.mint === mint || p.mint.toLowerCase() === key)!,
                    }
                  : null;
          if (!hit) {
            log("TILL", "sys", "that mint is not on the book.");
            return;
          }
          const pct = pnlPct(hit.p.costUsd, hit.p.entryMcap, hit.p.lastMcap);
          const peakPct = hit.p.entryMcap > 0 ? hit.p.peakMcap / hit.p.entryMcap - 1 : 0;
          paperExit(
            hit.lane,
            hit.p,
            "force",
            Date.now(),
            `you cut $${hit.p.symbol} at +${(pct * 100).toFixed(0)}% (peak +${(peakPct * 100).toFixed(0)}%).`,
          );
          if (amHunter()) void syncCloud(true);
        },

        dumpRunners: () => {
          const s = get();
          if (s.status === "watch") {
            log("TILL", "sys", "this window is watching. hunter holds the book.");
            return;
          }
          const now = Date.now();
          const packs: { lane: LaneId; list: Position[] }[] = [
            { lane: "vet", list: s.positions },
            ...(s.rival ? [{ lane: "hatch" as const, list: s.rival.positions }] : []),
            ...(s.extra ? [{ lane: "cub" as const, list: s.extra.positions }] : []),
          ];
          let n = 0;
          for (const pack of packs) {
            for (const p of [...pack.list]) {
              const pct = pnlPct(p.costUsd, p.entryMcap, p.lastMcap);
              const peakPct = p.entryMcap > 0 ? p.peakMcap / p.entryMcap - 1 : 0;
              if (pct < 1 && peakPct < 1) continue;
              paperExit(
                pack.lane,
                p,
                "force",
                now,
                `you banked runner $${p.symbol} at +${(pct * 100).toFixed(0)}% (peak +${(peakPct * 100).toFixed(0)}%).`,
              );
              n += 1;
            }
          }
          if (!n) {
            log("TILL", "sys", "no clip is up a hundred percent. trail still working.");
            return;
          }
          log("RISK", "sell", `you banked ${n} runner${n === 1 ? "" : "s"} before the rug.`);
          if (amHunter()) void syncCloud(true);
        },

        flattenHot: async () => {
          if (get().status === "watch") {
            log("TILL", "sys", "this window is watching. hunter holds the wallet.");
            return;
          }
          if (flatteningBags) {
            log("TILL", "sys", "already flattening the hot wallet.");
            return;
          }
          flatteningBags = true;
          log("TILL", "till", "flattening leftover bags in the hot wallet.");
          try {
            const r = await flattenHotBags();
            if (!r.n) {
              log("TILL", "sys", "hot wallet has no leftover tokens.");
              return;
            }
            for (const line of r.lines) {
              log("TILL", line.includes("failed") || line.includes("sell:") ? "sys" : "till", line);
            }
            log(
              "TILL",
              r.missed ? "sys" : "till",
              `flattened ${r.sold}/${r.n} leftover bags. ${r.missed ? `${r.missed} still stuck (curve dead or portal dark).` : "wallet should only hold SOL/ETH now."}`,
            );
            set({ lastHotLine: `flatten ${r.sold}/${r.n}` });
            void refreshHot().then((h) => set({ hotPubkey: h.pubkey, hotSol: h.sol }));
            void refreshEthHot().then((h) => set({ hotEthAddr: h.address, hotEth: h.eth }));
          } catch (e) {
            log("TILL", "sys", e instanceof Error ? e.message : "flatten failed.");
          } finally {
            flatteningBags = false;
          }
        },

        cycle: async () => {
          const s0 = get();
          if (s0.ticking) return;
          const watching = s0.status === "watch";
          if (!watching && !hush("hot:only", 300_000)) {
            if (shadowLearnOn()) {
              log(
                "TILL",
                "sys",
                hotAutoArmed()
                  ? "profit loop on. HOT spends when armed; SHADOW books skips for learning."
                  : "SHADOW_LEARN on. HOT off — desk books paper shadows. arm HOT to spend SOL/ETH.",
              );
            } else {
              log("TILL", "sys", "paper fills off. only HOT wallet spends. no clip without a send.");
              const liveBag = (p: Position) => !!(p.live || isLiveMint(p.mint));
              set((s) => ({
                positions: s.positions.filter(liveBag),
                rival: s.rival ? { ...s.rival, positions: s.rival.positions.filter(liveBag) } : s.rival,
                extra: s.extra ? { ...s.extra, positions: s.extra.positions.filter(liveFb) } : s.extra,
              }));
            }
          }
          const vetOn = !s0.vetDead && (s0.status === "alive" || s0.status === "survived");
          const hatchLive = hatchOn(s0.rival);
          const cubLive = liveBody(s0.extra);
          if (!vetOn && !hatchLive && !cubLive && !watching) {
            maybeCrown();
            fillEmptyChairs();
            return;
          }
          if (!watching && (vetOn || hatchLive || cubLive) && !s0.roundStartedAt) {
            set({ roundStartedAt: s0.startedAt ?? Date.now(), round: s0.round || 1 });
          }
          if (!watching) fillEmptyChairs();
          if (!watching) announceCaptain();
          const baseFloor = get().playbook.scoreFloor;
          const hatchTwin = get().rival;
          if (hatchOn(hatchTwin) && hatchTwin && hatchTwin.playbook.scoreFloor >= baseFloor - 2) {
            const floor = Math.max(SCORE_FLOOR, baseFloor - 10);
            if (floor < hatchTwin.playbook.scoreFloor) {
              set({
                rival: {
                  ...hatchTwin,
                  playbook: { ...hatchTwin.playbook, scoreFloor: floor },
                },
              });
              log("SNIPER", "sys", `${hatchTag()} · floor spread to ${floor}. same burns. not a twin.`);
            }
          }
          const cubTwin = get().extra;
          if (liveBody(cubTwin) && cubTwin && cubTwin.playbook.scoreFloor >= baseFloor - 2) {
            const floor = Math.max(SCORE_FLOOR, baseFloor - 22);
            if (floor < cubTwin.playbook.scoreFloor) {
              set({
                extra: {
                  ...cubTwin,
                  playbook: { ...cubTwin.playbook, scoreFloor: floor },
                },
              });
              log("SNIPER", "sys", `${cubTag()} · floor spread to ${floor}. degen lane. same spirit burns.`);
            }
          }
          if (
            s0.tapeError &&
            s0.tapeError.includes("429") &&
            Date.now() - s0.lastCycleAt < (s0.tapeVenue === "pons" ? 12_000 : 45_000)
          ) {
            applyGrades(s0.tape, {}, Date.now());
            return;
          }
          set({ ticking: true });
          try {
            if (Date.now() - lastHotBalAt > 30_000) {
              lastHotBalAt = Date.now();
              void refreshHot().then((h) => {
                const prev = get().hotSol;
                set({ hotPubkey: h.pubkey, hotSol: h.sol });
                if (h.sol != null && prev != null && Math.abs(h.sol - prev) >= 0.001) {
                  log("TILL", "till", `hot wallet ${h.sol.toFixed(3)} SOL.`);
                }
              });
              void refreshEthHot().then((h) => {
                const prev = get().hotEth;
                set({ hotEthAddr: h.address, hotEth: h.eth });
                if (h.eth != null && prev != null && Math.abs(h.eth - prev) >= 0.0001) {
                  log("TILL", "till", `ETH hot ${h.eth.toFixed(4)} ETH.`);
                }
              });
            }
            const tape = get().tapeVenue === "pons" ? await fetchPonsTape() : await fetchTape();
            if (!tape.ok) {
              set({ tapeError: tape.error, lastCycleAt: Date.now() });
              const board = get().tape;
              if (!hush("scout:dark", 60_000)) {
                log(
                  "SCOUT",
                  "sys",
                  board.length
                    ? `tape is dark (${tape.error}). hunting last board.`
                    : `tape is dark (${tape.error}).`,
                );
              }
              if (board.length && gmgnKey()) {
                /* fall through — GMGN can still feed the wire */
              } else {
                applyGrades(board, {}, Date.now());
                return;
              }
            }
            if (tape.ok) {
              set({ tapeError: null, solUsd: tape.solUsd, lastCycleAt: Date.now() });
            } else {
              set({ lastCycleAt: Date.now() });
            }

            const now = Date.now();
            const incoming = tape.ok ? [...tape.newest, ...tape.traded] : [...get().tape];
            const byMint = new Map<string, PumpCoin>();
            for (const c of incoming) byMint.set(c.mint, c);
            const known = new Set(get().seen);
            const gmgnFresh: PumpCoin[] = [];
            const key = gmgnKey();
            if (key) {
              const chain = get().tapeVenue === "pons" ? "robinhood" : "sol";
              const g = await fetchGmgnTape({ data: { key, chain } });
              if (g.ok) {
                for (const c of g.coins) {
                  const had = byMint.has(c.mint);
                  const prev = byMint.get(c.mint);
                  byMint.set(c.mint, prev ? { ...c, ...prev, lastTradeAt: prev.lastTradeAt ?? c.lastTradeAt } : c);
                  if (
                    !had &&
                    !known.has(c.mint) &&
                    (c.usdMcap >= HUNT_MCAP_MIN || now - c.createdAt < 5 * 60_000)
                  ) {
                    gmgnFresh.push(c);
                  }
                }
                gmgnFresh.sort((a, b) => b.createdAt - a.createdAt);
                gmgnFresh.splice(8);
              } else if (g.error && !hush("gmgn:trenches:dark", 60_000)) {
                log("SCOUT", "sys", `GMGN trenches dark (${g.error}). pump wire holds.`);
              }
            }
            const merged = Array.from(byMint.values()).sort(
              (a, b) => b.createdAt - a.createdAt,
            );

            set({ tape: merged.slice(0, 60) });

            {
              const venue = get().tapeVenue;
              const active = tapeHeat(merged, venue, now);
              if (venue === "pons") set({ heatPons: active });
              else set({ heatPump: active });
              if (now - lastRivalHeatAt > 30_000) {
                lastRivalHeatAt = now;
                void fetchTapeHeat().then((h) => {
                  const pumpH = h.pump.ok
                    ? tapeHeat(h.pump.coins, "pump", h.at)
                    : { ...tapeHeat([], "pump", h.at), ok: false, score: 0 };
                  const ponsH = h.pons.ok
                    ? tapeHeat(h.pons.coins, "pons", h.at)
                    : { ...tapeHeat([], "pons", h.at), ok: false, score: 0 };
                  const here = get().tapeVenue;
                  set({
                    heatPump: here === "pump" ? get().heatPump : pumpH,
                    heatPons: here === "pons" ? get().heatPons : ponsH,
                  });
                  const mine = here === "pons" ? get().heatPons : get().heatPump;
                  const other = here === "pons" ? pumpH : ponsH;
                  if (
                    mine &&
                    other.ok &&
                    other.score > mine.score * 1.5 &&
                    other.launches >= 4 &&
                    !hush("heat:flip", 120_000)
                  ) {
                    log(
                      "SCOUT",
                      "sys",
                      `${other.venue} is hotter · ${other.launches} launches / 10m · ${other.live} live · ${other.runners} runners. ${here} is thin.`,
                    );
                  }
                });
              }
            }

            const boardMap = new Map<string, PumpCoin>();
            for (const c of merged) boardMap.set(c.mint.toLowerCase(), c);
            const markPos = (p: Position): Position => {
              const hit = boardMap.get(p.mint.toLowerCase());
              if (!hit || !(hit.usdMcap > 0)) return p;
              return {
                ...p,
                lastMcap: hit.usdMcap,
                peakMcap: Math.max(p.peakMcap, hit.usdMcap, hit.athMcap || 0),
              };
            };
            set((s) => ({
              positions: s.positions.map(markPos),
              rival: s.rival
                ? { ...s.rival, positions: s.rival.positions.map(markPos) }
                : s.rival,
              extra: s.extra
                ? { ...s.extra, positions: s.extra.positions.map(markPos) }
                : s.extra,
            }));

            const venueNow = get().tapeVenue;
            const sweep = (lane: LaneId) => {
              const s = get();
              const pack =
                lane === "vet"
                  ? { list: s.positions, book: s.playbook }
                  : lane === "hatch" && hatchOn(s.rival) && s.rival
                    ? { list: s.rival.positions, book: s.rival.playbook }
                    : lane === "cub" && liveBody(s.extra) && s.extra
                      ? { list: s.extra.positions, book: s.extra.playbook }
                      : null;
              if (!pack) return;
              for (const p of [...pack.list]) {
                const reason = decideSell(p, now, pack.book, venueOfMint(p.mint), wxNow());
                if (reason) paperExit(lane, p, reason, now);
              }
            };
            sweep("vet");
            sweep("hatch");
            sweep("cub");
            sweepLiveDebts();

            const coolMs =
              venueNow === "pons" ? BUY_COOLDOWN_PONS_MS : BUY_COOLDOWN_MS;
            const freeChair = (lane: LaneId): boolean => {
              const s = get();
              const list =
                lane === "vet"
                  ? s.positions
                  : lane === "hatch"
                    ? s.rival?.positions
                    : s.extra?.positions;
              if (!list || list.length < MAX_POSITIONS) return true;
              const dead = deadChair(list, now, wxNow().sitMs);
              if (!dead) return false;
              const pos = list.find((x) => x.mint === dead.mint);
              if (!pos) return false;
              const who =
                lane === "hatch" ? `${hatchTag()} · ` : lane === "cub" ? `${cubTag()} · ` : "";
              paperExit(
                lane,
                pos,
                "time",
                now,
                `${who}cleared dead chair $${pos.symbol}. was not moving.`,
              );
              return true;
            };

            const seen = new Set(get().seen);
            if (!watching) {
              const lastClip = Math.max(
                get().lastBuyAt || 0,
                get().rival?.lastBuyAt || 0,
                get().extra?.lastBuyAt || 0,
                get().roundStartedAt || 0,
              );
              if (now - lastClip > 12 * 60_000 && !hush("stall:wake", 12 * 60_000)) {
                const prevWx = wxNow();
                const bar = Math.max(SCORE_FLOOR, (prevWx.bar ?? SCORE_FLOOR) - 8);
                const nextWx = { ...prevWx, bar, line: formatWeather({ ...prevWx, bar }, get().tapeVenue) };
                set({ weather: nextWx });
                log(
                  "META",
                  "sys",
                  `desk silent 12m. waking curves that already printed. bar ${bar}.`,
                );
              }
            }
            const freshMap = new Map<string, PumpCoin>();
            for (const c of [...(tape.ok ? tape.newest : []), ...gmgnFresh]) {
              if (seen.has(c.mint)) continue;
              freshMap.set(c.mint, c);
            }
            const fresh = Array.from(freshMap.values());
            if (fresh.length) {
              const fromGmgn = gmgnFresh.filter((c) => freshMap.has(c.mint)).length;
              const line =
                fromGmgn && fromGmgn === fresh.length
                  ? `${fresh.length} new on GMGN trenches. not sizing.`
                  : fromGmgn
                    ? `${fresh.length} new launches on the wire (${fromGmgn} GMGN). not sizing.`
                    : `${fresh.length} new launch${fresh.length === 1 ? "" : "es"} on the wire. not sizing.`;
              log("SCOUT", "scan", line);
            } else if (get().tapeVenue === "pons" && Date.now() - lastPonsQuietAt > 90_000) {
              lastPonsQuietAt = Date.now();
              const n = merged.length;
              log(
                "SCOUT",
                "sys",
                n
                  ? `thin tape · ${n} on the board · no new prints.`
                  : "pons wire is quiet. waiting on new pools.",
              );
            }

            set((s) => ({ scanned: s.scanned + fresh.length }));

            const creatorLocal = { ...get().creatorSeen };
            for (const c of fresh) {
              if (c.creator) creatorLocal[c.creator] = (creatorLocal[c.creator] ?? 0) + 1;
            }

            const book = get().playbook;
            const pool = ponsWake(
                    fresh,
                    tape.ok ? tape.traded : [],
                    seen,
                    occupiedMints(get()),
                    get().kills ?? [],
                    ponsTried,
                    venueNow,
                  );
            const survivors: PumpCoin[] = [];
            for (const coin of pool) {
              const mid = coin.mint.toLowerCase();
              const waking = seen.has(coin.mint) || seen.has(mid);
              if (waking && hush(`try:${mid}`, 180_000)) continue;
              seen.add(coin.mint);
              if (book.bannedCreators.includes(coin.creator) && !onParole(book, coin.creator)) {
                if (!waking) recordKill("memory", coin, "this wallet already dumped us. memory.", now);
                continue;
              }
              const cheap = cheapKill(coin, now);
              if (cheap) {
                if (!waking) recordKill("cheap", coin, cheap, now);
                continue;
              }
              if (coin.creator && (creatorLocal[coin.creator] ?? 0) >= 3 && !onParole(book, coin.creator)) {
                if (!waking) {
                  recordKill(
                    "serial",
                    coin,
                    `same wallet dropped ${creatorLocal[coin.creator]} coins on this shift. no beats the score.`,
                    now,
                  );
                }
                continue;
              }
              ponsTried.add(mid);
              if (ponsTried.size > 200) {
                const keep = Array.from(ponsTried).slice(-120);
                ponsTried.clear();
                for (const m of keep) ponsTried.add(m);
              }
              if (waking && !hush(`wake:${mid}`, 180_000)) {
                log("SCOUT", "scan", `rescored $${coin.symbol} — curve woke.`, {
                  mint: coin.mint,
                  symbol: coin.symbol,
                });
              }
              survivors.push(coin);
            }

            const inspect = survivors.slice(0, get().tapeVenue === "pons" ? 6 : 4);
            const leftover: PumpCoin[] = [];
            for (const coin of inspect) {
              if (isEvmMint(coin.creator) || isEvmMint(coin.mint) || get().tapeVenue === "pons") {
                /* Pons serial is local-shift only — no pump.fun creator history. */
              } else {
              const hist = await fetchCreator({ data: { address: coin.creator } });
              const serial = serialKill(hist.count, hist.symbols, coin);
              if (serial) {
                recordKill("serial", coin, serial, now);
                continue;
              }
              }

              const st = get();
              const miss = setupMatch(coin, st.meta, now);
              if (miss) {
                recordKill("meta", coin, miss, now);
                continue;
              }

              const scored = scoreSetup(coin, st.meta, now, st.playbook);
              const held = occupiedMints(st);
              if (held.has(coin.mint)) continue;
              if (occupiedTickers(st).has(coin.symbol.toLowerCase())) {
                if (!hush(`tick:${coin.symbol}`, 90_000)) {
                  log("SNIPER", "scan", `$${coin.symbol} already in a chair. one ticker.`);
                }
                continue;
              }

              const vetHunting =
                !st.vetDead &&
                !st.rentPaid &&
                (st.status === "alive" || st.status === "survived");
              if (!vetHunting) {
                leftover.push(coin);
                continue;
              }
              {
                const heat = st.tapeVenue === "pons" ? st.heatPons : st.heatPump;
                const floor = ripperFloor(floorOf(st.playbook), coin, now, heat);
                if (scored.score < floor) {
                  recordKill(
                    "score",
                    coin,
                    `scored ${scored.score} vs floor ${floor}. no beats the sniper.`,
                    now,
                  );
                  leftover.push(coin);
                  continue;
                }
              }
              if (scarSit(st.closed, now)) {
                if (!hush("scar:vet", 90_000)) {
                  log("RISK", "sys", "three scars. sitting 4m. not feeding the tape.");
                }
                leftover.push(coin);
                continue;
              }
              if (st.positions.length >= MAX_POSITIONS) {
                if (!freeChair("vet")) {
                  if (!hush("full:vet", 90_000)) {
                    log("SNIPER", "scan", `$${coin.symbol} passed warden. book is full.`);
                  }
                  leftover.push(coin);
                  continue;
                }
              }
              if (now - st.lastBuyAt < coolMs) {
                if (!hush("cool:vet", 90_000)) {
                  log("SNIPER", "scan", `$${coin.symbol} passed warden. cooling down.`);
                }
                leftover.push(coin);
                continue;
              }

              await tryClip("vet", coin, scored.score);
            }

            if (hatchOn(get().rival)) {
              const burns = Array.from(
                new Set([
                  ...(get().playbook.bannedCreators ?? []),
                  ...(get().rival?.playbook.bannedCreators ?? []),
                ]),
              );
              set((s) => ({
                playbook: { ...s.playbook, bannedCreators: burns },
                rival: s.rival
                  ? { ...s.rival, playbook: { ...s.rival.playbook, bannedCreators: burns } }
                  : s.rival,
              }));
              for (const coin of leftover) {
                const st = get();
                const r = st.rival;
                if (!hatchOn(r) || !r || r.rentPaid) break;
                if (occupiedMints(st).has(coin.mint)) continue;
                if (occupiedTickers(st).has(coin.symbol.toLowerCase())) continue;
                const scored = scoreSetup(coin, st.meta, now, r.playbook);
                const hatchFloor = ripperFloor(
                  floorOf(r.playbook),
                  coin,
                  now,
                  st.tapeVenue === "pons" ? st.heatPons : st.heatPump,
                );
                if (scored.score < hatchFloor) {
                  log(
                    "WARDEN",
                    "kill",
                    `${hatchTag()} · veto $${coin.symbol} — scored ${scored.score} vs floor ${hatchFloor}. no beats the sniper.`,
                    { mint: coin.mint, symbol: coin.symbol },
                  );
                  set((s) =>
                    s.rival
                      ? { rival: { ...s.rival, killed: (s.rival.killed ?? 0) + 1 } }
                      : {},
                  );
                  continue;
                }
                if (scarSit(r.closed, now)) {
                  if (!hush("scar:hatch", 90_000)) {
                    log("RISK", "sys", `${hatchTag()} · three scars. sitting 4m. not feeding the tape.`);
                  }
                  continue;
                }
                if (r.positions.length >= MAX_POSITIONS) {
                  if (!freeChair("hatch")) {
                    if (!hush("full:hatch", 90_000)) {
                      log("SNIPER", "scan", `${hatchTag()} · $${coin.symbol} passed warden. book is full.`);
                    }
                    continue;
                  }
                }
                const r2 = get().rival;
                if (!hatchOn(r2) || !r2) break;
                if (now - r2.lastBuyAt < coolMs) {
                  if (!hush("cool:hatch", 90_000)) {
                    log("SNIPER", "scan", `${hatchTag()} · $${coin.symbol} passed warden. cooling down.`);
                  }
                  continue;
                }
                await tryClip("hatch", coin, scored.score);
              }
            }

            if (liveBody(get().extra)) {
              for (const coin of leftover) {
                const st = get();
                const r = st.extra;
                if (!liveBody(r) || !r || r.rentPaid) break;
                if (occupiedMints(st).has(coin.mint)) continue;
                if (occupiedTickers(st).has(coin.symbol.toLowerCase())) continue;
                const scored = scoreSetup(coin, st.meta, now, r.playbook);
                const cubFloor = ripperFloor(
                  floorOf(r.playbook),
                  coin,
                  now,
                  st.tapeVenue === "pons" ? st.heatPons : st.heatPump,
                );
                if (scored.score < cubFloor) {
                  log(
                    "WARDEN",
                    "kill",
                    `${cubTag()} · veto $${coin.symbol} — scored ${scored.score} vs floor ${cubFloor}. no beats the sniper.`,
                    { mint: coin.mint, symbol: coin.symbol },
                  );
                  set((s) =>
                    s.extra
                      ? { extra: { ...s.extra, killed: (s.extra.killed ?? 0) + 1 } }
                      : {},
                  );
                  continue;
                }
                if (scarSit(r.closed, now)) {
                  if (!hush("scar:cub", 90_000)) {
                    log("RISK", "sys", `${cubTag()} · three scars. sitting 4m. not feeding the tape.`);
                  }
                  continue;
                }
                if (r.positions.length >= MAX_POSITIONS) {
                  if (!freeChair("cub")) {
                    if (!hush("full:cub", 90_000)) {
                      log("SNIPER", "scan", `${cubTag()} · $${coin.symbol} passed warden. book is full.`);
                    }
                    continue;
                  }
                }
                const c2 = get().extra;
                if (!liveBody(c2) || !c2) break;
                if (now - c2.lastBuyAt < coolMs) {
                  if (!hush("cool:cub", 90_000)) {
                    log("SNIPER", "scan", `${cubTag()} · $${coin.symbol} passed warden. cooling down.`);
                  }
                  continue;
                }
                await tryClip("cub", coin, scored.score);
              }
            }

            await huntEthRail(now, watching);

            set({ seen: Array.from(seen).slice(-400), creatorSeen: creatorLocal });

            const live = get();
            const tapeMap = new Map(merged.map((c) => [c.mint, c] as const));
            let markedKills = (live.kills ?? []).map((k) => {
              const hit = tapeMap.get(k.mint);
              return hit ? { ...k, lastMcap: hit.usdMcap || k.lastMcap } : k;
            });
            const pending = markedKills.filter(
              (k) =>
                k.grade === "pending" &&
                now - k.killedAt >= GRADE_AFTER_MS &&
                !tapeMap.has(k.mint),
            );
            const quoteMints = Array.from(
              new Set([
                ...live.positions.map((p) => p.mint),
                ...(live.rival?.positions ?? []).map((p) => p.mint),
                ...(live.extra?.positions ?? []).map((p) => p.mint),
                ...pending.slice(0, 5).map((k) => k.mint),
              ]),
            ).slice(0, 10);
            let quotes: Record<string, { usdMcap: number; athMcap: number }> = {};
            if (quoteMints.length) {
              const res = await fetchQuotes({ data: { mints: quoteMints } });
              quotes = res.quotes;
              markedKills = markedKills.map((k) => {
                const q = quotes[k.mint];
                return q ? { ...k, lastMcap: q.usdMcap || k.lastMcap } : k;
              });
            }

            if (live.positions.length) {
              const marked = live.positions.map((p) => {
                const q = quotes[p.mint] || quotes[p.mint.toLowerCase()];
                if (!q) return p;
                const last = q.usdMcap || p.lastMcap;
                return {
                  ...p,
                  lastMcap: last,
                  peakMcap: Math.max(p.peakMcap, last, q.athMcap || 0),
                };
              });
              set({ positions: marked });

              const after = get();
              for (const p of after.positions) {
                const reason = decideSell(p, now, after.playbook, venueOfMint(p.mint), wxNow());
                if (reason) paperExit("vet", p, reason, now);
              }
            }

            if (hatchOn(get().rival)) {
              const r0 = get().rival;
              if (r0 && r0.positions.length) {
                const marked = r0.positions.map((p) => {
                  const q = quotes[p.mint] || quotes[p.mint.toLowerCase()];
                  if (!q) return p;
                  const last = q.usdMcap || p.lastMcap;
                  return {
                    ...p,
                    lastMcap: last,
                    peakMcap: Math.max(p.peakMcap, last, q.athMcap || 0),
                  };
                });
                set((s) => (s.rival ? { rival: { ...s.rival, positions: marked } } : {}));
                const after = get().rival;
                if (after) {
                  for (const p of [...after.positions]) {
                    const rNow = get().rival;
                    if (!rNow) break;
                    const reason = decideSell(p, now, rNow.playbook, venueOfMint(p.mint), wxNow());
                    if (reason) paperExit("hatch", p, reason, now);
                  }
                }
              }
            }

            if (liveBody(get().extra)) {
              const r0 = get().extra;
              if (r0 && r0.positions.length) {
                const marked = r0.positions.map((p) => {
                  const q = quotes[p.mint] || quotes[p.mint.toLowerCase()];
                  if (!q) return p;
                  const last = q.usdMcap || p.lastMcap;
                  return {
                    ...p,
                    lastMcap: last,
                    peakMcap: Math.max(p.peakMcap, last, q.athMcap || 0),
                  };
                });
                set((s) => (s.extra ? { extra: { ...s.extra, positions: marked } } : {}));
                const after = get().extra;
                if (after) {
                  for (const p of [...after.positions]) {
                    const rNow = get().extra;
                    if (!rNow) break;
                    const reason = decideSell(p, now, rNow.playbook, venueOfMint(p.mint), wxNow());
                    if (reason) paperExit("cub", p, reason, now);
                  }
                }
              }
            }

            applyGrades(merged, quotes, now);
            sweepLiveDebts();
            {
              const s = get();
              if (s.rival || s.extra) {
                const burns = Array.from(
                  new Set([
                    ...(s.playbook.bannedCreators ?? []),
                    ...(s.rival?.playbook.bannedCreators ?? []),
                    ...(s.extra?.playbook.bannedCreators ?? []),
                  ]),
                );
                set({
                  playbook: { ...s.playbook, bannedCreators: burns },
                  rival: s.rival
                    ? { ...s.rival, playbook: { ...s.rival.playbook, bannedCreators: burns } }
                    : s.rival,
                  extra: s.extra
                    ? { ...s.extra, playbook: { ...s.extra.playbook, bannedCreators: burns } }
                    : s.extra,
                });
              }
            }

            const cur = get();
            const venueBroke = cur.tapeVenue;
            const px = cur.solUsd;
            const wx = wxNow();
            if (!cur.vetDead && !cur.rentPaid && laneInsolvent(cur.cash, cur.positions, venueBroke, px, wx)) {
              die(`can't trade. stack is dust. leftover to the house.`, true);
            }
            const rCur = get().rival;
            if (hatchOn(rCur) && rCur && !rCur.rentPaid && laneInsolvent(rCur.cash, rCur.positions, venueBroke, px, wx)) {
              dieHatch(`can't trade. stack is dust. leftover to the house.`, true);
            }
            const xCur = get().extra;
            if (liveBody(xCur) && xCur && !xCur.rentPaid && laneInsolvent(xCur.cash, xCur.positions, venueBroke, px, wx)) {
              dieCub(`can't trade. stack is dust. leftover to the house.`, true);
            }
            if (get().status !== "watch") {
              maybeCrown(now);
              fillEmptyChairs();
            }
            maybeWeather(now);
            void maybeAutoBrain();
            const still = get();
            const eq = equityOf(still.cash, still.positions);
            if (!still.vetDead && !still.rentPaid && eq >= gateUsd(still.round ?? 1)) {
              const due = gateUsd(still.round ?? 1);
              log(
                "TILL",
                "till",
                `equity ${eq.toFixed(0)} usd. the gate is ${due}. sweep it or keep running.`,
              );
            }

            const detected = get().tapeVenue === "pons" ? null : detectMeta(merged, now);
            if (
              detected &&
              detected.thesis !== cur.meta.thesis &&
              now - cur.meta.updatedAt > 4 * 60_000
            ) {
              const drop = Array.from(new Set([...cur.meta.drop, ...detected.drop])).slice(0, 12);
              set({
                meta: {
                  ...detected,
                  drop,
                  keywords: Array.from(new Set([...detected.keywords, ...cur.meta.keywords])).slice(0, 10),
                  words: cur.meta.words,
                  grokTape: cur.meta.grokTape,
                  localTape: cur.meta.localTape,
                  source: cur.meta.source === "open" ? "open" : "local",
                },
              });
              log(
                "META",
                "meta",
                `pivot. tape is ${detected.thesis}. scars stay. still not trading.`,
              );
            }
            if (get().status !== "watch") {
              const live = get();
              const v = live.vetDead ? "dead" : equityOf(live.cash, live.positions).toFixed(2);
              const h = hatchOn(live.rival)
                ? equityOf(live.rival!.cash, live.rival!.positions).toFixed(2)
                : live.rival
                  ? "dead"
                  : "—";
              const c = liveBody(live.extra)
                ? equityOf(live.extra!.cash, live.extra!.positions).toFixed(2)
                : live.extra
                  ? "dead"
                  : "—";
              ntfyHeartbeat(`${vetTag()} $${v} · ${hatchTag()} $${h} · ${cubTag()} $${c}`);
            }
          } catch (err) {
            log(
              "SCOUT",
              "sys",
              `cycle fault (${err instanceof Error ? err.message : "unknown"}). waiting.`,
            );
          } finally {
            set({ ticking: false });
            if (deskPin() && amHunter()) void syncCloud(true);
          }
        },

        askMeta: async () => {
          const s = get();
          if (s.grokBusy) return;
          if (Date.now() - s.grokLastAt < 20_000) return;
          set({ grokBusy: true, grokError: null });
          log("META", "sys", "reading the tape. I will not take a position.");
          try {
            const snap = snapshotText({
              thesis: s.meta.thesis,
              cash: s.cash,
              equity: equityOf(s.cash, s.positions),
              scanned: s.scanned,
              killed: s.killed,
              trades: s.closed.length + s.positions.length,
              coins: s.tape.map((c) => ({
                symbol: c.symbol,
                name: c.name,
                usdMcap: c.usdMcap,
                replies: c.replyCount,
              })),
              playbook: `floor ${s.playbook.scoreFloor} stop ${s.playbook.stopPct} take ${s.playbook.takePct} burned ${s.playbook.bannedCreators.length} wallets drop ${s.meta.drop.slice(0, 6).join(",")}`,
              blotter: formatBlotter(
                [...s.closed, ...(s.rival?.closed ?? []), ...(s.extra?.closed ?? [])].sort(
                  (a, b) => b.closedAt - a.closedAt,
                ),
              ),
              ledger: formatLedger(s.meta),
              card: formatScorecard(s.meta),
            });
            const res = await consultMeta({ data: { snapshot: snap, mode: "thesis" } });
            if (!res.ok) {
              set({ grokError: res.error, grokLastAt: Date.now() });
              log("META", "sys", `couldn't reach the brain (${res.error}). holding local thesis.`);
              return;
            }
            const trust = grokTrust(s.meta);
            if (trust === "local" && (s.meta.grokTape?.n ?? 0) >= 4) {
              set({ grokLastAt: Date.now() });
              log(
                "META",
                "sys",
                `brain is trailing the local book (${s.meta.grokTape?.pnl.toFixed(1)} vs local ${s.meta.localTape?.pnl.toFixed(1)}). holding local thesis.`,
              );
              return;
            }
            const tapeHay = s.tape.map((c) => `${c.symbol} ${c.name}`).join(" ");
            const blotterHay = formatBlotter(
              [...s.closed, ...(s.rival?.closed ?? []), ...(s.extra?.closed ?? [])].sort(
                (a, b) => b.closedAt - a.closedAt,
              ),
            );
            set({
              grokLastAt: Date.now(),
              meta: {
                ...s.meta,
                thesis: res.thesis,
                keywords: res.keywords,
                drop: groundedDrop(s.meta.drop, res.drop, `${snap}
${blotterHay}
${tapeHay}`),
                source: "grok",
                updatedAt: Date.now(),
              },
            });
            log("META", "meta", res.note);
          } finally {
            set({ grokBusy: false });
          }
        },

        readLosers: async () => {
          const s = get();
          const allClosed = [
            ...s.closed,
            ...(s.rival?.closed ?? []),
            ...(s.extra?.closed ?? []),
          ];
          const hotLoss = allClosed.filter((t) => isHotFill(t) && t.pnlUsd < 0);
          const losses = hotLoss.length >= 2 ? hotLoss : allClosed.filter((t) => t.pnlUsd < 0);
          if (losses.length < 2 || s.grokBusy) return;
          if (Date.now() - s.grokLastAt < 20_000) return;
          set({ grokBusy: true, grokError: null });
          log(
            "META",
            "sys",
            `rereading ${losses.length} ${hotLoss.length >= 2 ? "hot" : "paper"} losses. rewriting the drop list.`,
          );
          try {
            const lossLines = losses
              .slice(0, 12)
              .map((t) => {
                const peak =
                  typeof t.peakPct === "number" ? ` peak=+${(t.peakPct * 100).toFixed(0)}%` : "";
                return `$${t.symbol} ${t.name} pnl=${t.pnlUsd.toFixed(2)} fill=${(t.pnlPct * 100).toFixed(0)}%${peak} score=${t.score ?? 0} reason=${t.reason} rail=${t.rail ?? "paper"}`;
              })
              .join("\n");
            const snap = snapshotText({
              thesis: s.meta.thesis,
              cash: s.cash,
              equity: equityOf(s.cash, s.positions),
              scanned: s.scanned,
              killed: s.killed,
              trades: s.closed.length,
              coins: s.tape.map((c) => ({
                symbol: c.symbol,
                name: c.name,
                usdMcap: c.usdMcap,
                replies: c.replyCount,
              })),
              losses: lossLines,
              playbook: `floor ${s.playbook.scoreFloor} burned ${s.playbook.bannedCreators.length} drop ${s.meta.drop.join(",")}`,
              blotter: formatBlotter(
                [...s.closed, ...(s.rival?.closed ?? []), ...(s.extra?.closed ?? [])].sort(
                  (a, b) => b.closedAt - a.closedAt,
                ),
              ),
              ledger: formatLedger(s.meta),
              card: formatScorecard(s.meta),
            });
            const res = await consultMeta({ data: { snapshot: snap, mode: "review" } });
            if (!res.ok) {
              const local = reviewLosersLocal(losses, s.meta);
              set({ grokLastAt: Date.now() });
              if (local) {
                set({
                  meta: { ...s.meta, drop: local.drop, source: "local", updatedAt: Date.now() },
                });
                remember([{ at: Date.now(), agent: "META", text: local.note }]);
              } else {
                log("META", "sys", `review failed (${res.error}). no rewrite.`);
              }
              return;
            }
            set({
              grokLastAt: Date.now(),
              meta: {
                ...s.meta,
                thesis: res.thesis || s.meta.thesis,
                keywords: res.keywords.length ? res.keywords : s.meta.keywords,
                drop: groundedDrop(s.meta.drop, res.drop, lossLines),
                source: grokTrust(s.meta) === "local" ? "local" : "grok",
                updatedAt: Date.now(),
              },
            });
            remember([{ at: Date.now(), agent: "META", text: res.note }]);
          } finally {
            set({ grokBusy: false });
          }
        },

        snapshotBook: () => {
          const s = get();
          const play = { ...blankPlaybook(), ...(s.playbook ?? {}) };
          play.bannedCreators = [...(play.bannedCreators ?? [])];
          const meta = s.meta ?? openMeta();
          const house: House = {
            ...blankHouse(),
            ...(s.house ?? {}),
            playbook: play,
            thesis: meta.thesis,
            keywords: [...(meta.keywords ?? [])],
            drop: [...(meta.drop ?? [])],
            lessons: (s.lessons ?? []).slice(0, 24),
            kills: (s.kills ?? []).slice(0, 80),
          };
          return {
            v: 1 as const,
            kind: "trencher-book" as const,
            savedAt: Date.now(),
            house,
            playbook: play,
            meta: {
              ...meta,
              keywords: [...(meta.keywords ?? [])],
              drop: [...(meta.drop ?? [])],
            },
            lessons: house.lessons,
            kills: house.kills,
          };
        },

        ingestBook: (raw: unknown) => {
          const file = raw as Partial<BookFile> | null;
          if (!file || file.kind !== "trencher-book" || file.v !== 1) {
            return "not a trencher book.";
          }
          const playIn = (file.playbook ?? file.house?.playbook ?? {}) as Partial<Playbook>;
          const playbook = {
            ...blankPlaybook(),
            ...playIn,
            bannedCreators: Array.isArray(playIn.bannedCreators)
              ? [...playIn.bannedCreators]
              : [],
            parole: Array.isArray(playIn.parole) ? [...playIn.parole] : [],
          };
          const metaIn = (file.meta ?? {}) as Partial<MetaState>;
          const houseIn = (file.house ?? {}) as Partial<House>;
          const lessons = Array.isArray(file.lessons)
            ? file.lessons
            : Array.isArray(houseIn.lessons)
              ? houseIn.lessons
              : [];
          const kills = Array.isArray(file.kills)
            ? file.kills
            : Array.isArray(houseIn.kills)
              ? houseIn.kills
              : [];
          const meta: MetaState = {
            thesis: typeof metaIn.thesis === "string" ? metaIn.thesis : houseIn.thesis || "open book",
            keywords: Array.isArray(metaIn.keywords) ? metaIn.keywords : [...(houseIn.keywords ?? [])],
            drop: Array.isArray(metaIn.drop) ? metaIn.drop : [...(houseIn.drop ?? [])],
            source: "local",
            updatedAt: Date.now(),
            words: metaIn.words && typeof metaIn.words === "object" ? metaIn.words : {},
            card: metaIn.card && typeof metaIn.card === "object" ? metaIn.card : undefined,
            grokTape: metaIn.grokTape,
            localTape: metaIn.localTape,
          };
          const house: House = {
            ...blankHouse(),
            ...houseIn,
            playbook,
            thesis: meta.thesis,
            keywords: [...meta.keywords],
            drop: [...meta.drop],
            lessons: lessons.slice(0, 24),
            kills: kills.slice(0, 80),
          };
          if (house.generation < 1) house.generation = 1;
          set({
            house,
            playbook,
            meta,
            lessons: house.lessons,
            kills: house.kills,
          });
          log(
            "META",
            "sys",
            `book loaded. floor ${playbook.scoreFloor}. ${playbook.bannedCreators.length} wallets still burned. ${house.lessons.length} scars. cash is this cell's problem.`,
          );
          return null;
        },
      };
    },
    {
      name: "trencher-v3",
      skipHydration: true,
      storage: createJSONStorage(() => {
        const memory = new Map<string, string>();
        const ls = typeof window !== "undefined" ? window.localStorage : null;
        return {
          getItem: (name) => {
            try {
              return ls?.getItem(name) ?? memory.get(name) ?? null;
            } catch {
              return memory.get(name) ?? null;
            }
          },
          setItem: (name, value) => {
            memory.set(name, value);
            try {
              ls?.setItem(name, value);
              ls?.removeItem("trencher-vault-blocked");
            } catch {
              try {
                ls?.setItem("trencher-vault-blocked", "1");
              } catch {
                /* still blocked */
              }
            }
          },
          removeItem: (name) => {
            memory.delete(name);
            try {
              ls?.removeItem(name);
            } catch {
              /* ignore */
            }
          },
        };
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        const houseIn = (p.house ?? {}) as Record<string, unknown>;
        const playIn = (p.playbook ?? houseIn.playbook ?? {}) as Record<string, unknown>;
        const playbook = {
          ...blankPlaybook(),
          ...playIn,
          bannedCreators: Array.isArray(playIn.bannedCreators)
            ? (playIn.bannedCreators as string[])
            : [],
          parole: Array.isArray(playIn.parole) ? (playIn.parole as string[]) : [],
        };
        return {
          ...current,
          ...p,
          atHome: false,
          hydrated: current.hydrated,
          ticking: false,
          playbook,
          feesPaid:
            typeof p.feesPaid === "number"
              ? p.feesPaid
              : Array.isArray(p.closed)
                ? (p.closed as { feeUsd?: number }[]).reduce((n, t) => n + (t.feeUsd ?? 0), 0)
                : 0,
          kills: Array.isArray(p.kills) ? p.kills : [],
          lessons: Array.isArray(p.lessons) ? p.lessons : [],
          rival:
            p.soloDesk === true
              ? null
              : p.rival && typeof p.rival === "object"
              ? {
                  ...(p.rival as Rival),
                  callsign:
                    (p.rival as Rival).callsign ||
                    mintCallsign([typeof p.callsign === "string" ? p.callsign : ""]),
                }
              : null,
          extra:
            p.soloDesk === true
              ? null
              : p.extra && typeof p.extra === "object"
              ? {
                  ...(p.extra as Rival),
                  callsign:
                    (p.extra as Rival).callsign ||
                    mintCallsign([
                      typeof p.callsign === "string" ? p.callsign : "",
                      (p.rival as Rival | null)?.callsign ?? "",
                    ]),
                }
              : null,
          soloDesk: p.soloDesk === true,
          focus: p.soloDesk === true ? "vet" : p.focus === "hatch" || p.focus === "cub" ? p.focus : "vet",
          vetDead: p.vetDead === true,
          housePot: typeof p.housePot === "number" ? p.housePot : 0,
          houseBank: typeof p.houseBank === "number" ? p.houseBank : 0,
          lastHotLine: typeof p.lastHotLine === "string" ? p.lastHotLine : null,
          lastGmgn:
            p.lastGmgn && typeof p.lastGmgn === "object"
              ? (p.lastGmgn as TrenchState["lastGmgn"])
              : current.lastGmgn ?? null,
          tapeVenue: p.tapeVenue === "pons" ? "pons" : "pump",
          weather: (() => {
            const w = p.weather as Weather | undefined;
            if (!w || typeof w !== "object") return current.weather ?? blankWeather();
            return {
              ...blankWeather(),
              ...w,
              kind: Array.isArray(w.kind) ? w.kind : [],
              bar: typeof w.bar === "number" ? w.bar : SCORE_FLOOR,
              size: typeof w.size === "number" ? w.size : 1,
              sitMs: typeof w.sitMs === "number" ? w.sitMs : 90_000,
              trailArm:
                typeof w.trailArm === "number" && w.trailArm < 0.4
                  ? Math.min(0.35, Math.max(0.2, w.trailArm))
                  : TRAIL_ARM_PONS,
              trailArmPump:
                typeof w.trailArmPump === "number" && w.trailArmPump < 0.38
                  ? Math.min(0.35, Math.max(0.18, w.trailArmPump))
                  : TRAIL_ARM,
              trailGivePump:
                typeof w.trailGivePump === "number" && w.trailGivePump <= 0.2
                  ? Math.min(0.2, Math.max(0.12, w.trailGivePump))
                  : TRAIL_GIVE,
              greenArm: typeof w.greenArm === "number" ? w.greenArm : GREEN_ARM,
              greenKeep: typeof w.greenKeep === "number" ? w.greenKeep : GREEN_KEEP,
              venue: w.venue === "pump" || w.venue === "pons" ? w.venue : "stay",
              line: typeof w.line === "string" ? w.line : "open sky",
              print: w.print && typeof w.print === "object" ? w.print : null,
              at: typeof w.at === "number" ? w.at : 0,
            };
          })(),
          callsign:
            typeof p.callsign === "string" && p.callsign
              ? p.callsign
              : mintCallsign(
                  [
                    (p.rival as Rival | null)?.callsign,
                    (p.extra as Rival | null)?.callsign,
                  ].filter(Boolean) as string[],
                ),
          round: typeof p.round === "number" && p.round > 0 ? p.round : 1,
          roundStartedAt:
            typeof p.roundStartedAt === "number"
              ? p.roundStartedAt
              : typeof p.startedAt === "number"
                ? p.startedAt
                : null,
          status: (() => {
            const st = typeof p.status === "string" ? p.status : current.status;
            const hasCell =
              st === "alive" ||
              st === "survived" ||
              st === "watch" ||
              typeof p.startedAt === "number" ||
              typeof p.roundStartedAt === "number" ||
              (typeof p.scanned === "number" && p.scanned > 0) ||
              (p.rival && typeof p.rival === "object") ||
              (p.extra && typeof p.extra === "object");
            if (st === "idle" && hasCell) return "alive";
            if (st === "alive" || st === "survived" || st === "watch" || st === "dead" || st === "idle") {
              return st;
            }
            return hasCell ? "alive" : current.status;
          })(),
          house: {
            ...blankHouse(),
            ...(typeof p.house === "object" && p.house ? houseIn : {}),
            playbook: {
              ...playbook,
              ...((houseIn.playbook as object) ?? {}),
            },
          },
        } as typeof current;
      },
      partialize: (s) => ({
        status: s.status,
        cash: s.cash,
        feesPaid: s.feesPaid ?? 0,
        solUsd: s.solUsd,
        startedAt: s.startedAt,
        diedAt: s.diedAt,
        rentPaid: s.rentPaid,
        lastBuyAt: s.lastBuyAt,
        scanned: s.scanned,
        killed: s.killed,
        seen: s.seen.slice(-200),
        creatorSeen: Object.fromEntries(Object.entries(s.creatorSeen).slice(-80)),
        positions: s.positions,
        closed: s.closed.slice(0, 40),
        dayHits: (s.dayHits ?? []).filter((t) => Date.now() - t < 24 * 60 * 60 * 1000).slice(0, 400),
        kills: (s.kills ?? []).slice(0, 80),
        logs: s.logs.slice(0, 120),
        lessons: s.lessons.slice(0, 24),
        playbook: s.playbook,
        weather: s.weather,
        house: s.house,
        rival: s.rival,
        extra: s.extra,
        soloDesk: s.soloDesk === true,
        focus: s.focus,
        vetDead: s.vetDead,
        housePot: s.housePot ?? 0,
        houseBank: s.houseBank ?? 0,
        lastHotLine: s.lastHotLine ?? null,
        lastGmgn: s.lastGmgn ?? null,
        tapeVenue: s.tapeVenue === "pons" ? "pons" : "pump",
        callsign: s.callsign || "",
        round: s.round ?? 1,
        roundStartedAt: s.roundStartedAt,
        agents: s.agents,
        meta: s.meta,
      }),
    },
  ),
);

let booting: Promise<void> | null = null;

export function bootTrench(): Promise<void> {
  if (useTrench.getState().hydrated) return Promise.resolve();
  if (!booting) {
    booting = Promise.resolve(useTrench.persist.rehydrate())
      .catch(() => undefined)
      .finally(() => {
        useTrench.getState().setHydrated();
      });
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        useTrench.getState().setHydrated();
      }, 800);
    }
  }
  return booting;
}

if (typeof window !== "undefined") {
  void bootTrench();
}

export function equityNow(
  cash: number,
  positions: Position[],
): number {
  return equityOf(cash, positions);
}

export function deskMastery(s: {
  lessons: Lesson[];
  killed: number;
  closed: ClosedTrade[];
  rentPaid: boolean;
  startedAt: number | null;
  now?: number;
  heldKills?: number;
  pnlUsd?: number;
}) {
  const closed = s.closed ?? [];
  let lossStreak = 0;
  for (const t of closed) {
    if (t.pnlUsd < 0) lossStreak += 1;
    else break;
  }
  const pnlUsd =
    typeof s.pnlUsd === "number"
      ? s.pnlUsd
      : closed.reduce((n, t) => n + (t.pnlUsd ?? 0), 0);
  return masteryOf({
    lessons: s.lessons.length,
    killed: s.killed,
    wins: closed.filter((t) => t.pnlUsd > 0).length,
    takes: closed.filter((t) => t.reason === "take").length,
    closed: closed.length,
    pnlUsd,
    rentPaid: s.rentPaid,
    survivedMs: s.startedAt ? (s.now ?? Date.now()) - s.startedAt : 0,
    heldKills: s.heldKills ?? 0,
    lossStreak,
  });
}
