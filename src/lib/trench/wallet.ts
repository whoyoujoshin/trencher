import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { buildLiveTrade, buildPonsTrade, fetchEthBalance, fetchHotBalance, sendSignedEthTx, sendSignedTx } from "./server";
import { isEvmMint } from "./types";

const KEY = "trencher-wallet-v1";
const SIGN_KEY = "trencher-sign-one";
const HOT_KEY = "trencher-hot-v1";
const HOT_ARM = "trencher-hot-auto";
const LIVE_MINTS = "trencher-live-mints";

export const LIVE_CAP_SOL = 0.02;
export const LIVE_CAP_ETH = 0.001;
const ETH_KEY = "trencher-eth-hot-v1";

export function markLiveMint(mint: string) {
  if (!mint) return;
  try {
    const cur = JSON.parse(localStorage.getItem(LIVE_MINTS) || "[]") as string[];
    if (cur.includes(mint)) return;
    localStorage.setItem(LIVE_MINTS, JSON.stringify([...cur, mint].slice(-80)));
  } catch {
    /* ignore */
  }
}

export function isLiveMint(mint: string): boolean {
  if (!mint) return false;
  try {
    return (JSON.parse(localStorage.getItem(LIVE_MINTS) || "[]") as string[]).includes(mint);
  } catch {
    return false;
  }
}

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toBase58(): string; toString(): string };
  isConnected?: boolean;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toBase58(): string } }>;
  disconnect: () => Promise<void>;
  on: (event: string, handler: () => void) => void;
  signAndSendTransaction: (tx: VersionedTransaction) => Promise<{ signature: string }>;
};

function phantom(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { solana?: PhantomProvider; phantom?: { solana?: PhantomProvider } };
  const p = w.phantom?.solana ?? w.solana;
  return p?.isPhantom ? p : p ?? null;
}

export type WalletSnap = {
  pubkey: string | null;
  sol: number | null;
  error: string | null;
};

