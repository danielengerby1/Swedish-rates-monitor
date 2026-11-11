"use client";

import { useMemo, useState } from "react";
import { analyse, price, shock } from "@/lib/bond";
import { monthlyCost } from "@/lib/mortgage";
import { PriceYieldChart } from "./Charts";
import { Term } from "./Term";

const sek = (x: number) => `${Math.round(x).toLocaleString("sv-SE")} kr`;
const signedPct = (x: number, d = 2) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(d)}%`;

export function BondCalculator({ yields }: { yields: Record<number, number> }) {
  const maturities = [2, 5, 7, 10];
  const [years, setYears] = useState(10);
  const [ytm, setYtm] = useState(yields[10]);
  const [coupon, setCoupon] = useState(Math.round(yields[10] * 4) / 4);
  const [bps, setBps] = useState(100);

  const pick = (y: number) => { setYears(y); setYtm(yields[y]); setCoupon(Math.round(yields[y] * 4) / 4); };
  const b = { coupon: coupon / 100, yield: ytm / 100, years };
  const a = analyse(b);
  const s = shock(b, bps / 10000);

  const rows = useMemo(() => {
    const out = [];
    for (let y = Math.max(0, ytm - 3); y <= ytm + 3 + 1e-9; y += 0.1) {
      const p = price({ ...b, yield: y / 100 });
      out.push({ y: Math.round(y * 100) / 100, price: p, tangent: a.price * (1 - a.modified * (y - ytm) / 100) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years, ytm, coupon]);

  return (
    <section className="card">
      <h2>Bond risk calculator</h2>
      <p className="sub">
        What happens to a Swedish government bond when rates move? Defaults use today&apos;s market yields.
        The <Term k="duration">duration</Term> line is the straight-line estimate. The gap to the curve is <Term k="convexity">convexity</Term>.
      </p>
      <div className="grid2 tight">
        <div>
          <div className="controls">
            <div className="control">
              <label>Maturity</label>
              <div className="seg">
                {maturities.map((m) => <button key={m} aria-pressed={years === m} onClick={() => pick(m)}>{m}Y</button>)}
              </div>
            </div>
            <div className="control">
              <label htmlFor="cpn">Coupon %</label>
              <input id="cpn" type="number" step={0.25} min={0} max={15} value={coupon}
                onChange={(e) => setCoupon(Math.max(0, Math.min(15, Number(e.target.value) || 0)))} />
            </div>
            <div className="control">
              <label htmlFor="ytm"><Term k="ytm">Yield %</Term></label>
              <input id="ytm" type="number" step={0.05} min={-1} max={15} value={Number(ytm.toFixed(3))}
                onChange={(e) => setYtm(Math.max(-1, Math.min(15, Number(e.target.value) || 0)))} />
            </div>
          </div>
          <div className="control" style={{ marginBottom: 14 }}>
            <label htmlFor="shock">Rate shock: {bps >= 0 ? "+" : ""}{bps} <Term k="bp">bp</Term></label>
            <input id="shock" type="range" min={-200} max={200} step={25} value={bps} onChange={(e) => setBps(Number(e.target.value))} className="wide" />
          </div>
          <table className="compact kv">
            <tbody>
              <tr><td>Price (per 100 nominal)</td><td>{a.price.toFixed(2)}</td></tr>
              <tr><td><Term k="duration">Modified duration</Term></td><td>{a.modified.toFixed(2)}</td></tr>
              <tr><td><Term k="convexity">Convexity</Term></td><td>{a.convexity.toFixed(1)}</td></tr>
              <tr><td><Term k="dv01">DV01</Term></td><td>{a.dv01.toFixed(3)}</td></tr>
              <tr className="hl"><td>Price change, exact</td><td className={s.exact < 0 ? "neg" : ""}>{signedPct(s.exact)}</td></tr>
              <tr><td>Duration estimate</td><td>{signedPct(s.durationOnly)}</td></tr>
              <tr><td>Duration + convexity</td><td>{signedPct(s.withConvexity)}</td></tr>
              <tr><td>On a 10 MSEK holding</td><td className={s.exact < 0 ? "neg" : ""}>{s.exact >= 0 ? "+" : "−"}{sek(Math.abs(s.exact) * 10_000_000)}</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <PriceYieldChart rows={rows} current={{
            y: ytm, price: a.price, shocked: Math.round((ytm + bps / 100) * 100) / 100,
            shockedPrice: price({ ...b, yield: (ytm + bps / 100) / 100 }),
          }} />
          <p className="small">Large dot: today. Green dot: after the shock. Annual coupons, valued on a coupon date.</p>
        </div>
      </div>
    </section>
  );
}

export function MortgageCalculator({ floating, fixed }: { floating: number; fixed: number | null }) {
  const [loan, setLoan] = useState(3_000_000);
  const [r, setR] = useState(Math.round(floating * 100) / 100);
  const [amort, setAmort] = useState(2);
  const scenarios = [0, 1, 2].map((d) => ({ d, c: monthlyCost(loan, (r + d) / 100, amort / 100) }));
  const base = scenarios[0].c.total;
  return (
    <section className="card">
      <h2>What rates mean for a household</h2>
      <p className="sub">
        Monthly cost of a mortgage at today&apos;s average new floating rate ({floating.toFixed(2)}%
        {fixed != null && <>; 3–5 year fixed {fixed.toFixed(2)}%</>}), after the <Term k="deduction">interest deduction</Term>,
        and what a rise in rates would add.
      </p>
      <div className="controls">
        <div className="control">
          <label htmlFor="loan">Loan (SEK)</label>
          <input id="loan" type="number" step={100000} min={100000} max={20000000} value={loan} className="wide-num"
            onChange={(e) => setLoan(Math.max(0, Math.min(50_000_000, Number(e.target.value) || 0)))} />
        </div>
        <div className="control">
          <label htmlFor="mr">Interest rate %</label>
          <input id="mr" type="number" step={0.05} min={0} max={15} value={r}
            onChange={(e) => setR(Math.max(0, Math.min(15, Number(e.target.value) || 0)))} />
        </div>
        <div className="control">
          <label htmlFor="am">Amortisation % / year</label>
          <input id="am" type="number" step={0.5} min={0} max={5} value={amort}
            onChange={(e) => setAmort(Math.max(0, Math.min(5, Number(e.target.value) || 0)))} />
        </div>
      </div>
      <div className="tbl-wrap">
        <table className="compact">
          <thead><tr><th>Per month</th>{scenarios.map((s) => <th key={s.d}>{s.d === 0 ? `At ${r.toFixed(2)}%` : `+${s.d} pp`}</th>)}</tr></thead>
          <tbody>
            <tr><td>Interest</td>{scenarios.map((s) => <td key={s.d}>{sek(s.c.interest)}</td>)}</tr>
            <tr><td><Term k="deduction">Tax deduction</Term></td>{scenarios.map((s) => <td key={s.d}>−{sek(s.c.deduction)}</td>)}</tr>
            <tr><td>Amortisation</td>{scenarios.map((s) => <td key={s.d}>{sek(s.c.amortisation)}</td>)}</tr>
            <tr className="hl"><td>Total</td>{scenarios.map((s) => <td key={s.d}>{sek(s.c.total)}</td>)}</tr>
            <tr><td>Change</td>{scenarios.map((s) => <td key={s.d} className={s.c.total > base ? "neg" : ""}>{s.d === 0 ? "–" : `+${sek(s.c.total - base)}`}</td>)}</tr>
          </tbody>
        </table>
      </div>
      <p className="small">
        One borrower; the 30% deduction applies to the first 100,000 SEK of interest a year, 21% above. Excludes fees and
        the property charge. Amortisation rules depend on loan-to-value and income. Not financial advice.
      </p>
    </section>
  );
}
