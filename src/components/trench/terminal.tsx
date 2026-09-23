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
import { coldLine } from "@/lib/trench/cold";
import { useSpirit } from "@/lib/trench/spirit";
import {
  AGENTS,
  CYCLE_MS,
  CYCLE_PONS_MS,
  STARTING_CASH,
  TRAIL_ARM,
  TRAIL_GIVE,
  TRAIL_ARM_PONS,
  TRAIL_GIVE_PONS,
  HARD_TAKE_PONS,
  blankWeather,
  gateUsd,
  isEvmMint,
  type AgentId,
  type KillRecord,
  type LogLine,
  type Position,
  type Rail,
} from "@/lib/trench/types";
import { ageLabel, cn, elapsed, formatPct, formatUsd, shortAddr, vaultPressure } from "@/lib/utils";
import { ntfyTopic, pingNtfy, setNtfyTopic } from "@/lib/trench/ntfy";
import { gmgnKey, setGmgnKey } from "@/lib/trench/gmgn";
import { setSolRpcUrl, solRpcUrl } from "@/lib/trench/sol-rpc";
import { amHunter, chamberEyes, deskPin, seatCloud, syncCloud, unlockCloud } from "@/lib/trench/cloud";
import {
  connectWallet,
  disconnectWallet,
  ensureEthHot,
  ensureHot,
  hotAutoArmed,
  importEthHot,
  importHot,
  isLiveMint,
  mintEthHot,
  refreshEthHot,
  refreshHot,
  refreshWallet,
  setHotAuto,
  signOneState,
} from "@/lib/trench/wallet";
import { blankPlaybook, clipsInDay, liveFloor, pickHotLane, pnlPct, positionValue, protectSpec, trailSpec, wardenScore } from "@/lib/trench/logic";
import { hardReload } from "@/lib/error-component";

const ICONS: Record<AgentId, typeof Radio> = {
  SCOUT: Radio,
  WARDEN: Shield,
  SNIPER: Crosshair,
  RISK: Activity,
  TILL: Landmark,
  META: Brain,
};

