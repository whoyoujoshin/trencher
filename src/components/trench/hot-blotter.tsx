import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTrench } from "@/lib/trench/store";
import type { ClosedTrade, LaneId } from "@/lib/trench/types";
import { formatPct, formatUsd } from "@/lib/utils";

type Row = ClosedTrade & { lane: LaneId; sign: string };

function missOf(t: ClosedTrade): { tag: string; tone: string } {
  const fill = t.pnlPct;
  const peak = typeof t.peakPct === "number" ? t.peakPct : null;
  if (peak == null) return { tag: "no peak stamp", tone: "text-subtle" };
  const left = peak - fill;
  if (peak < 0.08) return { tag: "never ran", tone: "text-subtle" };
  if (t.reason === "take" && left < 0.12) return { tag: "booked the run", tone: "text-gain" };
  if (t.reason === "take" && left >= 0.12) return { tag: "left on the table", tone: "text-warn" };
  if ((t.reason === "stop" || t.reason === "time") && peak >= 0.4 && fill < 0.1) {
    return { tag: "gave it back", tone: "text-loss" };
  }
  if ((t.reason === "stop" || t.reason === "time") && peak >= 0.2) {
    return { tag: "gave some back", tone: "text-warn" };
  }
  if (t.reason === "stop") return { tag: "stopped cold", tone: "text-loss" };
  if (t.reason === "time") return { tag: "clock", tone: "text-subtle" };
  return { tag: "held", tone: "text-muted" };
}

function hold(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function HotBlotter() {
  const closed = useTrench((s) => s.closed);
  const rival = useTrench((s) => s.rival);
  const extra = useTrench((s) => s.extra);
  const callsign = useTrench((s) => s.callsign);
  const [rail, setRail] = useState<"hot" | "all">("hot");

  const rows = useMemo(() => {
    const pack: Row[] = [
      ...closed.map((t) => ({ ...t, lane: "vet" as const, sign: callsign || "vet" })),
      ...((rival?.closed ?? []).map((t) => ({ ...t, lane: "hatch" as const, sign: rival?.callsign || "hatch" }))),
      ...((extra?.closed ?? []).map((t) => ({ ...t, lane: "cub" as const, sign: extra?.callsign || "cub" }))),
    ];
    pack.sort((a, b) => b.closedAt - a.closedAt);
    if (rail === "hot") {
      return pack.filter((t) => t.live || t.rail === "sol" || t.rail === "eth");
    }
    return pack;
  }, [closed, rival, extra, callsign, rail]);

  const hot = rows.filter((t) => t.live || t.rail === "sol" || t.rail === "eth");
  const n = hot.length;
  const wins = hot.filter((t) => t.pnlUsd > 0).length;
  const pnl = hot.reduce((s, t) => s + t.pnlUsd, 0);
  const gave = hot.filter((t) => missOf(t).tag.startsWith("gave")).length;
  const never = hot.filter((t) => missOf(t).tag === "never ran").length;

  return (
    <main className="min-h-dvh bg-bg text-fg">
      <header className="border-b border-line px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="font-mono text-2xs tracking-kicker text-subtle uppercase">hot wallet</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Blotter</h1>
          </div>
          <Link to="/" className="font-mono text-2xs tracking-label text-muted uppercase hover:text-fg">
            ← back to the desk
          </Link>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted text-pretty">
          Live SOL and ETH fills only. Peak is the high-water mark while the clip was open.
          Fill is where RISK actually booked it. The gap is what we missed.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 font-mono text-2xs text-muted">
          <span>{n} hot clips</span>
          <span>win {n ? Math.round((wins / n) * 100) : 0}%</span>
          <span className={pnl >= 0 ? "text-gain" : "text-loss"}>{formatUsd(pnl)}</span>
          <span>{gave} gave back</span>
          <span>{never} never ran</span>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setRail("hot")}
            className={`font-mono text-2xs uppercase ${rail === "hot" ? "text-fg" : "text-subtle"}`}
          >
            hot only
          </button>
          <button
            type="button"
            onClick={() => setRail("all")}
            className={`font-mono text-2xs uppercase ${rail === "all" ? "text-fg" : "text-subtle"}`}
          >
            include paper
          </button>
        </div>
      </header>

      <div className="overflow-x-auto px-4 py-4 sm:px-6">
        {rows.length === 0 ? (
          <p className="font-mono text-2xs text-subtle">
            No hot fills in this cell yet. Paper stays on the desk. New live closes stamp peak.
          </p>
        ) : (
          <table className="w-full min-w-[52rem] border-collapse text-left">
            <thead>
              <tr className="font-mono text-micro tracking-label text-subtle uppercase">
                <th className="py-2 pr-3 font-normal">ticker</th>
                <th className="py-2 pr-3 font-normal">body</th>
                <th className="py-2 pr-3 font-normal">rail</th>
                <th className="py-2 pr-3 font-normal">fill</th>
                <th className="py-2 pr-3 font-normal">peak</th>
                <th className="py-2 pr-3 font-normal">missed</th>
                <th className="py-2 pr-3 font-normal">$</th>
                <th className="py-2 pr-3 font-normal">why</th>
                <th className="py-2 pr-3 font-normal">held</th>
                <th className="py-2 font-normal">read</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const miss = missOf(t);
                const peak = typeof t.peakPct === "number" ? t.peakPct : null;
                const left = peak != null ? peak - t.pnlPct : null;
                return (
                  <tr key={`${t.mint}-${t.closedAt}-${t.lane}`} className="border-t border-line">
                    <td className="py-2 pr-3 font-mono text-2xs text-fg">${t.symbol}</td>
                    <td className="py-2 pr-3 font-mono text-2xs text-muted">{t.sign}</td>
                    <td className="py-2 pr-3 font-mono text-2xs text-muted">{t.rail ?? "paper"}</td>
                    <td className={`py-2 pr-3 font-mono text-2xs ${t.pnlPct >= 0 ? "text-gain" : "text-loss"}`}>
                      {formatPct(t.pnlPct)}
                    </td>
                    <td className="py-2 pr-3 font-mono text-2xs text-fg">
                      {peak != null ? formatPct(peak) : "—"}
                    </td>
                    <td className="py-2 pr-3 font-mono text-2xs text-loss">
                      {left != null && left > 0.02 ? formatPct(left) : "—"}
                    </td>
                    <td className={`py-2 pr-3 font-mono text-2xs ${t.pnlUsd >= 0 ? "text-gain" : "text-loss"}`}>
                      {formatUsd(t.pnlUsd)}
                    </td>
                    <td className="py-2 pr-3 font-mono text-2xs text-muted">{t.reason}</td>
                    <td className="py-2 pr-3 font-mono text-2xs text-subtle">{hold(t.heldMs)}</td>
                    <td className={`py-2 font-mono text-2xs ${miss.tone}`}>{miss.tag}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
