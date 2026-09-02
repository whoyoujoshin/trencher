import { createServerFn } from "@tanstack/react-start";
import type { PumpCoin } from "./types";

const PUMP = "https://frontend-api-v3.pump.fun";

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

export const fetchQuotes = createServerFn({ method: "POST" })
  .validator((input: { mints: string[] }) => ({
    mints: Array.isArray(input.mints)
      ? input.mints.filter((m) => typeof m === "string").slice(0, 8)
      : [],
  }))
  .handler(async ({ data }) => {
    const quotes: Record<string, { usdMcap: number; athMcap: number }> = {};
    await Promise.all(
      data.mints.map(async (mint) => {
        try {
          const raw = await pumpGet(`/coins/${encodeURIComponent(mint)}`);
          const coin = raw && typeof raw === "object" ? normalize(raw as RawCoin) : null;
          if (coin) quotes[mint] = { usdMcap: coin.usdMcap, athMcap: coin.athMcap };
        } catch {
          /* keep last known */
        }
      }),
    );
    return { quotes };
  });

export const fetchCreator = createServerFn({ method: "POST" })
  .validator((input: { address: string }) => ({
    address: String(input.address ?? "").slice(0, 64),
  }))
  .handler(async ({ data }) => {
    const address = data.address;
    if (!address) return { count: 0, symbols: [] as string[] };
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