function railOf(
  t: { mint: string; symbol: string; rail?: Rail; live?: boolean },
  logs: { mint?: string; symbol?: string; text: string }[],
): Rail {
  if (isEvmMint(t.mint)) {
    if (t.rail === "eth" || t.rail === "sol" || t.live || isLiveMint(t.mint)) return "eth";
    const liveHit = logs.some(
      (l) =>
        (l.mint === t.mint || l.symbol === t.symbol || l.text.includes(`$${t.symbol}`)) &&
        (l.text.includes("HOT ETH") || l.text.includes("0.002 ETH") || l.text.includes("0.001 ETH")),
    );
    return liveHit ? "eth" : "paper";
  }
  if (t.rail === "sol" || t.live || isLiveMint(t.mint)) return "sol";
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
            <Button size="lg" onClick={() => hardReload(true)}>
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
  const tapeVenue = useTrench((s) => s.tapeVenue);
  const atHome = useTrench((s) => s.atHome);
  const startedAt = useTrench((s) => s.startedAt);
  const scanned = useTrench((s) => s.scanned);
  const [cloudRole, setCloudRole] = useState<"hunter" | "watch" | "off">("off");
  const [cloudEyes, setCloudEyes] = useState(0);
  const hatchLive = !!rival && (rival.status === "alive" || rival.status === "survived");
  const cubLive = !!extra && (extra.status === "alive" || extra.status === "survived");
  const hunting =
    status === "watch" ||
    status === "dead" ||
    (!vetDead && (status === "alive" || status === "survived")) ||
    hatchLive ||
    cubLive;

  useEffect(() => {
    void bootTrench().finally(() => setHydrated());
  }, [setHydrated]);

  useEffect(() => {
    if (!deskPin()) {
      setCloudRole("off");
      setCloudEyes(0);
      return;
    }
    let on = true;
    const beat = async () => {
      try {
        const wasHunter = amHunter();
        const role = await syncCloud(wasHunter);
        if (!on) return;
        setCloudRole(role);
        setCloudEyes(chamberEyes());
        if (role === "watch" || (!wasHunter && role === "hunter")) {
          await useTrench.persist.rehydrate();
        }
      } catch {
        if (on) setCloudRole(amHunter() ? "hunter" : "off");
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
    if (deskPin() && cloudRole !== "hunter") return;
    void cycle();
    const ms = tapeVenue === "pons" ? CYCLE_PONS_MS : CYCLE_MS;
    const id = window.setInterval(() => {
      void cycle();
    }, ms);
    const onVis = () => {
      if (document.visibilityState === "visible") void cycle();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [hunting, cycle, cloudRole, tapeVenue]);

  const hasCell =
    status === "watch" ||
    status === "alive" ||
    status === "survived" ||
    hatchLive ||
    cubLive ||
    !!startedAt ||
    (scanned ?? 0) > 0;

  if (!hydrated) {
    return <WakeScreen ready={false} />;
  }

  // Dead wins over home — otherwise Kill clone / pay gate never reach the desk.
  if (status === "dead") return <DeathScreen />;
  if (atHome || (status === "idle" && !hasCell)) {
    return <WakeScreen ready hunting={hasCell} />;
  }
  return <Desk cloudRole={cloudRole} eyes={cloudEyes} />;
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
      <Button size={size} variant="ghost" asChild className={compact ? "" : "min-h-12"}>
        <Link to="/hot">Hot blotter</Link>
      </Button>
      {msg ? <p className="font-mono text-2xs text-subtle">{msg}</p> : null}
    </div>
  );
}

function GmgnDock() {
  const [key, setKey] = useState("");
  const [armed, setArmed] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const k = gmgnKey();
    setKey(k);
    setArmed(k);
  }, []);

  function save() {
    const err = setGmgnKey(key);
    if (err) {
      setMsg(err);
      return;
    }
    const k = gmgnKey();
    setArmed(k);
    setMsg(k ? "Warden borrowed GMGN eyes." : "GMGN off.");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="GMGN API key"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        type="password"
        className="h-9 w-36 border border-line bg-elevated px-2 font-mono text-2xs text-fg placeholder:text-subtle"
      />
      <Button size="sm" variant="ghost" onClick={save}>
        {armed ? "gmgn on" : "Arm GMGN"}
      </Button>
      {msg ? <p className="font-mono text-2xs text-subtle">{msg}</p> : null}
    </div>
  );
}

function RpcDock() {
  const [url, setUrl] = useState("");
  const [armed, setArmed] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const u = solRpcUrl();
    setUrl(u);
    setArmed(u);
    if (u) setMsg("rpc stays on in this browser.");
  }, []);

  function save() {
    const trimmed = url.trim();
    if (!trimmed && solRpcUrl()) {
      const u = solRpcUrl();
      setUrl(u);
      setArmed(u);
      setMsg("rpc stays on in this browser.");
      return;
    }
    const err = setSolRpcUrl(url);
    if (err) {
      setMsg(err);
      return;
    }
    const u = solRpcUrl();
    setArmed(u);
    setUrl(u);
    setMsg(u ? "rpc stays on in this browser. Helius is used for sends and balance." : "RPC off. public endpoints only.");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Helius URL or API key"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        type="password"
        className="h-9 w-44 border border-line bg-elevated px-2 font-mono text-2xs text-fg placeholder:text-subtle"
      />
      <Button size="sm" variant="ghost" onClick={save}>
        {armed ? "rpc on" : "Arm RPC"}
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
  const [ethPk, setEthPk] = useState("");
  const [ethBal, setEthBal] = useState<number | null>(null);
  const [ethSecret, setEthSecret] = useState("");
  const [solSecret, setSolSecret] = useState("");
  const [hotAuto, setHotAutoUi] = useState(false);

  const storeHotSol = useTrench((s) => s.hotSol);
  const storeHotPk = useTrench((s) => s.hotPubkey);
  const storeEth = useTrench((s) => s.hotEth);
  const storeEthAddr = useTrench((s) => s.hotEthAddr);
  const tapeVenue = useTrench((s) => s.tapeVenue);
  const flattenHot = useTrench((s) => s.flattenHot);
  const status = useTrench((s) => s.status);

  useEffect(() => {
    const h = ensureHot();
    setHotPk(storeHotPk || h.pubkey);
    setHotAutoUi(h.auto);
    const e = ensureEthHot();
    setEthPk(storeEthAddr || e.address);
    void refreshHot().then((s) => {
      setHotPk(s.pubkey);
      setHotSol(s.sol);
      setHotAutoUi(s.auto);
    });
    void refreshEthHot().then((s) => {
      setEthPk(s.address);
      setEthBal(s.eth);
    });
    void refreshWallet().then((s) => {
      setPubkey(s.pubkey);
      setSol(s.sol);
      setSign(signOneState());
    });
  }, [storeHotPk, storeEthAddr]);

  useEffect(() => {
    if (storeHotSol != null) setHotSol(storeHotSol);
  }, [storeHotSol]);
  useEffect(() => {
    if (storeEth != null) setEthBal(storeEth);
  }, [storeEth]);

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
      () => setMsg("hot address copied. send ~0.10 SOL. not your phantom."),
      () => {
        try {
          document.execCommand("copy");
          setMsg("hot address copied. send ~0.10 SOL.");
        } catch {
          setMsg("highlight the address and ctrl+c. clipboard is blocked.");
        }
      },
    );
  }

  function copyEth() {
    if (!ethPk) return;
    void navigator.clipboard.writeText(ethPk).then(
      () => setMsg("ETH hot copied. send ~0.004 ETH on Robinhood Chain (4663). not your phantom."),
      () => setMsg("highlight the ETH address and ctrl+c."),
    );
  }

  function takeEthKey() {
    const r = importEthHot(ethSecret);
    if (!r.ok || !r.snap) {
      setMsg(r.error ?? "key did not take.");
      return;
    }
    setEthSecret("");
    setEthPk(r.snap.address);
    setMsg(`ETH hot restored ${r.snap.address.slice(0, 10)}… same wallet. fund if the old tab still holds the ETH.`);
    void refreshEthHot().then((s) => {
      setEthPk(s.address);
      setEthBal(s.eth);
      useTrench.setState({ hotEthAddr: s.address, hotEth: s.eth });
    });
  }

  function takeSolKey() {
    const r = importHot(solSecret);
    if (!r.ok || !r.snap) {
      setMsg(r.error ?? "SOL key did not take.");
      return;
    }
    setSolSecret("");
    setHotPk(r.snap.pubkey);
    setMsg(`SOL hot restored ${r.snap.pubkey.slice(0, 8)}… same wallet.`);
    void refreshHot().then((s) => {
      setHotPk(s.pubkey);
      setHotSol(s.sol);
      useTrench.setState({ hotPubkey: s.pubkey, hotSol: s.sol });
    });
  }

  function mintEth() {
    const s = mintEthHot();
    setEthPk(s.address);
    setMsg("new ETH hot minted. only do this if Firefox is gone and you have no key.");
  }

  function toggleAuto() {
    const on = setHotAuto(!hotAuto);
    setHotAutoUi(on);
    setMsg(
      on
        ? tapeVenue === "pons"
          ? "HOT AUTO on. Pons spends 0.002 ETH. SOL spends 0.04 on pump. no paper."
          : "HOT AUTO on. spends 0.04 SOL. no paper. no popup."
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
          {status !== "watch" ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setMsg("flattening leftover bags…");
                void flattenHot().then(() => setMsg("flatten done. check Till in the log."));
              }}
            >
              Flatten hot
            </Button>
          ) : null}
        </>
      ) : null}
      {ethPk ? (
        <>
          <input
            id="trencher-eth-hot-addr"
            readOnly
            value={ethPk}
            onFocus={(e) => e.currentTarget.select()}
            spellCheck={false}
            className="h-9 w-[14rem] border border-line bg-elevated px-2 font-mono text-2xs text-fg"
            title={ethPk}
          />
          <Button size="sm" variant="ghost" onClick={copyEth}>
            Copy ETH hot
          </Button>
          <span className="font-mono text-2xs text-muted">
            {ethBal != null ? `${ethBal.toFixed(4)} ETH` : "…"}
          </span>
        </>
      ) : null}
      <input
        value={ethSecret}
        onChange={(e) => setEthSecret(e.target.value)}
        placeholder="paste Firefox ETH key 0x…"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="h-9 w-[16rem] border border-line bg-elevated px-2 font-mono text-2xs text-fg placeholder:text-subtle"
      />
      <Button size="sm" variant="ghost" disabled={!ethSecret.trim()} onClick={takeEthKey}>
        Restore ETH
      </Button>
      <input
        value={solSecret}
        onChange={(e) => setSolSecret(e.target.value)}
        placeholder="paste SOL hot secret…"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="h-9 w-[16rem] border border-line bg-elevated px-2 font-mono text-2xs text-fg placeholder:text-subtle"
      />
      <Button size="sm" variant="ghost" disabled={!solSecret.trim()} onClick={takeSolKey}>
        Restore SOL
      </Button>
      {!ethPk ? (
        <Button size="sm" variant="ghost" onClick={mintEth}>
          Mint new ETH
        </Button>
      ) : null}
      {sign === "armed" && !hotAuto ? (
        <span className="font-mono text-2xs text-subtle">sign-one still armed (popup)</span>
      ) : null}
      {msg ? <p className="font-mono text-2xs text-subtle">{msg}</p> : null}
    </div>
  );
}

