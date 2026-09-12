export type AgentId = "SCOUT" | "WARDEN" | "SNIPER" | "RISK" | "TILL" | "META";

export type BotStatus = "idle" | "alive" | "dead" | "survived" | "watch";

export type LogKind = "scan" | "kill" | "buy" | "sell" | "meta" | "till" | "sys";

export type SellReason = "stop" | "take" | "time" | "force";

export type TapeVenue = "pump" | "pons";

export type TapeHeat = {
  venue: TapeVenue;
  at: number;
  ok: boolean;
  launches: number;
  named: number;
  live: number;
  runners: number;
  flowUsd: number;
  newestAgeMs: number;
  score: number;
};

export function isEvmMint(mint: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(mint);
}

export type Rail = "paper" | "sol" | "eth";

export function stampRail(mint: string, live: boolean): Rail {
  if (!live) return "paper";
  return isEvmMint(mint) ? "eth" : "sol";
}

export type PumpCoin = {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image: string | null;
  creator: string;
  createdAt: number;
  usdMcap: number;
  solMcap: number;
  replyCount: number;
  complete: boolean;
  nsfw: boolean;
  banned: boolean;
  live: boolean;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  username: string | null;
  lastTradeAt: number | null;
  athMcap: number;
  venue?: TapeVenue;
  curve?: string;
  pair?: string;
};

export type Position = {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  creator: string;
  costUsd: number;
  entryMcap: number;
  peakMcap: number;
  lastMcap: number;
  openedAt: number;
  score: number;
  stopPct: number;
  takePct: number;
  intendedUsd: number;
  slipPct: number;
  feeUsd: number;
  live?: boolean;
  liveCostUsd?: number;
  metaSource?: "open" | "local" | "grok";
  metaHits?: string[];
};

export type ClosedTrade = {
  mint: string;
  symbol: string;
  name: string;
  creator: string;
  costUsd: number;
  proceedsUsd: number;
  pnlUsd: number;
  pnlPct: number;
  reason: SellReason;
  heldMs: number;
  openedAt: number;
  closedAt: number;
  score: number;
  slipPct: number;
  feeUsd: number;
  rail?: Rail;
  peakPct?: number;
  metaSource?: "open" | "local" | "grok";
  metaHits?: string[];
  settled?: "pending" | "yes" | "no";
  tx?: string;
  liveCostUsd?: number;
};

export type LogLine = {
  id: string;
  at: number;
  agent: AgentId;
  kind: LogKind;
  text: string;
  mint?: string;
  symbol?: string;
};

export type AgentPulse = {
  lastAt: number;
  lastText: string;
  kills: number;
  acts: number;
};

export type MetaKnobTape = { n: number; w: number; pnl: number };

export type MetaScorecard = {
  bySource: Partial<Record<"open" | "local" | "grok", MetaKnobTape>>;
  byThesis: Record<string, MetaKnobTape>;
  byKeyword: Record<string, MetaKnobTape>;
  updatedAt: number;
};

export type MetaState = {
  thesis: string;
  keywords: string[];
  drop: string[];
  source: "open" | "local" | "grok";
  updatedAt: number;
  words?: Record<string, WordStat>;
  grokTape?: SourceTape;
  localTape?: SourceTape;
  card?: MetaScorecard;
};

export type WordStat = {
  n: number;
  w: number;
  pnl: number;
};

export type SourceTape = {
  n: number;
  pnl: number;
};

export type Playbook = {
  scoreFloor: number;
  stopPct: number;
  takePct: number;
  socialBias: number;
  bannedCreators: string[];
  parole?: string[];
};

export type Lesson = {
  id: string;
  at: number;
  agent: AgentId;
  text: string;
};

export type KillKind = "cheap" | "serial" | "score" | "meta" | "memory";

export type KillGrade = "pending" | "rugged" | "ran" | "flat";

export type KillRecord = {
  mint: string;
  symbol: string;
  name: string;
  creator: string;
  kind: KillKind;
  reason: string;
  mcapAt: number;
  killedAt: number;
  lastMcap: number;
  grade: KillGrade;
  gradedAt: number | null;
};

export type House = {
  generation: number;
  deaths: number;
  escapes: number;
  playbook: Playbook;
  thesis: string;
  keywords: string[];
  drop: string[];
  lessons: Lesson[];
  kills: KillRecord[];
};

export type Rival = {
  status: BotStatus;
  cash: number;
  startedAt: number | null;
  diedAt: number | null;
  rentPaid: boolean;
  lastBuyAt: number;
  positions: Position[];
  closed: ClosedTrade[];
  playbook: Playbook;
  lessons: Lesson[];
  feesPaid: number;
  killed: number;
  callsign: string;
  dayHits?: number[];
};

export type LaneId = "vet" | "hatch" | "cub";

const CALL_STEMS = [
  "NYX",
  "ORION",
  "VEX",
  "KAEL",
  "ZED",
  "RYN",
  "NOVA",
  "HEX",
  "KAI",
  "ION",
  "LYRA",
  "APEX",
  "RAVEN",
  "ECHO",
  "AXIOM",
  "SABLE",
  "WRAITH",
  "CRUX",
  "HALO",
  "NEX",
  "TOR",
  "VELA",
  "QUILL",
  "VOID",
  "OMEN",
  "VYRE",
  "JET",
  "RHO",
  "KITE",
  "SOLA",
] as const;

