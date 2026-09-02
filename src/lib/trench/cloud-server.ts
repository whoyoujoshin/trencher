import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";

const EYE_TTL = 15_000;
const EYE_CAP = 40;
const HUNTER_MS = 90_000;

function hashPin(pin: string): string {
  return createHash("sha256").update(`trencher-desk:${pin}`).digest("hex");
}

let eyesReady: Promise<void> | null = null;

async function ensureEyes(sql: Awaited<ReturnType<typeof getSql>>) {
  eyesReady ??= sql
    .query(
      "alter table trench_desk add column if not exists eyes jsonb not null default '{}'::jsonb",
    )
    .then(() => undefined);
  await eyesReady;
}

function asEyes(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

function pruneEyes(raw: unknown, eyeId: string, hunterId: string | null): { json: string; watching: number } {
  const now = Date.now();
  const cutoff = now - EYE_TTL;
  const next: Record<string, number> = {};
  for (const [k, v] of Object.entries(asEyes(raw))) {
    const t = typeof v === "number" ? v : Number(v);
    if (k && Number.isFinite(t) && t >= cutoff) next[k] = t;
  }
  if (eyeId) next[eyeId] = now;
  const keys = Object.keys(next);
  if (keys.length > EYE_CAP) {
    keys.sort((a, b) => next[a] - next[b]);
    for (const k of keys.slice(0, keys.length - EYE_CAP)) delete next[k];
  }
  const watching = Object.keys(next).filter((k) => k !== hunterId).length;
  return { json: JSON.stringify(next), watching };
}

export const pullDesk = createServerFn({ method: "POST" })
  .validator((input: { pin: string; hunterId: string; eyeId?: string }) => ({
    pin: String(input.pin ?? "").slice(0, 64),
    hunterId: String(input.hunterId ?? "").slice(0, 80),
    eyeId: String(input.eyeId ?? input.hunterId ?? "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    if (data.pin.length < 4) return { ok: false as const, error: "chamber # too short" };
    const sql = await getSql();
    await ensureEyes(sql);
    const pinHash = hashPin(data.pin);
    const rows = await sql<{
      id: string;
      blob: string;
      pin_hash: string;
      hunter_id: string | null;
      hunter_until: string | null;
      eyes: unknown;
    }>`select id, blob, pin_hash, hunter_id, hunter_until, eyes from trench_desk where id = ${pinHash} or (id = ${"main"} and pin_hash = ${pinHash}) limit 1`;
    const row = rows[0];
    if (!row) return { ok: false as const, error: "no chamber yet. host it from the live tab." };
    if (row.pin_hash !== pinHash) return { ok: false as const, error: "wrong chamber #." };
    const until = row.hunter_until ? Date.parse(row.hunter_until) : 0;
    const mine =
      !row.hunter_id ||
      !until ||
      until < Date.now() ||
      row.hunter_id === data.hunterId;
    if (mine && data.hunterId) {
      const next = new Date(Date.now() + HUNTER_MS).toISOString();
      await sql`
        update trench_desk
        set hunter_id = ${data.hunterId}, hunter_until = ${next}
        where id = ${row.id} and pin_hash = ${row.pin_hash}
      `;
    }
    const hunterKey = mine ? data.hunterId : row.hunter_id;
    const presence = mine ? data.hunterId : data.eyeId;
    const { json, watching } = pruneEyes(row.eyes, presence, hunterKey);
    await sql`update trench_desk set eyes = ${json}::jsonb where id = ${row.id}`;
    return {
      ok: true as const,
      blob: row.blob,
      hunter: mine,
      watching,
    };
  });

export const pushDesk = createServerFn({ method: "POST" })
  .validator((input: {
    pin: string;
    blob: string;
    hunterId: string;
    eyeId?: string;
    force?: boolean;
  }) => ({
    pin: String(input.pin ?? "").slice(0, 64),
    blob: String(input.blob ?? "").slice(0, 1_500_000),
    hunterId: String(input.hunterId ?? "").slice(0, 80),
    eyeId: String(input.eyeId ?? input.hunterId ?? "").slice(0, 80),
    force: input.force === true,
  }))
  .handler(async ({ data }) => {
    if (data.pin.length < 4) return { ok: false as const, error: "chamber # too short" };
    if (!data.blob) return { ok: false as const, error: "empty desk" };
    const sql = await getSql();
    await ensureEyes(sql);
    const pinHash = hashPin(data.pin);
    const rows = await sql<{
      id: string;
      pin_hash: string;
      hunter_id: string | null;
      hunter_until: string | null;
      eyes: unknown;
    }>`
      select id, pin_hash, hunter_id, hunter_until, eyes from trench_desk
      where id = ${pinHash} or (id = ${"main"} and pin_hash = ${pinHash})
      limit 1
    `;
    const existing = rows[0];
    if (existing && existing.pin_hash !== pinHash) {
      return { ok: false as const, error: "wrong chamber #." };
    }
    const heldUntil = existing?.hunter_until ? Date.parse(existing.hunter_until) : 0;
    const held =
      !!existing?.hunter_id &&
      heldUntil > Date.now() &&
      existing.hunter_id !== data.hunterId;
    if (held && !data.force) {
      return { ok: false as const, error: "another tab is the hunter.", hunter: false, watching: 0 };
    }
    const until = new Date(Date.now() + HUNTER_MS).toISOString();
    const deskId = existing?.id ?? pinHash;
    const { json, watching } = pruneEyes(existing?.eyes, data.hunterId, data.hunterId);
    if (!existing) {
      await sql`
        insert into trench_desk (id, pin_hash, blob, hunter_id, hunter_until, eyes, updated_at)
        values (${deskId}, ${pinHash}, ${data.blob}, ${data.hunterId || null}, ${until}, ${json}::jsonb, now())
      `;
    } else {
      await sql`
        update trench_desk
        set blob = ${data.blob},
            hunter_id = ${data.hunterId || null},
            hunter_until = ${until},
            eyes = ${json}::jsonb,
            updated_at = now()
        where id = ${deskId} and pin_hash = ${pinHash}
      `;
    }
    return { ok: true as const, hunter: true, watching };
  });
