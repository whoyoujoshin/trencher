const KEY = "trencher-gmgn-key";

export function sanitizeGmgnKey(raw: string): { key: string; error: string | null } {
  let s = String(raw ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!s) return { key: "", error: "empty. paste the GMGN API key only." };
  if (/BEGIN/i.test(s) || s.includes("-----")) {
    return { key: "", error: "that's the PEM. paste the API key GMGN showed after you uploaded the public key." };
  }
  if (s.length < 12 || s.length > 400) {
    return { key: "", error: "paste the GMGN API key from gmgn.ai/ai. not a wallet key." };
  }
  return { key: s, error: null };
}

export function gmgnKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const { key } = sanitizeGmgnKey(window.localStorage.getItem(KEY) || "");
    return key;
  } catch {
    return "";
  }
}

export function setGmgnKey(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
  const { key, error } = sanitizeGmgnKey(trimmed);
  if (error || !key) return error || "could not read that key.";
  try {
    window.localStorage.setItem(KEY, key);
  } catch {
    return "couldn't save the key.";
  }
  return null;
}
