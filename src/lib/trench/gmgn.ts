const KEY = "trencher-gmgn-key";

export function gmgnKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return (window.localStorage.getItem(KEY) || "").trim();
  } catch {
    return "";
  }
}

export function setGmgnKey(raw: string): string | null {
  const key = raw.trim();
  if (!key) {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
  if (key.length < 12 || key.length > 220) {
    return "paste the GMGN API key from gmgn.ai/ai. not a wallet key.";
  }
  try {
    window.localStorage.setItem(KEY, key);
  } catch {
    return "couldn't save the key.";
  }
  return null;
}
