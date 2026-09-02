import { useEffect } from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

function isStaleChunk(message: string): boolean {
  return /failed to fetch dynamically imported module|loading chunk \d+|importing a module script failed/i.test(
    message,
  );
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
    window.location.reload();
  }, [stale]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-fg">
      <span className="text-loss" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">
        {stale ? "Desk file went stale" : "Something went wrong"}
      </h1>
      <p className="max-w-md text-sm break-words text-muted">{message}</p>
      <button
        type="button"
        className="mt-2 border border-line px-3 py-2 font-mono text-2xs tracking-label text-fg uppercase hover:border-fg"
        onClick={() => {
          try {
            sessionStorage.removeItem("trencher-chunk-reload");
          } catch {
            /* ignore */
          }
          window.location.reload();
        }}
      >
        Reload the desk
      </button>
    </main>
  );
}
