import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";

function hashPin(pin: string): string {
  return createHash("sha256").update(`trencher-desk:${pin}`).digest("hex");
}

export const pullDesk = createServerFn({ method: "POST" })
  .validator((input: { pin: string; hunterId: string }) => ({
    pin: String(input.pin ?? "").slice(0, 64),
    hunterId: String(input.hunterId ?? "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    if (data.pin.length < 4) return { ok: false as const, error: "desk code too short" };
    const sql = await getSql();
    const rows = await sql<{
      blob: string;
      pin_hash: string;
      hunter_id: string | null;
      hunter_until: string | null;
    }>`select blob, pin_hash, hunter_id, hunter_until from trench_desk where id = ${"main"}`;
    const row = rows[0];
    if (!row) return { ok: false as const, error: "no cloud desk yet. seat it from the live tab." };
    if (row.pin_hash !== hashPin(data.pin)) return { ok: false as const, error: "wrong desk code." };
    const until = row.hunter_until ? Date.parse(row.hunter_until) : 0;
    const mine =
      !row.hunter_id ||
      !until ||
      until < Date.now() ||
      row.hunter_id === data.hunterId;
    if (mine && data.hunterId) {
      const next = new Date(Date.now() + 20_000).toISOString();
      await sql`
        update trench_desk
        set hunter_id = ${data.hunterId}, hunter_until = ${next}
        where id = ${"main"} and pin_hash = ${row.pin_hash}
      `;
    }
    return {
      ok: true as const,
      blob: row.blob,
      hunter: mine,
    };
  });

export const pushDesk = createServerFn({ method: "POST" })
  .validator((input: { pin: string; blob: string; hunterId: string }) => ({
    pin: String(input.pin ?? "").slice(0, 64),
    blob: String(input.blob ?? "").slice(0, 1_500_000),
    hunterId: String(input.hunterId ?? "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    if (data.pin.length < 4) return { ok: false as const, error: "desk code too short" };
    if (!data.blob) return { ok: false as const, error: "empty desk" };
    const sql = await getSql();
    const pinHash = hashPin(data.pin);
    const rows = await sql<{ pin_hash: string }>`select pin_hash from trench_desk where id = ${"main"}`;
    const existing = rows[0];
    if (existing && existing.pin_hash !== pinHash) {
      return { ok: false as const, error: "wrong desk code." };
    }
    const until = new Date(Date.now() + 20_000).toISOString();
    if (!existing) {
      await sql`
        insert into trench_desk (id, pin_hash, blob, hunter_id, hunter_until, updated_at)
        values (${"main"}, ${pinHash}, ${data.blob}, ${data.hunterId || null}, ${until}, now())
      `;
    } else {
      await sql`
        update trench_desk
        set blob = ${data.blob},
            hunter_id = ${data.hunterId || null},
            hunter_until = ${until},
            updated_at = now()
        where id = ${"main"} and pin_hash = ${pinHash}
      `;
    }
    return { ok: true as const, hunter: true };
  });
