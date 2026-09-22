import { createServerFn } from "@tanstack/react-start";
import { HUNT_MCAP_MIN, isEvmMint, type PumpCoin } from "./types";

const PUMP = "https://frontend-api-v3.pump.fun";
const RH_RPCS = [
  "https://robinhood-rpc.publicnode.com",
  "https://rpc-robinhood.blockmachine.io",
  "https://rpc.solidrpc.io/public/evm/4663",
  "https://robinhood.rpc.blxrbdn.com",
  "https://rpc.mainnet.chain.robinhood.com",
];
const RH_V3_FACTORY = "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA";
const SUSHI_V3_FACTORY = "0xE51960f1B45f1C9FB6D166E6a884F866fC70433B";
const PONS_V2_FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";
const PONS_V1_FACTORY = "0xa5aab3f0c6eeadf30ef1d3eb997108e976351feb";
const HOOD_LAUNCHER = "0x5e4121c262b846eb518ef3eadcd5566838aa841f";
const POOLS_TRADE = [
  "0x23f8209572b4a1c2ad88a42749e830791fb027f1",
  "0xad44d55e7f8337c3ce113fbb591486e85be104b2",
  "0x0000ffffbe8efe702c8703ae3477ff5de3d319c0",
];
const RH_WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const PONS_USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const POOL_CREATED =
  "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118";
const TOKEN_LAUNCHED =
  "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607";
const TOKEN_LAUNCHED_V1 =
  "0xdb51ea9ad51ab453a65a4cb7e60c3cb378c9501bb002609f8f97778fb6c4235a";
const TOKEN_LAUNCHED_HOOD =
  "0xddc4160e57e0f9bb97f0a72300d16d7085e659888650ee95da1e92e4fb4b0ff4";
const PONS_FEE = 10_000;
const V3_FEES = new Set([500, 2500, 3000, 10_000]);
const PONS_SUPPLY = 1_000_000_000;
const NAME_SEL = "0x06fdde03";
const SYMBOL_SEL = "0x95d89b41";
const SLOT0_SEL = "0x3850c7bd";
const BALANCE_OF_SEL = "0x70a08231";
const PONS_LOOKBACK = 9_000;
const PONS_V2_WINDOWS = 2;
const PONS_BLOCK_MS = 100;
const PONS_FRESH_MS = 800;
const PONS_STALE_MS = 10 * 60_000;
const PUMP_FRESH_MS = 6_000;
const PUMP_STALE_MS = 10 * 60_000;
const PUMP_COOL_MS = 45_000;

const creatorCache = new Map<
  string,
  { at: number; count: number; symbols: string[] }
>();
const CREATOR_TTL = 3 * 60_000;
let pumpCoolUntil = 0;
let pumpTapeCache: {
  at: number;
  tape: { ok: true; newest: PumpCoin[]; traded: PumpCoin[]; solUsd: number };
} | null = null;

type RawCoin = Record<string, unknown>;

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function tapeMs(v: unknown): number {
  const n = num(v);
  if (n <= 0) return 0;
  return n < 1e12 ? n * 1000 : n;
}

function normalize(raw: RawCoin): PumpCoin | null {
  const mint = str(raw.mint);
  if (!mint) return null;
  const usdMcap = num(raw.usd_market_cap) || num(raw.market_cap_usd);
  const solMcap = num(raw.market_cap);
  return {
    mint,
    name: str(raw.name) || "unnamed",
    symbol: str(raw.symbol) || "???",
    description: str(raw.description),
    image: str(raw.image_uri) || str(raw.profile_image) || null,
    creator: str(raw.creator),
    createdAt: tapeMs(raw.created_timestamp),
    usdMcap,
    solMcap,
    replyCount: Math.floor(num(raw.reply_count)),
    complete: Boolean(raw.complete),
    nsfw: Boolean(raw.nsfw),
    banned: Boolean(raw.is_banned),
    live: Boolean(raw.is_currently_live),
    twitter: str(raw.twitter) || null,
    telegram: str(raw.telegram) || null,
    website: str(raw.website) || null,
    username: str(raw.username) || null,
    lastTradeAt: tapeMs(raw.last_trade_timestamp) || null,
    athMcap: num(raw.ath_market_cap) || usdMcap,
    venue: "pump",
  };
}

