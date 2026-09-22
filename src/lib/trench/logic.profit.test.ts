import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  absorbTrade,
  bankPct,
  blankPlaybook,
  decideSell,
  hotLiveBlock,
  punchedQuiet,
  ripperFloor,
  scarStreak,
} from "./logic.ts";
import { blankWeather, MIN_BANK_PCT, MIN_BANK_SCAR_PCT, RIPPER_PUNCH } from "./types.ts";
import type { ClosedTrade, MetaState, PumpCoin, TapeHeat } from "./types.ts";

function coin(over: Partial<PumpCoin> = {}): PumpCoin {
  return {
    mint: "So1anaMint1111111111111111111111111111111",
    name: "Ripper",
    symbol: "RIP",
    description: "momentum meme",
    image: null,
    creator: "creatorA",
    createdAt: Date.now() - 60_000,
    usdMcap: 64_000,
    solMcap: 2,
    replyCount: 3,
    complete: false,
    nsfw: false,
    banned: false,
    live: false,
    twitter: "https://x.com/r",
    telegram: null,
    website: null,
    username: null,
    lastTradeAt: Date.now() - 5_000,
    athMcap: 64_000,
    venue: "pump",
    ...over,
  };
}

function trade(over: Partial<ClosedTrade> = {}): ClosedTrade {
  return {
    mint: "m1",
    symbol: "DOGE",
    name: "Doge Coin",
    creator: "walletA",
    costUsd: 8,
    proceedsUsd: 8.5,
    pnlUsd: 0.3,
    pnlPct: 0.04,
    reason: "take",
    heldMs: 20_000,
    openedAt: Date.now() - 20_000,
    closedAt: Date.now(),
    score: 60,
    slipPct: 0.02,
    feeUsd: 0.16,
    peakPct: 0.05,
    metaSource: "local",
    rail: "paper",
    ...over,
  };
}

describe("profit loop P0 bank-any-green", () => {
  it("banks at MIN_BANK_PCT (~4%) instead of waiting for runners", () => {
    const now = Date.now();
    const reason = decideSell(
      {
        costUsd: 15,
        entryMcap: 5000,
        lastMcap: 5000 * (1 + MIN_BANK_PCT),
        peakMcap: 5000 * (1 + MIN_BANK_PCT),
        openedAt: now - 15_000,
        stopPct: -0.5,
        takePct: 0.9,
      },
      now,
      blankPlaybook(),
      "pump",
    );
    assert.equal(reason, "take");
  });

  it("does not bank a tiny +2% that still sits under the fee edge", () => {
    const now = Date.now();
    const reason = decideSell(
      {
        costUsd: 15,
        entryMcap: 5000,
        lastMcap: 5100,
        peakMcap: 5100,
        openedAt: now - 15_000,
        stopPct: -0.5,
        takePct: 0.9,
      },
      now,
      blankPlaybook(),
      "pump",
    );
    assert.equal(reason, null);
  });

  it("banks earlier on a scar/bleed print", () => {
    const now = Date.now();
    const wx = {
      ...blankWeather(),
      kind: ["bleed" as const],
      print: {
        n: 3,
        takePct: 0,
        stopPct: 1,
        timePct: 0,
        flatPct: 0,
        runnerPct: 0,
        gaveBackPct: 0,
        modestGavePct: 0,
        source: "hot" as const,
        avgHold: 20_000,
        scarStreak: 3,
        launches: 0,
        live: 0,
        runners: 0,
        heatScore: 0,
        venue: "pump" as const,
        medianPeak: 0,
        missedPct: 0,
        peakN: 0,
      },
    };
    assert.ok(bankPct(true, wx) <= MIN_BANK_SCAR_PCT + 1e-9);
    const reason = decideSell(
      {
        costUsd: 15,
        entryMcap: 5000,
        lastMcap: 5000 * (1 + MIN_BANK_SCAR_PCT),
        peakMcap: 5000 * (1 + MIN_BANK_SCAR_PCT),
        openedAt: now - 12_000,
        stopPct: -0.5,
        takePct: 0.9,
      },
      now,
      blankPlaybook(),
      "pump",
      wx,
    );
    assert.equal(reason, "take");
  });

  it("once greened past bank, does not need trail arm to take", () => {
    const now = Date.now();
    const reason = decideSell(
      {
        costUsd: 15,
        entryMcap: 5000,
        lastMcap: 5300,
        peakMcap: 5300,
        openedAt: now - 30_000,
        stopPct: -0.18,
        takePct: 0.9,
      },
      now,
      { ...blankPlaybook(), stopPct: -0.18, takePct: 0.9 },
      "pump",
    );
    assert.equal(reason, "take");
  });
});

