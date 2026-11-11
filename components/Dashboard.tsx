"use client";

import { useMemo, useState } from "react";
import { CURVE, monthlyAverage, shiftDate, valueAt, type RatesData } from "@/lib/data";
import { curveAt, findings, inversionEpisodes, slopeSeries, snapshot } from "@/lib/insights";
import { SITE } from "@/lib/site";
import { CurveChart, TimeChart, rate } from "./Charts";
import { BondCalculator, MortgageCalculator } from "./Calculators";
import { Term } from "./Term";

const RANGES = [
  { key: "1y", label: "1Y", years: 1 }, { key: "2y", label: "2Y", years: 2 }, { key: "5y", label: "5Y", years: 5 },
  { key: "10y", label: "10Y", years: 10 }, { key: "max", label: "Since 2005", years: 0 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const bp = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))} bp`;
const monthLabel = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

export default function Dashboard({ data }: { data: RatesData }) {
  const [range, setRange] = useState<RangeKey>("5y");
  const s = useMemo(() => snapshot(data), [data]);
  const facts = useMemo(() => findings(data), [data]);
  const last = s.date;

  // Curve today, a month ago, a year ago.
  const curves = useMemo(() => ({
    now: curveAt(data, last),
    m1: curveAt(data, shiftDate(last, { months: -1 })),
    y1: curveAt(data, shiftDate(last, { years: -1 })),
  }), [data, last]);

  // Time window for the history charts.
  const from = useMemo(() => {
    const r = RANGES.find((x) => x.key === range)!;
    return r.years ? shiftDate(last, { years: -r.years }) : data.daily.dates[0];
  }, [range, last, data]);
  const dStart = Math.max(0, data.daily.dates.findIndex((d) => d >= from));
  const daily = (k: keyof RatesData["daily"]["series"]) => data.daily.series[k].slice(dStart);
  const dDates = data.daily.dates.slice(dStart);
  const mStart = Math.max(0, data.monthly.months.findIndex((m) => m >= from.slice(0, 7)));
  const months = data.monthly.months.slice(mStart);
  const monthly = (k: keyof RatesData["monthly"]["series"]) => data.monthly.series[k].slice(mStart);
  const policyMonthly = useMemo(() => data.monthly.months.map((m) => monthlyAverage(data, "policy", m)), [data]);

  const slope = useMemo(() => slopeSeries(data), [data]);
  const episodes = useMemo(() => inversionEpisodes(slope), [slope]);

  const yields = Object.fromEntries([2, 5, 7, 10].map((y) => [y, valueAt(data, `gb${y}y` as "gb2y", last) ?? 2.5])) as Record<number, number>;

  return (
    <main className="wrap">
      <header className="hero">
        <div className="eyebrow">Sweden · interest rates · inflation · mortgages</div>
        <h1>Swedish Rates &amp; Inflation Monitor</h1>
        <p className="lede">
          Where Swedish interest rates are, what the yield curve is signalling, how inflation compares with the
          Riksbank&apos;s 2% target, and what it all means for bond investors and households. Built on official
          Riksbank and Statistics Sweden data, refreshed automatically every weekday.
        </p>
        <div className="links">
          <a href={SITE.repo}>Source code</a>
          <a href="#methodology">Methodology</a>
          <a href={SITE.linkedin}>Built by {SITE.author}</a>
          <a href={SITE.sibling.url}>{SITE.sibling.name}</a>
        </div>
      </header>

      <section className="findings">
        <div className="eyebrow">Key findings · data to {last}</div>
        <ul>{facts.map((f) => <li key={f}>{f}</li>)}</ul>
      </section>

      <div className="kpis six">
        <Kpi label={<Term k="policy">Policy rate</Term>} value={rate(s.policy)}
          sub={s.policy1yAgo == null ? "" : `${bp(s.policy - s.policy1yAgo)} over 12 months`} />
        <Kpi label="10-year govt bond" value={rate(s.y10)}
          sub={s.y10_1mAgo == null ? "" : `${bp(s.y10 - s.y10_1mAgo)} over 1 month`} />
        <Kpi label={<Term k="kpif">Inflation (CPIF)</Term>} value={rate(s.kpif, 1)}
          sub={`${monthLabel(s.kpifMonth)} · target 2%`} />
        <Kpi label={<Term k="realRate">Real policy rate</Term>} value={`${s.realPolicy >= 0 ? "+" : ""}${s.realPolicy.toFixed(2)}%`}
          sub="policy rate − CPIF" />
        <Kpi label={<Term k="slope">Curve slope</Term>} value={bp(s.slope)} sub={`10y − 3m · ${s.shape}`} accent={s.shape === "inverted"} />
        <Kpi label={<Term k="mortgageRate">Floating mortgage</Term>} value={rate(s.mortgage)}
          sub={s.mortgageSpread == null ? monthLabel(s.mortgageMonth) : `${monthLabel(s.mortgageMonth)} · ${s.mortgageSpread.toFixed(2)} pp over policy`} />
      </div>

      <section className="card">
        <h2>The <Term k="yieldCurve">yield curve</Term> today</h2>
        <p className="sub">Swedish Treasury bill and government bond yields by maturity, compared with one month and one year ago.</p>
        <CurveChart points={CURVE} policy={s.policy} series={[
          { key: "now", name: `Today (${last})`, color: "var(--series-1)", values: curves.now.map((p) => p.value) },
          { key: "m1", name: "1 month ago", color: "var(--series-3)", values: curves.m1.map((p) => p.value) },
          { key: "y1", name: "1 year ago", color: "var(--series-2)", values: curves.y1.map((p) => p.value) },
        ]} />
        <div className="tbl-wrap">
          <table className="compact curve-table">
            <thead><tr><th>Maturity</th>{CURVE.map((p) => <th key={p.key}>{p.label}</th>)}</tr></thead>
            <tbody>
              <tr className="hl"><td>Yield</td>{curves.now.map((p) => <td key={p.key}>{p.value == null ? "–" : p.value.toFixed(2)}</td>)}</tr>
              <tr><td>vs 1 month</td>{curves.now.map((p, i) => <td key={p.key}>{p.value != null && curves.m1[i].value != null ? bp(p.value - curves.m1[i].value!) : "–"}</td>)}</tr>
              <tr><td>vs 1 year</td>{curves.now.map((p, i) => <td key={p.key}>{p.value != null && curves.y1[i].value != null ? bp(p.value - curves.y1[i].value!) : "–"}</td>)}</tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="range-bar">
        <span className="small">Period for the charts below</span>
        <div className="seg">
          {RANGES.map((r) => <button key={r.key} aria-pressed={range === r.key} onClick={() => setRange(r.key)}>{r.label}</button>)}
        </div>
      </div>

      <section className="card">
        <h2>Policy rate and government bond yields</h2>
        <p className="sub">Daily. Long yields move ahead of the policy rate as markets price in future decisions.</p>
        <TimeChart x={dDates} series={[
          { key: "p", name: "Policy rate", color: "var(--series-1)", values: daily("policy"), step: true },
          { key: "y2", name: "2-year", color: "var(--series-2)", values: daily("gb2y") },
          { key: "y10", name: "10-year", color: "var(--series-3)", values: daily("gb10y") },
        ]} />
      </section>

      <section className="card">
        <h2><Term k="slope">Curve slope</Term> and <Term k="inversion">inversions</Term></h2>
        <p className="sub">10-year yield minus 3-month bill yield, in percentage points. Shaded: inverted for at least 20 trading days (below −10 bp).</p>
        <TimeChart x={dDates} refY={0} yUnit=" pp"
          shade={episodes.filter((e) => e.end >= dDates[0]).map((e) => ({ from: e.start < dDates[0] ? dDates[0] : e.start, to: e.end }))}
          series={[{ key: "s", name: "10y − 3m spread", color: "var(--series-1)", values: slope.slice(dStart).map((p) => p.value) }]} />
        {episodes.length > 0 && (
          <div className="tbl-wrap">
            <table className="compact">
              <thead><tr><th>Inversion since 2005</th><th>Trading days</th><th>Deepest</th></tr></thead>
              <tbody>
                {episodes.map((e) => (
                  <tr key={e.start}>
                    <td>{monthLabel(e.start.slice(0, 7))} – {e.ongoing ? "ongoing" : monthLabel(e.end.slice(0, 7))}</td>
                    <td>{e.days}</td><td>{bp(e.min)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid2">
        <section className="card">
          <h2>Inflation vs the 2% target</h2>
          <p className="sub">Annual change, monthly. The gap between the policy rate and <Term k="kpif">CPIF</Term> is the <Term k="realRate">real policy rate</Term>.</p>
          <TimeChart x={months} refY={2} refLabel="2% target" height={300} series={[
            { key: "k", name: "CPIF", color: "var(--series-1)", values: monthly("kpif") },
            { key: "kx", name: "CPIF excl. energy", color: "var(--series-2)", values: monthly("kpifxe") },
            { key: "p", name: "Policy rate", color: "var(--muted)", values: policyMonthly.slice(mStart), dashed: true },
          ]} />
        </section>
        <section className="card">
          <h2>From policy rate to mortgages</h2>
          <p className="sub">Banks&apos; average rate on new mortgages, monthly, against the policy rate. The gap is the <Term k="mortgageSpread">mortgage spread</Term>.</p>
          <TimeChart x={months} height={300} series={[
            { key: "mf", name: "Floating (≤3m)", color: "var(--series-1)", values: monthly("mortgageFloating") },
            { key: "m5", name: "Fixed 3–5 years", color: "var(--series-2)", values: monthly("mortgage3to5y") },
            { key: "p", name: "Policy rate", color: "var(--muted)", values: policyMonthly.slice(mStart), dashed: true },
          ]} />
        </section>
      </div>

      <BondCalculator yields={yields} />
      <MortgageCalculator floating={s.mortgage} fixed={s.mortgage3to5} />

      <Methodology data={data} />
      <HowBuilt />

      <footer>
        Data updated {data.updated}, refreshed automatically every weekday. Sources: Sveriges Riksbank (SWEA API) and
        Statistics Sweden (SCB). For education and demonstration only, not financial advice.
      </footer>
    </main>
  );
}

function Kpi({ label, value, sub, accent }: { label: React.ReactNode; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={`kpi${accent ? " accent" : ""}`}>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      <div className="d">{sub}</div>
    </div>
  );
}

function Methodology({ data }: { data: RatesData }) {
  return (
    <section className="card method" id="methodology">
      <h2>Data &amp; methodology</h2>
      <dl>
        <dt>Rates</dt>
        <dd>Riksbank SWEA API: policy rate ({data.meta.policy.series}), Treasury bills at 1, 3 and 6 months and
          government bond yields at 2, 5, 7 and 10 years, daily since 2005. A series missing for a day is carried forward
          for at most five days; longer gaps are left blank.</dd>
        <dt>Inflation</dt>
        <dd>Statistics Sweden: CPIF (table TAB6590) and CPIF excluding energy (TAB6593), annual change, 2020=100 base.</dd>
        <dt>Mortgage rates</dt>
        <dd>Statistics Sweden TAB6535: banks&apos; average rates on new and renegotiated mortgages, weighted by volume across
          houses and tenant-owner apartments. The spread compares it with the policy rate&apos;s average in the same month.</dd>
        <dt>Curve shape</dt>
        <dd>Based on the 10-year minus 3-month spread: below −10 bp inverted, up to +25 bp flat, up to +150 bp normal,
          above that steep. Inversion episodes need at least 20 trading days; recoveries shorter than 10 days don&apos;t split one.</dd>
        <dt>Bond maths</dt>
        <dd>Annual-coupon bonds valued on a coupon date: price, Macaulay and modified duration, convexity and DV01, with the
          price change from a rate shock computed exactly and by the duration and duration-plus-convexity approximations.</dd>
        <dt>Pipeline</dt>
        <dd>A scheduled job fetches the data every weekday evening, waits out the Riksbank API&apos;s rate limit, validates
          ranges and freshness, and only then commits a new snapshot, which redeploys the site.</dd>
      </dl>
    </section>
  );
}

function HowBuilt() {
  return (
    <section className="card method">
      <details>
        <summary><h2>How I built this</h2></summary>
        <dl>
          <dt>Why</dt>
          <dd>My first project looked at Nordic equities. This one covers the other side of a portfolio: rates, inflation
            and credit costs, the numbers that drive bond prices, bank margins and household budgets in Sweden.</dd>
          <dt>Stack</dt>
          <dd>A Python data pipeline (standard library only) run by GitHub Actions; a static Next.js + TypeScript site with
            Recharts on Vercel. Built with Claude Code as an AI pair programmer.</dd>
          <dt>Engineering choices</dt>
          <dd>The Riksbank API allows only a few requests a minute, so instead of calling it on every page view, a daily
            job fetches the data politely and commits a validated snapshot. Visitors never hit the APIs, and the site
            loads instantly. A failed or suspicious fetch never replaces good data.</dd>
          <dt>Verification</dt>
          <dd>The bond maths is implemented in both Python and TypeScript and tested against a shared fixture; the
            mortgage calculator is tested against Skatteverket&apos;s own worked example. Tests run on every push.</dd>
        </dl>
      </details>
    </section>
  );
}
