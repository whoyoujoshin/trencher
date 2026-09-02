import { createServerFn } from "@tanstack/react-start";
import { isEvmMint, type PumpCoin } from "./types";

const PUMP = "https://frontend-api-v3.pump.fun";
const RH_RPCS = [
  "https://robinhood-rpc.publicnode.com",
  "https://rpc-robinhood.blockmachine.io",
  "https://rpc.solidrpc.io/public/evm/4663",
  "https://robinhood.rpc.blxrbdn.com",
  "https://rpc.mainnet.chain.robinhood.com",
];
const RH_V3_FACTORY = "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA";
const PONS_V2_FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";
const RH_WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const PONS_USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const POOL_CREATED =
  "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118";
const TOKEN_LAUNCHED =
  "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607";
const PONS_FEE = 10_000;
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

const creatorCache = new Map<
  string,
  { at: number; count: number; symbols: string[] }
>();
const CREATOR_TTL = 3 * 60_000;

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
    createdAt: num(raw.created_timestamp),
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
    lastTradeAt: num(raw.last_trade_timestamp) || null,
    athMcap: num(raw.ath_market_cap) || usdMcap,
    venue: "pump",
  };
}

async function pumpGet(path: string): Promise<unknown> {
  const res = await fetch(`${PUMP}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(9000),
  });
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
type PonsLaunch = {
  token: string;
  curve: string;
  pool: string;
  deployer: string;
  pair: string;
  tokenIs0: boolean;
  block: number;
  kind: "v2" | "v3";
};
const ponsLaunches = new Map<string, PonsLaunch>();
const ponsKnown = new Map<string, PumpCoin>();

function packPons(coins: PumpCoin[], ethUsd: number): Extract<PonsTape, { ok: true }> {
  const newest = [...coins].sort((a, b) => b.createdAt - a.createdAt);
  return {
    ok: true,
    newest,
    traded: newest.filter((c) => c.usdMcap >= 2500).slice(0, 16),
    solUsd: ethUsd,
  };
}

async function geckoPons(ethUsd: number): Promise<PumpCoin[]> {
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
  const out: PumpCoin[] = [];
  for (const pool of body.data ?? []) {
    const quoteId = pool.relationships?.quote_token?.data?.id ?? "";
    const baseId = pool.relationships?.base_token?.data?.id ?? "";
    const quote = tokens.get(quoteId);
    const base = tokens.get(baseId);
    const quoteAddr = (quote?.address ?? "").toLowerCase();
    const baseAddr = (base?.address ?? "").toLowerCase();
    const token = quoteAddr === RH_WETH ? base : baseAddr === RH_WETH ? quote : null;
    const mint = (token?.address ?? "").toLowerCase();
    if (!isEvmMint(mint) || mint === RH_WETH) continue;
    const usdMcap = num(pool.attributes?.market_cap_usd) || num(pool.attributes?.fdv_usd);
    const created = Date.parse(pool.attributes?.pool_created_at ?? "") || Date.now();
    out.push({
      mint,
      name: token?.name || pool.attributes?.name || "unnamed",
      symbol: token?.symbol || "???",
      description: "Pons launch on Robinhood Chain",
      image: token?.image_url ?? null,
      creator: "",
      createdAt: created,
      usdMcap,
      solMcap: ethUsd > 0 ? usdMcap / ethUsd : 0,
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
      athMcap: usdMcap,
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
  if (!Number.isFinite(mcap) || mcap <= 0 || mcap > 90_000) return 0;
  return Math.round(mcap);
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
  if (cold) {
    for (let i = 0; i < PONS_V2_WINDOWS; i++) {
      const to = bn - i * PONS_LOOKBACK;
      const from = to - PONS_LOOKBACK + 1;
      if (to <= 0) break;
      pushLogWindow(logCalls, PONS_V2_FACTORY, TOKEN_LAUNCHED, from, to);
    }
    pushLogWindow(logCalls, RH_V3_FACTORY, POOL_CREATED, bn - PONS_LOOKBACK + 1, bn);
  } else {
    const from = Math.max(0, ponsHead - 128);
    pushLogWindow(logCalls, PONS_V2_FACTORY, TOKEN_LAUNCHED, from, bn);
    pushLogWindow(logCalls, RH_V3_FACTORY, POOL_CREATED, from, bn);
  }
  const raws = await rhBatch(logCalls);
  const v2Count = cold ? Math.min(PONS_V2_WINDOWS, logCalls.length - 1) : 1;
  for (let i = 0; i < v2Count; i++) {
    const raw = raws[i];
    if (!Array.isArray(raw)) continue;
    for (const row of parseTokenLaunched(raw as { topics?: string[]; data?: string; blockNumber?: string }[])) {
      ponsLaunches.set(row.token, row);
    }
  }
  const v3Raw = raws[v2Count];
  if (Array.isArray(v3Raw)) {
    for (const row of parsePonsLogs(v3Raw as { topics?: string[]; data?: string; blockNumber?: string }[])) {
      if (!ponsLaunches.has(row.token)) ponsLaunches.set(row.token, row);
    }
  }
  ponsHead = bn;
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
    const graduated = row.kind === "v3" || (remaining > 0 && remaining < PONS_SUPPLY * 0.15);
    const coin: PumpCoin = {
      mint: row.token,
      name: q?.name || extra?.name || prev?.name || "unnamed",
      symbol: q?.symbol || extra?.symbol || prev?.symbol || "???",
      description: row.kind === "v2" ? "Pons V2 bonding curve" : "Pons launch on Robinhood Chain",
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
    if (fee !== PONS_FEE) continue;
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
  try {
    const [newestRaw, tradedRaw] = await Promise.all([
      pumpGet(
        "/coins?offset=0&limit=40&sort=created_timestamp&order=DESC&includeNsfw=false",
      ),
      pumpGet(
        "/coins?offset=0&limit=24&sort=last_trade_timestamp&order=DESC&includeNsfw=false",
      ),
    ]);
    const newest = asCoins(newestRaw);
    const traded = asCoins(tradedRaw);
    return {
      ok: true as const,
      newest,
      traded,
      solUsd: solFrom([...newest, ...traded]),
    };
  } catch (err) {
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
const LIVE_ETH_WEI = 1_000_000_000_000_000n; // 0.001 ETH
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
      const [nonceRaw, gasPriceRaw, balRaw] = await rhBatch([
        { method: "eth_getTransactionCount", params: [data.from, "pending"] },
        { method: "eth_gasPrice", params: [] },
        { method: "eth_getBalance", params: [data.from, "latest"] },
      ]);
      const nonce = Number(BigInt(String(nonceRaw ?? "0x0")));
      const gasPrice = BigInt(String(gasPriceRaw ?? "0x1a20a8e0"));
      const bal = BigInt(String(balRaw ?? "0x0"));
      if (data.action === "buy") {
        const quote = LIVE_ETH_WEI;
        const gasNeed = 250_000n * gasPrice;
        if (bal < quote + gasNeed) {
          return { ok: false as const, error: "eth hot needs 0.001 plus gas" };
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
              gasPrice: `0x${gasPrice.toString(16)}`,
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
            gas: "0x186a0",
            gasPrice: `0x${gasPrice.toString(16)}`,
            nonce,
            chainId: RH_CHAIN_ID,
          },
          {
            to: launch.curve,
            data: sell,
            value: "0x0",
            gas: "0x493e0",
            gasPrice: `0x${gasPrice.toString(16)}`,
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

export const consultMeta = createServerFn({ method: "POST" })
  .validator((input: { snapshot: string; mode?: string }) => ({
    snapshot: String(input.snapshot ?? "").slice(0, 4000),
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
                ? "You are META, chief of staff of TRENCHER. You never trade. Review losing paper trades and rewrite the drop list. Reply with compact JSON only: {\"thesis\":\"8 words max\",\"keywords\":[\"3-6 lowercase tokens\"],\"drop\":[\"tokens the desk may not buy\"],\"note\":\"one dry sentence about what the losers taught\"}. No markdown."
                : "You are META, chief of staff of TRENCHER. You never touch the market. Reply with compact JSON only: {\"thesis\":\"8 words max\",\"keywords\":[\"3-6 lowercase tokens\"],\"drop\":[\"tokens to avoid\"],\"note\":\"one dry sentence for the log\"}. No markdown.",
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
  .validator((input: { publicKey: string; mint: string; action?: string }) => ({
    publicKey: String(input.publicKey ?? "").slice(0, 64),
    mint: String(input.mint ?? "").slice(0, 64),
    action: input.action === "sell" ? "sell" : "buy",
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
              slippage: 25,
              priorityFee: 0.0002,
              pool: "pump",
            }
          : {
              publicKey: data.publicKey,
              action: "buy",
              mint: data.mint,
              denominatedInSol: "true",
              amount: 0.02,
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

const SEND_RPCS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-rpc.publicnode.com",
  "https://rpc.ankr.com/solana",
];

export const sendSignedTx = createServerFn({ method: "POST" })
  .validator((input: { txB64: string }) => ({
    txB64: String(input.txB64 ?? "").slice(0, 8000),
  }))
  .handler(async ({ data }) => {
    if (data.txB64.length < 32) return { ok: false as const, error: "empty tx", sig: null as string | null };
    let last = "no rpc";
    for (const url of SEND_RPCS) {
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
        });
        const j = (await res.json()) as { result?: string; error?: { message?: string; code?: number } };
        if (typeof j.result === "string" && j.result.length > 20) {
          return { ok: true as const, sig: j.result, error: null as string | null };
        }
        last = j.error?.message || `http ${res.status}`;
      } catch (e) {
        last = e instanceof Error ? e.message : "rpc fail";
      }
    }
    return { ok: false as const, error: last.slice(0, 180), sig: null };
  });
