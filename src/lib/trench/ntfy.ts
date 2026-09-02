const KEY = "trencher-ntfy-topic";
const HOST = "https://ntfy.sh";
const HEART_MS = 15 * 60_000;
const BURST_MS = 8_000;

let lastBeat = 0;
let lastPing = 0;

export function ntfyTopic(): string {
  if (typeof window === "undefined") return "";
  try {
    return (window.localStorage.getItem(KEY) || "").trim();
  } catch {
    return "";
  }
}

export function setNtfyTopic(raw: string): string | null {
  const topic = raw.trim().replace(/^https?:\/\/ntfy\.sh\//i, "");
  if (!topic) {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(topic)) {
    return "8–64 letters, numbers, dash or underscore.";
  }
  try {
    window.localStorage.setItem(KEY, topic);
  } catch {
    return "couldn't save the topic.";
  }
  return null;
}

export function pingNtfy(title: string, body: string, force = false): void {
  if (typeof window === "undefined") return;
  const topic = ntfyTopic();
  if (!topic) return;
  const now = Date.now();
  if (!force && now - lastPing < BURST_MS) return;
  lastPing = now;
  void fetch(`${HOST}/${encodeURIComponent(topic)}`, {
    method: "POST",
    headers: {
      Title: title.slice(0, 80),
      "Content-Type": "text/plain; charset=utf-8",
    },
    body: body.slice(0, 500),
  }).catch(() => undefined);
}

export function ntfyHeartbeat(body: string): void {
  const now = Date.now();
  if (now - lastBeat < HEART_MS) return;
  lastBeat = now;
  pingNtfy("TRENCHER", body, true);
}
