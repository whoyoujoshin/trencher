import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blankCold, coldDue, coldLine, playCoversClip, saneCold, settleReserve } from "./cold.ts";

describe("cold hunt cap", () => {
  it("stays quiet at or under $50 plus a dollar of dust", () => {
    assert.equal(coldDue("sol", 0.4, 120), null);
    assert.equal(coldDue("sol", 50 / 120, 120), null);
    assert.equal(coldDue("sol", 51 / 120, 120), null);
    assert.equal(coldDue("eth", 0.02, 2500), null);
    assert.equal(coldDue("eth", 51 / 2500, 2500), null);
  });

  it("reserves the excess and leaves a $50 play bank", () => {
    const d = coldDue("sol", 1, 120);
    assert.ok(d);
    assert.equal(d.rail, "sol");
    assert.equal(d.usd, 120);
    assert.equal(d.keepNative, 0.416667);
    assert.equal(d.sweepNative, 0.583333);
    assert.equal(d.sweepUsd, 70);
    const eth = coldDue("eth", 0.03, 2500);
    assert.ok(eth);
    assert.equal(eth.keepNative, 0.02);
    assert.equal(eth.sweepNative, 0.01);
    assert.equal(eth.sweepUsd, 25);
  });

  it("spends the play bank and does not refill it from the reserve", () => {
    const first = coldDue("sol", 1, 120);
    assert.ok(first);
    const afterBuy = settleReserve(first, "sol", 0.96, 120);
    assert.ok(afterBuy);
    assert.equal(afterBuy.sweepNative, first.sweepNative);
    assert.equal(afterBuy.keepNative, 0.376667);
    assert.equal(playCoversClip(afterBuy.keepNative, 0.04, 0.005), true);
    const drawn = settleReserve(first, "sol", 0.6, 120);
    assert.ok(drawn);
    assert.equal(drawn.sweepNative, first.sweepNative);
    assert.equal(playCoversClip(drawn.keepNative, 0.04, 0.005), false);
  });

  it("parks profit above a full $50 bank into the reserve", () => {
    const first = coldDue("sol", 1, 120);
    assert.ok(first);
    const refilled = settleReserve(first, "sol", 0.9, 120);
    assert.ok(refilled);
    assert.equal(refilled.sweepNative, first.sweepNative);
    assert.ok(refilled.keepNative < first.keepNative);
    const over = settleReserve(first, "sol", 1.2, 120);
    assert.ok(over);
    assert.equal(over.sweepNative, 0.783333);
    assert.equal(over.keepNative, 0.416667);
  });

  it("clears the reserve once the wallet is back under $50", () => {
    const first = coldDue("sol", 1, 120);
    assert.ok(first);
    assert.equal(settleReserve(first, "sol", 0.4, 120), null);
  });

  it("trips just past the dust band", () => {
    const d = coldDue("sol", 52 / 120, 120);
    assert.ok(d);
    assert.ok(d.sweepUsd > 0);
    assert.equal(coldDue("sol", 51.02 / 120, 120)?.usd, 51.02);
  });

  it("refuses a bad quote instead of inventing a reserve", () => {
    assert.equal(coldDue("sol", 1, 0), null);
    assert.equal(coldDue("sol", 1, -5), null);
    assert.equal(coldDue("eth", -1, 2500), null);
    assert.equal(coldDue("eth", Number.NaN, 2500), null);
    assert.equal(coldDue("sol", Number.POSITIVE_INFINITY, 120), null);
  });

  it("tells the desk the reserve is not ammo", () => {
    const d = coldDue("sol", 1, 120);
    assert.ok(d);
    const line = coldLine(d);
    assert.match(line, /Till reserved 0\.5833 SOL \(\$70\.00\)/);
    assert.match(line, /HOT plays with \$50/);
    assert.match(line, /Nothing sent/);
    const spent = settleReserve(d, "sol", 0.96, 120);
    assert.ok(spent);
    assert.match(coldLine(spent), /HOT play bank 0\.3767 SOL/);
    const eth = coldDue("eth", 0.03, 2760);
    assert.ok(eth);
    assert.match(coldLine(eth), /ETH/);
  });

  it("drops a poisoned latch but keeps a real one", () => {
    assert.deepEqual(saneCold(null), blankCold());
    assert.deepEqual(saneCold({ sol: { rail: "eth" }, eth: "nope" }), blankCold());
    const due = coldDue("sol", 1, 120);
    assert.deepEqual(saneCold({ sol: due, eth: null }), { sol: due, eth: null });
  });
});
