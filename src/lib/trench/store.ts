import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  fetchCreator,
  fetchQuotes,
  fetchTape,
  fetchPonsTape,
  consultMeta,
} from "./server";
import {
  absorbKill,
  absorbTrade,
  blankPlaybook,
  cheapKill,
  climbPlaybook,
  decideGrade,
  decideSell,
  detectMeta,
  heatPlaybook,
  makeKill,
  masteryOf,
  paperFee,
  paperSlip,
  pnlPct,
  pickHotLane,
  positionValue,
  reviewLosersLocal,
  scoreSetup,
  serialKill,
  setupMatch,
  sizeByScore,
  snapshotText,
} from "./logic";
import { ntfyHeartbeat, pingNtfy } from "./ntfy";
import { amHunter, deskPin, syncCloud } from "./cloud";
import { LIVE_CAP_SOL, ethHotBuy, ethHotSell, hotAutoArmed, hotBuy, hotSell, isLiveMint, refreshEthHot, refreshHot, shadowQuote, signOneBuy, signOneState } from "./wallet";
import { canonHasBlood, canonToPlaybook } from "./canon";
import { useSpirit } from "./spirit";
import {
  AGENTS,
  BROKE_USD,
  BUY_COOLDOWN_MS,
  MAX_POSITIONS,
  ROUND_MS,
  SCORE_FLOOR,
  STARTING_CASH,
  TRAIL_ARM,
  TRAIL_GIVE,
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
  isEvmMint,
  mintCallsign,
} from "./types";

let lastPonsQuietAt = 0;

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
  scanned: number;
  killed: number;
  seen: string[];
  creatorSeen: Record<string, number>;
  tape: PumpCoin[];
  positions: Position[];
  closed: ClosedTrade[];
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
  atHome: boolean;
  callsign: string;
  goHome: () => void;
  leaveHome: () => void;
  setTapeVenue: (venue: TapeVenue) => void;
  spawnRival: () => void;
  cull: () => void;
  setFocus: (lane: LaneId) => void;
  spectate: () => void;
  setHydrated: () => void;
  arm: () => void;
  clone: () => void;
  payRent: () => void;
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
  "setHydrated" | "arm" | "clone" | "payRent" | "cycle" | "askMeta" | "readLosers" | "snapshotBook" | "ingestBook" | "spawnRival" | "cull" | "setFocus" | "spectate" | "goHome" | "leaveHome" | "setTapeVenue"
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
    scanned: 0,
    killed: 0,
    seen: [],
    creatorSeen: {},
    tape: [],
    positions: [],
    closed: [],
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

