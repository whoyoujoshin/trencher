import { pullDesk, pushDesk } from "./cloud-server";

const PIN_KEY = "trencher-desk-pin";
const HUNTER_KEY = "trencher-cloud-hunter";

let hunter = true;

export function amHunter(): boolean {
  return hunter;
}

export function deskPin(): string {
  try {
    return localStorage.getItem(PIN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setDeskPin(pin: string) {
  try {
    if (pin) localStorage.setItem(PIN_KEY, pin);
    else localStorage.removeItem(PIN_KEY);
  } catch {
    /* ignore */
  }
}

export function hunterId(): string {
  try {
    let id = localStorage.getItem(HUNTER_KEY);
    if (!id) {
      id = `h-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
      localStorage.setItem(HUNTER_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

function pack(): string {
  const trench = localStorage.getItem("trencher-v3") ?? "";
  const hot = localStorage.getItem("trencher-hot-v1") ?? "";
  const auto = localStorage.getItem("trencher-hot-auto") ?? "";
  const ntfy = localStorage.getItem("trencher-ntfy-topic") ?? "";
  return JSON.stringify({ trench, hot, auto, ntfy, at: Date.now() });
}

function unpack(raw: string) {
  const data = JSON.parse(raw) as {
    trench?: string;
    hot?: string;
    auto?: string;
    ntfy?: string;
  };
  if (data.trench) localStorage.setItem("trencher-v3", data.trench);
  if (data.hot) localStorage.setItem("trencher-hot-v1", data.hot);
  if (data.auto) localStorage.setItem("trencher-hot-auto", data.auto);
  else localStorage.removeItem("trencher-hot-auto");
  if (data.ntfy) localStorage.setItem("trencher-ntfy-topic", data.ntfy);
}

export async function seatCloud(pin: string): Promise<string> {
  const p = pin.trim();
  if (p.length < 4) return "chamber # needs 4+ characters.";
  setDeskPin(p);
  const res = await pushDesk({ data: { pin: p, blob: pack(), hunterId: hunterId() } });
  if (!res.ok) return res.error;
  hunter = true;
  return "chamber live. anyone with this number can Watch.";
}

export async function unlockCloud(pin: string): Promise<string> {
  const p = pin.trim();
  if (p.length < 4) return "chamber # needs 4+ characters.";
  setDeskPin(p);
  const res = await pullDesk({ data: { pin: p, hunterId: hunterId() } });
  if (!res.ok) return res.error;
  unpack(res.blob);
  hunter = res.hunter;
  return res.hunter ? "this tab is the hunter." : "watching the chamber. hunter tab still trades.";
}

export async function syncCloud(push: boolean): Promise<"hunter" | "watch" | "off"> {
  const pin = deskPin();
  if (!pin) return "off";
  if (push && hunter) {
    const res = await pushDesk({ data: { pin, blob: pack(), hunterId: hunterId() } });
    if (!res.ok) return hunter ? "hunter" : "watch";
    hunter = true;
    return "hunter";
  }
  const res = await pullDesk({ data: { pin, hunterId: hunterId() } });
  if (!res.ok) return hunter ? "hunter" : "watch";
  unpack(res.blob);
  hunter = res.hunter;
  return hunter ? "hunter" : "watch";
}