export function savedPubkey(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export type SignOneState = "armed" | "spent" | "idle";

export function signOneState(): SignOneState {
  try {
    const v = localStorage.getItem(SIGN_KEY);
    if (v === "spent") return "spent";
    if (v === "armed") return "armed";
  } catch {
    /* ignore */
  }
  return "idle";
}

export function armSignOne(): SignOneState {
  try {
    if (localStorage.getItem(SIGN_KEY) === "spent") return "spent";
    localStorage.setItem(SIGN_KEY, "armed");
  } catch {
    /* ignore */
  }
  return "armed";
}

function spendSignOne() {
  try {
    localStorage.setItem(SIGN_KEY, "spent");
  } catch {
    /* ignore */
  }
}

export type HotSnap = {
  pubkey: string;
  sol: number | null;
  auto: boolean;
  secretB64: string;
};

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function loadHotKey(): Keypair | null {
  try {
    const raw = localStorage.getItem(HOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { secret?: string };
    if (!parsed.secret) return null;
    return Keypair.fromSecretKey(b64ToBytes(parsed.secret));
  } catch {
    return null;
  }
}

export function ensureHot(): HotSnap {
  let kp = loadHotKey();
  if (!kp) {
    kp = Keypair.generate();
    try {
      localStorage.setItem(
        HOT_KEY,
        JSON.stringify({ secret: bytesToB64(kp.secretKey), pubkey: kp.publicKey.toBase58() }),
      );
    } catch {
      /* ignore */
    }
  }
  return {
    pubkey: kp.publicKey.toBase58(),
    sol: null,
    auto: hotAutoArmed(),
    secretB64: bytesToB64(kp.secretKey),
  };
}

export function hotAutoArmed(): boolean {
  try {
    return localStorage.getItem(HOT_ARM) === "armed";
  } catch {
    return false;
  }
}

export function setHotAuto(on: boolean): boolean {
  try {
    if (on) localStorage.setItem(HOT_ARM, "armed");
    else localStorage.removeItem(HOT_ARM);
  } catch {
    /* ignore */
  }
  return on;
}

async function rpcBalance(pubkey: string): Promise<number> {
  const r = await fetchHotBalance({ data: { pubkey } });
  if (!r.ok || r.sol == null) throw new Error(r.error || "rpc dark");
  return r.sol;
}

export async function refreshHot(): Promise<HotSnap> {
  const hot = ensureHot();
  try {
    hot.sol = await rpcBalance(hot.pubkey);
  } catch {
    hot.sol = null;
  }
  hot.auto = hotAutoArmed();
  return hot;
}

export async function connectWallet(): Promise<WalletSnap> {
  const p = phantom();
  if (!p) {
    return { pubkey: null, sol: null, error: "no phantom. open the published tab, not the preview." };
  }
  try {
    const creds = await p.connect();
    const pubkey = creds.publicKey.toBase58();
    try {
      localStorage.setItem(KEY, pubkey);
    } catch {
      /* ignore */
    }
    const sol = await rpcBalance(pubkey);
    return { pubkey, sol, error: null };
  } catch (e) {
    return {
      pubkey: savedPubkey(),
      sol: null,
      error: e instanceof Error ? e.message : "wallet refused.",
    };
  }
}

export async function disconnectWallet(): Promise<void> {
  try {
    await phantom()?.disconnect();
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export async function refreshWallet(): Promise<WalletSnap> {
  const p = phantom();
  const pk = p?.publicKey?.toBase58?.() ?? savedPubkey();
  if (!pk) return { pubkey: null, sol: null, error: null };
  try {
    const sol = await rpcBalance(pk);
    return { pubkey: pk, sol, error: null };
  } catch (e) {
    return { pubkey: pk, sol: null, error: e instanceof Error ? e.message : "rpc dark" };
  }
}

export function shadowQuote(fillUsd: number, solUsd: number): { sol: number; usd: number } {
  const px = solUsd > 0 ? solUsd : 140;
  const raw = fillUsd / px;
  const sol = Math.min(LIVE_CAP_SOL, Math.max(0, Math.round(raw * 1000) / 1000));
  return { sol, usd: Math.round(sol * px * 100) / 100 };
}

export async function signOneBuy(mint: string, symbol: string): Promise<{ ok: boolean; text: string }> {
  if (signOneState() !== "armed") {
    return { ok: false, text: "sign-one is not armed." };
  }
  const p = phantom();
  if (!p) {
    return { ok: false, text: "no phantom. cannot sign." };
  }
  try {
    await p.connect({ onlyIfTrusted: true }).catch(() => p.connect());
  } catch {
    return { ok: false, text: "phantom refused connect." };
  }
  const pubkey = p.publicKey?.toBase58?.() ?? savedPubkey();
  if (!pubkey) return { ok: false, text: "no pubkey." };
  let sol = 0;
  try {
    sol = await rpcBalance(pubkey);
  } catch {
    /* still try */
  }
  if (sol > 0 && sol < LIVE_CAP_SOL + 0.003) {
    return { ok: false, text: `wallet has ${sol.toFixed(3)} SOL. need ${LIVE_CAP_SOL} plus fee.` };
  }
  const built = await buildLiveTrade({ data: { publicKey: pubkey, mint, action: "buy" } });
  if (!built.ok) return { ok: false, text: `portal: ${built.error}` };
  try {
    const raw = Uint8Array.from(atob(built.txB64), (c) => c.charCodeAt(0));
    const tx = VersionedTransaction.deserialize(raw);
    const sent = await p.signAndSendTransaction(tx);
    spendSignOne();
    const sig = sent.signature;
    markLiveMint(mint);
    return {
      ok: true,
      text: `SIGNED · 0.02 SOL buy $${symbol} · ${sig.slice(0, 8)}… · sign-one spent. https://solscan.io/tx/${sig}`,
    };
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : "sign rejected." };
  }
}

export async function hotBuy(mint: string, symbol: string): Promise<{ ok: boolean; text: string }> {
  if (!hotAutoArmed()) return { ok: false, text: "hot auto is off." };
  const kp = loadHotKey();
  if (!kp) return { ok: false, text: "no hot wallet." };
  const pubkey = kp.publicKey.toBase58();
  let sol = 0;
  try {
    sol = await rpcBalance(pubkey);
  } catch {
    return { ok: false, text: "could not read hot balance." };
  }
  if (sol < LIVE_CAP_SOL + 0.003) {
    return { ok: false, text: `hot has ${sol.toFixed(3)} SOL. send at least 0.05. auto skipped.` };
  }
  const built = await buildLiveTrade({ data: { publicKey: pubkey, mint, action: "buy" } });
  if (!built.ok) return { ok: false, text: `portal: ${built.error}` };
  try {
    const raw = Uint8Array.from(atob(built.txB64), (c) => c.charCodeAt(0));
    const tx = VersionedTransaction.deserialize(raw);
    tx.sign([kp]);
    const signed = bytesToB64(tx.serialize());
    const sent = await sendSignedTx({ data: { txB64: signed } });
    if (!sent.ok || !sent.sig) {
      return { ok: false, text: `HOT send failed: ${sent.error}` };
    }
    markLiveMint(mint);
    return {
      ok: true,
      text: `HOT · 0.02 SOL $${symbol} · ${sent.sig.slice(0, 8)}… https://solscan.io/tx/${sent.sig}`,
    };
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : "hot send failed." };
  }
}

async function signHot(mint: string, action: "buy" | "sell"): Promise<{ ok: boolean; sig?: string; error?: string }> {
  const kp = loadHotKey();
  if (!kp) return { ok: false, error: "no hot wallet." };
  const pubkey = kp.publicKey.toBase58();
  const built = await buildLiveTrade({ data: { publicKey: pubkey, mint, action } });
  if (!built.ok) return { ok: false, error: built.error };
  const raw = Uint8Array.from(atob(built.txB64), (c) => c.charCodeAt(0));
  const tx = VersionedTransaction.deserialize(raw);
  tx.sign([kp]);
  const sent = await sendSignedTx({ data: { txB64: bytesToB64(tx.serialize()) } });
  if (!sent.ok || !sent.sig) return { ok: false, error: sent.error || "send failed" };
  return { ok: true, sig: sent.sig };
}

export async function hotSell(mint: string, symbol: string): Promise<{ ok: boolean; text: string }> {
  if (!hotAutoArmed()) return { ok: false, text: "hot auto is off." };
  const kp = loadHotKey();
  if (!kp) return { ok: false, text: "no hot wallet." };
  try {
    const sent = await signHot(mint, "sell");
    if (!sent.ok || !sent.sig) {
      return { ok: false, text: `HOT sell $${symbol} failed: ${sent.error}` };
    }
    return {
      ok: true,
      text: `HOT SELL · 100% $${symbol} · ${sent.sig.slice(0, 8)}… https://solscan.io/tx/${sent.sig}`,
    };
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : "hot sell failed." };
  }
}

export type EthHotSnap = {
  address: string;
  eth: number | null;
  auto: boolean;
};

function loadEthPk(): `0x${string}` | null {
  try {
    const raw = localStorage.getItem(ETH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { secret?: string };
    if (!parsed.secret || !parsed.secret.startsWith("0x")) return null;
    return parsed.secret as `0x${string}`;
  } catch {
    return null;
  }
}

function writeEthPk(pk: `0x${string}`): EthHotSnap {
  const acct = privateKeyToAccount(pk);
  try {
    localStorage.setItem(ETH_KEY, JSON.stringify({ secret: pk, address: acct.address }));
  } catch {
    /* ignore */
  }
  return { address: acct.address, eth: null, auto: hotAutoArmed() };
}

export function peekEthHot(): EthHotSnap {
  const pk = loadEthPk();
  if (!pk) return { address: "", eth: null, auto: hotAutoArmed() };
  const acct = privateKeyToAccount(pk);
  return { address: acct.address, eth: null, auto: hotAutoArmed() };
}

export function ensureEthHot(): EthHotSnap {
  return peekEthHot();
}

export function mintEthHot(): EthHotSnap {
  const existing = peekEthHot();
  if (existing.address) return existing;
  return writeEthPk(generatePrivateKey());
}

export function importEthHot(secret: string): { ok: boolean; snap?: EthHotSnap; error?: string } {
  const raw = secret.trim();
  const pk = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    return { ok: false, error: "not a 32-byte hex key." };
  }
  try {
    return { ok: true, snap: writeEthPk(pk) };
  } catch {
    return { ok: false, error: "that key would not load." };
  }
}

export async function refreshEthHot(): Promise<EthHotSnap> {
  const hot = peekEthHot();
  if (!hot.address) return hot;
  try {
    const r = await fetchEthBalance({ data: { address: hot.address } });
    hot.eth = r.ok ? r.eth : null;
  } catch {
    hot.eth = null;
  }
  hot.auto = hotAutoArmed();
  return hot;
}

async function signAndSendEthSteps(
  steps: {
    to: string;
    data: string;
    value: string;
    gas: string;
    gasPrice: string;
    nonce: number;
    chainId: number;
  }[],
): Promise<{ ok: boolean; hash?: string; error?: string }> {
  const pk = loadEthPk();
  if (!pk) return { ok: false, error: "no eth hot." };
  const account = privateKeyToAccount(pk);
  let last = "";
  for (const step of steps) {
    const signed = await account.signTransaction({
      to: step.to as `0x${string}`,
      data: step.data as `0x${string}`,
      value: BigInt(step.value),
      gas: BigInt(step.gas),
      gasPrice: BigInt(step.gasPrice),
      nonce: step.nonce,
      chainId: step.chainId,
      type: "legacy",
    });
    const sent = await sendSignedEthTx({ data: { raw: signed } });
    if (!sent.ok || !sent.hash) return { ok: false, error: sent.error || "eth send failed" };
    last = sent.hash;
  }
  return { ok: true, hash: last };
}

export async function ethHotBuy(mint: string, symbol: string): Promise<{ ok: boolean; text: string }> {
  if (!hotAutoArmed()) return { ok: false, text: "hot auto is off." };
  if (!isEvmMint(mint)) return { ok: false, text: "not a pons mint." };
  const hot = peekEthHot();
  if (!hot.address) return { ok: false, text: "no ETH hot. paste the Firefox key or mint one." };
  let eth = 0;
  try {
    const r = await fetchEthBalance({ data: { address: hot.address } });
    eth = r.eth ?? 0;
  } catch {
    return { ok: false, text: "could not read ETH hot." };
  }
  if (eth < LIVE_CAP_ETH + 0.0002) {
    return { ok: false, text: `ETH hot has ${eth.toFixed(4)} ETH. send at least 0.002. auto skipped.` };
  }
  const built = await buildPonsTrade({ data: { from: hot.address, mint, action: "buy" } });
  if (!built.ok) return { ok: false, text: `pons: ${built.error}` };
  try {
    const sent = await signAndSendEthSteps(built.steps);
    if (!sent.ok || !sent.hash) return { ok: false, text: `ETH send failed: ${sent.error}` };
    markLiveMint(mint);
    return {
      ok: true,
      text: `HOT · 0.001 ETH $${symbol} · ${sent.hash.slice(0, 10)}… https://robinhoodchain.blockscout.com/tx/${sent.hash}`,
    };
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : "eth hot send failed." };
  }
}

export async function ethHotSell(mint: string, symbol: string): Promise<{ ok: boolean; text: string }> {
  if (!hotAutoArmed()) return { ok: false, text: "hot auto is off." };
  if (!isEvmMint(mint)) return { ok: false, text: "not a pons mint." };
  const hot = peekEthHot();
  if (!hot.address) return { ok: false, text: "no ETH hot." };
  const built = await buildPonsTrade({ data: { from: hot.address, mint, action: "sell" } });
  if (!built.ok) return { ok: false, text: `pons sell: ${built.error}` };
  try {
    const sent = await signAndSendEthSteps(built.steps);
    if (!sent.ok || !sent.hash) return { ok: false, text: `ETH sell failed: ${sent.error}` };
    return {
      ok: true,
      text: `HOT SELL · 100% $${symbol} · ${sent.hash.slice(0, 10)}… https://robinhoodchain.blockscout.com/tx/${sent.hash}`,
    };
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : "eth hot sell failed." };
  }
}