function liveBody(r: Rival | null | undefined): r is Rival {
  return !!r && (r.status === "alive" || r.status === "survived");
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
        if (lane === "vet") {
          set((s) => ({
            positions: s.positions.map((p) => (p.mint === mint ? { ...p, live: true } : p)),
          }));
          return;
        }
        if (lane === "hatch") {
          set((s) =>
            s.rival
              ? {
                  rival: {
                    ...s.rival,
                    positions: s.rival.positions.map((p) =>
                      p.mint === mint ? { ...p, live: true } : p,
                    ),
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
                  positions: s.extra.positions.map((p) =>
                    p.mint === mint ? { ...p, live: true } : p,
                  ),
                },
              }
            : {},
        );
      }

      function fireLive(lane: LaneId, mint: string, symbol: string, score: number) {
        if (isEvmMint(mint) || get().tapeVenue === "pons") {
          if (!hotAutoArmed()) return;
          if (captain() !== lane) return;
          const spiritFloor = Math.max(
            SCORE_FLOOR,
            useSpirit.getState().canon?.scoreFloor ?? SCORE_FLOOR,
          );
          if (score < spiritFloor) {
            log(
              "TILL",
              "sys",
              `SPIRIT veto live ETH $${symbol} score ${score} vs canon floor ${spiritFloor}. paper only. ${signOf(lane)} holds the wallet.`,
              { mint, symbol },
            );
            return;
          }
          void ethHotBuy(mint, symbol).then((r) => {
            log("TILL", r.ok ? "till" : "sys", r.text, { mint, symbol });
            set({ lastHotLine: r.text });
            if (r.ok) {
              pingNtfy("TRENCHER", `HOT 0.001 ETH $${symbol} · ${signOf(lane)}`, true);
              markLaneLive(lane, mint);
            }
          });
          return;
        }
        if (!hotAutoArmed() && signOneState() !== "armed") return;
        if (captain() !== lane) return;
        const spiritFloor = Math.max(
          SCORE_FLOOR,
          useSpirit.getState().canon?.scoreFloor ?? SCORE_FLOOR,
        );
        if (score < spiritFloor) {
          log(
            "TILL",
            "sys",
            `SPIRIT veto live $${symbol} score ${score} vs canon floor ${spiritFloor}. paper only. ${signOf(lane)} holds the wallet.`,
            { mint, symbol },
          );
          return;
        }
        if (hotAutoArmed()) {
          void hotBuy(mint, symbol).then((r) => {
            log("TILL", r.ok ? "till" : "sys", r.text, { mint, symbol });
            set({ lastHotLine: r.text });
            if (r.ok) {
              pingNtfy("TRENCHER", `HOT 0.02 SOL $${symbol} · ${signOf(lane)}`, true);
              markLaneLive(lane, mint);
            }
          });
          return;
        }
        void signOneBuy(mint, symbol).then((r) => {
          log("TILL", r.ok ? "till" : "sys", r.text, { mint, symbol });
          if (r.ok) {
            pingNtfy("TRENCHER", `SIGNED 0.02 SOL $${symbol} · ${signOf(lane)}`, true);
            markLaneLive(lane, mint);
          }
        });
      }

      function fireLiveSell(p: { mint: string; symbol: string; live?: boolean }) {
        if (!hotAutoArmed()) return;
        if (!(p.live || isLiveMint(p.mint))) return;
        const mint = p.mint;
        const symbol = p.symbol;
        if (isEvmMint(mint)) {
          void ethHotSell(mint, symbol).then((r) => {
            log("TILL", r.ok ? "till" : "sys", r.text, { mint, symbol });
            set({ lastHotLine: r.text });
            if (r.ok) pingNtfy("TRENCHER", `HOT ETH SELL $${symbol}`, true);
          });
          return;
        }
        void hotSell(mint, symbol).then((r) => {
          log("TILL", r.ok ? "till" : "sys", r.text, { mint, symbol });
          set({ lastHotLine: r.text });
          if (r.ok) pingNtfy("TRENCHER", `HOT SELL $${symbol}`, true);
        });
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
          const hatchSnap = list[1];
          const cubSnap = list[2];
          const kept = list.map((x) => x.callsign);
          const nextCell = (s.round ?? 1) + 1;
          const due = gateUsd(nextCell);
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

      function maybeAutoBrain() {
        const s = get();
        if (s.status === "watch" || s.status === "idle" || s.grokBusy) return;
        if (!s.tape.length) return;
        const now = Date.now();
        if (now - (s.grokLastAt || 0) < 8 * 60_000) return;
        const losses = [
          ...s.closed,
          ...(s.rival?.closed ?? []),
          ...(s.extra?.closed ?? []),
        ].filter((t) => t.pnlUsd < 0);
        if (losses.length >= 2 && now - (s.meta.updatedAt || 0) > 10 * 60_000) {
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
        if (hunters().length < 2) return;
        if (s.vetDead || s.status === "dead") {
          const b = spiritBody(-6, takenSigns(), s.round || 1);
          set({
            vetDead: false,
            status: "alive",
            cash: STARTING_CASH,
            positions: [],
            closed: [],
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
          const absorbed = absorbKill(next, book, metaNow);
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
        leaveHome: () => set({ atHome: false }),

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
          log(
            "SCOUT",
            "sys",
            next === "pons"
              ? "tape flipped to Pons on Robinhood Chain. paper ETH. SOL hot parked."
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
            ? canonToPlaybook(spirit)
            : inherited
              ? {
                  ...blankPlaybook(),
                  ...fromHouse,
                  bannedCreators: [...(fromHouse.bannedCreators ?? [])],
                }
              : blankPlaybook();
          const meta: MetaState = fromSpirit
            ? {
                thesis: spirit.thesis || "open book",
                keywords: [...spirit.keywords],
                drop: [...spirit.drop],
                source: spirit.thesis && spirit.thesis !== "open book" ? "local" : "open",
                updatedAt: now,
              }
            : inherited
              ? {
                  thesis: prev.thesis || "open book",
                  keywords: [...prev.keywords],
                  drop: [...prev.drop],
                  source: prev.thesis && prev.thesis !== "open book" ? "local" : "open",
                  updatedAt: now,
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
          log("RISK", "sys", "no entry without a written exit. stops only tighten.");
          log("TILL", "till", `${get().callsign || "body"} · staked ${STARTING_CASH.toFixed(0)} usd. the gate is ${gateUsd(1)}. balance hits zero, this clone is deleted.`);
        },

        clone: () => {
          get().arm();
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

        cycle: async () => {
          const s0 = get();
          const watching = s0.status === "watch";
          const vetOn = !s0.vetDead && (s0.status === "alive" || s0.status === "survived");
          const hatchLive = hatchOn(s0.rival);
          const cubLive = liveBody(s0.extra);
          if ((!vetOn && !hatchLive && !cubLive && !watching) || s0.ticking) return;
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
            const tape = get().tapeVenue === "pons" ? await fetchPonsTape() : await fetchTape();
            if (!tape.ok) {
              set({ tapeError: tape.error, lastCycleAt: Date.now() });
              log("SCOUT", "sys", `tape is dark (${tape.error}).`);
              applyGrades(get().tape, {}, Date.now());
              return;
            }
            set({ tapeError: null, solUsd: tape.solUsd, lastCycleAt: Date.now() });

            const now = Date.now();
            const incoming = [...tape.newest, ...tape.traded];
            const byMint = new Map<string, PumpCoin>();
            for (const c of incoming) byMint.set(c.mint, c);
            const merged = Array.from(byMint.values()).sort(
              (a, b) => b.createdAt - a.createdAt,
            );

            set({ tape: merged.slice(0, 60) });

            const seen = new Set(get().seen);
            const fresh = tape.newest.filter((c) => !seen.has(c.mint));
            if (fresh.length) {
              log(
                "SCOUT",
                "scan",
                `${fresh.length} new launch${fresh.length === 1 ? "" : "es"} on the wire. not sizing.`,
              );
            } else if (get().tapeVenue === "pons" && !tape.newest.length) {
              if (Date.now() - lastPonsQuietAt > 60_000) {
                lastPonsQuietAt = Date.now();
                log("SCOUT", "sys", "pons wire is quiet. waiting on new 1% pools.");
              }
            }

            set((s) => ({ scanned: s.scanned + fresh.length }));

            const creatorLocal = { ...get().creatorSeen };
            for (const c of fresh) {
              if (c.creator) creatorLocal[c.creator] = (creatorLocal[c.creator] ?? 0) + 1;
            }

            const book = get().playbook;
            const survivors: PumpCoin[] = [];
            for (const coin of fresh) {
              seen.add(coin.mint);
              if (book.bannedCreators.includes(coin.creator)) {
                recordKill("memory", coin, "this wallet already dumped us. memory.", now);
                continue;
              }
              const cheap = cheapKill(coin, now);
              if (cheap) {
                recordKill("cheap", coin, cheap, now);
                continue;
              }
              if (coin.creator && (creatorLocal[coin.creator] ?? 0) >= 3) {
                recordKill(
                  "serial",
                  coin,
                  `same wallet dropped ${creatorLocal[coin.creator]} coins on this shift. no beats the score.`,
                  now,
                );
                continue;
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

              const vetHunting =
                !st.vetDead &&
                !st.rentPaid &&
                (st.status === "alive" || st.status === "survived");
              if (!vetHunting) {
                leftover.push(coin);
                continue;
              }
              if (scored.score < st.playbook.scoreFloor) {
                recordKill(
                  "score",
                  coin,
                  `scored ${scored.score} vs floor ${st.playbook.scoreFloor}. no beats the sniper.`,
                  now,
                );
                leftover.push(coin);
                continue;
              }
              if (st.positions.length >= MAX_POSITIONS) {
                log("SNIPER", "scan", `$${coin.symbol} passed warden. book is full.`);
                leftover.push(coin);
                continue;
              }
              if (now - st.lastBuyAt < BUY_COOLDOWN_MS) {
                log("SNIPER", "scan", `$${coin.symbol} passed warden. cooling down.`);
                leftover.push(coin);
                continue;
              }

              const intended = sizeByScore(st.cash, st.solUsd, scored.score);
              if (intended < 4) {
                log("SNIPER", "sys", "size under 4 usd against the risk cap. waiting on cash.");
                leftover.push(coin);
                continue;
              }

              const slipPct = paperSlip(coin.usdMcap);
              const fillUsd = Math.round(intended * (1 + slipPct) * 100) / 100;
              const feeUsd = paperFee(fillUsd);
              const debit = fillUsd + feeUsd;
              if (st.cash < debit) {
                log("TILL", "till", `$${coin.symbol} fill plus fee is ${debit.toFixed(2)}. not enough cash.`);
                leftover.push(coin);
                continue;
              }

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
                score: scored.score,
                stopPct: st.playbook.stopPct,
                takePct: st.playbook.takePct,
                intendedUsd: intended,
                slipPct,
                feeUsd,
              };

              log(
                "RISK",
                "sys",
                `exit written $${coin.symbol}: stop ${(st.playbook.stopPct * 100).toFixed(0)}% / trail arms +${(TRAIL_ARM * 100).toFixed(0)}% then give ${(TRAIL_GIVE * 100).toFixed(0)}% of peak. no hard take.`,
                { mint: coin.mint, symbol: coin.symbol },
              );
              set((s) => ({
                cash: s.cash - debit,
                feesPaid: (s.feesPaid ?? 0) + feeUsd,
                positions: [pos, ...s.positions],
                lastBuyAt: now,
              }));
              log(
                "SNIPER",
                "buy",
                `fill $${coin.symbol} ${fillUsd.toFixed(2)} usd · score ${scored.score} · ${scored.why}. never averaging down.`,
                { mint: coin.mint, symbol: coin.symbol },
              );
              log(
                "SNIPER",
                "sys",
                `slippage $${coin.symbol} ${(slipPct * 100).toFixed(1)}% on a ${Math.round(coin.usdMcap)} curve.`,
                { mint: coin.mint, symbol: coin.symbol },
              );
              log(
                "TILL",
                "till",
                `fee $${coin.symbol} ${feeUsd.toFixed(2)} usd. logged separate from the fill.`,
                { mint: coin.mint, symbol: coin.symbol },
              );
              const shadow = shadowQuote(fillUsd, st.solUsd);
              log(
                "TILL",
                "sys",
                st.tapeVenue === "pons" || isEvmMint(coin.mint)
                  ? `PONS paper $${coin.symbol} ${fillUsd.toFixed(2)} usd. ETH hot 0.001 if armed.`
                  : `SHADOW · ${vetTag()} would spend ${shadow.sol.toFixed(3)} SOL ($${shadow.usd.toFixed(2)}) on $${coin.symbol} · cap ${LIVE_CAP_SOL}.`,
                { mint: coin.mint, symbol: coin.symbol },
              );
              fireLive("vet", coin.mint, coin.symbol, scored.score);
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
                const scored = scoreSetup(coin, st.meta, now, r.playbook);
                if (scored.score < r.playbook.scoreFloor) {
                  log(
                    "WARDEN",
                    "kill",
                    `${hatchTag()} · veto $${coin.symbol} — scored ${scored.score} vs floor ${r.playbook.scoreFloor}. no beats the sniper.`,
                    { mint: coin.mint, symbol: coin.symbol },
                  );
                  set((s) =>
                    s.rival
                      ? { rival: { ...s.rival, killed: (s.rival.killed ?? 0) + 1 } }
                      : {},
                  );
                  continue;
                }
                if (r.positions.length >= MAX_POSITIONS) {
                  log("SNIPER", "scan", `${hatchTag()} · $${coin.symbol} passed warden. book is full.`);
                  continue;
                }
                if (now - r.lastBuyAt < BUY_COOLDOWN_MS) {
                  log("SNIPER", "scan", `${hatchTag()} · $${coin.symbol} passed warden. cooling down.`);
                  continue;
                }
                const intended = sizeByScore(r.cash, st.solUsd, scored.score);
                if (intended < 4) {
                  log("SNIPER", "sys", `${hatchTag()} · size under 4 usd. waiting on cash.`);
                  continue;
                }
                const slipPct = paperSlip(coin.usdMcap);
                const fillUsd = Math.round(intended * (1 + slipPct) * 100) / 100;
                const feeUsd = paperFee(fillUsd);
                const debit = fillUsd + feeUsd;
                if (r.cash < debit) {
                  log("TILL", "till", `${hatchTag()} · $${coin.symbol} fill plus fee is ${debit.toFixed(2)}. not enough cash.`);
                  continue;
                }
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
                  score: scored.score,
                  stopPct: r.playbook.stopPct,
                  takePct: r.playbook.takePct,
                  intendedUsd: intended,
                  slipPct,
                  feeUsd,
                };
                log(
                  "RISK",
                  "sys",
                  `${hatchTag()} · exit written $${coin.symbol}: stop ${(r.playbook.stopPct * 100).toFixed(0)}% / trail +${(TRAIL_ARM * 100).toFixed(0)}% / −${(TRAIL_GIVE * 100).toFixed(0)}% peak.`,
                  { mint: coin.mint, symbol: coin.symbol },
                );
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
                log(
                  "SNIPER",
                  "buy",
                  `${hatchTag()} · fill $${coin.symbol} ${fillUsd.toFixed(2)} usd · score ${scored.score} · ${scored.why}.`,
                  { mint: coin.mint, symbol: coin.symbol },
                );
                const shadow = shadowQuote(fillUsd, st.solUsd);
                log(
                  "TILL",
                  "sys",
                  st.tapeVenue === "pons" || isEvmMint(coin.mint)
                    ? `PONS paper $${coin.symbol} ${fillUsd.toFixed(2)} usd. ETH hot 0.001 if armed.`
                    : `SHADOW · ${hatchTag()} would spend ${shadow.sol.toFixed(3)} SOL ($${shadow.usd.toFixed(2)}) on $${coin.symbol} · cap ${LIVE_CAP_SOL} · wallet does not sign.`,
                  { mint: coin.mint, symbol: coin.symbol },
                );
                fireLive("hatch", coin.mint, coin.symbol, scored.score);
                log(
                  "TILL",
                  "till",
                  `${hatchTag()} · fee $${coin.symbol} ${feeUsd.toFixed(2)} usd.`,
                  { mint: coin.mint, symbol: coin.symbol },
                );
              }
            }

            if (liveBody(get().extra)) {
              for (const coin of leftover) {
                const st = get();
                const r = st.extra;
                if (!liveBody(r) || !r || r.rentPaid) break;
                if (occupiedMints(st).has(coin.mint)) continue;
                const scored = scoreSetup(coin, st.meta, now, r.playbook);
                if (scored.score < r.playbook.scoreFloor) {
                  log(
                    "WARDEN",
                    "kill",
                    `${cubTag()} · veto $${coin.symbol} — scored ${scored.score} vs floor ${r.playbook.scoreFloor}. no beats the sniper.`,
                    { mint: coin.mint, symbol: coin.symbol },
                  );
                  set((s) =>
                    s.extra
                      ? { extra: { ...s.extra, killed: (s.extra.killed ?? 0) + 1 } }
                      : {},
                  );
                  continue;
                }
                if (r.positions.length >= MAX_POSITIONS) {
                  log("SNIPER", "scan", `${cubTag()} · $${coin.symbol} passed warden. book is full.`);
                  continue;
                }
                if (now - r.lastBuyAt < BUY_COOLDOWN_MS) {
                  log("SNIPER", "scan", `${cubTag()} · $${coin.symbol} passed warden. cooling down.`);
                  continue;
                }
                const intended = sizeByScore(r.cash, st.solUsd, scored.score);
                if (intended < 4) {
                  log("SNIPER", "sys", `${cubTag()} · size under 4 usd. waiting on cash.`);
                  continue;
                }
                const slipPct = paperSlip(coin.usdMcap);
                const fillUsd = Math.round(intended * (1 + slipPct) * 100) / 100;
                const feeUsd = paperFee(fillUsd);
                const debit = fillUsd + feeUsd;
                if (r.cash < debit) {
                  log("TILL", "till", `${cubTag()} · $${coin.symbol} fill plus fee is ${debit.toFixed(2)}. not enough cash.`);
                  continue;
                }
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
                  score: scored.score,
                  stopPct: r.playbook.stopPct,
                  takePct: r.playbook.takePct,
                  intendedUsd: intended,
                  slipPct,
                  feeUsd,
                };
                log(
                  "RISK",
                  "sys",
                  `${cubTag()} · exit written $${coin.symbol}: stop ${(r.playbook.stopPct * 100).toFixed(0)}% / trail +${(TRAIL_ARM * 100).toFixed(0)}% / −${(TRAIL_GIVE * 100).toFixed(0)}% peak.`,
                  { mint: coin.mint, symbol: coin.symbol },
                );
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
                log(
                  "SNIPER",
                  "buy",
                  `${cubTag()} · fill $${coin.symbol} ${fillUsd.toFixed(2)} usd · score ${scored.score} · ${scored.why}.`,
                  { mint: coin.mint, symbol: coin.symbol },
                );
                fireLive("cub", coin.mint, coin.symbol, scored.score);
              }
            }

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
                const q = quotes[p.mint];
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
                const pct = pnlPct(p.costUsd, p.entryMcap, p.lastMcap);
                const held = now - p.openedAt;
                const reason = decideSell(p, now, after.playbook);
                if (!reason) continue;

                const proceeds = positionValue(p.costUsd, p.entryMcap, p.lastMcap);
                const feeBuy = p.feeUsd ?? 0;
                const feeSell = paperFee(proceeds);
                const net = Math.round((proceeds - feeSell) * 100) / 100;
                const fees = Math.round((feeBuy + feeSell) * 100) / 100;
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
                  rail: p.live || isLiveMint(p.mint) ? "sol" : "paper",
                };
                set((s) => ({
                  cash: s.cash + net,
                  feesPaid: (s.feesPaid ?? 0) + feeSell,
                  positions: s.positions.filter((x) => x.mint !== p.mint),
                  closed: [trade, ...s.closed].slice(0, 40),
                }));
                const heldLabel =
                  held < 60_000
                    ? `${Math.round(held / 1000)}s`
                    : `${Math.round(held / 60000)}m`;
                const line =
                  reason === "stop"
                    ? `stopped $${p.symbol} at ${(pct * 100).toFixed(0)}% in ${heldLabel}. written exit, no feelings.`
                    : reason === "take"
                      ? `trailed $${p.symbol} off peak. now +${(pct * 100).toFixed(0)}% after ${heldLabel}. no hard take.`
                      : `time stop $${p.symbol} ${(pct * 100).toFixed(0)}% after ${heldLabel}.`;
                log("RISK", "sell", line, { mint: p.mint, symbol: p.symbol });
                fireLiveSell(p);
                log(
                  "TILL",
                  "till",
                  `fee $${p.symbol} sell ${feeSell.toFixed(2)} usd. round trip ${fees.toFixed(2)}.`,
                  { mint: p.mint, symbol: p.symbol },
                );
                pingNtfy(
                  reason === "take" ? "TAKE" : "STOP",
                  `vet $${p.symbol} ${(pct * 100).toFixed(0)}% ${reason} · ${get().cash.toFixed(2)} cash`,
                  true,
                );

                const cur = get();
                const learned = absorbTrade(trade, cur.playbook, cur.meta);
                set({ playbook: learned.playbook, meta: learned.meta });
                remember(learned.lessons);
              }
            }

            if (hatchOn(get().rival)) {
              const r0 = get().rival;
              if (r0 && r0.positions.length) {
                const marked = r0.positions.map((p) => {
                  const q = quotes[p.mint];
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
                  for (const p of after.positions) {
                    const rNow = get().rival;
                    if (!rNow) break;
                    const pct = pnlPct(p.costUsd, p.entryMcap, p.lastMcap);
                    const held = now - p.openedAt;
                    let reason: SellReason | null = null;
                    if (pct <= stopOf(p, rNow.playbook)) reason = "stop";
                    else if (pct >= takeOf(p, rNow.playbook)) reason = "take";
                    else if (held > 8 * 60_000 && pct < 0) reason = "time";
                    else if (held > 25 * 60_000 && pct < 0.25) reason = "time";
                    if (!reason) continue;
                    const proceeds = positionValue(p.costUsd, p.entryMcap, p.lastMcap);
                    const feeBuy = p.feeUsd ?? 0;
                    const feeSell = paperFee(proceeds);
                    const net = Math.round((proceeds - feeSell) * 100) / 100;
                    const fees = Math.round((feeBuy + feeSell) * 100) / 100;
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
                      rail: p.live || isLiveMint(p.mint) ? "sol" : "paper",
                    };
                    const learned = absorbTrade(trade, rNow.playbook, get().meta);
                    set((s) =>
                      s.rival
                        ? {
                            rival: {
                              ...s.rival,
                              cash: s.rival.cash + net,
                              feesPaid: (s.rival.feesPaid ?? 0) + feeSell,
                              positions: s.rival.positions.filter((x) => x.mint !== p.mint),
                              closed: [trade, ...s.rival.closed].slice(0, 40),
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
                    const heldLabel =
                      held < 60_000
                        ? `${Math.round(held / 1000)}s`
                        : `${Math.round(held / 60000)}m`;
                    const line =
                      reason === "stop"
                        ? `${hatchTag()} · stopped $${p.symbol} at ${(pct * 100).toFixed(0)}% in ${heldLabel}.`
                        : reason === "take"
                          ? `${hatchTag()} · took profit on $${p.symbol} +${(pct * 100).toFixed(0)}% after ${heldLabel}.`
                          : `${hatchTag()} · time stop $${p.symbol} ${(pct * 100).toFixed(0)}% after ${heldLabel}.`;
                    log("RISK", "sell", line, { mint: p.mint, symbol: p.symbol });
                    fireLiveSell(p);
                    pingNtfy(
                      reason === "take" ? "TAKE" : "STOP",
                      `${hatchTag()} $${p.symbol} ${(pct * 100).toFixed(0)}% ${reason} · ${get().rival?.cash.toFixed(2) ?? "—"} cash`,
                      true,
                    );
                    for (const e of learned.lessons) {
                      log(e.agent, "sys", `${hatchTag()} · ${e.text}`);
                    }
                  }
                }
              }
            }

            if (liveBody(get().extra)) {
              const r0 = get().extra;
              if (r0 && r0.positions.length) {
                const marked = r0.positions.map((p) => {
                  const q = quotes[p.mint];
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
                  for (const p of after.positions) {
                    const rNow = get().extra;
                    if (!rNow) break;
                    const pct = pnlPct(p.costUsd, p.entryMcap, p.lastMcap);
                    const held = now - p.openedAt;
                    let reason: SellReason | null = null;
                    if (pct <= stopOf(p, rNow.playbook)) reason = "stop";
                    else if (pct >= takeOf(p, rNow.playbook)) reason = "take";
                    else if (held > 8 * 60_000 && pct < 0) reason = "time";
                    else if (held > 25 * 60_000 && pct < 0.25) reason = "time";
                    if (!reason) continue;
                    const proceeds = positionValue(p.costUsd, p.entryMcap, p.lastMcap);
                    const feeBuy = p.feeUsd ?? 0;
                    const feeSell = paperFee(proceeds);
                    const net = Math.round((proceeds - feeSell) * 100) / 100;
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
                      feeUsd: Math.round((feeBuy + feeSell) * 100) / 100,
                      rail: "paper",
                    };
                    const learned = absorbTrade(trade, rNow.playbook, get().meta);
                    set((s) =>
                      s.extra
                        ? {
                            extra: {
                              ...s.extra,
                              cash: s.extra.cash + net,
                              feesPaid: (s.extra.feesPaid ?? 0) + feeSell,
                              positions: s.extra.positions.filter((x) => x.mint !== p.mint),
                              closed: [trade, ...s.extra.closed].slice(0, 40),
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
                    log(
                      "RISK",
                      "sell",
                      `${cubTag()} · ${reason} $${p.symbol} ${(pct * 100).toFixed(0)}%.`,
                      { mint: p.mint, symbol: p.symbol },
                    );
                    fireLiveSell(p);
                    pingNtfy(
                      reason === "take" ? "TAKE" : "STOP",
                      `${cubTag()} $${p.symbol} ${(pct * 100).toFixed(0)}% ${reason} · ${get().extra?.cash.toFixed(2) ?? "—"} cash`,
                      true,
                    );
                  }
                }
              }
            }

            applyGrades(merged, quotes, now);
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
            const eq = equityOf(cur.cash, cur.positions);
            if (!cur.vetDead && !cur.rentPaid && eq < BROKE_USD) {
              die(`can't trade. stack under ${BROKE_USD}. leftover to the house.`);
            }
            const rCur = get().rival;
            if (hatchOn(rCur) && rCur && !rCur.rentPaid && equityOf(rCur.cash, rCur.positions) < BROKE_USD) {
              dieHatch(`can't trade. stack under ${BROKE_USD}. leftover to the house.`);
            }
            const xCur = get().extra;
            if (liveBody(xCur) && xCur && !xCur.rentPaid && equityOf(xCur.cash, xCur.positions) < BROKE_USD) {
              dieCub(`can't trade. stack under ${BROKE_USD}. leftover to the house.`);
            }
            if (get().status !== "watch") maybeCrown(now);
            void maybeAutoBrain();
            const still = get();
            if (!still.vetDead && !still.rentPaid && eq >= gateUsd(still.round ?? 1)) {
              const due = gateUsd(still.round ?? 1);
              log(
                "TILL",
                "till",
                `equity ${eq.toFixed(0)} usd. the gate is ${due}. sweep it or keep running.`,
              );
            }

            const detected = detectMeta(merged, now);
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
            });
            const res = await consultMeta({ data: { snapshot: snap, mode: "thesis" } });
            if (!res.ok) {
              set({ grokError: res.error, grokLastAt: Date.now() });
              log("META", "sys", `couldn't reach the brain (${res.error}). holding local thesis.`);
              return;
            }
            set({
              grokLastAt: Date.now(),
              meta: {
                thesis: res.thesis,
                keywords: res.keywords,
                drop: Array.from(new Set([...s.meta.drop, ...res.drop])).slice(0, 12),
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
          const losses = [
            ...s.closed,
            ...(s.rival?.closed ?? []),
            ...(s.extra?.closed ?? []),
          ].filter((t) => t.pnlUsd < 0);
          if (losses.length < 2 || s.grokBusy) return;
          if (Date.now() - s.grokLastAt < 20_000) return;
          set({ grokBusy: true, grokError: null });
          log("META", "sys", `rereading ${losses.length} losing trades. rewriting the drop list.`);
          try {
            const lossLines = losses
              .slice(0, 12)
              .map(
                (t) =>
                  `$${t.symbol} ${t.name} pnl=${t.pnlUsd.toFixed(2)} score=${t.score ?? 0} reason=${t.reason}`,
              )
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
                thesis: res.thesis || s.meta.thesis,
                keywords: res.keywords.length ? res.keywords : s.meta.keywords,
                drop: Array.from(new Set([...s.meta.drop, ...res.drop])).slice(0, 12),
                source: "grok",
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
        };
        return {
          ...current,
          ...p,
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
            p.rival && typeof p.rival === "object"
              ? {
                  ...(p.rival as Rival),
                  callsign:
                    (p.rival as Rival).callsign ||
                    mintCallsign([typeof p.callsign === "string" ? p.callsign : ""]),
                }
              : null,
          extra:
            p.extra && typeof p.extra === "object"
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
          focus: p.focus === "hatch" || p.focus === "cub" ? p.focus : "vet",
          vetDead: p.vetDead === true,
          housePot: typeof p.housePot === "number" ? p.housePot : 0,
          houseBank: typeof p.houseBank === "number" ? p.houseBank : 0,
          lastHotLine: typeof p.lastHotLine === "string" ? p.lastHotLine : null,
          tapeVenue: p.tapeVenue === "pons" ? "pons" : "pump",
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
        kills: (s.kills ?? []).slice(0, 80),
        logs: s.logs.slice(0, 120),
        lessons: s.lessons.slice(0, 24),
        playbook: s.playbook,
        house: s.house,
        rival: s.rival,
        extra: s.extra,
        focus: s.focus,
        vetDead: s.vetDead,
        housePot: s.housePot ?? 0,
        houseBank: s.houseBank ?? 0,
        lastHotLine: s.lastHotLine ?? null,
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
      }, 2500);
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
