import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUsd(n: number, digits = 2): string {
  const abs = Math.abs(n);
  return (
    (n < 0 ? "-" : "") +
    "$" +
    abs.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  );
}

export function formatPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}

export function shortAddr(addr: string, n = 4): string {
  if (!addr) return "—";
  if (addr.length <= n * 2 + 1) return addr;
  return `${addr.slice(0, n)}…${addr.slice(-n)}`;
}

export function elapsed(from: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - from) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function ageLabel(createdMs: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - createdMs) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

const VAULT_KEYS = ["trencher-v3", "trencher-spirit-v1"] as const;
const VAULT_QUOTA = 5 * 1024 * 1024;

export function vaultPressure(): {
  pct: number;
  fat: boolean;
  blocked: boolean;
  label: string;
} {
  if (typeof window === "undefined") {
    return { pct: 0, fat: false, blocked: false, label: "—" };
  }
  let chars = 0;
  let blocked = false;
  try {
    const ls = window.localStorage;
    blocked = ls.getItem("trencher-vault-blocked") === "1";
    for (const key of VAULT_KEYS) {
      const v = ls.getItem(key);
      if (v) chars += key.length + v.length;
    }
  } catch {
    blocked = true;
  }
  const pct = Math.min(99, (chars * 2) / VAULT_QUOTA * 100);
  const fat = pct >= 60 || blocked;
  const shown = pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
  return {
    pct,
    fat,
    blocked,
    label: blocked ? "blocked · save file" : fat ? "fat · seat it" : shown,
  };
}