async function pumpGet(path: string): Promise<unknown> {
  if (Date.now() < pumpCoolUntil) throw new Error("pump 429");
  const res = await fetch(`${PUMP}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(9000),
  });
  if (res.status === 429) {
    const ra = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 120_000) : PUMP_COOL_MS;
    pumpCoolUntil = Math.max(pumpCoolUntil, Date.now() + wait);
    throw new Error("pump 429");
  }
  if (!res.ok) {
    throw new Error(`pump ${res.status}`);
  }
  return res.json();
}

function asCoins(data: unknown): PumpCoin[] {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { coins?: unknown }).coins)
      ? ((data as { coins: RawCoin[] }).coins)
      : [];
  const out: PumpCoin[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const c = normalize(row as RawCoin);
    if (c && !c.nsfw && !c.banned) out.push(c);
  }
  return out;
}

function solFrom(coins: PumpCoin[]): number {
  const ratios = coins
    .map((c) => (c.solMcap > 0.5 ? c.usdMcap / c.solMcap : 0))
    .filter((r) => r > 20 && r < 2000)
    .sort((a, b) => a - b);
  if (!ratios.length) return 140;
  return ratios[Math.floor(ratios.length / 2)] ?? 140;
}

type RpcRow = { jsonrpc: "2.0"; id: number; result?: unknown; error?: { message?: string; code?: number } };

let rhRpcIndex = 0;

async function rhBatchOnce(url: string, calls: { method: string; params: unknown[] }[]): Promise<unknown[]> {
  const body = calls.map((c, i) => ({ jsonrpc: "2.0" as const, id: i + 1, method: c.method, params: c.params }));
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "trencher-desk/1.0" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`rh rpc ${res.status}`);
  const json = (await res.json()) as RpcRow | RpcRow[];
  const rows = Array.isArray(json) ? json : [json];
  const byId = new Map(rows.map((r) => [r.id, r]));
  if (rows.some((r) => r.error && (r.error.code === 429 || /too many/i.test(r.error.message ?? "")))) {
    throw new Error("rh rpc 429");
  }
  return calls.map((_, i) => byId.get(i + 1)?.result);
}

async function rhBatch(calls: { method: string; params: unknown[] }[]): Promise<unknown[]> {
  if (!calls.length) return [];
  let last = "rh rpc dark";
  for (let i = 0; i < RH_RPCS.length; i++) {
    const url = RH_RPCS[(rhRpcIndex + i) % RH_RPCS.length]!;
    try {
      const out = await rhBatchOnce(url, calls);
      rhRpcIndex = (rhRpcIndex + i) % RH_RPCS.length;
      return out;
    } catch (err) {
      last = err instanceof Error ? err.message : "rh rpc dark";
    }
  }
  throw new Error(last);
}

function topicAddr(topic: string): string {
  return `0x${topic.slice(-40).toLowerCase()}`;
}

function decodeAbiString(hex: unknown): string {
  const h = String(hex ?? "").replace(/^0x/, "");
  if (h.length < 128) return "";
  const len = Number(BigInt(`0x${h.slice(64, 128)}`));
  if (!Number.isFinite(len) || len <= 0 || len > 96) return "";
  const data = h.slice(128, 128 + len * 2);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = parseInt(data.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(bytes).replace(/\0/g, "").trim();
}

function mcapFromSlot0(hex: unknown, tokenIsToken0: boolean, ethUsd: number): number {
  const h = String(hex ?? "").replace(/^0x/, "");
  if (h.length < 64) return 0;
  let sqrt: bigint;
  try {
    sqrt = BigInt(`0x${h.slice(0, 64)}`);
  } catch {
    return 0;
  }
  if (sqrt <= 0n) return 0;
  const scaled = Number(sqrt / (1n << 48n)) / 2 ** 48;
  if (!Number.isFinite(scaled) || scaled <= 0) return 0;
  const p = scaled * scaled;
  if (!Number.isFinite(p) || p <= 0) return 0;
  const priceWeth = tokenIsToken0 ? p : 1 / p;
  if (!Number.isFinite(priceWeth) || priceWeth <= 0) return 0;
  const usd = priceWeth * ethUsd * PONS_SUPPLY;
  if (!Number.isFinite(usd) || usd <= 0 || usd > 50_000_000) return 0;
  return Math.round(usd);
}

type DexPair = {
  chainId?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  priceNative?: string;
  marketCap?: number;
  fdv?: number;
  pairCreatedAt?: number;
  liquidity?: { usd?: number };
  info?: { imageUrl?: string };
};

type DexQuote = {
  usdMcap: number;
  athMcap: number;
  image: string | null;
  name?: string;
  symbol?: string;
  createdAt?: number;
};

async function dexQuotes(mints: string[]): Promise<Record<string, DexQuote>> {
  const out: Record<string, DexQuote> = {};
  const addrs = mints.map((m) => m.toLowerCase()).filter(isEvmMint).slice(0, 30);
  if (!addrs.length) return out;
  try {
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/robinhood/${addrs.join(",")}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return out;
    const rows = (await res.json()) as DexPair[];
    if (!Array.isArray(rows)) return out;
    for (const p of rows) {
      const base = (p.baseToken?.address ?? "").toLowerCase();
      const quote = (p.quoteToken?.address ?? "").toLowerCase();
      const mint = addrs.find((a) => a === base || a === quote);
      if (!mint) continue;
      const mcap = num(p.marketCap) || num(p.fdv);
      const prev = out[mint];
      if (prev && prev.usdMcap >= mcap) continue;
      const token = mint === base ? p.baseToken : p.quoteToken;
      out[mint] = {
        usdMcap: mcap,
        athMcap: mcap,
        image: p.info?.imageUrl ?? null,
        name: token?.name,
        symbol: token?.symbol,
        createdAt: num(p.pairCreatedAt) || undefined,
      };
    }
  } catch {
    /* keep empty */
  }
  return out;
}

async function ethUsdFromDex(): Promise<number> {
  if (Date.now() - ethUsdMemo.at < 60_000 && ethUsdMemo.usd > 0) return ethUsdMemo.usd;
  try {
    const res = await fetch(
      "https://api.dexscreener.com/tokens/v1/robinhood/0x39dBED3a2bd333467115dE45665cC57F813C4571",
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return 2400;
    const rows = (await res.json()) as DexPair[];
    const p = Array.isArray(rows) ? rows[0] : null;
    const usd = Number(p?.priceUsd);
    const native = Number(p?.priceNative);
    if (usd > 0 && native > 0) {
      const eth = usd / native;
      if (eth > 200 && eth < 20_000) {
        const usd = Math.round(eth);
        ethUsdMemo = { at: Date.now(), usd };
        return usd;
      }
    }
  } catch {
    /* ignore */
  }
  return ethUsdMemo.usd || 2400;
}

type PonsTape = {
  ok: true;
  newest: PumpCoin[];
  traded: PumpCoin[];
  solUsd: number;
} | {
  ok: false;
  error: string;
};

let ponsCache: { at: number; tape: Extract<PonsTape, { ok: true }> } | null = null;
let ethUsdMemo = { at: 0, usd: 2400 };
let ponsHead = 0;
let lastPonsDexAt = 0;
let lastGeckoAt = 0;
type PadKind = "v2" | "v3" | "v1" | "hood" | "pools";
type PonsLaunch = {
  token: string;
  curve: string;
  pool: string;
  deployer: string;
  pair: string;
  tokenIs0: boolean;
  block: number;
  kind: PadKind;
};
const ponsLaunches = new Map<string, PonsLaunch>();
const ponsKnown = new Map<string, PumpCoin>();

function packPons(coins: PumpCoin[], ethUsd: number): Extract<PonsTape, { ok: true }> {
  const newest = [...coins].sort((a, b) => b.createdAt - a.createdAt);
  return {
    ok: true,
    newest,
    traded: newest.filter((c) => c.usdMcap >= HUNT_MCAP_MIN).slice(0, 16),
    solUsd: ethUsd,
  };
}

async function geckoPons(ethUsd: number, anyQuote = false): Promise<PumpCoin[]> {
  const res = await fetch(
    "https://api.geckoterminal.com/api/v2/networks/robinhood/new_pools?page=1&include=base_token,quote_token",
    { headers: { accept: "application/json", "user-agent": "trencher-desk/1.0" }, signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) throw new Error(`gecko ${res.status}`);
  const body = (await res.json()) as {
    data?: {
      attributes?: {
        name?: string;
        pool_created_at?: string;
        fdv_usd?: string;
        market_cap_usd?: string;
        volume_usd?: { m5?: string; h1?: string; h24?: string };
      };
      relationships?: {
        base_token?: { data?: { id?: string } };
        quote_token?: { data?: { id?: string } };
      };
    }[];
    included?: {
      id?: string;
      type?: string;
      attributes?: { address?: string; name?: string; symbol?: string; image_url?: string };
    }[];
  };
  const tokens = new Map(
    (body.included ?? [])
      .filter((x) => x.type === "token")
      .map((x) => [x.id ?? "", x.attributes ?? {}] as const),
  );
  const isQuote = (addr: string) => addr === RH_WETH || addr === PONS_USDG;
  const out: PumpCoin[] = [];
  for (const pool of body.data ?? []) {
    const quoteId = pool.relationships?.quote_token?.data?.id ?? "";
    const baseId = pool.relationships?.base_token?.data?.id ?? "";
    const quote = tokens.get(quoteId);
    const base = tokens.get(baseId);
    const quoteAddr = (quote?.address ?? "").toLowerCase();
    const baseAddr = (base?.address ?? "").toLowerCase();
    const token = isQuote(quoteAddr) ? base : isQuote(baseAddr) ? quote : anyQuote ? base : null;
    if (!anyQuote && !isQuote(quoteAddr) && !isQuote(baseAddr)) continue;
    const mint = (token?.address ?? "").toLowerCase();
    if (!isEvmMint(mint) || mint === RH_WETH || mint === PONS_USDG) continue;
    const usdMcap = num(pool.attributes?.market_cap_usd) || num(pool.attributes?.fdv_usd);
    const created = Date.parse(pool.attributes?.pool_created_at ?? "") || Date.now();
    const vol = num(pool.attributes?.volume_usd?.h1) || num(pool.attributes?.volume_usd?.m5) * 12;
    out.push({
      mint,
      name: token?.name || pool.attributes?.name || "unnamed",
      symbol: token?.symbol || "???",
      description: "Robinhood Chain launch",
      image: token?.image_url ?? null,
      creator: "",
      createdAt: created,
      usdMcap: usdMcap || vol,
      solMcap: ethUsd > 0 ? (usdMcap || vol) / ethUsd : 0,
      replyCount: 0,
      complete: false,
      nsfw: false,
      banned: false,
      live: false,
      twitter: null,
      telegram: null,
      website: null,
      username: null,
      lastTradeAt: Date.now(),
      athMcap: usdMcap || vol,
      venue: "pons",
    });
  }
  return out;
}

function padBalanceOf(who: string): string {
  return `${BALANCE_OF_SEL}${who.replace(/^0x/, "").toLowerCase().padStart(64, "0")}`;
}

function nativePair(pair: string): boolean {
  return !pair || /^0x0+$/.test(pair);
}

function quoteDecimals(pair: string): number {
  if (nativePair(pair)) return 18;
  if (pair === PONS_USDG) return 6;
  return 18;
}

function asTokens(hex: unknown): number {
  try {
    return Number(BigInt(String(hex ?? "0x0")) / 10n ** 18n);
  } catch {
    return 0;
  }
}

function asEth(hex: unknown): number {
  try {
    return Number(BigInt(String(hex ?? "0x0")) / 10n ** 12n) / 1e6;
  } catch {
    return 0;
  }
}

function asUnits(hex: unknown, decimals: number): number {
  try {
    const raw = BigInt(String(hex ?? "0x0"));
    if (decimals >= 12) return Number(raw / 10n ** BigInt(decimals - 6)) / 1e6;
    return Number(raw) / 10 ** decimals;
  } catch {
    return 0;
  }
}

function mcapFromCurve(quoteUsd: number, remaining: number, supply: number): number {
  if (!(quoteUsd > 0) || !(supply > 0)) return 0;
  const sold = Math.max(0, supply - remaining);
  const mcap =
    sold > supply * 0.001 ? (quoteUsd / sold) * supply : Math.max(1500, quoteUsd * 60);
  if (!Number.isFinite(mcap) || mcap <= 0 || mcap > 400_000) return 0;
  return Math.round(mcap);
}

function padLine(kind: PadKind): string {
  if (kind === "v2") return "Pons V2 bonding curve";
  if (kind === "v1") return "Pons V1 pool";
  if (kind === "hood") return "hood.fun on Robinhood Chain";
  if (kind === "pools") return "pools.trade on Robinhood Chain";
  return "Robinhood Chain launch";
}

function padWindows(): { addr: string; topic: string; parse: PadKind }[] {
  return [
    { addr: PONS_V2_FACTORY, topic: TOKEN_LAUNCHED, parse: "v2" },
    { addr: PONS_V1_FACTORY, topic: TOKEN_LAUNCHED_V1, parse: "v1" },
    { addr: HOOD_LAUNCHER, topic: TOKEN_LAUNCHED_HOOD, parse: "hood" },
    ...POOLS_TRADE.map((addr) => ({ addr, topic: TOKEN_LAUNCHED_V1, parse: "pools" as const })),
    { addr: RH_V3_FACTORY, topic: POOL_CREATED, parse: "v3" },
    { addr: SUSHI_V3_FACTORY, topic: POOL_CREATED, parse: "v3" },
  ];
}

function pushLogWindow(
  calls: { method: string; params: unknown[] }[],
  address: string,
  topic: string,
  from: number,
  to: number,
) {
  calls.push({
    method: "eth_getLogs",
    params: [
      {
        address,
        fromBlock: `0x${Math.max(0, from).toString(16)}`,
        toBlock: `0x${Math.max(0, to).toString(16)}`,
        topics: [topic],
      },
    ],
  });
}

async function loadPonsTape(): Promise<Extract<PonsTape, { ok: true }>> {
  const ethUsd = await ethUsdFromDex();
  const cold = ponsHead <= 0;
  const [bnRaw] = await rhBatch([{ method: "eth_blockNumber", params: [] }]);
  const bn = Number(BigInt(String(bnRaw ?? "0")));
  if (!Number.isFinite(bn) || bn <= 0) throw new Error("rh head dark");
  const logCalls: { method: string; params: unknown[] }[] = [];
  const pads = padWindows();
  const fromHot = Math.max(0, ponsHead - 128);
  const fromCold = Math.max(0, bn - PONS_LOOKBACK + 1);
  if (cold) {
    for (let i = 0; i < PONS_V2_WINDOWS; i++) {
      const to = bn - i * PONS_LOOKBACK;
      const from = to - PONS_LOOKBACK + 1;
      if (to <= 0) break;
      pushLogWindow(logCalls, PONS_V2_FACTORY, TOKEN_LAUNCHED, from, to);
    }
    for (const pad of pads) {
      if (pad.addr === PONS_V2_FACTORY) continue;
      pushLogWindow(logCalls, pad.addr, pad.topic, fromCold, bn);
    }
  } else {
    for (const pad of pads) {
      pushLogWindow(logCalls, pad.addr, pad.topic, fromHot, bn);
    }
  }
  const raws = await rhBatch(logCalls);
  const ingest = (rows: PonsLaunch[]) => {
    for (const row of rows) ponsLaunches.set(row.token, row);
  };
  if (cold) {
    const v2Count = Math.min(PONS_V2_WINDOWS, Math.max(0, logCalls.length - (pads.length - 1)));
    for (let i = 0; i < v2Count; i++) {
      const raw = raws[i];
      if (Array.isArray(raw)) ingest(parseTokenLaunched(raw as { topics?: string[]; data?: string; blockNumber?: string }[]));
    }
    const extras = pads.filter((p) => p.addr !== PONS_V2_FACTORY);
    extras.forEach((pad, i) => {
      const raw = raws[v2Count + i];
      if (!Array.isArray(raw)) return;
      const logs = raw as { topics?: string[]; data?: string; blockNumber?: string }[];
      if (pad.parse === "v3") ingest(parsePonsLogs(logs));
      else if (pad.parse === "hood") ingest(parseHoodLaunched(logs));
      else if (pad.parse === "v1" || pad.parse === "pools") ingest(parseV1Launched(logs, pad.parse));
    });
  } else {
    pads.forEach((pad, i) => {
      const raw = raws[i];
      if (!Array.isArray(raw)) return;
      const logs = raw as { topics?: string[]; data?: string; blockNumber?: string }[];
      if (pad.parse === "v2") ingest(parseTokenLaunched(logs));
      else if (pad.parse === "v3") ingest(parsePonsLogs(logs));
      else if (pad.parse === "hood") ingest(parseHoodLaunched(logs));
      else ingest(parseV1Launched(logs, pad.parse));
    });
  }
  ponsHead = bn;
  try {
    if (Date.now() - lastGeckoAt > 12_000) {
      const gecko = await geckoPons(ethUsd);
      lastGeckoAt = Date.now();
      for (const c of gecko) {
        if (!isEvmMint(c.mint) || ponsLaunches.has(c.mint)) continue;
        ponsLaunches.set(c.mint, {
          token: c.mint,
          curve: "",
          pool: "",
          deployer: (c.creator || "").toLowerCase(),
          pair: RH_WETH,
          tokenIs0: true,
          block: bn,
          kind: "v3",
        });
        if (!ponsKnown.has(c.mint)) ponsKnown.set(c.mint, { ...c, description: "Robinhood Chain launch" });
      }
    }
  } catch {
    /* gecko is a fill, not the rail */
  }
  if (ponsLaunches.size > 120) {
    const keep = Array.from(ponsLaunches.values())
      .sort((a, b) => b.block - a.block)
      .slice(0, 80);
    ponsLaunches.clear();
    for (const row of keep) ponsLaunches.set(row.token, row);
  }
  const rows = Array.from(ponsLaunches.values())
    .sort((a, b) => b.block - a.block)
    .slice(0, 40);
  const unknown = rows.filter((r) => {
    const k = ponsKnown.get(r.token);
    return !k || k.name === "unnamed" || k.symbol === "???" || k.usdMcap <= 1800;
  });
  const refreshMcap = Date.now() - lastPonsDexAt > 8_000;
  const dexTargets = unknown.length
    ? unknown.slice(0, 16).map((r) => r.token)
    : refreshMcap
      ? rows.slice(0, 8).map((r) => r.token)
      : [];
  const dex = dexTargets.length ? await dexQuotes(dexTargets) : {};
  if (dexTargets.length) lastPonsDexAt = Date.now();
  const missing = unknown.slice(0, 8);
  const calls: { method: string; params: unknown[] }[] = [];
  for (const row of missing) {
    calls.push({ method: "eth_call", params: [{ to: row.token, data: NAME_SEL }, "latest"] });
    calls.push({ method: "eth_call", params: [{ to: row.token, data: SYMBOL_SEL }, "latest"] });
    if (row.kind === "v2" && row.curve) {
      calls.push({ method: "eth_call", params: [{ to: row.token, data: padBalanceOf(row.curve) }, "latest"] });
      if (nativePair(row.pair)) {
        calls.push({ method: "eth_getBalance", params: [row.curve, "latest"] });
      } else {
        calls.push({ method: "eth_call", params: [{ to: row.pair, data: padBalanceOf(row.curve) }, "latest"] });
      }
    } else {
      calls.push({ method: "eth_call", params: [{ to: row.pool || row.token, data: SLOT0_SEL }, "latest"] });
      calls.push({ method: "eth_call", params: [{ to: row.token, data: "0x18160ddd" }, "latest"] });
    }
  }
  const results = calls.length ? await rhBatch(calls) : [];
  const byMissing = new Map<string, { name: string; symbol: string; mcap: number; remaining: number }>();
  let cursor = 0;
  for (const row of missing) {
    const name = decodeAbiString(results[cursor]);
    const symbol = decodeAbiString(results[cursor + 1]);
    cursor += 2;
    let mcap = 0;
    let remaining = 0;
    if (row.kind === "v2" && row.curve) {
      remaining = asTokens(results[cursor]);
      const quoteUsd = nativePair(row.pair)
        ? asEth(results[cursor + 1]) * ethUsd
        : asUnits(results[cursor + 1], quoteDecimals(row.pair));
      mcap = mcapFromCurve(quoteUsd, remaining, PONS_SUPPLY);
    } else {
      mcap = mcapFromSlot0(results[cursor], row.tokenIs0, ethUsd);
    }
    cursor += 2;
    byMissing.set(row.token, { name, symbol, mcap, remaining });
  }
  const coins: PumpCoin[] = rows.map((row) => {
    const prev = ponsKnown.get(row.token);
    const q = dex[row.token];
    const extra = byMissing.get(row.token);
    const usdMcap = (() => {
      const d = q?.usdMcap || 0;
      const s = extra?.mcap || 0;
      if (d > 90_000 && s > 0) return s;
      const n = d || s || prev?.usdMcap || 0;
      if (row.kind === "v2" && n <= 0) return 1800;
      return n;
    })();
    const createdAt =
      prev?.createdAt ||
      q?.createdAt ||
      Date.now() - Math.max(0, bn - row.block) * PONS_BLOCK_MS;
    const remaining = extra?.remaining ?? 0;
    const graduated = remaining > 0 && remaining < PONS_SUPPLY * 0.15;
    const coin: PumpCoin = {
      mint: row.token,
      name: q?.name || extra?.name || prev?.name || "unnamed",
      symbol: q?.symbol || extra?.symbol || prev?.symbol || "???",
      description: padLine(row.kind),
      image: q?.image ?? prev?.image ?? null,
      creator: (row.deployer || prev?.creator || "").toLowerCase(),
      createdAt,
      usdMcap,
      solMcap: ethUsd > 0 ? usdMcap / ethUsd : 0,
      replyCount: 0,
      complete: graduated,
      nsfw: false,
      banned: false,
      live: false,
      twitter: null,
      telegram: null,
      website: null,
      username: null,
      lastTradeAt: Date.now(),
      athMcap: Math.max(usdMcap, q?.athMcap ?? prev?.athMcap ?? 0),
      venue: "pons",
      curve: row.curve || prev?.curve,
      pair: row.pair || prev?.pair,
    };
    ponsKnown.set(row.token, coin);
    return coin;
  });
  return packPons(coins, ethUsd);
}

function parseV1Launched(
  logs: { topics?: string[]; data?: string; blockNumber?: string }[],
  kind: PadKind,
): PonsLaunch[] {
  const launches: PonsLaunch[] = [];
  for (const log of logs) {
    const topics = log.topics ?? [];
    if (topics.length < 4) continue;
    const token = topicAddr(topics[1] ?? "");
    const deployer = topicAddr(topics[2] ?? "");
    if (!isEvmMint(token) || token === RH_WETH) continue;
    const data = String(log.data ?? "").replace(/^0x/, "");
    const pair = data.length >= 64 ? `0x${data.slice(24, 64).toLowerCase()}` : RH_WETH;
    const pool = data.length >= 128 ? `0x${data.slice(88, 128).toLowerCase()}` : "";
    launches.push({
      token,
      curve: "",
      pool,
      deployer,
      pair: isEvmMint(pair) ? pair : RH_WETH,
      tokenIs0: true,
      block: Number(BigInt(log.blockNumber ?? "0x0")),
      kind,
    });
  }
  return launches;
}

function parseHoodLaunched(
  logs: { topics?: string[]; data?: string; blockNumber?: string }[],
): PonsLaunch[] {
  const launches: PonsLaunch[] = [];
  for (const log of logs) {
    const topics = log.topics ?? [];
    if (topics.length < 4) continue;
    const token = topicAddr(topics[1] ?? "");
    const deployer = topicAddr(topics[2] ?? "");
    const pool = topicAddr(topics[3] ?? "");
    if (!isEvmMint(token) || token === RH_WETH) continue;
    launches.push({
      token,
      curve: "",
      pool: isEvmMint(pool) ? pool : "",
      deployer,
      pair: RH_WETH,
      tokenIs0: true,
      block: Number(BigInt(log.blockNumber ?? "0x0")),
      kind: "hood",
    });
  }
  return launches;
}

function parseTokenLaunched(
  logs: { topics?: string[]; data?: string; blockNumber?: string }[],
): PonsLaunch[] {
  const launches: PonsLaunch[] = [];
  for (const log of logs) {
    const topics = log.topics ?? [];
    if (topics.length < 4) continue;
    const token = topicAddr(topics[1] ?? "");
    const curve = topicAddr(topics[2] ?? "");
    const deployer = topicAddr(topics[3] ?? "");
    if (!isEvmMint(token) || token === RH_WETH) continue;
    const data = String(log.data ?? "").replace(/^0x/, "");
    const pair = data.length >= 64 ? `0x${data.slice(24, 64).toLowerCase()}` : "0x0000000000000000000000000000000000000000";
    launches.push({
      token,
      curve,
      pool: "",
      deployer,
      pair,
      tokenIs0: true,
      block: Number(BigInt(log.blockNumber ?? "0x0")),
      kind: "v2",
    });
  }
  return launches;
}

function parsePonsLogs(
  logs: { topics?: string[]; data?: string; blockNumber?: string }[],
): PonsLaunch[] {
  const launches: PonsLaunch[] = [];
  for (const log of logs) {
    const topics = log.topics ?? [];
    if (topics.length < 4) continue;
    const fee = Number(BigInt(topics[3] ?? "0"));
    if (!V3_FEES.has(fee) && fee !== PONS_FEE) continue;
    const token0 = topicAddr(topics[1] ?? "");
    const token1 = topicAddr(topics[2] ?? "");
    const weth = token0 === RH_WETH ? "0" : token1 === RH_WETH ? "1" : "";
    if (!weth) continue;
    const token = weth === "0" ? token1 : token0;
    if (!isEvmMint(token) || token === RH_WETH) continue;
    const data = String(log.data ?? "").replace(/^0x/, "");
    const pool = `0x${data.slice(64 + 24, 128).toLowerCase()}`;
    launches.push({
      token,
      curve: "",
      pool,
      deployer: "",
      pair: RH_WETH,
      tokenIs0: token === token0,
      block: Number(BigInt(log.blockNumber ?? "0x0")),
      kind: "v3",
    });
  }
  return launches;
}

export const fetchTape = createServerFn({ method: "GET" }).handler(async () => {
  if (pumpTapeCache && Date.now() - pumpTapeCache.at < PUMP_FRESH_MS) {
    return pumpTapeCache.tape;
  }
  try {
    const newestRaw = await pumpGet(
      "/coins?offset=0&limit=40&sort=created_timestamp&order=DESC&includeNsfw=false",
    );
    let tradedRaw: unknown = [];
    try {
      tradedRaw = await pumpGet(
        "/coins?offset=0&limit=24&sort=last_trade_timestamp&order=DESC&includeNsfw=false",
      );
    } catch {
      /* newest is enough when pump is thinning the wire */
    }
    const newest = asCoins(newestRaw);
    const traded = asCoins(tradedRaw);
    const tape = {
      ok: true as const,
      newest,
      traded,
      solUsd: solFrom([...newest, ...traded]),
    };
    pumpTapeCache = { at: Date.now(), tape };
    return tape;
  } catch (err) {
    if (pumpTapeCache && Date.now() - pumpTapeCache.at < PUMP_STALE_MS) {
      return pumpTapeCache.tape;
    }
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "tape down",
    };
  }
});

export const fetchPonsTape = createServerFn({ method: "GET" }).handler(async () => {
  if (ponsCache && Date.now() - ponsCache.at < PONS_FRESH_MS) return ponsCache.tape;
  try {
    const tape = await loadPonsTape();
    ponsCache = { at: Date.now(), tape };
    return tape;
  } catch (err) {
    if (ponsCache && Date.now() - ponsCache.at < PONS_STALE_MS) return ponsCache.tape;
    try {
      const ethUsd = await ethUsdFromDex();
      const gecko = await geckoPons(ethUsd);
      if (gecko.length) {
        const tape = packPons(gecko, ethUsd);
        ponsCache = { at: Date.now(), tape };
        return tape;
      }
    } catch {
      /* fall through */
    }
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "pons tape down",
    };
  }
});

export const fetchTapeHeat = createServerFn({ method: "GET" }).handler(async () => {
  const pump = await (async () => {
    try {
      const raw = await pumpGet(
        "/coins?offset=0&limit=40&sort=created_timestamp&order=DESC&includeNsfw=false",
      );
      return { ok: true as const, coins: asCoins(raw), error: null as string | null };
    } catch (e) {
      return {
        ok: false as const,
        coins: [] as PumpCoin[],
        error: e instanceof Error ? e.message : "pump dark",
      };
    }
  })();
  const pons = await (async () => {
    try {
      if (ponsCache && Date.now() - ponsCache.at < PONS_STALE_MS) {
        return {
          ok: true as const,
          coins: ponsCache.tape.newest,
          error: null as string | null,
        };
      }
      const tape = await loadPonsTape();
      ponsCache = { at: Date.now(), tape };
      return { ok: true as const, coins: tape.newest, error: null as string | null };
    } catch (e) {
      try {
        const gecko = await geckoPons(await ethUsdFromDex(), true);
        return {
          ok: gecko.length > 0,
          coins: gecko,
          error: gecko.length ? null : (e instanceof Error ? e.message : "pons dark"),
        };
      } catch (g) {
        return {
          ok: false as const,
          coins: [] as PumpCoin[],
          error: g instanceof Error ? g.message : "pons dark",
        };
      }
    }
  })();
  return { pump, pons, at: Date.now() };
});

export const fetchQuotes = createServerFn({ method: "POST" })
  .validator((input: { mints: string[] }) => ({
    mints: Array.isArray(input.mints)
      ? input.mints.filter((m) => typeof m === "string").slice(0, 8)
      : [],
  }))
  .handler(async ({ data }) => {
    const quotes: Record<string, { usdMcap: number; athMcap: number }> = {};
    const evm = data.mints.filter(isEvmMint);
    const pump = data.mints.filter((m) => !isEvmMint(m));
    await Promise.all([
      ...pump.map(async (mint) => {
        try {
          const raw = await pumpGet(`/coins/${encodeURIComponent(mint)}`);
          const coin = raw && typeof raw === "object" ? normalize(raw as RawCoin) : null;
          if (coin) quotes[mint] = { usdMcap: coin.usdMcap, athMcap: coin.athMcap };
        } catch {
          /* keep last known */
        }
      }),
      (async () => {
        if (!evm.length) return;
        const dex = await dexQuotes(evm);
        for (const [mint, q] of Object.entries(dex)) {
          quotes[mint] = { usdMcap: q.usdMcap, athMcap: q.athMcap };
        }
      })(),
    ]);
    return { quotes };
  });

export const fetchCreator = createServerFn({ method: "POST" })
  .validator((input: { address: string }) => ({
    address: String(input.address ?? "").slice(0, 64),
  }))
  .handler(async ({ data }) => {
    const address = data.address;
    if (!address || isEvmMint(address)) return { count: 0, symbols: [] as string[] };
    const hit = creatorCache.get(address);
    if (hit && Date.now() - hit.at < CREATOR_TTL) {
      return { count: hit.count, symbols: hit.symbols };
    }
    try {
      const raw = await pumpGet(
        `/coins?offset=0&limit=20&sort=created_timestamp&order=DESC&creator=${encodeURIComponent(address)}`,
      );
      const coins = asCoins(raw);
      const symbols = coins.map((c) => c.symbol);
      const rec = { at: Date.now(), count: coins.length, symbols };
      creatorCache.set(address, rec);
      return { count: rec.count, symbols };
    } catch {
      return { count: 0, symbols: [] as string[] };
    }
  });

export const fetchHotBalance = createServerFn({ method: "POST" })
  .validator((input: { pubkey: string }) => ({
    pubkey: String(input.pubkey ?? "").slice(0, 64),
  }))
  .handler(async ({ data }) => {
    if (data.pubkey.length < 32) return { ok: false as const, error: "bad pubkey", sol: null as number | null };
    try {
      const res = await fetch("https://api.mainnet-beta.solana.com", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getBalance",
          params: [data.pubkey],
        }),
      });
      const j = (await res.json()) as { result?: { value?: number }; error?: { message?: string } };
      if (j.error?.message) return { ok: false as const, error: j.error.message, sol: null };
      const lamports = j.result?.value ?? 0;
      const sol = Math.round((lamports / 1_000_000_000) * 10000) / 10000;
      return { ok: true as const, sol, error: null as string | null };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "rpc dark",
        sol: null,
      };
    }
  });

const BUY_SEL = "0x59a87bc1";
const SELL_SEL = "0xd04c6983";
const APPROVE_SEL = "0x095ea7b3";
const LIVE_ETH_WEI = 2_000_000_000_000_000n; // 0.002 ETH
const RH_CHAIN_ID = 4663;

function abiWord(v: bigint | string): string {
  const hex =
    typeof v === "bigint"
      ? v.toString(16)
      : v.startsWith("0x")
        ? v.slice(2)
        : v;
  return hex.toLowerCase().padStart(64, "0");
}

function encodeBuy(quoteWei: bigint, minOut: bigint, to: string): string {
  return `${BUY_SEL}${abiWord(quoteWei)}${abiWord(minOut)}${abiWord(to)}`;
}

function encodeSell(amount: bigint, minOut: bigint, to: string): string {
  return `${SELL_SEL}${abiWord(amount)}${abiWord(minOut)}${abiWord(to)}`;
}

function encodeApprove(spender: string, amount: bigint): string {
  return `${APPROVE_SEL}${abiWord(spender)}${abiWord(amount)}`;
}

async function lookupPonsLaunch(mint: string): Promise<PonsLaunch | null> {
  const m = mint.toLowerCase();
  const hit = ponsLaunches.get(m);
  if (hit?.kind === "v2" && hit.curve) return hit;
  const [bnRaw] = await rhBatch([{ method: "eth_blockNumber", params: [] }]);
  const bn = Number(BigInt(String(bnRaw ?? "0")));
  if (!Number.isFinite(bn) || bn <= 0) return null;
  const topic1 = `0x${m.slice(2).padStart(64, "0")}`;
  const from = Math.max(0, bn - PONS_LOOKBACK * 4);
  const [raw] = await rhBatch([
    {
      method: "eth_getLogs",
      params: [
        {
          address: PONS_V2_FACTORY,
          fromBlock: `0x${from.toString(16)}`,
          toBlock: `0x${bn.toString(16)}`,
          topics: [TOKEN_LAUNCHED, topic1],
        },
      ],
    },
  ]);
  const rows = parseTokenLaunched(
    Array.isArray(raw) ? (raw as { topics?: string[]; data?: string; blockNumber?: string }[]) : [],
  );
  const found = rows[rows.length - 1] ?? null;
  if (found) ponsLaunches.set(found.token, found);
  return found;
}

export const fetchEthBalance = createServerFn({ method: "POST" })
  .validator((input: { address: string }) => ({
    address: String(input.address ?? "").slice(0, 42).toLowerCase(),
  }))
  .handler(async ({ data }) => {
    if (!isEvmMint(data.address)) return { ok: false as const, error: "bad address", eth: null as number | null };
    try {
      const [raw] = await rhBatch([{ method: "eth_getBalance", params: [data.address, "latest"] }]);
      const eth = asEth(raw);
      return { ok: true as const, eth, error: null as string | null };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "rpc dark", eth: null };
    }
  });

export const buildPonsTrade = createServerFn({ method: "POST" })
  .validator((input: { from: string; mint: string; action?: string }) => ({
    from: String(input.from ?? "").slice(0, 42).toLowerCase(),
    mint: String(input.mint ?? "").slice(0, 42).toLowerCase(),
    action: input.action === "sell" ? "sell" : "buy",
  }))
  .handler(async ({ data }) => {
    if (!isEvmMint(data.from) || !isEvmMint(data.mint)) {
      return { ok: false as const, error: "bad eth addr" };
    }
    try {
      const launch = await lookupPonsLaunch(data.mint);
      if (!launch?.curve) return { ok: false as const, error: "no pons curve for mint" };
      if (!nativePair(launch.pair)) return { ok: false as const, error: "quote is not ETH. paper only." };
      const [nonceRaw, gasPriceRaw, balRaw, blockRaw] = await rhBatch([
        { method: "eth_getTransactionCount", params: [data.from, "pending"] },
        { method: "eth_gasPrice", params: [] },
        { method: "eth_getBalance", params: [data.from, "latest"] },
        { method: "eth_getBlockByNumber", params: ["latest", false] },
      ]);
      const nonce = Number(BigInt(String(nonceRaw ?? "0x0")));
      const gasPrice = BigInt(String(gasPriceRaw ?? "0x1a20a8e0"));
      const baseFee = (() => {
        const b = blockRaw && typeof blockRaw === "object" ? (blockRaw as { baseFeePerGas?: string }).baseFeePerGas : null;
        try {
          return b ? BigInt(b) : 0n;
        } catch {
          return 0n;
        }
      })();
      const floor = baseFee > gasPrice ? baseFee : gasPrice;
      const padded = floor * 2n + 1_000_000n;
      const bal = BigInt(String(balRaw ?? "0x0"));
      if (data.action === "buy") {
        const quote = LIVE_ETH_WEI;
        const gasNeed = 250_000n * padded;
        if (bal < quote + gasNeed) {
          return { ok: false as const, error: "eth hot needs 0.002 plus gas" };
        }
        const txData = encodeBuy(quote, 1n, data.from);
        let gas = 300000n;
        try {
          const [est] = await rhBatch([
            {
              method: "eth_estimateGas",
              params: [{ from: data.from, to: launch.curve, data: txData, value: `0x${quote.toString(16)}` }],
            },
          ]);
          const g = BigInt(String(est ?? "0x0"));
          if (g > 21000n) gas = g + g / 5n;
        } catch {
          /* keep default */
        }
        return {
          ok: true as const,
          steps: [
            {
              to: launch.curve,
              data: txData,
              value: `0x${quote.toString(16)}`,
              gas: `0x${gas.toString(16)}`,
              gasPrice: `0x${padded.toString(16)}`,
              nonce,
              chainId: RH_CHAIN_ID,
            },
          ],
        };
      }
      const [tokenBalRaw] = await rhBatch([
        { method: "eth_call", params: [{ to: data.mint, data: padBalanceOf(data.from) }, "latest"] },
      ]);
      const tokenBal = BigInt(String(tokenBalRaw ?? "0x0"));
      if (tokenBal <= 0n) return { ok: false as const, error: "no token balance to sell" };
      const approve = encodeApprove(launch.curve, tokenBal);
      const sell = encodeSell(tokenBal, 1n, data.from);
      return {
        ok: true as const,
        steps: [
          {
            to: data.mint,
            data: approve,
            value: "0x0",
            gas: "0x30d40",
            gasPrice: `0x${padded.toString(16)}`,
            nonce,
            chainId: RH_CHAIN_ID,
          },
          {
            to: launch.curve,
            data: sell,
            value: "0x0",
            gas: "0x7a120",
            gasPrice: `0x${padded.toString(16)}`,
            nonce: nonce + 1,
            chainId: RH_CHAIN_ID,
          },
        ],
      };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "pons build dark" };
    }
  });

export const sendSignedEthTx = createServerFn({ method: "POST" })
  .validator((input: { raw: string }) => ({
    raw: String(input.raw ?? "").slice(0, 20000),
  }))
  .handler(async ({ data }) => {
    const raw = data.raw.startsWith("0x") ? data.raw : `0x${data.raw}`;
    if (raw.length < 80) return { ok: false as const, error: "empty tx", hash: null as string | null };
    let last = "no rpc";
    for (let i = 0; i < RH_RPCS.length; i++) {
      const url = RH_RPCS[(rhRpcIndex + i) % RH_RPCS.length]!;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", "user-agent": "trencher-desk/1.0" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_sendRawTransaction",
            params: [raw],
          }),
          signal: AbortSignal.timeout(12_000),
        });
        const j = (await res.json()) as { result?: string; error?: { message?: string } };
        if (typeof j.result === "string" && j.result.startsWith("0x")) {
          rhRpcIndex = (rhRpcIndex + i) % RH_RPCS.length;
          return { ok: true as const, hash: j.result, error: null as string | null };
        }
        last = j.error?.message || `http ${res.status}`;
      } catch (e) {
        last = e instanceof Error ? e.message : "rpc fail";
      }
    }
    return { ok: false as const, error: last.slice(0, 180), hash: null };
  });

export const waitEthReceipt = createServerFn({ method: "POST" })
  .validator((input: { hash: string }) => ({
    hash: String(input.hash ?? "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    const hash = data.hash.startsWith("0x") ? data.hash : `0x${data.hash}`;
    if (hash.length < 66) return { ok: false as const, error: "bad hash", status: null as string | null };
    const deadline = Date.now() + 22_000;
    let last = "no receipt";
    while (Date.now() < deadline) {
      for (let i = 0; i < RH_RPCS.length; i++) {
        const url = RH_RPCS[(rhRpcIndex + i) % RH_RPCS.length]!;
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json", "user-agent": "trencher-desk/1.0" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "eth_getTransactionReceipt",
              params: [hash],
            }),
            signal: AbortSignal.timeout(8_000),
          });
          const j = (await res.json()) as {
            result?: { status?: string } | null;
            error?: { message?: string };
          };
          if (j.result && typeof j.result.status === "string") {
            if (j.result.status === "0x1") return { ok: true as const, status: "1", error: null as string | null };
            return { ok: false as const, error: "tx reverted", status: "0" };
          }
          last = j.error?.message || "pending";
        } catch (e) {
          last = e instanceof Error ? e.message : "rpc fail";
        }
      }
      await new Promise((r) => setTimeout(r, 700));
    }
    return { ok: false as const, error: last.slice(0, 180), status: null };
  });

export const consultMeta = createServerFn({ method: "POST" })
  .validator((input: { snapshot: string; mode?: string }) => ({
    snapshot: String(input.snapshot ?? "").slice(0, 5000),
    mode: input.mode === "review" ? "review" : "thesis",
  }))
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "AI is not available" };

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 280,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              data.mode === "review"
                ? "You are META, chief of staff of TRENCHER. You never trade. Review losing paper trades and rewrite the drop list. Use the ledger/scorecard sections when present; prefer dropping tokens that already lose on the ledger; do not invent drops absent from losses/ledger. Reply with compact JSON only: {\"thesis\":\"8 words max\",\"keywords\":[\"3-6 lowercase tokens\"],\"drop\":[\"tokens the desk may not buy\"],\"note\":\"one dry sentence about what the losers taught\"}. No markdown."
                : "You are META, chief of staff of TRENCHER. You never touch the market. Use the ledger/scorecard sections when present; prefer dropping tokens that already lose on the ledger; do not invent drops absent from losses/ledger. Reply with compact JSON only: {\"thesis\":\"8 words max\",\"keywords\":[\"3-6 lowercase tokens\"],\"drop\":[\"tokens to avoid\"],\"note\":\"one dry sentence for the log\"}. No markdown.",
          },
          { role: "user", content: data.snapshot },
        ],
      }),
    });
    if (!res.ok) {
      return { ok: false as const, error: `xAI API error ${res.status}` };
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content ?? "";
    const jsonText = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    try {
      const parsed = JSON.parse(jsonText) as {
        thesis?: string;
        keywords?: string[];
        drop?: string[];
        note?: string;
      };
      return {
        ok: true as const,
        thesis: String(parsed.thesis ?? "hold the line").slice(0, 80),
        keywords: (parsed.keywords ?? []).map((k) => String(k).toLowerCase()).slice(0, 8),
        drop: (parsed.drop ?? []).map((k) => String(k).toLowerCase()).slice(0, 8),
        note: String(parsed.note ?? "Thesis updated.").slice(0, 180),
      };
    } catch {
      return { ok: false as const, error: "unreadable thesis" };
    }
  });

export const buildLiveTrade = createServerFn({ method: "POST" })
  .validator((input: { publicKey: string; mint: string; action?: string; dump?: boolean }) => ({
    publicKey: String(input.publicKey ?? "").slice(0, 64),
    mint: String(input.mint ?? "").slice(0, 64),
    action: input.action === "sell" ? "sell" : "buy",
    dump: !!input.dump,
  }))
  .handler(async ({ data }) => {
    if (isEvmMint(data.mint)) {
      return { ok: false as const, error: "pons is paper. no ETH hot." };
    }
    if (data.publicKey.length < 32 || data.mint.length < 32) {
      return { ok: false as const, error: "bad pubkey or mint" };
    }
    try {
      const payload =
        data.action === "sell"
          ? {
              publicKey: data.publicKey,
              action: "sell",
              mint: data.mint,
              denominatedInSol: "false",
              amount: "100%",
              slippage: data.dump ? 50 : 25,
              priorityFee: data.dump ? 0.0005 : 0.0002,
              pool: data.dump ? "auto" : "pump",
            }
          : {
              publicKey: data.publicKey,
              action: "buy",
              mint: data.mint,
              denominatedInSol: "true",
              amount: 0.04,
              slippage: 25,
              priorityFee: 0.0002,
              pool: "pump",
            };
      const res = await fetch("https://pumpportal.fun/api/trade-local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const t = await res.text();
        return { ok: false as const, error: t.slice(0, 180) || `portal ${res.status}` };
      }
      const buf = Buffer.from(await res.arrayBuffer());
      return { ok: true as const, txB64: buf.toString("base64") };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "portal dark" };
    }
  });

const PUBLIC_SEND_RPCS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-rpc.publicnode.com",
  "https://solana.publicnode.com",
  "https://rpc.ankr.com/solana",
];

function envSolRpc(): string {
  const direct = String(process.env.SOLANA_RPC_URL ?? "").trim();
  if (direct.startsWith("https://")) return direct;
  const helius = String(process.env.HELIUS_API_KEY ?? "").trim();
  if (helius) return `https://mainnet.helius-rpc.com/?api-key=${helius}`;
  return "";
}

function pushUrl(out: string[], u: string) {
  const s = u.trim();
  if (!s.startsWith("https://") || out.includes(s)) return;
  out.push(s);
}

/** Live sends only — Helius / paid URL first. */
function sendRpcList(extra?: string): string[] {
  const out: string[] = [];
  pushUrl(out, extra ?? "");
  pushUrl(out, envSolRpc());
  for (const u of PUBLIC_SEND_RPCS) pushUrl(out, u);
  return out;
}

/** Reads / confirms — public first. Paid RPC is last-resort so credits stay for sends. */
function readRpcList(): string[] {
  const out: string[] = [];
  for (const u of PUBLIC_SEND_RPCS) pushUrl(out, u);
  pushUrl(out, envSolRpc());
  return out;
}

async function confirmSolSig(sig: string): Promise<{ ok: boolean; error: string }> {
  const urls = readRpcList();
  const deadline = Date.now() + 8_000;
  let last = "unconfirmed";
  let n = 0;
  while (Date.now() < deadline && n < 6) {
    const url = urls[n % urls.length] ?? urls[0];
    n += 1;
    if (!url) break;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getSignatureStatuses",
          params: [[sig], { searchTransactionHistory: true }],
        }),
        signal: AbortSignal.timeout(6_000),
      });
      if (res.status === 429 || res.status === 403) {
        last = `http ${res.status}`;
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      const j = (await res.json()) as {
        result?: { value?: Array<{ err?: unknown; confirmationStatus?: string } | null> };
        error?: { message?: string };
      };
      const st = j.result?.value?.[0];
      if (st?.err) return { ok: false, error: "on-chain err" };
      if (
        st &&
        (st.confirmationStatus === "confirmed" ||
          st.confirmationStatus === "finalized" ||
          st.confirmationStatus === "processed")
      ) {
        return { ok: true, error: "" };
      }
      last = j.error?.message || "pending";
    } catch (e) {
      last = e instanceof Error ? e.message : "rpc fail";
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return { ok: true, error: last };
}

