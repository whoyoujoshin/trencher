import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { blankPlaybook, cheapKill, decideSell, emptyPrint, exitMcap, formatWeather, paperFloor, ponsWake, regimeShift, scarSit, scoreSetup, setupMatch, sizeByScore, takeWindow, tapeHeat, trailSpec, windowPrint, writeWeather } from "./logic.ts";
import { blankWeather } from "./types.ts";
import type { ClosedTrade, MetaState, PumpCoin } from "./types.ts";

function coin(over: Partial<PumpCoin> = {}): PumpCoin {
  return {
    mint: "0x" + "11".repeat(20),
    name: "Claw",
    symbol: "CLAW",
    description: "Pons V2 bonding curve",
    image: null,
    creator: "0x" + "22".repeat(20),
    createdAt: Date.now() - 10 * 60_000,
    usdMcap: 6400,
    solMcap: 2,
    replyCount: 0,
    complete: false,
    nsfw: false,
    banned: false,
    live: false,
    twitter: null,
    telegram: null,
    website: null,
    username: null,
    lastTradeAt: Date.now(),
    athMcap: 6400,
    venue: "pons",
    ...over,
  };
}

const open: MetaState = {
  thesis: "stock memes only",
  keywords: ["hood", "robinhood", "nasdaq"],
  drop: [],
  source: "local",
  updatedAt: Date.now(),
};

describe("pons retune", () => {
  it("does not cheap-kill a listed Pons pool", () => {
    assert.equal(cheapKill(coin({ complete: true }), Date.now()), null);
  });

  it("still cheap-kills a completed Pump curve", () => {
    const c = coin({ venue: "pump", complete: true, mint: "So1anaMint1111111111111111111111111111111" });
    assert.equal(cheapKill(c, Date.now()), "already off the curve. too late.");
  });

  it("lets a 2h Pons name through cheap and setup despite Pump thesis", () => {
    const c = coin({ createdAt: Date.now() - 2 * 60 * 60_000 });
    assert.equal(cheapKill(c, Date.now()), null);
    assert.equal(setupMatch(c, open, Date.now()), null);
  });

  it("scores a typical Pons curve above the cub floor and under live 72", () => {
    const { score, why } = scoreSetup(coin(), open, Date.now());
    assert.ok(score >= 50, `score ${score} ${why}`);
    assert.ok(score < 72, `live floor should still veto ${score}`);
  });

  it("wakes a seen cheap-killed mint once it has a name and book", () => {
    const c = coin();
    const out = ponsWake([], [c], new Set([c.mint]), new Set(), [], new Set());
    assert.equal(out.length, 1);
    assert.equal(out[0].symbol, "CLAW");
  });

  it("time-stops a flat Pons clip after 90s so chairs rotate", () => {
    const now = Date.now();
    const reason = decideSell(
      {
        costUsd: 10,
        entryMcap: 5000,
        lastMcap: 5000,
        peakMcap: 5000,
        openedAt: now - 95_000,
        stopPct: -0.35,
      },
      now,
      { scoreFloor: 45, stopPct: -0.35, takePct: 0.9, socialBias: 0, bannedCreators: [] },
      "pons",
    );
    assert.equal(reason, "time");
  });

  it("hard-takes a Pons runner at +85%", () => {
    const now = Date.now();
    const reason = decideSell(
      {
        costUsd: 10,
        entryMcap: 5000,
        lastMcap: 9500,
        peakMcap: 9500,
        openedAt: now - 20_000,
        stopPct: -0.35,
      },
      now,
      { scoreFloor: 45, stopPct: -0.35, takePct: 0.9, socialBias: 0, bannedCreators: [] },
      "pons",
    );
    assert.equal(reason, "take");
  });

  it("books the trail, not the corpse, when a Pons runner rugs in one tick", () => {
    const pos = {
      costUsd: 10,
      entryMcap: 5000,
      lastMcap: 200,
      peakMcap: 20000,
      openedAt: Date.now() - 30_000,
      stopPct: -0.35,
    };
    const reason = decideSell(
      pos,
      Date.now(),
      { scoreFloor: 45, stopPct: -0.35, takePct: 0.9, socialBias: 0, bannedCreators: [] },
      "pons",
    );
    assert.equal(reason, "take");
    const mark = exitMcap(pos, "pons");
    assert.ok(mark > 15000, `trail mark ${mark}`);
    assert.ok(mark < pos.peakMcap);
  });

  it("fills the written stop, not the corpse, when a Pons clip never ran", () => {
    const pos = {
      costUsd: 8,
      entryMcap: 5000,
      lastMcap: 200,
      peakMcap: 5000,
      openedAt: Date.now() - 20_000,
      stopPct: -0.22,
    };
    const mark = exitMcap(pos, "pons");
    assert.ok(Math.abs(mark - 5000 * 0.78) < 1, `stop mark ${mark}`);
  });

  it("caps Pons size at 8 usd", () => {
    const n = sizeByScore(500, 4000, 70, "pons");
    assert.ok(n <= 8, `size ${n}`);
    assert.ok(n >= 2, `size ${n}`);
  });

  it("sits a lane after three straight losses", () => {
    const now = Date.now();
    const closed = [
      { pnlUsd: -2, closedAt: now - 10_000 },
      { pnlUsd: -1.5, closedAt: now - 40_000 },
      { pnlUsd: -3, closedAt: now - 80_000 },
    ];
    assert.equal(scarSit(closed, now), true);
    assert.equal(scarSit(closed, now + 5 * 60_000), false);
  });

  it("scores a busy tape hotter than a thin one", () => {
    const now = Date.now();
    const busy = tapeHeat(
      [
        coin({ createdAt: now - 60_000, usdMcap: 12_000, symbol: "HOT" }),
        coin({ createdAt: now - 120_000, usdMcap: 9_000, symbol: "RUN" }),
        coin({ createdAt: now - 180_000, usdMcap: 4_000, symbol: "OK" }),
      ],
      "pons",
      now,
    );
    const thin = tapeHeat(
      [coin({ createdAt: now - 8 * 60_000, usdMcap: 2_000, symbol: "MEH" })],
      "pons",
      now,
    );
    assert.ok(busy.score > thin.score, `${busy.score} vs ${thin.score}`);
    assert.equal(busy.runners, 2);
  });
});

