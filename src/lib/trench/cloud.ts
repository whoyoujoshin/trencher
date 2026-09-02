import { pullDesk, pushDesk } from "./cloud-server";

const PIN_KEY = "trencher-desk-pin";
const HUNTER_KEY = "trencher-cloud-hunter";
const EYE_KEY = "trencher-cloud-eye";

let hunter = false;
let watching = 0;

export function amHunter(): boolean {
  return hunter;
}

export function chamberEyes(): number {
  return watching;
}

function noteEyes(n?: number) {
  if (typeof n === "number" && n >= 0) watching = n;
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

function eyeId(): string {
  try {
    let id = sessionStorage.getItem(EYE_KEY);
    if (!id) {
      id = `e-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
      sessionStorage.setItem(EYE_KEY, id);
    }
    return id;
  } catch {
    return hunterId();
  }
}

function pack(): string {
  const trench = localStorage.getItem("trencher-v3") ?? "";
  const hot = localStorage.getItem("trencher-hot-v1") ?? "";
  const auto = localStorage.getItem("trencher-hot-auto") ?? "";
  const ntfy = localStorage.getItem("trencher-ntfy-topic") ?? "";
  const spirit = localStorage.getItem("trencher-spirit-v1") ?? "";
  const eth = localStorage.getItem("trencher-eth-hot-v1") ?? "";
  const live = localStorage.getItem("trencher-live-mints") ?? "";
  return JSON.stringify({ trench, hot, auto, ntfy, spirit, eth, live, at: Date.now() });
}

function unpack(raw: string) {
  let data: {
    trench?: string;
    hot?: string;
    auto?: string;
    ntfy?: string;
    spirit?: string;
    eth?: string;
    live?: string;
  };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    return;
  }
  if (data.trench) localStorage.setItem("trencher-v3", data.trench);
  if (data.hot) localStorage.setItem("trencher-hot-v1", data.hot);
  if (data.auto) localStorage.setItem("trencher-hot-auto", data.auto);
  else localStorage.removeItem("trencher-hot-auto");
  if (data.ntfy) localStorage.setItem("trencher-ntfy-topic", data.ntfy);
  if (data.spirit) localStorage.setItem("trencher-spirit-v1", data.spirit);
  if (data.eth) localStorage.setItem("trencher-eth-hot-v1", data.eth);
  if (data.live) localStorage.setItem("trencher-live-mints", data.live);
}

function ids() {
  return { hunterId: hunterId(), eyeId: eyeId() };
}

export async function seatCloud(pin: string): Promise<string> {
  const p = pin.trim();
  if (p.length < 4) return "chamber # needs 4+ characters.";
  setDeskPin(p);
  const pulled = await pullDesk({ data: { pin: p, ...ids() } });
  if (pulled.ok) unpack(pulled.blob);
  else if (pulled.error && !/no chamber yet/i.test(pulled.error)) return pulled.error;
  const res = await pushDesk({ data: { pin: p, blob: pack(), force: true, ...ids() } });
  if (!res.ok) return res.error;
  hunter = true;
  noteEyes(res.watching);
  const n = res.watching;
  return n
    ? `cell taken. ${n} watching.`
    : "cell taken. this tab is the hunter.";
}

export async function unlockCloud(pin: string): Promise<string> {
  const p = pin.trim();
  if (p.length < 4) return "chamber # needs 4+ characters.";
  setDeskPin(p);
  const res = await pullDesk({ data: { pin: p, ...ids() } });
  if (!res.ok) return res.error;
  unpack(res.blob);
  hunter = res.hunter;
  noteEyes(res.watching);
  if (res.hunter) return "this tab is the hunter.";
  const n = res.watching;
  return n
    ? `watching. ${n} on this number. hunter tab still trades.`
    : "watching the chamber. hunter tab still trades.";
}

export async function syncCloud(push: boolean): Promise<"hunter" | "watch" | "off"> {
  const pin = deskPin();
  if (!pin) {
    watching = 0;
    hunter = false;
    return "off";
  }
  if (push && hunter) {
    const res = await pushDesk({ data: { pin, blob: pack(), ...ids() } });
    if (res.ok) {
      hunter = true;
      noteEyes(res.watching);
      return "hunter";
    }
  }
  const res = await pullDesk({ data: { pin, ...ids() } });
  if (!res.ok) return hunter ? "hunter" : "watch";
  unpack(res.blob);
  hunter = res.hunter;
  noteEyes(res.watching);
  return hunter ? "hunter" : "watch";
}