export const sendSignedTx = createServerFn({ method: "POST" })
  .validator((input: { txB64: string; confirm?: boolean; rpc?: string }) => ({
    txB64: String(input.txB64 ?? "").slice(0, 8000),
    confirm: input.confirm !== false,
    rpc: String(input.rpc ?? "").slice(0, 280),
  }))
  .handler(async ({ data }) => {
    if (data.txB64.length < 32) return { ok: false as const, error: "empty tx", sig: null as string | null };
    const extra = data.rpc.startsWith("https://") ? data.rpc : "";
    let last = "no rpc";
    let blocked = 0;
    for (const url of sendRpcList(extra)) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "sendTransaction",
            params: [
              data.txB64,
              { encoding: "base64", skipPreflight: true, preflightCommitment: "processed" },
            ],
          }),
          signal: AbortSignal.timeout(12_000),
        });
        if (res.status === 401 || res.status === 403) {
          blocked += 1;
          last = `http ${res.status}`;
          continue;
        }
        if (res.status === 429) {
          last = "rpc rate";
          continue;
        }
        const j = (await res.json()) as { result?: string; error?: { message?: string; code?: number } };
        if (typeof j.result === "string" && j.result.length > 20) {
          const sig = j.result;
          if (!data.confirm) return { ok: true as const, sig, error: null as string | null };
          await confirmSolSig(sig);
          return { ok: true as const, sig, error: null as string | null };
        }
        last = j.error?.message || `http ${res.status}`;
      } catch (e) {
        last = e instanceof Error ? e.message : "rpc fail";
      }
    }
    if (blocked && /http 40[13]/.test(last)) {
      last = "rpc 403. paste a Helius HTTPS URL in RPC.";
    }
    return { ok: false as const, error: last.slice(0, 180), sig: null };
  });

