const KEY = "trencher-sol-rpc";

export function sanitizeSolRpc(raw: string): { url: string; error: string | null } {
  const s = String(raw ?? "").replace(/\s+/g, "").trim();
  if (!s) return { url: "", error: null };
  if (!/^https:\/\/[a-z0-9.-]+/i.test(s) || s.length > 280) {
    return { url: "", error: "paste an https Solana RPC URL (Helius, QuickNode, Alchemy)." };
  }
  if (/wallet|private|secret|BEGIN/i.test(s)) {
    return { url: "", error: "that's a key. paste the RPC URL only." };
  }
  return { url: s, error: null };
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