function CloudDock({
  eyes = 0,
  role = "off",
}: {
  eyes?: number;
  role?: "hunter" | "watch" | "off";
}) {
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    setPin(deskPin());
  }, []);

  useEffect(() => {
    setClaimed(role === "hunter");
  }, [role]);

  async function seat() {
    setBusy(true);
    try {
      const text = await seatCloud(pin);
      setMsg(text);
      const took = /cell taken|chamber live/i.test(text);
      setClaimed(took);
      if (took) window.setTimeout(() => window.location.reload(), 400);
    } catch {
      setMsg("chamber did not answer.");
      setClaimed(false);
    } finally {
      setBusy(false);
    }
  }

  async function unlock() {
    setBusy(true);
    try {
      const text = await unlockCloud(pin);
      setMsg(text);
      setClaimed(/this tab is the hunter/i.test(text));
      window.setTimeout(() => window.location.reload(), 400);
    } catch {
      setMsg("watch did not answer.");
      setBusy(false);
    }
  }

  const ready = claimed || role === "hunter";
  const elsewhere = !ready && role === "watch";

  return (
    <div className="flex flex-wrap items-start gap-2">
      <input
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        placeholder="chamber #"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="h-9 w-36 border border-line bg-elevated px-2 font-mono text-2xs text-fg placeholder:text-subtle"
        suppressHydrationWarning
      />
      <div className="flex flex-col items-start gap-0.5">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void seat()}>
          Chamber #
        </Button>
        <p
          className={cn(
            "font-mono text-[10px] leading-none tracking-label uppercase",
            ready ? "text-warn" : elsewhere ? "text-loss" : "text-subtle",
          )}
        >
          {ready ? "Cell room ready" : elsewhere ? "Cell held elsewhere" : "Cell room dark"}
        </p>
      </div>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void unlock()}>
        Watch
      </Button>
      {eyes > 0 ? (
        <p className="font-mono text-2xs tabular-nums text-gain">
          {eyes} watching
        </p>
      ) : null}
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
  const leaveHome = useTrench((s) => s.leaveHome);
  const setHydrated = useTrench((s) => s.setHydrated);
  const [stuck, setStuck] = useState(false);
  const [askPin, setAskPin] = useState(false);
  const [pin, setPin] = useState("");
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);

  useEffect(() => {
    if (ready) return;
    const id = window.setTimeout(() => {
      setHydrated();
      setStuck(true);
    }, 1200);
    return () => window.clearTimeout(id);
  }, [ready, setHydrated]);

  async function watchChamber() {
    setPinBusy(true);
    try {
      const text = await unlockCloud(pin);
      setPinMsg(text);
      if (/needs 4|no chamber|did not|not found|dark/i.test(text)) {
        setPinBusy(false);
        return;
      }
      window.setTimeout(() => window.location.reload(), 400);
    } catch {
      setPinMsg("chamber did not answer.");
      setPinBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-dvh flex-col justify-between bg-bg px-5 py-8 sm:px-10 sm:py-12">
      <header className="flex items-center justify-between text-muted">
        <p className="font-mono text-2xs tracking-kicker uppercase">paper trench</p>
        <p className="font-mono text-2xs tracking-label uppercase">pump.fun · RH chain paper</p>
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
          widens it. Stake {formatUsd(STARTING_CASH, 0)}. The gate starts at {formatUsd(gateUsd(1), 0)}
          and climbs each cell — Warden climbs with it. Pay the gate or get deleted.
          Pump.fun is HOT SOL. Robinhood Chain is HOT ETH on the Pons curve. Other RH pads are skipped until a router exists. No paper fills.
          Hunt cap is $50. Till reserves anything over that in the same wallet and lets HOT play with the $50. Nothing is sent.
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
              {ready ? "Start" : "Loading the book…"}
            </Button>
          )}
          {!hunting ? (
            <Button
              size="lg"
              variant="ghost"
              disabled={!ready}
              onClick={() => {
                setAskPin(true);
                setPin(deskPin());
              }}
              className="min-h-12 w-full sm:w-auto"
            >
              Spectate
            </Button>
          ) : null}
          {askPin && !hunting ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void watchChamber();
              }}
            >
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="chamber #"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoFocus
                className="h-12 w-40 border border-line bg-elevated px-3 font-mono text-sm text-fg placeholder:text-subtle"
              />
              <Button
                size="lg"
                variant="ghost"
                type="submit"
                disabled={!ready || pinBusy}
                className="min-h-12"
              >
                {pinBusy ? "Looking…" : "Watch"}
              </Button>
              {pinMsg ? <p className="font-mono text-2xs text-subtle">{pinMsg}</p> : null}
            </form>
          ) : null}
          <p className="font-mono text-2xs leading-relaxed text-subtle">
            Second window watches. The hunt and hot wallet live in the tab that was already running.
          </p>
          {stuck ? (
            <Button size="sm" variant="ghost" onClick={() => hardReload(true)}>
              Desk stuck. Reload.
            </Button>
          ) : null}
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
  const killClone = useTrench((s) => s.killClone);
  const callsign = useTrench((s) => s.callsign);
  const rival = useTrench((s) => s.rival);
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
  const deadSign =
    rival?.status === "dead" && rival.callsign
      ? rival.callsign
      : callsign || `Clone ${house?.generation || 1}`;

  return (
    <main className="flex min-h-dvh flex-col justify-center bg-bg px-5 py-10 sm:px-10">
      <div className="mx-auto w-full max-w-lg">
        <p className="font-mono text-2xs tracking-kicker text-loss uppercase">kill rule</p>
        <h1 className="mt-3 text-display font-semibold leading-[0.88] tracking-[-0.04em]">
          {deadSign} DEAD
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
          <Button size="lg" onClick={() => killClone()}>
            Kill clone
          </Button>
          <BookDock />
          <p className="font-mono text-2xs text-subtle">
            New {formatUsd(STARTING_CASH, 0)}. Spirit carries. Hunting restarts.
          </p>
        </div>
      </div>
    </main>
  );
}

