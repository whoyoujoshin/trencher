import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  blankCanon,
  canonHasBlood,
  mergeCanon,
  type SpiritCanon,
} from "./canon";
import type { BookFile } from "./types";

export type Sitting = {
  id: string;
  addedAt: number;
  name: string;
  book: BookFile;
};

type SpiritState = {
  sittings: Sitting[];
  selectedId: string | null;
  canon: SpiritCanon;
  seat: (book: BookFile, name?: string) => string | null;
  absorb: (book: BookFile) => void;
  forget: (id: string) => void;
  forgetGraves: () => void;
  select: (id: string | null) => void;
};

function nid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function sittingTitle(s: Sitting): string {
  const gen = s.book.house?.generation || 1;
  return s.name?.trim() || `clone ${gen}`;
}

export const useSpirit = create<SpiritState>()(
  persist(
    (set, get) => ({
      sittings: [],
      selectedId: null,
      canon: blankCanon(),
      absorb: (book) => {
        if (!book || book.kind !== "trencher-book" || book.v !== 1) return;
        set({ canon: mergeCanon(get().canon ?? blankCanon(), book) });
      },
      seat: (book, name) => {
        if (!book || book.kind !== "trencher-book" || book.v !== 1) {
          return "not a trencher book.";
        }
        const sitting: Sitting = {
          id: nid(),
          addedAt: Date.now(),
          name: name?.replace(/\.json$/i, "") || `clone ${book.house?.generation || 1}`,
          book,
        };
        set((s) => ({
          canon: mergeCanon(s.canon ?? blankCanon(), book),
          sittings: [sitting, ...s.sittings].slice(0, 24),
          selectedId: sitting.id,
        }));
        return null;
      },
      forget: (id) => {
        const next = get().sittings.filter((x) => x.id !== id);
        const selectedId = get().selectedId === id ? (next[0]?.id ?? null) : get().selectedId;
        set({ sittings: next, selectedId });
      },
      forgetGraves: () => set({ sittings: [], selectedId: null }),
      select: (id) => set({ selectedId: id }),
    }),
    {
      name: "trencher-spirit-v1",
      storage: createJSONStorage(() => {
        const memory = new Map<string, string>();
        const ls = typeof window !== "undefined" ? window.localStorage : null;
        return {
          getItem: (name) => {
            try {
              return ls?.getItem(name) ?? memory.get(name) ?? null;
            } catch {
              return memory.get(name) ?? null;
            }
          },
          setItem: (name, value) => {
            memory.set(name, value);
            try {
              ls?.setItem(name, value);
            } catch {
              /* quota */
            }
          },
          removeItem: (name) => {
            memory.delete(name);
            try {
              ls?.removeItem(name);
            } catch {
              /* ignore */
            }
          },
        };
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SpiritState>;
        const sittings = Array.isArray(p.sittings) ? p.sittings : [];
        let canon = p.canon && typeof p.canon === "object" ? { ...blankCanon(), ...p.canon } : blankCanon();
        if (!canonHasBlood(canon) && sittings.length) {
          canon = sittings.reduce(
            (c, s) => mergeCanon(c, s.book),
            blankCanon(),
          );
        }
        return {
          ...current,
          ...p,
          sittings,
          canon,
        };
      },
      partialize: (s) => ({
        sittings: s.sittings.slice(0, 24),
        selectedId: s.selectedId,
        canon: s.canon,
      }),
    },
  ),
);
