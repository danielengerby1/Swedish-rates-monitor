"use client";

import {
  CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot, ReferenceLine, Tooltip, XAxis, YAxis,
} from "recharts";
import { ChartBox, Legend, axisTick, useMediaQuery } from "./ui";

export const rate = (v: number, d = 2) => `${v.toFixed(d)}%`;

export interface Series { key: string; name: string; color: string; values: (number | null)[]; dashed?: boolean; step?: boolean }

/**
 * Time-series line chart over shared x labels (dates or months). Values are in percent.
 * Long daily series are thinned for drawing; the tooltip shows the plotted points.
 */
export function TimeChart({
  x, series, height = 320, maxPoints = 600, refY, refLabel, shade, yUnit = "%",
}: {
  x: string[]; series: Series[]; height?: number; maxPoints?: number;
  refY?: number; refLabel?: string; shade?: { from: string; to: string }[]; yUnit?: string;
}) {
  const step = Math.max(1, Math.ceil(x.length / maxPoints));
  const data = x
    .map((d, i) => Object.fromEntries([["x", d], ...series.map((s) => [s.key, s.values[i]])]))
    .filter((_, i) => i % step === 0 || i === x.length - 1);
  // Reference areas must start/end on plotted x values, so snap them to the thinned axis.
  const plotted = data.map((d) => d.x as string);
  const snap = (v: string, up: boolean) => {
    const i = plotted.findIndex((p) => p >= v);
    if (i < 0) return plotted[plotted.length - 1];
    return up || plotted[i] === v || i === 0 ? plotted[i] : plotted[i - 1];
  };
  const areas = (shade ?? []).map((a) => ({ from: snap(a.from, true), to: snap(a.to, false) })).filter((a) => a.from <= a.to);
  return (
    <>
      <Legend items={series.map((s) => ({ name: s.name, color: s.color, dashed: s.dashed }))} />
      <ChartBox height={height} mobileHeight={250}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="x" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} minTickGap={56}
            tickFormatter={(d: string) => (d.length > 7 ? d.slice(0, 7) : d)} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} width={yUnit === "%" ? 44 : 52} domain={["auto", "auto"]}
            tickFormatter={(v: number) => `${Number(v.toFixed(1))}${yUnit}`} />
          {areas.map((s) => (
            <ReferenceArea key={s.from} x1={s.from} x2={s.to} fill="var(--bad)" fillOpacity={0.07} ifOverflow="extendDomain" />
          ))}
          {refY != null && (
            <ReferenceLine y={refY} stroke="var(--text-secondary)" strokeDasharray="4 4"
              label={refLabel ? { value: refLabel, position: "insideBottomLeft", fill: "var(--text-secondary)", fontSize: 12 } : undefined} />
          )}
          <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
            <div className="tip"><div className="t">{label}</div>
              {series.map((s) => {
                const v = payload.find((p) => p.dataKey === s.key)?.value as number | null | undefined;
                return v == null ? null : (
                  <div key={s.key}><i className="swatch" style={{ background: s.color }} /> {s.name}: <b>{v.toFixed(2)}{yUnit}</b></div>
                );
              })}
            </div>) : null} />
          {series.map((s) => (
            <Line key={s.key} dataKey={s.key} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined}
              type={s.step ? "stepAfter" : "linear"} dot={false} connectNulls={false} isAnimationActive={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-1)" }} />
          ))}
        </LineChart>
      </ChartBox>
    </>
  );
}

/** Yield curve: maturity (sqrt-scaled so the short end is readable) against yield. */
export function CurveChart({
  points, series, policy,
}: {
  points: { label: string; years: number }[];
  series: { key: string; name: string; color: string; values: (number | null)[]; dashed?: boolean }[];
  policy: number;
}) {
  const data = points.map((p, i) => Object.fromEntries([["x", p.years], ["label", p.label], ...series.map((s) => [s.key, s.values[i]])]));
  // The short maturities sit close together on a phone, so label only 1M and 6M there.
  const narrow = useMediaQuery("(max-width: 640px)");
  const ticks = points.map((p) => p.years).filter((y) => !narrow || y >= 0.5 || y < 0.1);
  const label = (y: number) => points.find((p) => p.years === y)?.label ?? "";
  return (
    <>
      <Legend items={[...series.map((s) => ({ name: s.name, color: s.color, dashed: s.dashed })), { name: `Policy rate ${rate(policy)}`, color: "var(--text-secondary)", dashed: true }]} />
      <ChartBox height={320} mobileHeight={260}>
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="x" type="number" scale="sqrt" domain={[0, 10]} ticks={ticks} tickFormatter={label}
            tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} interval={0} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} width={44} domain={["auto", "auto"]} tickFormatter={(v: number) => `${v}%`} />
          <ReferenceLine y={policy} stroke="var(--text-secondary)" strokeDasharray="2 4" />
          <Tooltip content={({ active, payload }) => {
            const row = payload?.[0]?.payload as Record<string, number | string> | undefined;
            return active && row ? (
              <div className="tip"><div className="t">{row.label as string} maturity</div>
                {series.map((s) => row[s.key] == null ? null : (
                  <div key={s.key}><i className="swatch" style={{ background: s.color }} /> {s.name}: <b>{(row[s.key] as number).toFixed(2)}%</b></div>
                ))}
              </div>) : null;
          }} />
          {series.map((s) => (
            <Line key={s.key} dataKey={s.key} stroke={s.color} strokeWidth={s.dashed ? 2 : 2.5} strokeDasharray={s.dashed ? "5 4" : undefined}
              dot={{ r: s.dashed ? 3 : 4, fill: s.color, stroke: "var(--surface-1)", strokeWidth: 2 }} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ChartBox>
    </>
  );
}

/** Bond price against yield, with the duration tangent at the current yield. */
export function PriceYieldChart({ rows, current }: {
  rows: { y: number; price: number; tangent: number }[];
  current: { y: number; price: number; shocked: number; shockedPrice: number };
}) {
  return (
    <>
      <Legend items={[
        { name: "Actual price", color: "var(--series-1)" },
        { name: "Duration estimate", color: "var(--series-2)", dashed: true },
      ]} />
      <ChartBox height={260} mobileHeight={230}>
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="y" type="number" domain={["dataMin", "dataMax"]} tick={axisTick} tickLine={false}
            axisLine={{ stroke: "var(--axis)" }} tickFormatter={(v: number) => `${v.toFixed(1)}%`}
            label={{ value: "Yield", position: "insideBottom", offset: -10, fill: "var(--muted)", fontSize: 12 }} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} width={44} domain={["auto", "auto"]} tickFormatter={(v: number) => v.toFixed(0)} />
          <Tooltip content={({ active, payload }) => {
            const r = payload?.[0]?.payload as { y: number; price: number; tangent: number } | undefined;
            return active && r ? (
              <div className="tip"><div className="t">Yield {r.y.toFixed(2)}%</div>
                Price <b>{r.price.toFixed(2)}</b><br />Duration estimate {r.tangent.toFixed(2)}</div>) : null;
          }} />
          <Line dataKey="tangent" stroke="var(--series-2)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          <Line dataKey="price" stroke="var(--series-1)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          <ReferenceDot x={current.y} y={current.price} r={6} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={2} />
          {current.shocked !== current.y && (
            <ReferenceDot x={current.shocked} y={current.shockedPrice} r={6} fill="var(--series-3)" stroke="var(--surface-1)" strokeWidth={2} />
          )}
        </LineChart>
      </ChartBox>
    </>
  );
}
