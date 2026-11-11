import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { analyse, price, shock } from "../lib/bond";
import { monthlyCost, yearlyDeduction } from "../lib/mortgage";
import { curveShape, inversionEpisodes } from "../lib/insights";
import { indexOnOrBefore, shiftDate } from "../lib/data";

describe("bond", () => {
  it("par bond prices at 100 and zero-coupon duration equals maturity", () => {
    expect(price({ coupon: 0.03, yield: 0.03, years: 10 })).toBeCloseTo(100, 10);
    expect(analyse({ coupon: 0, yield: 0.025, years: 5 }).macaulay).toBeCloseTo(5, 10);
  });
  it("convexity improves the duration approximation", () => {
    const b = { coupon: 0.02, yield: 0.03, years: 10 };
    const s = shock(b, 0.01);
    expect(Math.abs(s.withConvexity - s.exact)).toBeLessThan(Math.abs(s.durationOnly - s.exact));
    expect(s.exact).toBeLessThan(0);
  });
  it("matches the Python implementation exactly", () => {
    const cases = JSON.parse(fs.readFileSync(path.join(__dirname, "fixture_bond.json"), "utf8"));
    for (const c of cases) {
      const r = analyse({ coupon: c.coupon, yield: c.yield, years: c.years, freq: c.freq });
      for (const k of Object.keys(c.expected) as (keyof typeof r)[]) expect(r[k], k).toBeCloseTo(c.expected[k], 10);
    }
  });
});

describe("mortgage", () => {
  it("applies 30% deduction up to 100k interest and 21% above (Skatteverket example)", () => {
    expect(yearlyDeduction(130_000)).toBeCloseTo(36_300, 6);
    expect(yearlyDeduction(80_000)).toBeCloseTo(24_000, 6);
  });
  it("monthly cost = interest − deduction + amortisation", () => {
    const c = monthlyCost(3_000_000, 0.027, 0.02);
    expect(c.interest).toBeCloseTo(6750, 6);
    expect(c.deduction).toBeCloseTo(2025, 6);
    expect(c.amortisation).toBeCloseTo(5000, 6);
    expect(c.total).toBeCloseTo(9725, 6);
  });
});

describe("insights", () => {
  it("classifies curve shape by the 10y−3m spread", () => {
    expect(curveShape(-0.5)).toBe("inverted");
    expect(curveShape(0.1)).toBe("flat");
    expect(curveShape(0.8)).toBe("normal");
    expect(curveShape(2)).toBe("steep");
  });
  it("finds inversion episodes, ignoring short dips and bridging brief recoveries", () => {
    const vals = [...Array(10).fill(0.5), ...Array(30).fill(-0.3), ...Array(3).fill(0.1), ...Array(10).fill(-0.6),
      ...Array(20).fill(0.4), ...Array(5).fill(-0.2), ...Array(10).fill(0.3)];
    const pts = vals.map((v, i) => ({ date: `d${String(i).padStart(3, "0")}`, value: v }));
    const eps = inversionEpisodes(pts, 20, 10);
    expect(eps).toHaveLength(1);
    expect(eps[0]).toMatchObject({ start: "d010", end: "d052", min: -0.6, ongoing: false });
  });
  it("marks an inversion that runs to the end as ongoing", () => {
    const pts = [...Array(5).fill(0.2), ...Array(25).fill(-0.2)].map((v, i) => ({ date: `d${i}`, value: v }));
    expect(inversionEpisodes(pts)[0].ongoing).toBe(true);
  });
});

describe("data helpers", () => {
  it("binary search and date shifting", () => {
    const d = ["2026-01-02", "2026-01-05", "2026-01-06"];
    expect(indexOnOrBefore(d, "2026-01-04")).toBe(0);
    expect(indexOnOrBefore(d, "2026-01-06")).toBe(2);
    expect(indexOnOrBefore(d, "2025-12-31")).toBe(-1);
    expect(shiftDate("2026-03-31", { months: -1 })).toBe("2026-02-28");
    expect(shiftDate("2024-02-29", { years: -1 })).toBe("2023-02-28");
    expect(shiftDate("2026-11-11", { days: -10 })).toBe("2026-11-01");
    expect(shiftDate("2026-11-11", { years: -1 })).toBe("2025-11-11");
  });
});

describe("inversion threshold", () => {
  it("ignores shallow dips that never reach −10 bp", () => {
    const pts = Array(40).fill(-0.05).map((v, i) => ({ date: `d${i}`, value: v }));
    expect(inversionEpisodes(pts)).toHaveLength(0);
  });
});
