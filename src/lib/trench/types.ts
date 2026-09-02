export type AgentId = "SCOUT" | "WARDEN" | "SNIPER" | "RISK" | "TILL" | "META";

export type BotStatus = "idle" | "alive" | "dead" | "survived" | "watch";

export type LogKind = "scan" | "kill" | "buy" | "sell" | "meta" | "till" | "sys";

export type SellReason = "stop" | "take" | "time" | "force";

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
  rail?: "paper" | "sol";
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

export type MetaState = {
  thesis: string;
  keywords: string[];
  drop: string[];
  source: "open" | "local" | "grok";
  updatedAt: number;
};

export type Playbook = {
  scoreFloor: number;
  stopPct: number;
  takePct: number;
  socialBias: number;
  bannedCreators: string[];
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
};

export type LaneId = "vet" | "hatch" | "cub";

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
  { id: "RISK", title: "Risk", owns: "Writes the exit first. Tightens after a stop.", never: "Never opens. Never widens a stop." },
  { id: "TILL", title: "Till", owns: "Fees, rent, survival.", never: "Never trades. Never skips the rent." },
  { id: "META", title: "Meta", owns: "The playbook. Survives the clone.", never: "Never touches the market." },
];

export const STARTING_CASH = 50;
export const RENT_USD = 300;
export const MAX_BUY_SOL = 0.22;
export const STOP_LOSS = -0.5;
export const TAKE_PROFIT = 0.9;
export const TRAIL_ARM = 1;
export const TRAIL_GIVE = 0.3;
export const MAX_POSITIONS = 3;
export const BUY_COOLDOWN_MS = 45_000;
export const CYCLE_MS = 8_000;
export const ROUND_MS = 168 * 60 * 60 * 1000;
export const BROKE_USD = 10;
export const SCORE_FLOOR = 45;
export const FEE_RATE = 0.01;
export const GRADE_AFTER_MS = 75_000;
export const FLAT_AFTER_MS = 12 * 60_000;