describe("META weather", () => {
  function close(over: Partial<ClosedTrade> = {}): ClosedTrade {
    return {
      mint: "m",
      symbol: "X",
      name: "X",
      creator: "",
      costUsd: 8,
      proceedsUsd: 8,
      pnlUsd: 0,
      pnlPct: 0,
      reason: "time",
      heldMs: 90_000,
      openedAt: Date.now() - 90_000,
      closedAt: Date.now(),
      score: 70,
      slipPct: 0,
      feeUsd: 0.08,
      ...over,
    };
  }

  it("flags a dead tape vs an empty prior", () => {
    const batch = Array.from({ length: 8 }, (_, i) =>
      close({ symbol: `T${i}`, reason: "time", pnlPct: 0, pnlUsd: -0.1, closedAt: Date.now() - i * 1000 }),
    );
    const nowP = windowPrint(batch, { venue: "pons", at: 0, ok: true, launches: 1, named: 1, live: 1, runners: 0, flowUsd: 0, newestAgeMs: 0, score: 4 }, "pons");
    const flags = regimeShift(emptyPrint("pons"), nowP, null);
    assert.ok(flags.includes("died"), String(flags));
  });

  it("flags rip-then-rug", () => {
    const batch = [
      close({ reason: "stop", pnlPct: -0.18, peakPct: 0.8, pnlUsd: -1 }),
      close({ reason: "stop", pnlPct: -0.2, peakPct: 0.6, pnlUsd: -1 }),
      close({ reason: "time", pnlPct: 0.05, peakPct: 0.5, pnlUsd: 0.2 }),
      close({ reason: "take", pnlPct: 0.9, peakPct: 0.9, pnlUsd: 6 }),
      close({ reason: "stop", pnlPct: -0.22, peakPct: 0.05, pnlUsd: -1 }),
      close({ reason: "time", pnlPct: 0, peakPct: 0, pnlUsd: 0 }),
    ];
    const nowP = windowPrint(batch, null, "pons");
    const flags = regimeShift(emptyPrint("pons"), nowP, null);
    assert.ok(flags.includes("rip"), String(flags));
  });

  it("clamps bar under spirit and never below 40", () => {
    const wx = writeWeather(blankWeather(), ["died", "bleed"], emptyPrint("pons"), 72);
    assert.ok(wx.bar <= 72);
    assert.ok(wx.bar >= 40);
    assert.equal(wx.size, 0.7);
    const low = writeWeather({ ...blankWeather(), bar: 40 }, ["woke"], emptyPrint("pump"), 72);
    assert.equal(low.bar, 40);
  });

  it("paper floor ignores a 72 playbook so spirit stays the live gate", () => {
    const book = { ...blankPlaybook(), scoreFloor: 72 };
    const wx = { ...blankWeather(), bar: 53 };
    assert.equal(paperFloor(book, wx, 72), 53);
    const hatch = { ...blankPlaybook(), scoreFloor: 39 };
    assert.equal(paperFloor(hatch, wx, 72), 47);
  });

  it("sizes down on weather 0.7 without breaking the 8 usd cap", () => {
    const full = sizeByScore(500, 4000, 70, "pons");
    const cut = sizeByScore(500, 4000, 70, "pons", { ...blankWeather(), size: 0.7 });
    assert.ok(full <= 8);
    assert.ok(cut < full);
    assert.ok(cut >= 2);
  });

  it("time-stops a flat Pons clip on a 60s sit", () => {
    const now = Date.now();
    const reason = decideSell(
      {
        costUsd: 8,
        entryMcap: 5000,
        lastMcap: 5000,
        peakMcap: 5000,
        openedAt: now - 65_000,
        stopPct: -0.22,
      },
      now,
      blankPlaybook(),
      "pons",
      { ...blankWeather(), sitMs: 60_000 },
    );
    assert.equal(reason, "time");
  });

  it("hides Pons sit on Pump and shows arm on both", () => {
    const wx = writeWeather(blankWeather(), ["died"], emptyPrint("pons"), 72);
    const pump = formatWeather(wx, "pump");
    const pons = formatWeather(wx, "pons");
    assert.equal(pump.includes("sit"), false, pump);
    assert.ok(pump.includes("arm +"), pump);
    assert.ok(pons.includes("sit"), pons);
    assert.ok(pons.includes("arm +"), pons);
  });

  it("time-stops a tiny-green Pump clip after 8m so chairs rotate", () => {
    const now = Date.now();
    const reason = decideSell(
      {
        costUsd: 20,
        entryMcap: 5000,
        lastMcap: 5020,
        peakMcap: 5100,
        openedAt: now - 8.5 * 60_000,
        stopPct: -0.5,
      },
      now,
      blankPlaybook(),
      "pump",
    );
    assert.equal(reason, "time");
  });

  it("lowers Pump trail arm on died so +100% is not the only take", () => {
    const wx = writeWeather(blankWeather(), ["died"], emptyPrint("pump"), 72);
    const spec = trailSpec("pump", wx);
    assert.ok(spec.arm <= 0.4, `arm ${spec.arm}`);
    assert.ok(spec.arm >= 0.22);
    const now = Date.now();
    const take = decideSell(
      {
        costUsd: 20,
        entryMcap: 5000,
        lastMcap: 6000,
        peakMcap: 9000,
        openedAt: now - 60_000,
        stopPct: -0.5,
      },
      now,
      blankPlaybook(),
      "pump",
      wx,
    );
    assert.equal(take, "take");
  });

  it("banks a +18% peak at +2% instead of riding the -18% stop", () => {
    const now = Date.now();
    const pos = {
      costUsd: 15,
      entryMcap: 5000,
      lastMcap: 4100,
      peakMcap: 5900,
      openedAt: now - 90_000,
      stopPct: -0.18,
    };
    const reason = decideSell(pos, now, { ...blankPlaybook(), stopPct: -0.18 }, "pump");
    assert.equal(reason, "take");
    const mark = exitMcap(pos, "pump");
    assert.ok(Math.abs(mark - 5000 * 1.02) < 1, `protect mark ${mark}`);
  });

  it("reads four hot modest-green rugs as rip without waiting on paper", () => {
    const now = Date.now();
    const batch = Array.from({ length: 4 }, (_, i) =>
      close({
        symbol: `H${i}`,
        reason: "stop",
        pnlPct: -0.18,
        peakPct: 0.18,
        pnlUsd: -2.7,
        rail: "sol",
        closedAt: now - i * 60_000,
      }),
    );
    const nowP = windowPrint(batch, null, "pump");
    assert.equal(nowP.source, "hot");
    assert.ok(nowP.modestGavePct >= 0.35, String(nowP.modestGavePct));
    const flags = regimeShift(emptyPrint("pump"), nowP, null);
    assert.ok(flags.includes("rip"), String(flags));
  });

  it("prefers four hot fills over a pile of paper in the window", () => {
    const now = Date.now();
    const paper = Array.from({ length: 10 }, (_, i) =>
      close({ symbol: `P${i}`, rail: "paper", reason: "time", pnlPct: 0, closedAt: now - i * 1000 }),
    );
    const hot = Array.from({ length: 4 }, (_, i) =>
      close({
        symbol: `L${i}`,
        rail: "sol",
        reason: "stop",
        pnlPct: -0.18,
        peakPct: 0.2,
        closedAt: now - i * 2000,
      }),
    );
    const batch = takeWindow([...paper, ...hot], now);
    assert.equal(batch.every((t) => t.rail === "sol"), true);
    assert.ok(batch.length >= 4);
  });

  it("still stops a clip that never greened", () => {
    const pos = {
      costUsd: 15,
      entryMcap: 5000,
      lastMcap: 4100,
      peakMcap: 5100,
      openedAt: Date.now() - 20_000,
      stopPct: -0.18,
    };
    const reason = decideSell(pos, Date.now(), { ...blankPlaybook(), stopPct: -0.18 }, "pump");
    assert.equal(reason, "stop");
    const mark = exitMcap(pos, "pump");
    assert.ok(Math.abs(mark - 5000 * 0.82) < 1, `stop mark ${mark}`);
  });
});
