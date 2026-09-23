const KEY = "trencher-sol-rpc";
const HELIUS = "https://mainnet.helius-rpc.com/?api-key=";

export function sanitizeSolRpc(raw: string): { url: string; error: string | null } {
  const s = String(raw ?? "").replace(/\s+/g, "").trim();
  if (!s) return { url: "", error: null };
  if (/^https:\/\//i.test(s)) {
    if (!/^https:\/\/[a-z0-9.-]+/i.test(s) || s.length > 280) {
      return { url: "", error: "paste an https Solana RPC URL or a Helius API key." };
    }
    if (/wallet|private|secret|BEGIN/i.test(s)) {
      return { url: "", error: "that's a wallet secret. paste the RPC URL or Helius API key." };
    }
    return { url: s, error: null };
  }
  if (/^[A-Za-z0-9_-]{16,120}$/.test(s)) {
    return { url: `${HELIUS}${s}`, error: null };
  }
  return { url: "", error: "paste a Helius API key or an https RPC URL." };
}

export function solRpcUrl(): string {
  if (typeof window === "undefined") return "";
  try {
    const { url } = sanitizeSolRpc(window.localStorage.getItem(KEY) || "");
    return url;
  } catch {
    return "";
  }
}

export function setSolRpcUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
  const { url, error } = sanitizeSolRpc(trimmed);
  if (error || !url) return error || "could not read that URL.";
  try {
    window.localStorage.setItem(KEY, url);
  } catch {
    return "couldn't save the URL.";
  }
  return null;
}