const WSOL = "So11111111111111111111111111111111111111112";
const SKIP_ETH = new Set([RH_WETH.toLowerCase(), PONS_USDG.toLowerCase()]);

export const listHotBags = createServerFn({ method: "POST" })
  .validator((input: { sol?: string; eth?: string }) => ({
    sol: String(input.sol ?? "").slice(0, 64),
    eth: String(input.eth ?? "").slice(0, 42).toLowerCase(),
  }))
  .handler(async ({ data }) => {
    const sol: { mint: string; amount: number }[] = [];
    const eth: { mint: string; amount: string }[] = [];
    if (data.sol.length >= 32) {
      const programs = [
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      ];
      for (const url of readRpcList()) {
        let parsed = false;
        for (const programId of programs) {
          try {
            const res = await fetch(url, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "getTokenAccountsByOwner",
                params: [data.sol, { programId }, { encoding: "jsonParsed" }],
              }),
              signal: AbortSignal.timeout(12_000),
            });
            if (!res.ok) continue;
            const j = (await res.json()) as {
              result?: {
                value?: Array<{
                  account?: {
                    data?: {
                      parsed?: { info?: { mint?: string; tokenAmount?: { uiAmount?: number } } };
                    };
                  };
                }>;
              };
            };
            if (!j.result) continue;
            parsed = true;
            for (const row of j.result.value ?? []) {
              const info = row.account?.data?.parsed?.info;
              const mint = info?.mint ?? "";
              const amt = info?.tokenAmount?.uiAmount ?? 0;
              if (!mint || mint === WSOL || amt <= 0) continue;
              if (!sol.some((x) => x.mint === mint)) sol.push({ mint, amount: amt });
            }
          } catch {
            /* next */
          }
        }
        if (parsed) break;
      }
    }
    if (isEvmMint(data.eth)) {
      try {
        const res = await fetch(
          `https://robinhoodchain.blockscout.com/api/v2/addresses/${data.eth}/tokens?type=ERC-20`,
          { signal: AbortSignal.timeout(12_000), headers: { accept: "application/json" } },
        );
        const j = (await res.json()) as {
          items?: Array<{
            value?: string;
            token?: { address?: string; address_hash?: string };
          }>;
        };
        for (const item of j.items ?? []) {
          const mint = (item.token?.address_hash || item.token?.address || "").toLowerCase();
          const val = item.value ?? "0";
          if (!mint || SKIP_ETH.has(mint) || val === "0") continue;
          eth.push({ mint, amount: val });
        }
      } catch {
        /* leave empty */
      }
    }
    return { ok: true as const, sol, eth };
  });

