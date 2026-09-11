import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { absorbKill, absorbTrade, blankPlaybook, blankScorecard, cheapKill, clipsInDay, coldKeywords, decideSell, emptyPrint, exitMcap, formatLedger, formatWeather, gmgnLine, gmgnVeto, grokTrust, hotLiveBlock, isHotFill, liveFloor, paperFloor, pickHotLane, ponsWake, regimeShift, scarSit, scarStreak, scoreSetup, setupMatch, shouldAskMeta, sizeByScore, stampDayHits, stripColdKeywords, takeWindow, tapeHeat, trailSpec, windowPrint, wilsonLow, wordEdge, wordShouldDrop, writeWeather } from "./logic.ts";
import { blankWeather, stampRail } from "./types.ts";
import type { ClosedTrade, MetaState, PumpCoin } from "./types.ts";
import { blankCanon, mergeCanon } from "./canon.ts";
import type { BookFile } from "./types.ts";

function coin(over: Partial<PumpCoin> = {}): PumpCoin {
  return {
    mint: "0x" + "11".repeat(20),
    name: "Claw",
    symbol: "CLAW",
    description: "Pons V2 bonding curve",
    image: null,
    creator: "0x" + "22".repeat(20),
    createdAt: Date.now() - 10 * 60_000,
    usdMcap: 64_000,
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
    athMcap: 64_000,
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
    const c = coin({
      venue: "pump",
      complete: true,
      usdMcap: 8_000,
      mint: "So1anaMint1111111111111111111111111111111",
    });
    assert.equal(cheapKill(c, Date.now()), "already off the curve. too late.");
  });

  it("lets a graduated Pump coin through once it has 50k book", () => {
    const c = coin({
      venue: "pump",
      complete: true,
      usdMcap: 72_000,
      mint: "So1anaMint1111111111111111111111111111111",
    });
    assert.equal(cheapKill(c, Date.now()), null);
    assert.equal(setupMatch(c, { ...open, keywords: [] }, Date.now()), null);
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

  it("wakes a seen Pump mint once the curve has book", () => {
    const c = coin({
      venue: "pump",
      mint: "So1anaMint1111111111111111111111111111111",
      usdMcap: 64_000,
      complete: false,
    });
    const out = ponsWake([], [c], new Set([c.mint]), new Set(), [], new Set(), "pump");
    assert.equal(out.length, 1);
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
        coin({ createdAt: now - 60_000, usdMcap: 80_000, symbol: "HOT" }),
        coin({ createdAt: now - 120_000, usdMcap: 70_000, symbol: "RUN" }),
        coin({ createdAt: now - 180_000, usdMcap: 60_000, symbol: "OK" }),
      ],
      "pons",
      now,
    );
    const thin = tapeHeat(
      [coin({ createdAt: now - 8 * 60_000, usdMcap: 8_000, symbol: "MEH" })],
      "pons",
      now,
    );
    assert.ok(busy.score > thin.score, `${busy.score} vs ${thin.score}`);
    assert.equal(busy.runners, 3);
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

  it("live floor sits 4 over paper, never above spirit", () => {
    const wx = { ...blankWeather(), bar: 53 };
    const book = blankPlaybook();
    assert.equal(liveFloor(book, wx, 72), 57);
    assert.equal(liveFloor(book, { ...wx, bar: 70 }, 72), 72);
    assert.ok(liveFloor(book, wx, 72) < 72);
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
    assert.ok(spec.arm <= 0.25, `arm ${spec.arm}`);
    assert.ok(spec.arm >= 0.18);
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

  it("arms the trail at +25% and books a green that covers fees", () => {
    const spec = trailSpec("pump");
    assert.ok(Math.abs(spec.arm - 0.25) < 0.001, `arm ${spec.arm}`);
    const pos = {
      costUsd: 15,
      entryMcap: 5000,
      lastMcap: 5000 * 1.25 * (1 - spec.give) - 1,
      peakMcap: 6250,
      openedAt: Date.now() - 40_000,
      stopPct: -0.18,
    };
    const reason = decideSell(pos, Date.now(), { ...blankPlaybook(), stopPct: -0.18 }, "pump");
    assert.equal(reason, "take");
    const mark = exitMcap(pos, "pump");
    const booked = mark / 5000 - 1;
    assert.ok(booked >= 0.02, `booked ${(booked * 100).toFixed(1)}% should cover fees`);
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

  it("pulse-dumps a dead clip after 8s instead of waiting for -18%", () => {
    const now = Date.now();
    const pos = {
      costUsd: 15,
      entryMcap: 5000,
      lastMcap: 4950,
      peakMcap: 5245,
      openedAt: now - 8_000,
      stopPct: -0.18,
    };
    assert.equal(decideSell(pos, now, { ...blankPlaybook(), stopPct: -0.18 }, "pump"), "time");
    const mark = exitMcap(pos, "pump");
    assert.ok(Math.abs(mark - 4950) < 1, `pulse mark ${mark} should be last, not the stop`);
    assert.equal(
      decideSell({ ...pos, openedAt: now - 4_000 }, now, { ...blankPlaybook(), stopPct: -0.18 }, "pump"),
      null,
    );
    assert.equal(
      decideSell({ ...pos, lastMcap: 5100 }, now, { ...blankPlaybook(), stopPct: -0.18 }, "pump"),
      null,
    );
  });

  it("protects a +10% peak at +2% so an 8m time stop is not the bank", () => {
    const now = Date.now();
    const pos = {
      costUsd: 15,
      entryMcap: 5000,
      lastMcap: 4900,
      peakMcap: 5535,
      openedAt: now - 90_000,
      stopPct: -0.18,
    };
    const reason = decideSell(pos, now, { ...blankPlaybook(), stopPct: -0.18 }, "pump");
    assert.equal(reason, "take");
    const mark = exitMcap(pos, "pump");
    assert.ok(Math.abs(mark - 5000 * 1.02) < 1, `protect mark ${mark}`);
  });

  it("keeps paper on a quiet Pump curve and a thin Pons book", () => {
    const now = Date.now();
    const quiet = coin({
      venue: "pump",
      mint: "So1anaMint1111111111111111111111111111111",
      usdMcap: 64_000,
      lastTradeAt: now - 90_000,
    });
    assert.ok(hotLiveBlock(quiet, now)?.includes("quiet"));
    const woke = coin({
      venue: "pump",
      mint: "So1anaMint1111111111111111111111111111111",
      usdMcap: 64_000,
      lastTradeAt: now - 5_000,
    });
    assert.equal(hotLiveBlock(woke, now), null);
    const thin = coin({ usdMcap: 1600 });
    assert.ok(setupMatch(thin, open, now)?.includes("50k"));
    assert.ok(hotLiveBlock(thin, now)?.includes("mcap"));
    assert.equal(hotLiveBlock(coin({ usdMcap: 64_000 }), now), null);
  });

  it("counts clips in a rolling 24h window past the 40-close blotter", () => {
    const now = Date.now();
    const hits = stampDayHits(
      Array.from({ length: 50 }, (_, i) => now - i * 60_000),
      now,
    );
    assert.equal(hits.length, 51);
    const closed = hits.slice(0, 40).map((t) => ({ closedAt: t }));
    assert.equal(clipsInDay(hits, closed, now), 51);
    const stale = stampDayHits([now - 25 * 60 * 60_000], now);
    assert.equal(stale.length, 1);
    assert.equal(clipsInDay([now - 30 * 60 * 60_000], [{ closedAt: now - 1000 }], now), 1);
  });

  it("vetoes a GMGN honeypot and a high sell tax, not a clean pump coin", () => {
    assert.equal(gmgnVeto({ isHoneypot: "yes" }), "honeypot. GMGN confirmed.");
    assert.ok(gmgnVeto({ sellTax: 0.15 })?.includes("sell tax"));
    assert.ok(gmgnVeto({ top10: 0.7 })?.includes("top ten"));
    assert.equal(gmgnVeto({ isHoneypot: "no", sellTax: 0, top10: 0.18, rugRatio: 0.02 }), null);
    assert.match(gmgnLine({ isHoneypot: "no", sellTax: 0, top10: 0.22 }), /honey no/);
  });
});

describe("self-teach", () => {
  const meta: MetaState = {
    thesis: "open book",
    keywords: [],
    drop: [],
    source: "local",
    updatedAt: 0,
  };

  function trade(over: Partial<ClosedTrade> = {}): ClosedTrade {
    return {
      mint: "m1",
      symbol: "DOGE",
      name: "Doge Coin",
      creator: "walletA",
      costUsd: 8,
      proceedsUsd: 6,
      pnlUsd: -2,
      pnlPct: -0.18,
      reason: "stop",
      heldMs: 20_000,
      openedAt: Date.now() - 20_000,
      closedAt: Date.now(),
      score: 50,
      slipPct: 0,
      feeUsd: 0.1,
      peakPct: 0.02,
      metaSource: "local",
      ...over,
    };
  }

  function kill(over: Partial<import("./types.ts").KillRecord> = {}): import("./types.ts").KillRecord {
    return {
      mint: "k1",
      symbol: "X",
      name: "X",
      creator: "factory",
      kind: "serial",
      reason: "serial",
      mcapAt: 4000,
      killedAt: Date.now() - 80_000,
      lastMcap: 12000,
      grade: "ran",
      gradedAt: Date.now(),
      ...over,
    };
  }

  it("does not drop a word after one loss", () => {
    const out = absorbTrade(trade(), blankPlaybook(), meta);
    assert.equal(out.meta.drop.includes("doge"), false);
    assert.ok((out.meta.words?.doge?.n ?? 0) >= 1);
  });

  it("drops a word after three losing samples", () => {
    let m = meta;
    let book = blankPlaybook();
    for (let i = 0; i < 3; i++) {
      const out = absorbTrade(trade({ mint: `m${i}` }), book, m);
      m = out.meta;
      book = out.playbook;
    }
    assert.ok(wordShouldDrop(m.words!.doge));
    assert.ok(m.drop.includes("doge") || m.drop.includes("dog"));
  });

  it("eases the stop after three green-then-stop clips", () => {
    const green = { reason: "stop" as const, peakPct: 0.2, pnlUsd: -1.5, pnlPct: -0.18 };
    const prior = [trade({ ...green, mint: "a" }), trade({ ...green, mint: "b" })];
    const book = { ...blankPlaybook(), stopPct: -0.35 };
    const out = absorbTrade(trade({ ...green, mint: "c" }), book, meta, prior);
    assert.ok(out.playbook.stopPct < -0.35, `stop ${out.playbook.stopPct}`);
    assert.ok(out.lessons.some((l) => l.text.includes("eased stop")));
  });

  it("tightens the stop when a clip never ran", () => {
    const book = { ...blankPlaybook(), stopPct: -0.5 };
    const out = absorbTrade(trade({ peakPct: 0.01 }), book, meta);
    assert.ok(out.playbook.stopPct > -0.5);
    assert.ok(out.lessons.some((l) => l.text.includes("never ran")));
  });

  it("paroles a wallet after two serial ran grades", () => {
    const first = absorbKill(kill({ mint: "k1" }), blankPlaybook(), meta, []);
    assert.equal((first.playbook.parole ?? []).includes("factory"), false);
    const second = absorbKill(kill({ mint: "k2" }), first.playbook, meta, [
      kill({ mint: "k1", grade: "ran" }),
    ]);
    assert.ok(second.playbook.parole?.includes("factory"));
    assert.equal(second.playbook.bannedCreators.includes("factory"), false);
  });

  it("raises the floor when warden accuracy is high", () => {
    const held = Array.from({ length: 7 }, (_, i) =>
      kill({
        mint: `h${i}`,
        kind: "score",
        grade: "rugged",
        lastMcap: 200,
        creator: `c${i}`,
      }),
    );
    const book = { ...blankPlaybook(), scoreFloor: 40 };
    const out = absorbKill(
      kill({ mint: "now", kind: "score", grade: "rugged", lastMcap: 200, creator: "now" }),
      book,
      meta,
      held,
    );
    assert.ok(out.playbook.scoreFloor >= 42, `floor ${out.playbook.scoreFloor}`);
  });

  it("cuts the floor harder when warden is missing", () => {
    const missed = Array.from({ length: 7 }, (_, i) =>
      kill({
        mint: `m${i}`,
        kind: "score",
        grade: "ran",
        lastMcap: 20000,
        creator: `c${i}`,
      }),
    );
    const book = { ...blankPlaybook(), scoreFloor: 60 };
    const out = absorbKill(
      kill({ mint: "now", kind: "score", grade: "ran", lastMcap: 18000, creator: "now" }),
      book,
      meta,
      missed,
    );
    assert.ok(out.playbook.scoreFloor <= 56, `floor ${out.playbook.scoreFloor}`);
  });

  it("does not crown a 1-for-2 hatch over a 8-for-12 vet", () => {
    const now = Date.now();
    const hatch = Array.from({ length: 2 }, (_, i) => ({ pnlUsd: i === 0 ? 4 : -1 }));
    const vet = Array.from({ length: 12 }, (_, i) => ({ pnlUsd: i < 8 ? 3 : -1 }));
    const hot = pickHotLane(now, [
      { id: "vet", hunting: true, closed: vet, startedAt: now - 86_400_000 },
      { id: "hatch", hunting: true, closed: hatch, startedAt: now - 3_600_000 },
      { id: "cub", hunting: false, closed: [], startedAt: null },
    ]);
    assert.equal(hot, "vet");
    assert.ok(wilsonLow(1, 2) < wilsonLow(8, 12));
  });

  it("distrusts grok when the local tape is ahead", () => {
    const cold: MetaState = {
      ...meta,
      source: "grok",
      grokTape: { n: 6, pnl: -12 },
      localTape: { n: 6, pnl: 8 },
    };
    assert.equal(grokTrust(cold), "local");
    const thin: MetaState = { ...meta, source: "grok", grokTape: { n: 2, pnl: -4 }, localTape: { n: 2, pnl: 2 } };
    assert.equal(grokTrust(thin), "grok");
  });

  it("does not treat a paper close as a hot fill", () => {
    assert.equal(stampRail("So11111111111111111111111111111111111111112", false), "paper");
    assert.equal(stampRail("So11111111111111111111111111111111111111112", true), "sol");
    assert.equal(stampRail("0x" + "11".repeat(20), true), "eth");
    assert.equal(isHotFill({ rail: "paper" }), false);
    assert.equal(isHotFill({ rail: "sol" }), true);
  });

  it("decideSell takes on written takePct even if trail is not armed", () => {
    const now = Date.now();
    const reason = decideSell(
      {
        costUsd: 15,
        entryMcap: 5000,
        lastMcap: 9500,
        peakMcap: 9500,
        openedAt: now - 20_000,
        stopPct: -0.5,
        takePct: 0.9,
      },
      now,
      { ...blankPlaybook(), stopPct: -0.5, takePct: 0.9 },
      "pump",
    );
    assert.equal(reason, "take");
  });

  it("absorbTrade does not ban creator on a time (pulse) loss", () => {
    const out = absorbTrade(
      trade({ reason: "time", peakPct: 0.02, pnlUsd: -0.5, pnlPct: -0.05 }),
      blankPlaybook(),
      meta,
    );
    assert.equal(out.playbook.bannedCreators.includes("walletA"), false);
    assert.equal(out.lessons.some((l) => l.agent === "WARDEN"), false);
  });

  it("absorbTrade bans only after evidence: skip first green-stop, ban on second loss", () => {
    const first = absorbTrade(
      trade({ reason: "stop", peakPct: 0.2, mint: "m-a" }),
      blankPlaybook(),
      meta,
    );
    assert.equal(first.playbook.bannedCreators.includes("walletA"), false);
    const second = absorbTrade(
      trade({ reason: "stop", peakPct: 0.15, mint: "m-b", pnlUsd: -1 }),
      first.playbook,
      meta,
      [trade({ reason: "stop", peakPct: 0.2, mint: "m-a" })],
    );
    assert.ok(second.playbook.bannedCreators.includes("walletA"));
    assert.ok(second.lessons.some((l) => l.agent === "WARDEN" && l.text.includes("burned")));
  });

  it("setupMatch does not veto a lively named coin that misses local keywords", () => {
    const c = coin({
      venue: "pump",
      mint: "So1anaMint1111111111111111111111111111111",
      name: "Banana Rocket",
      symbol: "BNNA",
      description: "just a banana",
      usdMcap: 64_000,
      replyCount: 4,
      lastTradeAt: Date.now(),
      twitter: "https://x.com/banana",
    });
    const local: MetaState = {
      thesis: "stock memes only",
      keywords: ["hood", "robinhood", "nasdaq"],
      drop: [],
      source: "local",
      updatedAt: Date.now(),
    };
    assert.equal(setupMatch(c, local, Date.now()), null);
  });
});

describe("meta scorecard", () => {
  function trade(over: Partial<ClosedTrade> = {}): ClosedTrade {
    return {
      mint: "m1",
      symbol: "DOGE",
      name: "Doge Coin",
      creator: "walletA",
      costUsd: 8,
      proceedsUsd: 6,
      pnlUsd: -2,
      pnlPct: -0.18,
      reason: "stop",
      heldMs: 20_000,
      openedAt: Date.now() - 20_000,
      closedAt: Date.now(),
      score: 50,
      slipPct: 0,
      feeUsd: 0.1,
      peakPct: 0.02,
      metaSource: "local",
      metaHits: ["doge"],
      ...over,
    };
  }

  it("wordEdge is ~0 for n=1, positive for winners, negative for losers", () => {
    assert.equal(wordEdge({ n: 1, w: 1, pnl: 4 }), 0);
    const win = wordEdge({ n: 4, w: 3, pnl: 12 });
    assert.ok(win > 0, `winner edge ${win}`);
    const lose = wordEdge({ n: 4, w: 1, pnl: -8 });
    assert.ok(lose < 0, `loser edge ${lose}`);
  });

  it("scoreSetup scars a ledger-known token vs a clean twin", () => {
    const now = Date.now();
    const scarred: MetaState = {
      thesis: "open",
      keywords: [],
      drop: [],
      source: "local",
      updatedAt: now,
      words: { doge: { n: 4, w: 1, pnl: -8 } },
    };
    const clean: MetaState = {
      thesis: "open",
      keywords: [],
      drop: [],
      source: "local",
      updatedAt: now,
      words: {},
    };
    const base = coin({
      venue: "pump",
      mint: "So1anaMint1111111111111111111111111111111",
      name: "Doge Rocket",
      symbol: "DOGE",
      description: "a doge on pump",
      usdMcap: 64_000,
      replyCount: 2,
      twitter: "https://x.com/doge",
    });
    const a = scoreSetup(base, scarred, now);
    const b = scoreSetup(base, clean, now);
    assert.ok(a.score < b.score, `scarred ${a.score} vs clean ${b.score}`);
  });

  it("absorbTrade populates card bySource.local and byKeyword", () => {
    const meta: MetaState = {
      thesis: "dog memes",
      keywords: ["doge"],
      drop: [],
      source: "local",
      updatedAt: 0,
    };
    const out = absorbTrade(trade({ metaSource: "local", metaHits: ["doge"], pnlUsd: -2 }), blankPlaybook(), meta);
    assert.ok(out.meta.card);
    assert.ok((out.meta.card!.bySource.local?.n ?? 0) >= 1);
    assert.ok((out.meta.card!.byKeyword.doge?.n ?? 0) >= 1);
  });

  it("hot fill weights the scorecard more than paper", () => {
    const meta: MetaState = {
      thesis: "open",
      keywords: [],
      drop: [],
      source: "local",
      updatedAt: 0,
      card: blankScorecard(),
    };
    const loss = { pnlUsd: -3, metaHits: ["doge"], metaSource: "local" as const };
    const paper = absorbTrade(trade({ ...loss, rail: "paper", mint: "p1" }), blankPlaybook(), meta);
    const hot = absorbTrade(
      trade({ ...loss, rail: "sol", mint: "h1" }),
      blankPlaybook(),
      { ...meta, card: blankScorecard() },
    );
    const paperTape = paper.meta.card!.bySource.local!;
    const hotTape = hot.meta.card!.bySource.local!;
    assert.ok(
      hotTape.n > paperTape.n || Math.abs(hotTape.pnl) > Math.abs(paperTape.pnl),
      `hot n=${hotTape.n} pnl=${hotTape.pnl} vs paper n=${paperTape.n} pnl=${paperTape.pnl}`,
    );
  });
});


describe("meta outcome brain", () => {
  function close(over: Partial<ClosedTrade> = {}): ClosedTrade {
    return {
      mint: "m",
      symbol: "X",
      name: "X",
      creator: "",
      costUsd: 8,
      proceedsUsd: 6,
      pnlUsd: -2,
      pnlPct: -0.2,
      reason: "stop",
      heldMs: 20_000,
      openedAt: Date.now() - 20_000,
      closedAt: Date.now(),
      score: 50,
      slipPct: 0,
      feeUsd: 0.1,
      ...over,
    };
  }

  it("scarStreak true when last 3 closes are losses", () => {
    const now = Date.now();
    const closed = [
      close({ pnlUsd: -1, closedAt: now - 1000 }),
      close({ pnlUsd: -2, closedAt: now - 2000 }),
      close({ pnlUsd: -3, closedAt: now - 3000 }),
      close({ pnlUsd: 5, closedAt: now - 4000 }),
    ];
    assert.equal(scarStreak(closed, 3), true);
  });

  it("scarStreak false when a recent win breaks the streak", () => {
    const now = Date.now();
    const closed = [
      close({ pnlUsd: -1, closedAt: now - 1000 }),
      close({ pnlUsd: 2, closedAt: now - 2000 }),
      close({ pnlUsd: -3, closedAt: now - 3000 }),
    ];
    assert.equal(scarStreak(closed, 3), false);
  });

  it("coldKeywords detects scarred keyword on card", () => {
    const meta: MetaState = {
      thesis: "open",
      keywords: ["doge", "pepe"],
      drop: [],
      source: "local",
      updatedAt: Date.now(),
      card: {
        bySource: {},
        byThesis: {},
        byKeyword: {
          doge: { n: 4, w: 1, pnl: -9 },
          pepe: { n: 2, w: 0, pnl: -3 },
        },
        updatedAt: Date.now(),
      },
    };
    assert.deepEqual(coldKeywords(meta), ["doge"]);
  });

  it("stripColdKeywords removes them", () => {
    const meta: MetaState = {
      thesis: "open",
      keywords: ["doge", "pepe"],
      drop: [],
      source: "local",
      updatedAt: Date.now(),
      card: {
        bySource: {},
        byThesis: {},
        byKeyword: { doge: { n: 5, w: 1, pnl: -12 } },
        updatedAt: Date.now(),
      },
    };
    const out = stripColdKeywords(meta);
    assert.deepEqual(out.stripped, ["doge"]);
    assert.deepEqual(out.meta.keywords, ["pepe"]);
  });

  it("shouldAskMeta false when local trust healthy", () => {
    const meta: MetaState = {
      thesis: "local book",
      keywords: [],
      drop: [],
      source: "grok",
      updatedAt: Date.now(),
      grokTape: { n: 6, pnl: -10 },
      localTape: { n: 6, pnl: 8 },
    };
    assert.equal(grokTrust(meta), "local");
    assert.equal(shouldAskMeta(meta, ["died"]), false);
  });

  it("mergeCanon merges words n/pnl", () => {
    const canon = {
      ...blankCanon(),
      words: { doge: { n: 2, w: 0, pnl: -4 } },
    };
    const book = {
      v: 1 as const,
      kind: "trencher-book" as const,
      savedAt: Date.now(),
      house: {
        generation: 1,
        deaths: 0,
        escapes: 0,
        playbook: blankPlaybook(),
        thesis: "open",
        keywords: [],
        drop: [],
        lessons: [],
        kills: [],
      },
      playbook: blankPlaybook(),
      meta: {
        thesis: "open",
        keywords: [],
        drop: [],
        source: "local" as const,
        updatedAt: Date.now(),
        words: { doge: { n: 3, w: 1, pnl: -6 } },
      },
      lessons: [],
      kills: [],
    } satisfies BookFile;
    const out = mergeCanon(canon, book);
    assert.equal(out.words!.doge.n, 5);
    assert.equal(out.words!.doge.pnl, -10);
    assert.equal(out.words!.doge.w, 1);
  });

  it("formatLedger non-empty when words present", () => {
    const meta: MetaState = {
      thesis: "open",
      keywords: [],
      drop: [],
      source: "local",
      updatedAt: Date.now(),
      words: {
        doge: { n: 4, w: 1, pnl: -8 },
        pepe: { n: 3, w: 2, pnl: 5 },
      },
    };
    const line = formatLedger(meta);
    assert.ok(line.length > 0, line);
    assert.ok(line.includes("doge"), line);
    assert.ok(line.includes("n="), line);
  });
});
