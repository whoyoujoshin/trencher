import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { formatPct, shortAddr } from "@/lib/utils";
import { sittingTitle, useSpirit } from "@/lib/trench/spirit";
import { canonHasBlood } from "@/lib/trench/canon";
import { useTrench } from "@/lib/trench/store";
import type { BookFile } from "@/lib/trench/types";

function when(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function SpiritBox() {
  const sittings = useSpirit((s) => s.sittings);
  const selectedId = useSpirit((s) => s.selectedId);
  const canon = useSpirit((s) => s.canon);
  const seat = useSpirit((s) => s.seat);
  const absorb = useSpirit((s) => s.absorb);
  const forget = useSpirit((s) => s.forget);
  const forgetGraves = useSpirit((s) => s.forgetGraves);
  const select = useSpirit((s) => s.select);
  const ingestBook = useTrench((s) => s.ingestBook);
  const inputRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [hover, setHover] = useState(false);

  const selected = sittings.find((s) => s.id === selectedId) ?? sittings[0] ?? null;

  function take(book: BookFile, name?: string) {
    const err = seat(book, name);
    setMsg(err ?? "seated.");
  }

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        take(JSON.parse(String(reader.result || "")) as BookFile, file.name);
      } catch {
        setMsg("that file is not a book.");
      }
    };
    reader.readAsText(file);
  }

  function onInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onFile(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setHover(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  function seatDesk() {
    const t = useTrench.getState();
    take(t.snapshotBook(), `desk-c${t.house?.generation || 1}`);
    if (t.rival) {
      absorb({
        v: 1,
        kind: "trencher-book",
        savedAt: Date.now(),
        house: {
          ...(t.house ?? {
            generation: 1,
            deaths: 0,
            escapes: 0,
            playbook: t.rival.playbook,
            thesis: t.meta.thesis,
            keywords: t.meta.keywords,
            drop: t.meta.drop,
            lessons: t.rival.lessons,
            kills: t.kills ?? [],
          }),
          playbook: t.rival.playbook,
        },
        playbook: t.rival.playbook,
        meta: t.meta,
        lessons: t.rival.lessons,
        kills: t.kills ?? [],
      });
    }
  }

  function wakeSelected() {
    if (!selected) return;
    const err = ingestBook(selected.book);
    setMsg(err ?? "the desk has this book. cash is still this cell's.");
  }

  const book = selected?.book;
  const play = book?.playbook;
  const burns = play?.bannedCreators ?? [];
  const scars = book?.lessons ?? [];
  const kills = (book?.kills ?? []).filter((k) => k.grade && k.grade !== "pending");

  return (
    <main className="min-h-dvh bg-bg text-fg">
      <header className="border-b border-line px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="font-mono text-2xs tracking-kicker text-subtle uppercase">the gulag radio</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Spirit box</h1>
          </div>
          <Link
            to="/"
            className="font-mono text-2xs tracking-label text-muted uppercase hover:text-fg"
          >
            ← back to the desk
          </Link>
        </div>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted text-pretty">
          One spirit. Every seat, every death, every hatch feeds it. Burns only grow. Floor
          never dies with a loser. Graves are optional. Clone 2 wears this, not the tail of
          a corpse.
        </p>
      </header>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <section className="border-b border-line lg:border-r lg:border-b-0">
          <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:px-5">
            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onInput}
            />
            <Button size="sm" onClick={seatDesk}>
              Feed the spirit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => inputRef.current?.click()}>
              Drop a book
            </Button>
            {sittings.length > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => forgetGraves()}>
                Forget graves
              </Button>
            ) : null}
            {msg ? <p className="font-mono text-2xs text-subtle">{msg}</p> : null}
          </div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setHover(true);
            }}
            onDragLeave={() => setHover(false)}
            onDrop={onDrop}
            className={`min-h-40 ${hover ? "bg-elevated" : ""}`}
          >
            {sittings.length === 0 ? (
              <p className="px-4 py-8 font-mono text-2xs leading-relaxed text-subtle sm:px-5">
                Graves are extra. The spirit already compiles. Seat the desk to feed it.
              </p>
            ) : (
              <ul>
                {sittings.map((s) => {
                  const on = selected?.id === s.id;
                  const p = s.book.playbook;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => select(s.id)}
                        className={`flex w-full flex-col items-start gap-0.5 border-b border-line px-4 py-3 text-left sm:px-5 ${
                          on ? "bg-elevated" : "hover:bg-surface"
                        }`}
                      >
                        <span className="font-mono text-2xs tracking-label text-subtle uppercase">
                          clone {s.book.house?.generation || 1}
                          {s.book.house?.deaths ? ` · ${s.book.house.deaths} dead` : ""}
                        </span>
                        <span className="text-sm text-fg">{sittingTitle(s)}</span>
                        <span className="font-mono text-2xs text-muted">
                          floor {p?.scoreFloor ?? "—"}
                          {p?.bannedCreators?.length ? ` · ${p.bannedCreators.length} burned` : ""}
                          {" · "}
                          {when(s.book.savedAt || s.addedAt)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-2xl">
            <p className="font-mono text-2xs tracking-kicker text-subtle uppercase">
              the spirit
              {canon.absorbed ? ` · ${canon.absorbed} absorbed` : ""}
              {canon.updatedAt ? ` · ${when(canon.updatedAt)}` : ""}
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
              {canonHasBlood(canon) ? "Forefathers compiled" : "Empty cell"}
            </h2>
            <p className="mt-2 font-mono text-2xs leading-relaxed text-muted">
              thesis · {canon.thesis}
              {" · "}floor {canon.scoreFloor}
              {" · "}stop {(canon.stopPct * 100).toFixed(0)}%
              {" · "}take +{(canon.takePct * 100).toFixed(0)}%
              {canon.bannedCreators.length ? ` · ${canon.bannedCreators.length} burned` : ""}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted text-pretty">
              Floor only rises. Burns only add. A dying clone cannot write this down. Forget
              the graves — the spirit already ate them.
            </p>

            {canon.bannedCreators.length > 0 && (
              <div className="mt-8">
                <h3 className="font-mono text-micro tracking-label text-subtle uppercase">Burned wallets</h3>
                <ul className="mt-2 flex flex-col gap-1">
                  {canon.bannedCreators.slice(0, 20).map((w) => (
                    <li key={w} className="font-mono text-2xs text-loss">
                      {shortAddr(w, 6)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {canon.kills.filter((k) => k.grade && k.grade !== "pending").length > 0 && (
              <div className="mt-8">
                <h3 className="font-mono text-micro tracking-label text-subtle uppercase">Graded kills</h3>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {canon.kills
                    .filter((k) => k.grade && k.grade !== "pending")
                    .slice(0, 16)
                    .map((k) => (
                      <li
                        key={`${k.mint}-${k.killedAt}`}
                        className="flex items-center justify-between gap-3 font-mono text-2xs"
                      >
                        <span className="truncate text-fg">${k.symbol}</span>
                        <span className={k.grade === "ran" ? "text-loss" : "text-gain"}>
                          {k.grade}
                          {k.mcapAt > 0 && k.lastMcap
                            ? ` ${formatPct((k.lastMcap - k.mcapAt) / k.mcapAt)}`
                            : ""}
                          {" · "}
                          {k.kind}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {canon.lessons.length > 0 && (
              <div className="mt-8">
                <h3 className="font-mono text-micro tracking-label text-subtle uppercase">Scars</h3>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {canon.lessons.slice(0, 12).map((l) => (
                    <li key={l.id} className="font-mono text-2xs leading-snug text-muted">
                      <span className="text-subtle uppercase">{l.agent}</span>
                      <span className="text-subtle"> · </span>
                      <span className="text-fg">{l.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {canon.drop.length ? (
              <div className="mt-8">
                <h3 className="font-mono text-micro tracking-label text-subtle uppercase">Drop list</h3>
                <p className="mt-2 font-mono text-2xs text-muted">{canon.drop.join(" · ")}</p>
              </div>
            ) : null}

            {selected && book && play ? (
              <div className="mt-12 border-t border-line pt-6">
                <p className="font-mono text-2xs tracking-kicker text-subtle uppercase">
                  grave · {when(book.savedAt)}
                </p>
                <p className="mt-2 font-mono text-2xs text-muted">
                  floor {play.scoreFloor}
                  {" · "}
                  {burns.length} burned · this photocopy does not overwrite the spirit
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" onClick={wakeSelected}>
                    Load this grave
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => selected && forget(selected.id)}
                  >
                    Forget this sitting
                  </Button>
                </div>
                <p className="mt-2 font-mono text-2xs text-subtle">
                  Load writes the live vet book. Does not touch cash. Do not load a corpse into Hatch.
                </p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