const GMGN_HOST = "https://openapi.gmgn.ai";
const gmgnCache = new Map<string, { at: number; snap: ReturnType<typeof parseGmgnSnap> }>();
const GMGN_TTL = 90_000;

function ratio(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v > 1 ? v / 100 : v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    return n > 1 ? n / 100 : n;
  }
  return undefined;
}

function parseGmgnSnap(raw: unknown): {
  isHoneypot?: string;
  sellTax?: number;
  buyTax?: number;
  top10?: number;
  rugRatio?: number;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;
  const honey = data.is_honeypot ?? data.isHoneypot;
  return {
    isHoneypot: typeof honey === "string" ? honey : honey === true ? "yes" : honey === false ? "no" : undefined,
    sellTax: ratio(data.sell_tax ?? data.sellTax),
    buyTax: ratio(data.buy_tax ?? data.buyTax),
    top10: ratio(data.top_10_holder_rate ?? data.top10HolderRate ?? data.top_10_holder_percent),
    rugRatio: ratio(data.rug_ratio ?? data.rugRatio),
  };
}

function asciiGmgnKey(raw: string): { key: string; error: string | null } {
  const s = String(raw ?? "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!s) return { key: "", error: "no key" };
  if (/BEGIN/i.test(s) || s.includes("-----")) {
    return { key: "", error: "pem in the key box. paste the API key." };
  }
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 127) return { key: "", error: "key has junk chars. paste the API key." };
  }
  return { key: s, error: null };
}