describe("profit loop P0 ripper entry", () => {
  it("cuts the score floor for fresh tape in the mcap window", () => {
    const now = Date.now();
    const c = coin({ createdAt: now - 60_000, usdMcap: 64_000, lastTradeAt: now - 5_000 });
    const heat: TapeHeat = {
      venue: "pump",
      at: now,
      ok: true,
      launches: 8,
      named: 6,
      live: 5,
      runners: 3,
      flowUsd: 100_000,
      newestAgeMs: 30_000,
      score: 72,
    };
    const base = 53;
    const floor = ripperFloor(base, c, now, heat);
    assert.ok(floor < base, `floor ${floor} vs base ${base}`);
    assert.ok(floor >= 40);
  });

  it("HOT_PUNCH still skips quiet; ripper punch + heat also skips quiet", () => {
    const now = Date.now();
    const quiet = coin({
      usdMcap: 64_000,
      lastTradeAt: now - 90_000,
      createdAt: now - 10 * 60_000,
    });
    assert.ok(hotLiveBlock(quiet, now, 60)?.includes("quiet"));
    assert.equal(hotLiveBlock(quiet, now, 80), null);
    assert.equal(hotLiveBlock(quiet, now, RIPPER_PUNCH, 72), null);
    assert.ok(hotLiveBlock(quiet, now, RIPPER_PUNCH, 40)?.includes("quiet"));
    assert.equal(punchedQuiet(quiet, now, 84), true);
    assert.equal(punchedQuiet(quiet, now, RIPPER_PUNCH, 72), true);
    assert.equal(punchedQuiet(quiet, now, 50, 72), false);
  });
});

describe("profit loop P0 scar learning", () => {
  const meta: MetaState = {
    thesis: "open",
    keywords: [],
    drop: [],
    source: "local",
    updatedAt: 0,
  };

  it("counts a net-of-fee green as a win for word weights", () => {
    const out = absorbTrade(
      trade({ pnlUsd: 0.2, feeUsd: 0.5, rail: "paper", symbol: "WINR", name: "Winner Rocket" }),
      blankPlaybook(),
      meta,
    );
    const tok = Object.keys(out.meta.words ?? {}).find((k) => (out.meta.words?.[k]?.w ?? 0) > 0);
    assert.ok(tok, `expected a winning word, got ${JSON.stringify(out.meta.words)}`);
  });

  it("raises the floor after a three-loss scar streak", () => {
    const now = Date.now();
    const losses = [
      trade({
        mint: "a",
        pnlUsd: -2,
        reason: "stop",
        peakPct: 0.02,
        closedAt: now - 1000,
        symbol: "A",
        name: "Alpha",
      }),
      trade({
        mint: "b",
        pnlUsd: -2,
        reason: "stop",
        peakPct: 0.02,
        closedAt: now - 2000,
        symbol: "B",
        name: "Beta",
      }),
    ];
    assert.equal(scarStreak([...losses], 2), true);
    const book = { ...blankPlaybook(), scoreFloor: 45 };
    const out = absorbTrade(
      trade({
        mint: "c",
        pnlUsd: -2,
        reason: "stop",
        peakPct: 0.01,
        closedAt: now,
        symbol: "C",
        name: "Charlie",
        creator: "walletScar",
      }),
      book,
      meta,
      losses,
    );
    assert.ok(out.playbook.scoreFloor >= 47, `floor ${out.playbook.scoreFloor}`);
    assert.ok(out.lessons.some((l) => l.text.includes("scar streak") || l.text.includes("floor")));
  });
});
