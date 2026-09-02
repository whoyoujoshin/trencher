import { Component, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  Activity,
  Brain,
  Crosshair,
  Landmark,
  Radio,
  Shield,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { bootTrench, deskMastery, equityNow, useTrench } from "@/lib/trench/store";
import { useSpirit } from "@/lib/trench/spirit";
import {
  AGENTS,
  CYCLE_MS,
  RENT_USD,
  ROUND_MS,
  STARTING_CASH,
  TRAIL_ARM,
  TRAIL_GIVE,
  type AgentId,
  type KillRecord,
  type LogLine,
  type Position,
} from "@/lib/trench/types";
import { ageLabel, cn, elapsed, formatPct, formatUsd, shortAddr, vaultPressure } from "@/lib/utils";
import { ntfyTopic, pingNtfy, setNtfyTopic } from "@/lib/trench/ntfy";
import { amHunter, deskPin, seatCloud, syncCloud, unlockCloud } from "@/lib/trench/cloud";
import {
  connectWallet,
  disconnectWallet,
  ensureHot,
  hotAutoArmed,
  isLiveMint,
  refreshHot,
  refreshWallet,
  setHotAuto,
  signOneState,
} from "@/lib/trench/wallet";
import { blankPlaybook, pickHotLane, pnlPct, positionValue, wardenScore } from "@/lib/trench/logic";

const ICONS: Record<AgentId, typeof Radio> = {
  SCOUT: Radio,
  WARDEN: Shield,
  SNIPER: Crosshair,
  RISK: Activity,
  TILL: Landmark,
  META: Brain,
};

function railOf(
  t: { mint: string; symbol: string; rail?: "paper" | "sol"; live?: boolean },
  logs: { mint?: string; symbol?: string; text: string }[],
): "paper" | "sol" {
  if (t.rail === "sol" || t.live) return "sol";
  if (isLiveMint(t.mint)) return "sol";
  const hit = logs.some(
    (l) =>
      (l.mint === t.mint || l.symbol === t.symbol || l.text.includes(`$${t.symbol}`)) &&
      (l.text.includes("HOT ·") || l.text.includes("HOT SELL") || l.text.startsWith("SIGNED")),
  );
  return hit ? "sol" : "paper";
}

export function TrenchApp() {
  return (
    <DeskGuard>
      <TrenchInner />
    </DeskGuard>
  );
}

class DeskGuard extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(err: Error) {
    return { err: err.message || "fault" };
  }
  render() {
    if (this.state.err) {
      return (
        <main className="flex min-h-dvh flex-col justify-center bg-bg px-5 py-10 sm:px-10">
          <p className="font-mono text-2xs tracking-kicker text-loss uppercase">desk fault</p>
          <h1 className="mt-3 text-display font-semibold leading-[0.88] tracking-[-0.04em]">
            The page threw.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted text-pretty">
            Render died. The book is still in the browser. Reload the desk — cash and scars stay if they were saved.
          </p>
          <div className="mt-8">
            <Button size="lg" onClick={() => this.setState({ err: null })}>
              Reload the desk
            </Button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

function TrenchInner() {
  const hydrated = useTrench((s) => s.hydrated);
  const status = useTrench((s) => s.status);
  const vetDead = useTrench((s) => s.vetDead);
  const rival = useTrench((s) => s.rival);
  const extra = useTrench((s) => s.extra);
  const setHydrated = useTrench((s) => s.setHydrated);
  const cycle = useTrench((s) => s.cycle);
  const atHome = useTrench((s) => s.atHome);
  const [cloudRole, setCloudRole] = useState<"hunter" | "watch" | "off">("off");
  const hatchLive = !!rival && (rival.status === "alive" || rival.status === "survived");
  const cubLive = !!extra && (extra.status === "alive" || extra.status === "survived");
  const hunting =
    status === "watch" ||
    (!vetDead && (status === "alive" || status === "survived")) ||
    hatchLive ||
    cubLive;

  useEffect(() => {
    void bootTrench().finally(() => setHydrated());
  }, [setHydrated]);

  useEffect(() => {
    if (!deskPin()) {
      setCloudRole("off");
      return;
    }
    let on = true;
    const beat = async () => {
      const wasHunter = amHunter();
      const role = await syncCloud(wasHunter);
      if (!on) return;
      setCloudRole(role);
      if (role === "watch" || (!wasHunter && role === "hunter")) {
        await useTrench.persist.rehydrate();
      }
    };
    void beat();
    const id = window.setInterval(() => void beat(), 4000);
    return () => {
      on = false;
      window.clearInterval(id);
    };
  }, [hydrated]);

  useEffect(() => {
    if (status !== "idle") return;
    const s = useTrench.getState();
    if (s.rival || s.extra || (s.scanned ?? 0) > 50 || s.roundStartedAt) {
      useTrench.setState({ status: s.rentPaid ? "survived" : "alive" });
    }
  }, [status]);

  useEffect(() => {
    if (!hunting || cloudRole === "watch") return;
    void cycle();
    const id = window.setInterval(() => {
      void cycle();
    }, CYCLE_MS);
    return () => window.clearInterval(id);
  }, [hunting, cycle, cloudRole]);

  if (!hydrated) {
    return <WakeScreen ready={false} />;
  }

  if (atHome || (status === "idle" && !hatchLive && !cubLive)) {
    return <WakeScreen ready hunting={hunting && status !== "idle"} />;
  }
  if (status === "dead") return <DeathScreen />;
  return <Desk cloudRole={cloudRole} />;
}

function BookDock({ compact = false }: { compact?: boolean }) {
  const snapshotBook = useTrench((s) => s.snapshotBook);
  const ingestBook = useTrench((s) => s.ingestBook);
  const inputRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function save() {
    const book = snapshotBook();
    const blob = new Blob([JSON.stringify(book, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const day = new Date(book.savedAt).toISOString().slice(0, 10);
    a.href = url;
    a.download = `trencher-book-c${book.house.generation || 1}-${day}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg("book walked out.");
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        const err = ingestBook(parsed);
        setMsg(err ?? "book loaded.");
      } catch {
        setMsg("that file is not a book.");
      }
    };
    reader.readAsText(file);
  }

  const size = compact ? "sm" : "lg";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onFile}
      />
      <Button size={size} variant="ghost" onClick={save} className={compact ? "" : "min-h-12"}>
        Save the book
      </Button>
      <Button
        size={size}
        variant="ghost"
        onClick={() => inputRef.current?.click()}
        className={compact ? "" : "min-h-12"}
      >
        Load the book
      </Button>
      <Button size={size} variant="ghost" asChild className={compact ? "" : "min-h-12"}>
        <Link to="/spirit">Spirit box</Link>
      </Button>
      {msg ? <p className="font-mono text-2xs text-subtle">{msg}</p> : null}
    </div>
  );
}

function NtfyDock() {
  const [topic, setTopic] = useState("");
  const [armed, setArmed] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const t = ntfyTopic();
    setTopic(t);
    setArmed(t);
  }, []);

  function save() {
    const err = setNtfyTopic(topic);
    if (err) {
      setMsg(err);
      return;
    }
    const t = ntfyTopic();
    setArmed(t);
    setMsg(t ? "phone is listening." : "ntfy off.");
    if (t) pingNtfy("TRENCHER", "desk is live. this is the test ping.", true);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="ntfy topic"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="h-9 w-36 border border-line bg-elevated px-2 font-mono text-2xs text-fg placeholder:text-subtle"
      />
      <Button size="sm" variant="ghost" onClick={save}>
        {armed ? "ntfy on" : "Arm ntfy"}
      </Button>
      {msg ? <p className="font-mono text-2xs text-subtle">{msg}</p> : null}
    </div>
  );
}

function WalletDock() {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [sol, setSol] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sign, setSign] = useState(signOneState);
  const [hotPk, setHotPk] = useState("");
  const [hotSol, setHotSol] = useState<number | null>(null);
  const [hotAuto, setHotAutoUi] = useState(false);

  const storeHotSol = useTrench((s) => s.hotSol);
  const storeHotPk = useTrench((s) => s.hotPubkey);

  useEffect(() => {
    const h = ensureHot();
    setHotPk(storeHotPk || h.pubkey);
    setHotAutoUi(h.auto);
    void refreshHot().then((s) => {
      setHotPk(s.pubkey);
      setHotSol(s.sol);
      setHotAutoUi(s.auto);
    });
    void refreshWallet().then((s) => {
      setPubkey(s.pubkey);
      setSol(s.sol);
      setSign(signOneState());
    });
  }, [storeHotPk]);

  useEffect(() => {
    if (storeHotSol != null) setHotSol(storeHotSol);
  }, [storeHotSol]);

  async function connect() {
    setBusy(true);
    const s = await connectWallet();
    setBusy(false);
    setPubkey(s.pubkey);
    setSol(s.sol);
    setMsg(s.error ?? (s.pubkey ? `${s.sol ?? "—"} SOL watching. fund the HOT wallet to auto.` : null));
  }

  async function drop() {
    await disconnectWallet();
    setPubkey(null);
    setSol(null);
    setMsg("phantom dropped.");
  }

  function copyHot() {
    if (!hotPk) return;
    const input = document.getElementById("trencher-hot-addr") as HTMLInputElement | null;
    if (input) {
      input.focus();
      input.select();
      input.setSelectionRange(0, hotPk.length);
    }
    void navigator.clipboard.writeText(hotPk).then(
      () => setMsg("hot address copied. send ~0.05 SOL. not your phantom."),
      () => {
        try {
          document.execCommand("copy");
          setMsg("hot address copied. send ~0.05 SOL.");
        } catch {
          setMsg("highlight the address and ctrl+c. clipboard is blocked.");
        }
      },
    );
  }

  function toggleAuto() {
    const on = setHotAuto(!hotAuto);
    setHotAutoUi(on);
    setMsg(
      on
        ? "HOT AUTO on. Hatch fills spend 0.02 SOL. no popup. telegram-bot rules."
        : "hot auto off.",
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pubkey ? (
        <>
          <span className="font-mono text-2xs text-muted">
            ph {shortAddr(pubkey, 4)}
            {sol != null ? ` · ${sol.toFixed(3)}` : ""}
          </span>
          <Button size="sm" variant="ghost" onClick={() => void drop()}>
            Drop
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void connect()}>
          {busy ? "Connecting…" : "Connect Phantom"}
        </Button>
      )}
      {hotPk ? (
        <>
          <input
            id="trencher-hot-addr"
            readOnly
            value={hotPk}
            onFocus={(e) => e.currentTarget.select()}
            spellCheck={false}
            className="h-9 w-[14rem] border border-line bg-elevated px-2 font-mono text-2xs text-fg"
            title={hotPk}
          />
          <Button size="sm" variant="ghost" onClick={copyHot}>
            Copy hot
          </Button>
          <span className="font-mono text-2xs text-muted">
            {hotSol != null ? `${hotSol.toFixed(3)} SOL` : "…"}
          </span>
          <Button size="sm" variant={hotAuto ? "primary" : "ghost"} onClick={toggleAuto}>
            {hotAuto ? "HOT AUTO" : "Arm hot auto"}
          </Button>
        </>
      ) : null}
      {sign === "armed" && !hotAuto ? (
        <span className="font-mono text-2xs text-subtle">sign-one still armed (popup)</span>
      ) : null}
      {msg ? <p className="font-mono text-2xs text-subtle">{msg}</p> : null}
    </div>
  );
}

function CloudDock() {
  const [pin, setPin] = useState(deskPin);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function seat() {
    setBusy(true);
    const text = await seatCloud(pin);
    setBusy(false);
    setMsg(text);
  }

  async function unlock() {
    setBusy(true);
    const text = await unlockCloud(pin);
    setBusy(false);
    setMsg(text);
    window.setTimeout(() => window.location.reload(), 400);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        placeholder="chamber #"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="h-9 w-36 border border-line bg-elevated px-2 font-mono text-2xs text-fg placeholder:text-subtle"
      />
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void seat()}>
        Chamber #
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void unlock()}>
        Watch
      </Button>
      {msg ? <p className="font-mono text-2xs text-subtle">{msg}</p> : null}
    </div>
  );
}

function WakeScreen({
  ready = true,
  hunting = false,
}: {
  ready?: boolean;
  hunting?: boolean;
}) {
  const arm = useTrench((s) => s.arm);
  const spectate = useTrench((s) => s.spectate);
  const leaveHome = useTrench((s) => s.leaveHome);
  return (
    <main className="relative flex min-h-dvh flex-col justify-between bg-bg px-5 py-8 sm:px-10 sm:py-12">
      <header className="flex items-center justify-between text-muted">
        <p className="font-mono text-2xs tracking-kicker uppercase">paper trench</p>
        <p className="font-mono text-2xs tracking-label uppercase">live pump.fun tape</p>
      </header>

      <section className="mx-auto flex w-full max-w-xl flex-col gap-6 py-10">
        <p className="stagger-in font-mono text-2xs tracking-kicker text-muted uppercase">
          six desks · one veto · they keep the scars
        </p>
        <h1 className="stagger-in text-display font-semibold leading-[0.86] tracking-[-0.04em] text-balance">
          TRENCHER
        </h1>
        <p className="stagger-in max-w-md text-base leading-snug text-muted text-pretty">
          Most of the desk is stopping. Every loser rewrites the playbook — Warden
          burns the wallet, Sniper raises the floor, Risk tightens the stop, never
          widens it. Stake {formatUsd(STARTING_CASH, 0)}. Pay {formatUsd(RENT_USD, 0)} rent or get deleted.
          If it dies, the next clone inherits the book. Cash does not.
        </p>
        <div className="stagger-in flex flex-col gap-3 sm:flex-row sm:items-center">
          {hunting ? (
            <Button size="lg" onClick={() => leaveHome()} className="min-h-12 w-full sm:w-auto">
              Back to the pit
            </Button>
          ) : (
            <Button
              size="lg"
              disabled={!ready}
              onClick={() => arm()}
              className="min-h-12 w-full sm:w-auto"
            >
              {ready ? `Stake ${formatUsd(STARTING_CASH, 0)}` : "Loading the book…"}
            </Button>
          )}
          {!hunting ? (
            <Button
              size="lg"
              variant="ghost"
              disabled={!ready}
              onClick={() => spectate()}
              className="min-h-12 w-full sm:w-auto"
            >
              Spectate
            </Button>
          ) : null}
          <BookDock />
          <CloudDock />
          <p className="font-mono text-2xs leading-relaxed text-subtle">
            Second window is a blank cell. Do not stake. Load the book JSON from Downloads.
            The hunt, Hatch, and hot wallet live in the tab that was already running.
          </p>
        </div>
      </section>

      <ul className="stagger-in mx-auto grid w-full max-w-3xl grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {AGENTS.map((a) => (
          <li key={a.id} className="border-t border-line pt-3">
            <p className="font-mono text-2xs tracking-label text-fg uppercase">{a.title}</p>
            <p className="mt-1 text-xs leading-snug text-muted">{a.owns}</p>
            <p className="mt-1 text-micro leading-snug text-subtle">{a.never}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}

function DeathScreen() {
  const clone = useTrench((s) => s.clone);
  const scanned = useTrench((s) => s.scanned);
  const killed = useTrench((s) => s.killed);
  const closed = useTrench((s) => s.closed);
  const startedAt = useTrench((s) => s.startedAt);
  const diedAt = useTrench((s) => s.diedAt);
  const lessons = useTrench((s) => s.lessons);
  const rentPaid = useTrench((s) => s.rentPaid);
  const house = useTrench((s) => s.house);
  const best = closed.reduce((m, t) => Math.max(m, t.pnlPct), 0);
  const wins = closed.filter((t) => t.pnlUsd > 0).length;
  const held = startedAt && diedAt ? elapsed(startedAt, diedAt) : "—";
  const rank = deskMastery({ lessons, killed, closed, rentPaid, startedAt, now: diedAt ?? Date.now() });

  return (
    <main className="flex min-h-dvh flex-col justify-center bg-bg px-5 py-10 sm:px-10">
      <div className="mx-auto w-full max-w-lg">
        <p className="font-mono text-2xs tracking-kicker text-loss uppercase">kill rule</p>
        <h1 className="mt-3 text-display font-semibold leading-[0.88] tracking-[-0.04em]">
          Clone {house?.generation || 1} deleted
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted text-pretty">
          Balance hit zero. This clone is gone. Scanned {scanned.toLocaleString()} launches,
          killed {killed.toLocaleString()}, closed {closed.length} trades
          {closed.length ? ` (${wins} wins)` : ""}. Best print {formatPct(best)}. Lived {held}. Died a {rank.label}. {lessons.length} scar{lessons.length === 1 ? "" : "s"} stay on the book.
        </p>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-fg text-pretty">
          Cash dies. Memory does not — if you save the book. This window is not a vault.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          <Button size="lg" onClick={() => clone()}>
            Wake the next one
          </Button>
          <BookDock />
          <p className="font-mono text-2xs text-subtle">
            New {formatUsd(STARTING_CASH, 0)}. Same book — if you saved it.
          </p>
        </div>
      </div>
    </main>
  );
}

function Desk({ cloudRole = "off" }: { cloudRole?: "hunter" | "watch" | "off" }) {
  const vetCash = useTrench((s) => s.cash);
  const vetPositions = useTrench((s) => s.positions);
  const vetClosed = useTrench((s) => s.closed);
  const vetLessons = useTrench((s) => s.lessons);
  const vetPlaybook = useTrench((s) => s.playbook) ?? blankPlaybook();
  const vetFees = useTrench((s) => s.feesPaid);
  const vetStarted = useTrench((s) => s.startedAt);
  const vetRent = useTrench((s) => s.rentPaid);
  const vetDead = useTrench((s) => s.vetDead);
  const rival = useTrench((s) => s.rival);
  const extra = useTrench((s) => s.extra);
  const houseBank = useTrench((s) => s.houseBank);
  const hotSol = useTrench((s) => s.hotSol);
  const hotPubkey = useTrench((s) => s.hotPubkey);
  const logs = useTrench((s) => s.logs);
  const lastHotLine = useTrench((s) => s.lastHotLine);
  const spiritFloor = useSpirit((s) => s.canon.scoreFloor);
  const round = useTrench((s) => s.round);
  const roundStartedAt = useTrench((s) => s.roundStartedAt);
  const focus = useTrench((s) => s.focus);
  const spawnRival = useTrench((s) => s.spawnRival);
  const cull = useTrench((s) => s.cull);
  const setFocus = useTrench((s) => s.setFocus);
  const goHome = useTrench((s) => s.goHome);
  const rentPaid = useTrench((s) => s.rentPaid);
  const status = useTrench((s) => s.status);
  const scanned = useTrench((s) => s.scanned);
  const killed = useTrench((s) => s.killed);
  const meta = useTrench((s) => s.meta);
  const payRent = useTrench((s) => s.payRent);
  const ticking = useTrench((s) => s.ticking);
  const tapeError = useTrench((s) => s.tapeError);
  const kills = useTrench((s) => s.kills);
  const house = useTrench((s) => s.house);
  const vetSign = useTrench((s) => s.callsign) || "BODY";
  const hatchSign = rival?.callsign || "BODY";
  const cubSign = extra?.callsign || "BODY";
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const hatchFocus = focus === "hatch" && !!rival;
  const cubFocus = focus === "cub" && !!extra;
  const lane = cubFocus && extra ? extra : hatchFocus && rival ? rival : null;
  const cash = lane ? lane.cash : vetCash;
  const positions = lane ? lane.positions : vetPositions;
  const closed = lane ? lane.closed : vetClosed;
  const lessons = lane ? lane.lessons : vetLessons;
  const playbook = lane ? lane.playbook : vetPlaybook;
  const feesPaid = lane ? lane.feesPaid : vetFees;
  const startedAt = lane ? lane.startedAt : vetStarted;
  const laneRent = lane ? lane.rentPaid : vetRent;

  const equity = equityNow(cash, positions);
  const pnl = equity - STARTING_CASH;
  const ward = wardenScore(kills ?? []);
  const rank = deskMastery({
    lessons,
    killed,
    closed,
    rentPaid: laneRent,
    startedAt,
    now,
    heldKills: ward.held,
    pnlUsd: pnl,
  });
  const winPct = closed.length
    ? closed.filter((t) => t.pnlUsd > 0).length / closed.length
    : 0;
  const vault = vaultPressure();
  const hatchLive = !!rival && (rival.status === "alive" || rival.status === "survived");
  const cubLive = !!extra && (extra.status === "alive" || extra.status === "survived");
  const vetLive = !vetDead && (status === "alive" || status === "survived");
  const eqV = equityNow(vetCash, vetPositions);
  const eqH = rival ? equityNow(rival.cash, rival.positions) : 0;
  const eqC = extra ? equityNow(extra.cash, extra.positions) : 0;
  const liveCount = (vetLive ? 1 : 0) + (hatchLive ? 1 : 0) + (cubLive ? 1 : 0);
  const cellFull = hatchLive && cubLive;
  const focusSign = cubFocus ? cubSign : hatchFocus ? hatchSign : vetSign;
  const focusCash = cubFocus ? extra?.cash ?? 0 : hatchFocus ? rival?.cash ?? 0 : vetCash;
  const focusSitting = cubFocus ? !!extra?.rentPaid : hatchFocus ? !!rival?.rentPaid : rentPaid;
  const focusHunting = cubFocus ? cubLive : hatchFocus ? hatchLive : vetLive;
  const canPay = focusHunting && !focusSitting && focusCash >= RENT_USD;
  const huntCount =
    (vetLive && !rentPaid ? 1 : 0) +
    (hatchLive && rival && !rival.rentPaid ? 1 : 0) +
    (cubLive && extra && !extra.rentPaid ? 1 : 0);
  const hotId = pickHotLane(now, [
    {
      id: "vet",
      hunting: vetLive && !rentPaid,
      closed: vetClosed,
      startedAt: vetStarted,
    },
    {
      id: "hatch",
      hunting: hatchLive && !!rival && !rival.rentPaid,
      closed: rival?.closed ?? [],
      startedAt: rival?.startedAt ?? null,
    },
    {
      id: "cub",
      hunting: cubLive && !!extra && !extra.rentPaid,
      closed: extra?.closed ?? [],
      startedAt: extra?.startedAt ?? null,
    },
  ]);
  const hotSign =
    hotId === "cub" ? cubSign : hotId === "hatch" ? hatchSign : hotId === "vet" ? vetSign : "—";

  return (
    <div className="min-h-dvh overflow-x-hidden bg-bg text-fg">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex items-baseline gap-3">
            <button
              type="button"
              onClick={() => goHome()}
              className="text-lg font-semibold tracking-[-0.03em] hover:text-muted"
              title="Home. Hunt keeps running."
            >
              TRENCHER
            </button>
            <StatusChip status={status} ticking={ticking} error={tapeError} />
            {status !== "watch" ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFocus("vet")}
                className={cn(
                  "border px-2 py-1 font-mono text-2xs tracking-label uppercase",
                  focus === "vet" ? "border-fg text-fg" : "border-line text-muted hover:text-fg",
                )}
              >
                {vetSign} {vetLive ? (rentPaid ? `rest ${formatUsd(eqV)}` : formatUsd(eqV)) : "dead"}
              </button>
              {rival ? (
                <button
                  type="button"
                  onClick={() => setFocus("hatch")}
                  className={cn(
                    "border px-2 py-1 font-mono text-2xs tracking-label uppercase",
                    focus === "hatch" ? "border-fg text-fg" : "border-line text-muted hover:text-fg",
                  )}
                >
                  {hatchSign} {hatchLive ? (rival.rentPaid ? `rest ${formatUsd(eqH)}` : formatUsd(eqH)) : "dead"}
                </button>
              ) : null}
              {extra ? (
                <button
                  type="button"
                  onClick={() => setFocus("cub")}
                  className={cn(
                    "border px-2 py-1 font-mono text-2xs tracking-label uppercase",
                    focus === "cub" ? "border-fg text-fg" : "border-line text-muted hover:text-fg",
                  )}
                >
                  {cubSign} {cubLive ? (extra.rentPaid ? `rest ${formatUsd(eqC)}` : formatUsd(eqC)) : "dead"}
                </button>
              ) : null}
            </div>
            ) : null}
          </div>
          <p className="ml-auto font-mono text-2xs tracking-label text-subtle uppercase">paper usd</p>
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs tabular-nums">
            {(rival || extra) && status !== "watch" ? (
              <>
                <Stat
                  label={vetSign}
                  value={vetLive ? formatUsd(eqV) : "dead"}
                  tone={!vetLive ? "loss" : eqV - STARTING_CASH >= 0 ? "gain" : "loss"}
                />
                {rival ? (
                  <Stat
                    label={hatchSign}
                    value={hatchLive ? formatUsd(eqH) : "dead"}
                    tone={!hatchLive ? "loss" : eqH - STARTING_CASH >= 0 ? "gain" : "loss"}
                  />
                ) : null}
                {extra ? (
                  <Stat
                    label={cubSign}
                    value={cubLive ? formatUsd(eqC) : "dead"}
                    tone={!cubLive ? "loss" : eqC - STARTING_CASH >= 0 ? "gain" : "loss"}
                  />
                ) : null}
              </>
            ) : (
              <Stat
                label="Equity"
                value={status === "watch" ? "—" : formatUsd(equity)}
                tone={status === "watch" ? undefined : pnl >= 0 ? "gain" : "loss"}
              />
            )}
            <Stat label="Cash" value={status === "watch" ? "—" : formatUsd(cash)} />
            <Stat
              label="PnL"
              value={status === "watch" ? "watch" : `${pnl >= 0 ? "+" : ""}${formatUsd(pnl)}`}
              tone={status === "watch" ? undefined : pnl >= 0 ? "gain" : "loss"}
            />
            <Stat
              label="Fees"
              value={formatUsd(feesPaid ?? 0)}
              tone={(feesPaid ?? 0) > 0 ? "loss" : undefined}
            />
            <Stat
              label="Rent"
              value={rentPaid ? "paid" : formatUsd(RENT_USD, 0)}
              tone={rentPaid ? "gain" : "warn"}
            />
            <Stat label="Scanned" value={scanned.toLocaleString()} />
            <Stat
              label="Kill"
              value={scanned ? `${((killed / scanned) * 100).toFixed(1)}%` : "—"}
            />
            <Stat
              label="Ward"
              value={ward.held + ward.missed ? `${(ward.acc * 100).toFixed(0)}%` : "—"}
              tone={
                !(ward.held + ward.missed)
                  ? undefined
                  : ward.acc >= 0.7
                    ? "gain"
                    : ward.acc < 0.45
                      ? "loss"
                      : "warn"
              }
            />
            <Stat label="Clock" value={startedAt ? elapsed(startedAt, now) : "00:00"} />
            <Stat
              label="Round"
              value={
                roundStartedAt
                  ? (() => {
                      const left = Math.max(0, ROUND_MS - (now - roundStartedAt));
                      const d = Math.floor(left / 86_400_000);
                      const h = Math.floor((left % 86_400_000) / 3_600_000);
                      return `R${round || 1} ${d}d ${h}h`;
                    })()
                  : `R${round || 1}`
              }
            />
            <Stat
              label="Bank"
              value={formatUsd(houseBank ?? 0)}
              tone={(houseBank ?? 0) > 0 ? "gain" : undefined}
            />
            <Stat
              label="Win"
              value={closed.length ? `${(winPct * 100).toFixed(0)}%` : "—"}
              tone={
                !closed.length ? undefined : winPct >= 0.45 ? "gain" : winPct < 0.3 ? "loss" : "warn"
              }
            />
            <Stat label="Rank" value={rank.label} />
            <Stat label="Clone" value={String(house?.generation || 1)} />
            <Stat
              label="Vault"
              value={vault.label}
              tone={vault.blocked ? "loss" : vault.fat ? "warn" : undefined}
            />
          </dl>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-gain/25 bg-gain/5 px-4 py-2 sm:px-6">
          <p className="font-mono text-2xs tracking-label text-gain uppercase">real sol</p>
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs tabular-nums">
            <Stat
              label="Hot"
              value={hotSol == null ? "—" : `${hotSol.toFixed(3)} SOL`}
              tone={(hotSol ?? 0) >= 0.023 ? "gain" : (hotSol ?? 0) > 0 ? "warn" : undefined}
            />
            <Stat
              label="Auto"
              value={hotAutoArmed() ? `on · ${hotSign}` : "off"}
              tone={hotAutoArmed() ? "gain" : "warn"}
            />
            <Stat
              label="Spirit"
              value={`floor ${spiritFloor ?? "—"}`}
            />
            <Stat
              label="Addr"
              value={hotPubkey ? shortAddr(hotPubkey, 4) : "—"}
            />
            <Stat
              label="Last"
              value={
                lastHotLine?.slice(0, 52) ??
                logs.find(
                  (l) =>
                    l.text.includes("HOT ·") ||
                    l.text.includes("HOT SELL") ||
                    l.text.includes("SPIRIT veto") ||
                    l.text.startsWith("SIGNED"),
                )?.text.slice(0, 48) ?? "no live fill yet"
              }
            />
            <Stat
              label="Cloud"
              value={cloudRole === "off" ? "local" : cloudRole === "watch" ? "watching" : "hunting"}
              tone={cloudRole === "hunter" ? "gain" : cloudRole === "watch" ? "warn" : undefined}
            />
          </dl>
          <p className="font-mono text-2xs text-subtle">
            Cash, bank, rent, PnL are paper. Only this row spends SOL.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2 sm:px-6">
          <p className="mr-auto font-mono text-2xs tracking-wide text-muted">
            thesis · {meta.thesis}
            {meta.source === "grok" ? " · grok" : meta.source === "local" ? " · local" : ""}
            {" · "}floor {playbook.scoreFloor}
            {" · "}stop {(playbook.stopPct * 100).toFixed(0)}%
            {" · "}trail +{(TRAIL_ARM * 100).toFixed(0)}%/−{(TRAIL_GIVE * 100).toFixed(0)}% peak
            {playbook.bannedCreators.length ? ` · ${playbook.bannedCreators.length} burned` : ""}
            {` · ${cubFocus ? cubSign : hatchFocus ? hatchSign : vetSign}`}
            {` · ${rank.label}`}
          </p>
          <BookDock compact />
          <NtfyDock />
          <CloudDock />
          <WalletDock />
          {status !== "watch" && !cellFull && (vetLive || hatchLive || cubLive) ? (
            <Button size="sm" variant="ghost" onClick={() => spawnRival()}>
              Wake a body
            </Button>
          ) : null}
          {status !== "watch" && huntCount >= 2 ? (
            <Button size="sm" variant="ghost" onClick={() => cull()}>
              Cull {focusSign}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={canPay ? "primary" : "quiet"}
            disabled={!canPay}
            onClick={() => payRent()}
          >
            {focusSitting
              ? `${focusSign} sitting`
              : `Pay ${focusSign} ${formatUsd(RENT_USD, 0)}`}
          </Button>
        </div>
      </header>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <AgentRail />
          <LogFeed />
        </div>
        <aside className="border-t border-line lg:border-t-0 lg:border-l">
          <Book
            positions={positions}
            now={now}
            closed={closed}
            lessons={lessons}
            lane={cubFocus ? cubSign : hatchFocus ? hatchSign : vetSign}
          />
          <Tape />
        </aside>
      </div>
    </div>
  );
}

function StatusChip({
  status,
  ticking,
  error,
}: {
  status: string;
  ticking: boolean;
  error: string | null;
}) {
  const label = error
    ? "tape dark"
    : status === "watch"
      ? "spectating"
      : status === "survived"
        ? "rent paid"
        : ticking
          ? "cycling"
          : "live";
  const tone = error ? "text-loss" : status === "watch" ? "text-muted" : "text-gain";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-2xs tracking-label uppercase",
        tone,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "gain" | "loss" | "warn";
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-micro tracking-label text-subtle uppercase">{label}</dt>
      <dd
        className={cn(
          "text-fg",
          tone === "gain" && "text-gain",
          tone === "loss" && "text-loss",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function AgentRail() {
  const agents = useTrench((s) => s.agents);
  return (
    <section className="grid grid-cols-2 border-b border-line sm:grid-cols-3 lg:grid-cols-6">
      {AGENTS.map((a) => {
        const Icon = ICONS[a.id];
        const pulse = agents[a.id];
        return (
          <article key={a.id} className="border-b border-r border-line px-4 py-3">
            <div className="flex items-center gap-2 text-muted">
              <Icon className="size-3.5" strokeWidth={1.75} />
              <p className="font-mono text-micro tracking-label uppercase">{a.title}</p>
            </div>
            <p className="mt-2 line-clamp-2 min-h-8 text-xs leading-snug text-fg">
              {pulse?.lastText ?? "asleep"}
            </p>
            <p className="mt-1 line-clamp-1 text-micro text-subtle">{a.never}</p>
          </article>
        );
      })}
    </section>
  );
}

function LogFeed() {
  const logs = useTrench((s) => s.logs);
  return (
    <section className="px-4 py-4 sm:px-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-mono text-2xs tracking-kicker text-muted uppercase">Log</h2>
        <p className="font-mono text-2xs text-subtle">{logs.length} lines</p>
      </div>
      {logs.length === 0 ? (
        <p className="text-sm text-muted">Waiting on the first cycle.</p>
      ) : (
        <ol className="flex flex-col">
          {logs.map((line) => (
            <LogRow key={line.id} line={line} />
          ))}
        </ol>
      )}
    </section>
  );
}

function LogRow({ line }: { line: LogLine }) {
  const tone =
    line.kind === "buy" || line.text.includes("took profit")
      ? "text-gain"
      : line.kind === "sell"
        ? "text-loss"
        : line.kind === "kill" || line.text.startsWith("veto")
          ? "text-muted"
          : "text-fg";
  return (
    <li className="grid grid-cols-[4.4rem_4.4rem_minmax(0,1fr)] items-start gap-2 border-b border-line/70 py-2.5 font-mono text-2xs leading-relaxed sm:grid-cols-[5.2rem_5.2rem_minmax(0,1fr)] sm:text-xs">
      <time className="text-subtle tabular-nums">
        {new Date(line.at).toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </time>
      <span className="tracking-label text-muted uppercase">{line.agent}</span>
      <p className={cn("min-w-0 text-pretty", tone)}>{line.text}</p>
    </li>
  );
}

function Book({
  positions,
  now,
  closed,
  lessons,
  lane,
}: {
  positions: Position[];
  now: number;
  closed: {
    mint: string;
    closedAt: number;
    symbol: string;
    pnlUsd: number;
    pnlPct: number;
    reason: string;
    rail?: "paper" | "sol";
  }[];
  lessons: { id: string; agent: string; text: string }[];
  lane: string;
}) {
  const kills = useTrench((s) => s.kills) ?? [];
  const logs = useTrench((s) => s.logs);
  const graded = kills.filter((k) => k.grade !== "pending");
  return (
    <section className="px-4 py-4 sm:px-5">
      <h2 className="font-mono text-2xs tracking-kicker text-muted uppercase">
        Book · {lane}
      </h2>
      {positions.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Flat. Waiting for a setup.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {positions.map((p) => (
            <PositionRow key={p.mint} p={p} now={now} logs={logs} />
          ))}
        </ul>
      )}
      {kills.length > 0 && (
        <div className="mt-5">
          <h3 className="font-mono text-micro tracking-label text-subtle uppercase">Graded kills</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {(graded.length ? graded : kills).slice(0, 8).map((k) => (
              <KillRow key={`${k.mint}-${k.killedAt}`} k={k} />
            ))}
          </ul>
        </div>
      )}
      {lessons.length > 0 && (
        <div className="mt-5">
          <h3 className="font-mono text-micro tracking-label text-subtle uppercase">Scars</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {lessons.slice(0, 6).map((l) => (
              <li key={l.id} className="font-mono text-2xs leading-snug text-muted">
                <span className="text-subtle uppercase">{l.agent}</span>
                <span className="text-subtle"> · </span>
                <span className="text-fg">{l.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {closed.length > 0 && (
        <div className="mt-5">
          <h3 className="font-mono text-micro tracking-label text-subtle uppercase">Closed</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {closed.slice(0, 8).map((t) => {
              const rail = railOf(t, logs);
              return (
              <li
                key={`${t.mint}-${t.closedAt}`}
                className="flex items-center justify-between gap-3 font-mono text-2xs"
              >
                <span className="truncate text-fg">${t.symbol}</span>
                <span
                  className={
                    t.pnlUsd >= 0 ? "text-gain tabular-nums" : "text-loss tabular-nums"
                  }
                >
                  {formatPct(t.pnlPct)} · {formatUsd(t.pnlUsd)} · {t.reason} ·{" "}
                  <span className={rail === "sol" ? "text-gain" : "text-subtle"}>{rail}</span>
                </span>
              </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function PositionRow({
  p,
  now,
  logs,
}: {
  p: Position;
  now: number;
  logs: { mint?: string; symbol?: string; text: string }[];
}) {
  const pct = pnlPct(p.costUsd, p.entryMcap, p.lastMcap);
  const value = positionValue(p.costUsd, p.entryMcap, p.lastMcap);
  const rail = railOf(p, logs);
  return (
    <li className="rounded-md border border-line bg-surface px-3 py-2.5">
      <div className="flex items-start gap-3">
        <CoinThumb src={p.image} symbol={p.symbol} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-medium">${p.symbol}</p>
            <p
              className={cn(
                "font-mono text-xs tabular-nums",
                pct >= 0 ? "text-gain" : "text-loss",
              )}
            >
              {formatPct(pct)}
            </p>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">{p.name}</p>
          <p className="mt-1 font-mono text-micro text-subtle tabular-nums">
            {formatUsd(value)} · in {ageLabel(p.openedAt, now)} · mcap {formatUsd(p.lastMcap, 0)}
          </p>
          <p className="mt-1 font-mono text-micro text-subtle tabular-nums">
            {(() => {
              const peakPct = p.entryMcap > 0 ? p.peakMcap / p.entryMcap - 1 : 0;
              const armed = peakPct >= TRAIL_ARM;
              return `stop ${((p.stopPct ?? -0.5) * 100).toFixed(0)}% · trail ${armed ? "live" : `arms +${(TRAIL_ARM * 100).toFixed(0)}%`} / −${(TRAIL_GIVE * 100).toFixed(0)}% peak`;
            })()}
            {typeof p.score === "number" ? ` · score ${p.score}` : ""}
            {p.slipPct ? ` · slip ${(p.slipPct * 100).toFixed(1)}%` : ""}
            {p.feeUsd ? ` · fee ${formatUsd(p.feeUsd)}` : ""}
            {` · ${rail}`}
          </p>
        </div>
      </div>
    </li>
  );
}

function Tape() {
  const tape = useTrench((s) => s.tape);
  const seen = useTrench((s) => s.seen);
  const seenSet = useMemo(() => new Set(seen), [seen]);
  return (
    <section className="border-t border-line px-4 py-4 sm:px-5">
      <h2 className="font-mono text-2xs tracking-kicker text-muted uppercase">Tape</h2>
      {tape.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Scout has not returned yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {tape.slice(0, 18).map((c) => (
            <li key={c.mint} className="flex items-center gap-3 border-b border-line/70 py-2">
              <CoinThumb src={c.image} symbol={c.symbol} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-xs font-medium">${c.symbol}</p>
                  <p className="font-mono text-2xs text-muted tabular-nums">
                    {formatUsd(c.usdMcap, 0)}
                  </p>
                </div>
                <p className="truncate font-mono text-micro text-subtle">
                  {ageLabel(c.createdAt)} · {shortAddr(c.creator)}
                  {seenSet.has(c.mint) ? " · seen" : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function KillRow({ k }: { k: KillRecord }) {
  const multiple = k.lastMcap / Math.max(k.mcapAt, 1);
  const label =
    k.grade === "rugged" ? "rugged" : k.grade === "ran" ? "ran" : k.grade === "flat" ? "flat" : "pending";
  const tone =
    k.grade === "rugged" ? "text-gain" : k.grade === "ran" ? "text-loss" : "text-subtle";
  return (
    <li className="flex items-center justify-between gap-3 font-mono text-2xs">
      <span className="min-w-0 truncate text-fg">${k.symbol}</span>
      <span className={cn("shrink-0 tabular-nums", tone)}>
        {label}
        {k.grade !== "pending" ? ` ${multiple >= 1 ? "+" : ""}${((multiple - 1) * 100).toFixed(0)}%` : ""}
        {" · "}
        {k.kind}
      </span>
    </li>
  );
}

function CoinThumb({ src, symbol }: { src: string | null; symbol: string }) {
  const [ok, setOk] = useState(Boolean(src));
  useEffect(() => {
    setOk(Boolean(src));
  }, [src]);
  return (
    <div className="size-8 shrink-0 overflow-hidden rounded-sm bg-elevated">
      {src && ok ? (
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          onError={() => setOk(false)}
        />
      ) : (
        <span className="flex size-full items-center justify-center font-mono text-micro text-muted">
          {symbol?.slice(0, 2) || "?"}
        </span>
      )}
    </div>
  );
}