function gmgnHeaderError(e: unknown): string {
  const msg = e instanceof Error ? e.message : "gmgn dark";
  if (/ByteString|character at index|Invalid character in header/i.test(msg)) {
    return "key has junk chars. paste the API key, not the PEM.";
  }
  return msg.slice(0, 80);
}

export const probeGmgn = createServerFn({ method: "POST" })
  .validator((input: { mint: string; key?: string; chain?: string }) => ({
    mint: String(input.mint ?? "").slice(0, 80),
    key: String(input.key ?? "").slice(0, 400),
    chain: input.chain === "robinhood" ? "robinhood" : "sol",
  }))
  .handler(async ({ data }) => {
    const rawKey = data.key || String(process.env.GMGN_API_KEY ?? "").trim();
    const cleaned = asciiGmgnKey(rawKey);
    if (cleaned.error || !cleaned.key) return { ok: false as const, error: cleaned.error || "no key", snap: null };
    const key = cleaned.key;
    if (data.mint.length < 32) return { ok: false as const, error: "bad mint", snap: null };
    const hit = gmgnCache.get(data.mint);
    if (hit && Date.now() - hit.at < GMGN_TTL) {
      return { ok: true as const, error: null as string | null, snap: hit.snap };
    }
    try {
      const qs = new URLSearchParams({
        chain: data.chain,
        address: data.mint,
        timestamp: String(Math.floor(Date.now() / 1000)),
        client_id: crypto.randomUUID(),
      });
      const res = await fetch(`${GMGN_HOST}/v1/token/security?${qs}`, {
        method: "GET",
        headers: {
          "X-APIKEY": key,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false as const, error: "bad key", snap: null };
      }
      if (res.status === 429) {
        return { ok: false as const, error: "gmgn rate", snap: null };
      }
      if (!res.ok) {
        return { ok: false as const, error: `gmgn ${res.status}`, snap: null };
      }
      const json: unknown = await res.json();
      const snap = parseGmgnSnap(json);
      gmgnCache.set(data.mint, { at: Date.now(), snap });
      return { ok: true as const, error: null as string | null, snap };
    } catch (e) {
      return {
        ok: false as const,
        error: gmgnHeaderError(e),
        snap: null,
      };
    }
  });

const GMGN_PUMP_PADS = new Set([
  "pump.fun",
  "pump_mayhem",
  "pump_mayhem_agent",
  "pump_agent",
  "pump",
]);
const GMGN_QUOTE: Record<string, number[]> = {
  sol: [4, 5, 3, 1, 13, 0],
  robinhood: [11, 20, 24, 12, 0],
};
let gmgnTapeCache: { at: number; chain: string; coins: PumpCoin[] } | null = null;
const GMGN_TAPE_TTL = 2_500;

function gmgnMs(v: unknown): number {
  const n = num(v);
  if (n <= 0) return Date.now();
  return n < 1e12 ? n * 1000 : n;
}

function coinFromGmgn(row: RawCoin, chain: "sol" | "robinhood"): PumpCoin | null {
  const mint = str(row.address) || str(row.mint);
  if (!mint) return null;
  const pad = str(row.launchpad_platform) || str(row.exchange);
  if (chain === "sol" && pad && !GMGN_PUMP_PADS.has(pad.toLowerCase())) return null;
  const usdMcap = num(row.usd_market_cap) || num(row.market_cap);
  const createdAt = gmgnMs(row.created_timestamp ?? row.creation_timestamp);
  const liveish = num(row.swaps_1m) > 0 || num(row.volume_1h) > 0;
  return {
    mint,
    name: str(row.name) || "unnamed",
    symbol: str(row.symbol) || "???",
    description: str(row.description),
    image: str(row.logo) || str(row.image) || null,
    creator: str(row.creator),
    createdAt,
    usdMcap,
    solMcap: usdMcap > 0 ? usdMcap / 140 : 0,
    replyCount: 0,
    complete: Boolean(row.complete) || num(row.complete_timestamp) > 0,
    nsfw: false,
    banned: false,
    live: liveish,
    twitter: str(row.twitter) || null,
    telegram: str(row.telegram) || null,
    website: str(row.website) || null,
    username: null,
    lastTradeAt: liveish ? Date.now() : createdAt,
    athMcap: num(row.ath_market_cap) || usdMcap,
    venue: chain === "robinhood" ? "pons" : "pump",
  };
}

export const fetchGmgnTape = createServerFn({ method: "POST" })
  .validator((input: { key?: string; chain?: string }) => ({
    key: String(input.key ?? "").slice(0, 400),
    chain: input.chain === "robinhood" ? "robinhood" : "sol",
  }))
  .handler(async ({ data }) => {
    const rawKey = data.key || String(process.env.GMGN_API_KEY ?? "").trim();
    const cleaned = asciiGmgnKey(rawKey);
    if (cleaned.error || !cleaned.key) {
      return { ok: false as const, error: cleaned.error || "no key", coins: [] as PumpCoin[] };
    }
    const key = cleaned.key;
    if (gmgnTapeCache && gmgnTapeCache.chain === data.chain && Date.now() - gmgnTapeCache.at < GMGN_TAPE_TTL) {
      return { ok: true as const, error: null as string | null, coins: gmgnTapeCache.coins };
    }
    try {
      const qs = new URLSearchParams({
        chain: data.chain,
        timestamp: String(Math.floor(Date.now() / 1000)),
        client_id: crypto.randomUUID(),
      });
      const body = {
        version: "v2",
        new_creation: {
          filters: ["offchain", "onchain"],
          launchpad_platform_v2: true,
          limit: 80,
          quote_address_type: GMGN_QUOTE[data.chain] ?? [],
        },
        near_completion: {
          filters: ["offchain", "onchain"],
          launchpad_platform_v2: true,
          limit: 40,
          quote_address_type: GMGN_QUOTE[data.chain] ?? [],
        },
        completed: {
          filters: ["offchain", "onchain"],
          launchpad_platform_v2: true,
          limit: 40,
          quote_address_type: GMGN_QUOTE[data.chain] ?? [],
        },
      };
      const res = await fetch(`${GMGN_HOST}/v1/trenches?${qs}`, {
        method: "POST",
        headers: {
          "X-APIKEY": key,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8_000),
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false as const, error: "bad key", coins: [] as PumpCoin[] };
      }
      if (res.status === 429) {
        return { ok: false as const, error: "gmgn rate", coins: [] as PumpCoin[] };
      }
      if (!res.ok) {
        return { ok: false as const, error: `gmgn ${res.status}`, coins: [] as PumpCoin[] };
      }
      const json = (await res.json()) as {
        code?: number;
        data?: { new_creation?: RawCoin[]; pump?: RawCoin[]; completed?: RawCoin[] };
        message?: string;
      };
      if (json.code != null && json.code !== 0) {
        return { ok: false as const, error: json.message || "gmgn trenches", coins: [] as PumpCoin[] };
      }
      const rows = [
        ...(json.data?.new_creation ?? []),
        ...(json.data?.pump ?? []),
        ...(json.data?.completed ?? []),
      ];
      const coins: PumpCoin[] = [];
      const seen = new Set<string>();
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const c = coinFromGmgn(row, data.chain === "robinhood" ? "robinhood" : "sol");
        if (!c || seen.has(c.mint)) continue;
        seen.add(c.mint);
        coins.push(c);
      }
      gmgnTapeCache = { at: Date.now(), chain: data.chain, coins };
      return { ok: true as const, error: null as string | null, coins };
    } catch (e) {
      return {
        ok: false as const,
        error: gmgnHeaderError(e),
        coins: [] as PumpCoin[],
      };
    }
  });
