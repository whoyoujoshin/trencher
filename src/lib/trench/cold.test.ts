import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blankCold, coldDue, coldLine, saneCold } from "./cold.ts";

describe("cold hunt cap", () => {
  it("stays quiet at or under $50 plus a dollar of dust", () => {
    assert.equal(coldDue("sol", 0.4, 120), null);
    assert.equal(coldDue("sol", 50 / 120, 120), null);
    assert.equal(coldDue("sol", 51 / 120, 120), null);
    assert.equal(coldDue("eth", 0.02, 2500), null);
    assert.equal(coldDue("eth", 51 / 2500, 2500), null);
  });

  it("names the excess native above $50", () => {
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

  it("trips just past the dust band", () => {
    const d = coldDue("sol", 52 / 120, 120);
    assert.ok(d);
    assert.ok(d.sweepUsd > 0);
    assert.equal(coldDue("sol", 51.02 / 120, 120)?.usd, 51.02);
  });

  it("refuses a bad quote instead of inventing a sweep", () => {
    assert.equal(coldDue("sol", 1, 0), null);
    assert.equal(coldDue("sol", 1, -5), null);
    assert.equal(coldDue("eth", -1, 2500), null);
    assert.equal(coldDue("eth", Number.NaN, 2500), null);
    assert.equal(coldDue("sol", Number.POSITIVE_INFINITY, 120), null);
  });

  it("tells the operator to move it and blocks buys", () => {
    const d = coldDue("sol", 1, 120);
    assert.ok(d);
    const line = coldLine(d);
    assert.match(line, /SWEEP \$70\.00 to cold \(sol\)/);
    assert.match(line, /keep 0\.4167 SOL \(\$50\)/);
    assert.match(line, /HOT buys blocked until the hunt wallet is under \$50/);
    const eth = coldDue("eth", 0.03, 2760);
    assert.ok(eth);
    assert.match(coldLine(eth), /to cold \(eth\)/);
    assert.match(coldLine(eth), /ETH/);
  });

  it("drops a poisoned latch but keeps a real one", () => {
    assert.deepEqual(saneCold(null), blankCold());
    assert.deepEqual(saneCold({ sol: { rail: "eth" }, eth: "nope" }), blankCold());
    const due = coldDue("sol", 1, 120);
    assert.deepEqual(saneCold({ sol: due, eth: null }), { sol: due, eth: null });
  });
});