export function mintCallsign(taken: string[] = []): string {
  const used = new Set(taken.filter(Boolean).map((n) => n.toUpperCase()));
  for (let i = 0; i < 80; i++) {
    const stem = CALL_STEMS[Math.floor(Math.random() * CALL_STEMS.length)];
    const n = 1 + Math.floor(Math.random() * 99);
    const name = `${stem}-${n}`;
    if (!used.has(name)) return name;
  }
  return `UNIT-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

export type BookFile = {
  v: 1;
  kind: "trencher-book";
  savedAt: number;
  house: House;
  playbook: Playbook;
  meta: MetaState;
  lessons: Lesson[];
  kills: KillRecord[];
};

export const AGENTS: {
  id: AgentId;
  title: string;
  owns: string;
  never: string;
}[] = [
  { id: "SCOUT", title: "Scout", owns: "The tape. Every new launch.", never: "Never sizes. Never buys." },
  { id: "WARDEN", title: "Warden", owns: "The veto. Then grades it.", never: "Never trades. No beats every score." },
  { id: "SNIPER", title: "Sniper", owns: "Entries. Sizes to the cap.", never: "Never averages. Never enters without an exit." },
  { id: "RISK", title: "Risk", owns: "Writes the exit first. Tightens after a stop. Eases only on a sample.", never: "Never opens. Never eases a stop on one clip." },
  { id: "TILL", title: "Till", owns: "Fees, the gate, survival.", never: "Never trades. Never skips the gate." },
  { id: "META", title: "Meta", owns: "Weather knobs. Survives the clone.", never: "Never rewrites Warden or spirit." },
];

export const STARTING_CASH = 50;
export const RENT_USD = 300;
export const GATE_STEP_USD = 150;
export const GATE_CAP_USD = 1500;

export function gateUsd(round: number): number {
  const n = Math.max(1, Math.floor(Number.isFinite(round) ? round : 1));
  return Math.min(GATE_CAP_USD, RENT_USD + (n - 1) * GATE_STEP_USD);
}

export function cellHeat(round: number): number {
  const n = Math.max(1, Math.floor(Number.isFinite(round) ? round : 1));
  return (n - 1) * 3;
}
export const MAX_BUY_SOL = 0.22;
export const STOP_LOSS = -0.5;
export const STOP_LOSS_PONS = -0.22;
export const TAKE_PROFIT = 0.9;
export const TRAIL_ARM = 0.25;
export const TRAIL_GIVE = 0.16;
export const TRAIL_ARM_PONS = 0.25;
export const TRAIL_GIVE_PONS = 0.16;
export const HARD_TAKE_PONS = 0.85;
export const GREEN_ARM = 0.08;
export const GREEN_KEEP = 0.02;
export const PULSE_MS = 8_000;
export const PULSE_PEAK = 0.06;
export const HOT_TRADE_MS = 60_000;
export const HUNT_MCAP_MIN = 25_000;
export const HUNT_MCAP_MAX = 400_000;
export const HOT_MCAP_PONS = HUNT_MCAP_MIN;
export const MAX_POSITIONS = 3;
export const BUY_COOLDOWN_MS = 45_000;
export const BUY_COOLDOWN_PONS_MS = 12_000;
export const CYCLE_MS = 8_000;
export const CYCLE_PONS_MS = 3_000;
export const ROUND_MS = 168 * 60 * 60 * 1000;
export const BROKE_USD = 10;
export const SCORE_FLOOR = 45;
export type WeatherKind = "died" | "woke" | "rip" | "bleed" | "harvest" | "venue";

export type TapePrint = {
  n: number;
  takePct: number;
  stopPct: number;
  timePct: number;
  flatPct: number;
  runnerPct: number;
  gaveBackPct: number;
  modestGavePct: number;
  source: "hot" | "paper";
  avgHold: number;
  scarStreak: number;
  launches: number;
  live: number;
  runners: number;
  heatScore: number;
  venue: TapeVenue;
};

export type Weather = {
  at: number;
  kind: WeatherKind[];
  venue: TapeVenue | "stay";
  bar: number;
  size: number;
  sitMs: number;
  trailArm: number;
  trailArmPump: number;
  trailGivePump: number;
  greenArm: number;
  greenKeep: number;
  line: string;
  print: TapePrint | null;
};

export function blankWeather(): Weather {
  return {
    at: 0,
    kind: [],
    venue: "stay",
    bar: SCORE_FLOOR,
    size: 1,
    sitMs: 90_000,
    trailArm: TRAIL_ARM_PONS,
    trailArmPump: TRAIL_ARM,
    trailGivePump: TRAIL_GIVE,
    greenArm: GREEN_ARM,
    greenKeep: GREEN_KEEP,
    line: "open sky",
    print: null,
  };
}

export const WEATHER_COOLDOWN_MS = 20 * 60_000;
export const FEE_RATE = 0.01;
export const GRADE_AFTER_MS = 75_000;
export const FLAT_AFTER_MS = 12 * 60_000;
