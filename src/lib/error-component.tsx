import { useEffect } from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

function isStaleChunk(message: string): boolean {
  return /failed to fetch dynamically imported module|loading chunk \d+|importing a module script failed/i.test(
    message,
  );
}

export function hardReload(force = false) {
  try {
    if (force) sessionStorage.removeItem("trencher-chunk-reload");
  } catch {
    /* ignore */
  }
  const go = () => {
    const u = new URL(window.location.href);
    u.searchParams.set("desk", String(Date.now()));
    window.location.replace(u.toString());
  };
  const sw =
    typeof navigator !== "undefined" && "serviceWorker" in navigator
      ? navigator.serviceWorker.getRegistrations().then((regs) => Promise.all(regs.map((r) => r.unregister())))
      : Promise.resolve();
  const cachesClear =
    typeof caches !== "undefined"
      ? caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      : Promise.resolve();
  void Promise.all([sw, cachesClear]).finally(go);
}

export function clearStaleBoot() {
  try {
    sessionStorage.removeItem("trencher-chunk-reload");
  } catch {
    /* ignore */
  }
  if (typeof window === "undefined") return;
  const u = new URL(window.location.href);
  if (!u.searchParams.has("desk")) return;
  u.searchParams.delete("desk");
  const next = u.pathname + (u.searchParams.toString() ? `?${u.searchParams}` : "") + u.hash;
  window.history.replaceState({}, "", next);
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const message = error.message || "An unexpected error occurred. Try reloading the page.";
  const stale = isStaleChunk(message);

  useEffect(() => {
    if (!stale) return;
    try {
      if (sessionStorage.getItem("trencher-chunk-reload")) return;
      sessionStorage.setItem("trencher-chunk-reload", "1");
    } catch {
      return;
    }
    hardReload();
  }, [stale]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-fg">
      <span className="text-loss" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">
        {stale ? "Desk file went stale" : "Something went wrong"}
      </h1>
      <p className="max-w-md text-sm break-words text-muted">
        {stale
          ? "This tab is holding an old desk file from the last publish. Reload pulls the current one."
          : message}
      </p>
      <button
        type="button"
        className="mt-2 border border-line px-3 py-2 font-mono text-2xs tracking-label text-fg uppercase hover:border-fg"
        onClick={() => hardReload(true)}
      >
        Reload the desk
      </button>
    </main>
  );
}