function Desk({
  cloudRole = "off",
  eyes = 0,
}: {
  cloudRole?: "hunter" | "watch" | "off";
  eyes?: number;
}) {
  const vetCash = useTrench((s) => s.cash);
  const vetPositions = useTrench((s) => s.positions);
  const vetClosed = useTrench((s) => s.closed);
  const vetDayHits = useTrench((s) => s.dayHits);
  const vetLessons = useTrench((s) => s.lessons);
  const vetPlaybook = useTrench((s) => s.playbook) ?? blankPlaybook();
  const vetFees = useTrench((s) => s.feesPaid);
  const vetStarted = useTrench((s) => s.startedAt);
  const vetRent = useTrench((s) => s.rentPaid);
  const vetDead = useTrench((s) => s.vetDead);
  const rival = useTrench((s) => s.rival);
  const extra = useTrench((s) => s.extra);
  const hotSol = useTrench((s) => s.hotSol);
  const hotPubkey = useTrench((s) => s.hotPubkey);
  const hotEth = useTrench((s) => s.hotEth);
  const hotEthAddr = useTrench((s) => s.hotEthAddr);
  const coldHold = useTrench((s) => s.coldHold);
  const logs = useTrench((s) => s.logs);
  const lastHotLine = useTrench((s) => s.lastHotLine);
  const lastGmgn = useTrench((s) => s.lastGmgn);
  const spiritFloor = useSpirit((s) => s.canon.scoreFloor);
  const round = useTrench((s) => s.round) || 1;
  const focus = useTrench((s) => s.focus);
  const spawnRival = useTrench((s) => s.spawnRival);
  const setSoloDesk = useTrench((s) => s.setSoloDesk);
  const soloDesk = useTrench((s) => s.soloDesk);
  const cull = useTrench((s) => s.cull);
  const killClone = useTrench((s) => s.killClone);
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
  const tapeVenue = useTrench((s) => s.tapeVenue);
  const weather = useTrench((s) => s.weather);
  const setTapeVenue = useTrench((s) => s.setTapeVenue);
  const due = gateUsd(round);
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
  const liveCount = (vetLive ? 1 : 0) + (hatchLive ? 1 : 0) + (cubLive ? 1 : 0);
  const clipsV = clipsInDay(vetDayHits, vetClosed, now);
  const clipsH = rival ? clipsInDay(rival.dayHits, rival.closed, now) : 0;
  const clipsC = extra ? clipsInDay(extra.dayHits, extra.closed, now) : 0;
  const clipsMax = Math.max(clipsV, clipsH, clipsC);
  const cellFull = hatchLive && cubLive;
  const focusSign = cubFocus ? cubSign : hatchFocus ? hatchSign : vetSign;
  const focusCash = cubFocus ? extra?.cash ?? 0 : hatchFocus ? rival?.cash ?? 0 : vetCash;
  const focusSitting = cubFocus ? !!extra?.rentPaid : hatchFocus ? !!rival?.rentPaid : rentPaid;
  const focusHunting = cubFocus ? cubLive : hatchFocus ? hatchLive : vetLive;
  const canPay = focusHunting && !focusSitting && focusCash >= due;
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
            <TapeSwitch venue={tapeVenue} onChange={setTapeVenue} />
            {status !== "watch" ? (
              <button
                type="button"
                onClick={() => setSoloDesk(!soloDesk)}
                title={soloDesk ? "Solo. Click to allow twins." : "Three chairs. Click for one hunter."}
                className={cn(
                  "border px-2 py-1 font-mono text-2xs tracking-label uppercase",
                  soloDesk ? "border-warn text-warn" : "border-line text-muted hover:text-fg",
                )}
              >
                {soloDesk ? "solo" : "pit"}
              </button>
            ) : null}
            {status !== "watch" ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFocus("vet")}
                className={cn(
                  "flex flex-col items-center border px-2 py-1 font-mono text-2xs tracking-label uppercase",
                  focus === "vet" ? "border-fg text-fg" : "border-line text-muted hover:text-fg",
                )}
              >
                <span>
                  {vetSign} {vetLive ? (rentPaid ? "rest" : "hunt") : "dead"}
                </span>
                <CloneTally open={vetLive ? vetPositions : []} clips={clipsV} hot={clipsMax} />
              </button>
              {rival ? (
                <button
                  type="button"
                  onClick={() => setFocus("hatch")}
                  className={cn(
                    "flex flex-col items-center border px-2 py-1 font-mono text-2xs tracking-label uppercase",
                    focus === "hatch" ? "border-fg text-fg" : "border-line text-muted hover:text-fg",
                  )}
                >
                  <span>
                    {hatchSign} {hatchLive ? (rival.rentPaid ? "rest" : "hunt") : "dead"}
                  </span>
                  <CloneTally open={hatchLive ? rival.positions : []} clips={clipsH} hot={clipsMax} />
                </button>
              ) : null}
              {extra ? (
                <button
                  type="button"
                  onClick={() => setFocus("cub")}
                  className={cn(
                    "flex flex-col items-center border px-2 py-1 font-mono text-2xs tracking-label uppercase",
                    focus === "cub" ? "border-fg text-fg" : "border-line text-muted hover:text-fg",
                  )}
                >
                  <span>
                    {cubSign} {cubLive ? (extra.rentPaid ? "rest" : "hunt") : "dead"}
                  </span>
                  <CloneTally open={cubLive ? extra.positions : []} clips={clipsC} hot={clipsMax} />
                </button>
              ) : null}
            </div>
            ) : null}
          </div>
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs tabular-nums">
            {(rival || extra) && status !== "watch" ? (
              <>
                <Stat
                  label={vetSign}
                  value={vetLive ? (rentPaid ? "rest" : "hunt") : "dead"}
                  tone={!vetLive ? "loss" : undefined}
                  dots={vetLive ? vetPositions : []}
                  clips={clipsV}
                  clipsHot={clipsMax}
                />
                {rival ? (
                  <Stat
                    label={hatchSign}
                    value={hatchLive ? (rival.rentPaid ? "rest" : "hunt") : "dead"}
                    tone={!hatchLive ? "loss" : undefined}
                    dots={hatchLive ? rival.positions : []}
                    clips={clipsH}
                    clipsHot={clipsMax}
                  />
                ) : null}
                {extra ? (
                  <Stat
                    label={cubSign}
                    value={cubLive ? (extra.rentPaid ? "rest" : "hunt") : "dead"}
                    tone={!cubLive ? "loss" : undefined}
                    dots={cubLive ? extra.positions : []}
                    clips={clipsC}
                    clipsHot={clipsMax}
                  />
                ) : null}
              </>
            ) : null}
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
              label="Win"
              value={closed.length ? `${(winPct * 100).toFixed(0)}%` : "—"}
              tone={
                !closed.length ? undefined : winPct >= 0.45 ? "gain" : winPct < 0.3 ? "loss" : "warn"
              }
            />
            <Stat
              label="Vault"
              value={vault.label}
              tone={vault.blocked ? "loss" : vault.fat ? "warn" : undefined}
            />
          </dl>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-gain/25 bg-gain/5 px-4 py-2 sm:px-6">
          <p className="font-mono text-2xs tracking-label text-gain uppercase">
            real sol · real eth
          </p>
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs tabular-nums">
            <Stat
              label="SOL"
              value={hotSol == null ? "—" : `${hotSol.toFixed(3)} SOL`}
              tone={coldHold?.sol ? "warn" : (hotSol ?? 0) >= 0.045 ? "gain" : (hotSol ?? 0) > 0 ? "warn" : undefined}
            />
            <Stat
              label="ETH"
              value={hotEth == null ? "—" : `${hotEth.toFixed(4)} ETH`}
              tone={coldHold?.eth ? "warn" : (hotEth ?? 0) >= 0.0024 ? "gain" : (hotEth ?? 0) > 0 ? "warn" : undefined}
            />
            <Stat label="Cap" value="$50" tone={coldHold?.sol || coldHold?.eth ? "warn" : undefined} />
            <Stat
              label="Rail"
              value={
                tapeVenue === "pons"
                  ? "rh"
                  : hotAutoArmed() && (hotEth ?? 0) >= 0.0024
                    ? "dual"
                    : "pump"
              }
              tone={
                tapeVenue === "pump" && hotAutoArmed() && (hotEth ?? 0) >= 0.0024
                  ? "gain"
                  : undefined
              }
            />
            <Stat
              label="Auto"
              value={hotAutoArmed() ? `on · ${hotSign}` : "off"}
              tone={hotAutoArmed() ? "gain" : "warn"}
            />
            <Stat
              label="Live"
              value={`floor ${liveFloor(playbook, weather ?? blankWeather(), spiritFloor ?? 45)}`}
              tone="gain"
            />
            <Stat
              label="Addr"
              value={
                [hotPubkey ? `sol ${shortAddr(hotPubkey, 4)}` : "", hotEthAddr ? `eth ${shortAddr(hotEthAddr, 4)}` : ""]
                  .filter(Boolean)
                  .join(" · ") || "—"
              }
            />
            <Stat
              label="Last"
              value={
                lastHotLine?.slice(0, 52) ??
                logs.find(
                  (l) =>
                    l.text.includes("HOT ·") ||
                    l.text.includes("HOT SELL") ||
                    l.text.includes("LIVE skip") ||
                    l.text.includes("LIVE veto") ||
                    l.text.includes("SPIRIT veto") ||
                    l.text.startsWith("SIGNED"),
                )?.text.slice(0, 48) ?? "no live fill yet"
              }
            />
            <Stat
              label="GMGN"
              value={
                lastGmgn
                  ? `$${lastGmgn.symbol} ${lastGmgn.text}`.slice(0, 42)
                  : gmgnKey()
                    ? "armed · waiting on a live mint"
                    : "dark"
              }
              tone={lastGmgn?.veto ? "loss" : gmgnKey() ? "gain" : undefined}
            />
            <Stat
              label="Cloud"
              value={
                cloudRole === "off"
                  ? "local"
                  : cloudRole === "watch"
                    ? eyes
                      ? `watching · ${eyes}`
                      : "watching"
                    : eyes
                      ? `hunting · ${eyes}`
                      : "hunting"
              }
              tone={
                cloudRole === "hunter"
                  ? "gain"
                  : cloudRole === "watch"
                    ? "warn"
                    : undefined
              }
            />
          </dl>
          {coldHold?.sol || coldHold?.eth ? (
            <div className="basis-full flex flex-col gap-1 border border-warn/50 bg-warn/10 px-3 py-2">
              <p className="font-mono text-2xs text-warn">
                Till reserved the overage in this wallet. HOT only spends the $50 play bank. Nothing is sent.
              </p>
              {coldHold.sol ? <p className="font-mono text-2xs text-fg">{coldLine(coldHold.sol)}</p> : null}
              {coldHold.eth ? <p className="font-mono text-2xs text-fg">{coldLine(coldHold.eth)}</p> : null}
            </div>
          ) : (
            <p className="basis-full font-mono text-2xs text-subtle">
              Hunt cap $50. Till reserves anything over that in the same wallet. HOT plays with $50. Nothing is sent.
            </p>
          )}
          <p className="font-mono text-2xs text-subtle">
            {tapeVenue === "pons"
              ? "Clips only book after HOT spends 0.002 ETH on the Pons curve. hood.fun / pools.trade have no router — skipped. SOL stays on pump."
              : "Clips only book after HOT spends 0.04 SOL. no paper fills."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2 sm:px-6">
          <p className="mr-auto font-mono text-2xs tracking-wide text-muted">
            {(() => {
              const words = (meta.thesis || "").split(/\s+/).filter(Boolean).slice(0, 4).join(" ");
              const floor = liveFloor(playbook, weather ?? blankWeather(), spiritFloor ?? 45);
              const spec = trailSpec(tapeVenue, weather);
              const green = protectSpec(weather);
              const bits = [
                words || "no thesis",
                `floor ${floor}`,
                `stop ${(playbook.stopPct * 100).toFixed(0)}%`,
                `trail +${(spec.arm * 100).toFixed(0)}/−${(spec.give * 100).toFixed(0)}`,
                `bank +${(green.arm * 100).toFixed(0)}`,
              ];
              if (playbook.bannedCreators.length) bits.push(`${playbook.bannedCreators.length} burned`);
              bits.push(cubFocus ? cubSign : hatchFocus ? hatchSign : vetSign);
              if (soloDesk) bits.push("solo");
              return bits.join(" · ");
            })()}
          </p>
          <BookDock compact />
          <NtfyDock />
          <GmgnDock />
          <RpcDock />
          <CloudDock eyes={eyes} role={cloudRole} />
          <WalletDock />
          {status !== "watch" && !soloDesk && !cellFull && (vetLive || hatchLive || cubLive) ? (
            <Button size="sm" variant="ghost" onClick={() => spawnRival()}>
              Wake a body
            </Button>
          ) : null}
          {status !== "watch" && huntCount >= 2 ? (
            <Button size="sm" variant="ghost" onClick={() => cull()}>
              Cull {focusSign}
            </Button>
          ) : null}
          {status !== "watch" ? (
            <Button
              size="sm"
              variant={!vetLive && !hatchLive && !cubLive ? "primary" : "ghost"}
              onClick={() => killClone()}
              title="End this cell. New callsign. Spirit stays. Hunting restarts."
            >
              Kill clone
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
              : `Pay ${focusSign} the gate`}
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

function TapeSwitch({
  venue,
  onChange,
}: {
  venue: "pump" | "pons";
  onChange: (v: "pump" | "pons") => void;
}) {
  const heatPump = useTrench((s) => s.heatPump);
  const heatPons = useTrench((s) => s.heatPons);
  const pumpScore = heatPump?.ok ? heatPump.score : -1;
  const ponsScore = heatPons?.ok ? heatPons.score : -1;
  const hotter = pumpScore < 0 && ponsScore < 0 ? null : pumpScore >= ponsScore ? "pump" : "pons";
  const chip = (v: "pump" | "pons") => {
    const h = v === "pump" ? heatPump : heatPons;
    const on = venue === v;
    const hot = hotter === v;
    const line = !h
      ? "…"
      : !h.ok
        ? "dark"
        : h.launches === 0 && h.newestAgeMs > 10 * 60_000
          ? `last ${Math.max(1, Math.round(h.newestAgeMs / 60_000))}m · ${h.live} live`
          : `${h.launches}/10m · ${h.live} live · ${h.runners} run`;
    return (
      <button
        key={v}
        type="button"
        onClick={() => onChange(v)}
        title={
          h?.ok
            ? `${v} · ${h.named} named · flow ${Math.round(h.flowUsd).toLocaleString()} usd · heat ${h.score}`
            : `${v} tape`
        }
        className={cn(
          "flex flex-col items-start border px-2 py-1 text-left",
          on ? "border-fg text-fg" : "border-line text-muted hover:text-fg",
          !on && hot && "border-warn text-warn",
        )}
      >
        <span className="font-mono text-2xs tracking-label uppercase">
          {v === "pons" ? "rh chain" : v}
          {hot ? " · hot" : ""}
        </span>
        <span className="font-mono text-micro tabular-nums text-subtle">{line}</span>
      </button>
    );
  };
  return <div className="flex items-center gap-1">{chip("pump")}{chip("pons")}</div>;
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
        ? "through the gate"
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

function CloneTally({
  open,
  clips,
  hot,
}: {
  open: Position[];
  clips: number;
  hot: number;
}) {
  const busy = hot >= 8 && clips === hot && clips > 0;
  return (
    <span className="mt-0.5 flex items-center justify-center gap-1">
      {open.length ? <BagDots positions={open} /> : null}
      <span
        title={`${clips} clips in the last 24 hours`}
        className={cn("font-mono text-2xs tabular-nums", busy ? "text-warn" : "text-subtle")}
      >
        {clips}×
      </span>
    </span>
  );
}

function BagDots({ positions }: { positions: Position[] }) {
  if (!positions.length) return null;
  return (
    <span className="flex items-center justify-center gap-0.5" aria-hidden>
      {positions.map((p) => {
        const pct = pnlPct(p.costUsd, p.entryMcap, p.lastMcap);
        const tone = pct > 0.005 ? "bg-gain" : pct < -0.005 ? "bg-loss" : "bg-muted";
        return (
          <span
            key={p.mint}
            title={`$${p.symbol} ${formatPct(pct)}`}
            className={cn("inline-block size-1.5 rounded-full", tone)}
          />
        );
      })}
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
  dots,
  clips,
  clipsHot,
}: {
  label: string;
  value: string;
  tone?: "gain" | "loss" | "warn";
  dots?: Position[];
  clips?: number;
  clipsHot?: number;
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
      {typeof clips === "number" ? (
        <CloneTally open={dots ?? []} clips={clips} hot={clipsHot ?? clips} />
      ) : dots ? (
        <BagDots positions={dots} />
      ) : null}
    </div>
  );
}

function AgentRail() {
  const agents = useTrench((s) => s.agents);
  const lastGmgn = useTrench((s) => s.lastGmgn);
  const gmgnArmed = typeof window !== "undefined" && !!gmgnKey();
  return (
    <section className="grid grid-cols-2 border-b border-line sm:grid-cols-3 lg:grid-cols-6">
      {AGENTS.map((a) => {
        const Icon = ICONS[a.id];
        const pulse = agents[a.id];
        const wardenEye =
          a.id === "WARDEN"
            ? lastGmgn
              ? `GMGN · $${lastGmgn.symbol} ${lastGmgn.text}`
              : gmgnArmed
                ? "GMGN armed. waiting on a live mint."
                : "GMGN dark."
            : a.never;
        return (
          <article key={a.id} className="border-b border-r border-line px-4 py-3">
            <div className="flex items-center gap-2 text-muted">
              <Icon className="size-3.5" strokeWidth={1.75} />
              <p className="font-mono text-micro tracking-label uppercase">{a.title}</p>
            </div>
            <p className="mt-2 line-clamp-2 min-h-8 text-xs leading-snug text-fg">
              {pulse?.lastText ?? "asleep"}
            </p>
            <p
              className={cn(
                "mt-1 line-clamp-1 text-micro",
                a.id === "WARDEN" && lastGmgn?.veto
                  ? "text-loss"
                  : a.id === "WARDEN" && gmgnArmed
                    ? "text-gain"
                    : "text-subtle",
              )}
            >
              {wardenEye}
            </p>
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
    rail?: Rail;
    peakPct?: number;
  }[];
  lessons: { id: string; agent: string; text: string }[];
  lane: string;
}) {
  const kills = useTrench((s) => s.kills) ?? [];
  const logs = useTrench((s) => s.logs);
  const dumpRunners = useTrench((s) => s.dumpRunners);
  const status = useTrench((s) => s.status);
  const graded = kills.filter((k) => k.grade !== "pending");
  const hot = positions.filter((p) => {
    const pct = pnlPct(p.costUsd, p.entryMcap, p.lastMcap);
    const peak = p.entryMcap > 0 ? p.peakMcap / p.entryMcap - 1 : 0;
    return pct >= 1 || peak >= 1;
  }).length;
  return (
    <section className="px-4 py-4 sm:px-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-mono text-2xs tracking-kicker text-muted uppercase">
          Book · {lane}
        </h2>
        {hot > 0 && status !== "watch" ? (
          <Button
            type="button"
            variant="quiet"
            size="sm"
            className="h-7 px-2 font-mono text-micro tracking-wide text-warn uppercase"
            onClick={() => dumpRunners()}
          >
            Bank {hot} runner{hot === 1 ? "" : "s"}
          </Button>
        ) : null}
      </div>
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
                  {formatPct(t.pnlPct)}
                  {typeof t.peakPct === "number" ? ` · peak ${formatPct(t.peakPct)}` : ""}
                  {" · "}
                  {formatUsd(t.pnlUsd)} · {t.reason} ·{" "}
                  <span
                    className={
                      rail === "eth"
                        ? "text-warn"
                        : rail === "sol"
                          ? "text-gain"
                          : "text-subtle"
                    }
                  >
                    {rail}
                  </span>
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
  const peakPct = p.entryMcap > 0 ? p.peakMcap / p.entryMcap - 1 : 0;
  const rail = railOf(p, logs);
  const dumpClip = useTrench((s) => s.dumpClip);
  const status = useTrench((s) => s.status);
  const venue = useTrench((s) => s.tapeVenue);
  const weather = useTrench((s) => s.weather);
  const spec = trailSpec(venue, weather);
  const arm = spec.arm;
  const give = spec.give;
  const green = protectSpec(weather);
  const armed = peakPct >= arm;
  const protectedGreen = !armed && peakPct >= green.arm;
  const runner = pct >= 1 || peakPct >= 1;
  const watching = status === "watch";
  return (
    <li
      className={cn(
        "rounded-md border bg-surface px-3 py-2.5",
        runner ? "border-warn/60" : "border-line",
      )}
    >
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
            {peakPct > pct + 0.05 ? ` · peak ${formatPct(peakPct)}` : ""}
          </p>
          <p className="mt-1 font-mono text-micro text-subtle tabular-nums">
            {`stop ${((p.stopPct ?? -0.5) * 100).toFixed(0)}% · trail ${armed ? "live" : `arms +${(arm * 100).toFixed(0)}%`} / −${(give * 100).toFixed(0)}% peak`}
            {protectedGreen ? ` · protect live bank +${(green.keep * 100).toFixed(0)}%` : ` · protect +${(green.arm * 100).toFixed(0)}%`}
            {venue === "pons" ? ` · hard +${(HARD_TAKE_PONS * 100).toFixed(0)}%` : ""}
            {typeof p.score === "number" ? ` · score ${p.score}` : ""}
            {p.slipPct ? ` · slip ${(p.slipPct * 100).toFixed(1)}%` : ""}
            {p.feeUsd ? ` · fee ${formatUsd(p.feeUsd)}` : ""}
            {` · ${rail}`}
          </p>
        </div>
        {!watching ? (
          <Button
            type="button"
            variant={runner ? "primary" : "quiet"}
            size="sm"
            className={cn(
              "h-7 shrink-0 px-2 font-mono text-micro tracking-wide uppercase",
              runner && "text-bg",
            )}
            onClick={() => dumpClip(p.mint)}
          >
            Bank
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function Tape() {
  const tape = useTrench((s) => s.tape);
  const seen = useTrench((s) => s.seen);
  const venue = useTrench((s) => s.tapeVenue);
  const seenSet = useMemo(() => new Set(seen), [seen]);
  return (
    <section className="border-t border-line px-4 py-4 sm:px-5">
      <h2 className="font-mono text-2xs tracking-kicker text-muted uppercase">
        Tape · {venue === "pons" ? "Robinhood Chain" : "pump.fun"}
      </h2>
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
                  {venue === "pons" ? " · rh" : ""}
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
