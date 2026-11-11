import { CURVE, lastValue, monthlyAverage, shiftDate, valueAt, type RatesData } from "./data";

export type CurveShape = "inverted" | "flat" | "normal" | "steep";

/** Classify the curve by the 10-year minus 3-month spread, in percentage points. */
export function curveShape(spread: number): CurveShape {
  if (spread < -0.1) return "inverted";
  if (spread <= 0.25) return "flat";
  if (spread <= 1.5) return "normal";
  return "steep";
}

export function curveAt(data: RatesData, iso: string) {
  return CURVE.map((p) => ({ ...p, value: valueAt(data, p.key, iso) }));
}

/** 10y − 3m spread for every day where both exist. */
export function slopeSeries(data: RatesData) {
  const { dates, series } = data.daily;
  return dates.map((d, i) => {
    const a = series.gb10y[i], b = series.tb3m[i];
    return { date: d, value: a != null && b != null ? a - b : null };
  });
}

export interface Episode { start: string; end: string; days: number; min: number; ongoing: boolean }

/**
 * Periods where the curve was inverted (10y more than 10 bp below 3m, matching curveShape)
 * for at least `minDays` trading days.
 * Short dips are ignored, and brief recoveries shorter than `gap` days don't split an episode.
 */
export function inversionEpisodes(
  points: { date: string; value: number | null }[], minDays = 20, gap = 10, threshold = -0.1,
): Episode[] {
  const out: Episode[] = [];
  let start = -1, lastNeg = -1, min = 0;
  const close = (ongoing: boolean) => {
    const days = lastNeg - start + 1;
    if (days >= minDays) out.push({ start: points[start].date, end: points[lastNeg].date, days, min, ongoing });
  };
  points.forEach((p, i) => {
    if (p.value == null) return;
    if (p.value < threshold) {
      if (start < 0 || i - lastNeg > gap) {
        if (start >= 0) close(false);
        start = i; min = p.value;
      }
      lastNeg = i;
      min = Math.min(min, p.value);
    }
  });
  if (start >= 0) close(points.length - 1 - lastNeg <= gap);
  return out;
}

export interface Snapshot {
  date: string;
  policy: number; policy1yAgo: number | null;
  y10: number; y10_1mAgo: number | null; y2: number; m3: number;
  slope: number; shape: CurveShape;
  kpif: number; kpifMonth: string; kpifxe: number | null;
  realPolicy: number;
  mortgage: number; mortgageMonth: string; mortgageSpread: number | null; mortgage3to5: number | null;
}

/** The latest values and the derived numbers the dashboard leads with. */
export function snapshot(data: RatesData): Snapshot {
  const date = data.daily.dates[data.daily.dates.length - 1];
  const v = (k: Parameters<typeof valueAt>[1], iso = date) => valueAt(data, k, iso);
  const m = data.monthly;
  const kp = lastValue(m.series.kpif)!;
  const mo = lastValue(m.series.mortgageFloating)!;
  const kpifMonth = m.months[kp.index], mortgageMonth = m.months[mo.index];
  const policy = v("policy")!, y10 = v("gb10y")!, m3 = v("tb3m")!;
  const avgPolicy = monthlyAverage(data, "policy", mortgageMonth);
  return {
    date,
    policy, policy1yAgo: v("policy", shiftDate(date, { years: -1 })),
    y10, y10_1mAgo: v("gb10y", shiftDate(date, { months: -1 })), y2: v("gb2y")!, m3,
    slope: y10 - m3, shape: curveShape(y10 - m3),
    kpif: kp.value, kpifMonth, kpifxe: m.series.kpifxe[kp.index],
    realPolicy: policy - kp.value,
    mortgage: mo.value, mortgageMonth,
    mortgageSpread: avgPolicy == null ? null : mo.value - avgPolicy,
    mortgage3to5: m.series.mortgage3to5y[mo.index],
  };
}

const pp = (x: number, d = 2) => `${x.toFixed(d)}%`;
const monthName = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** Plain-English headline findings for the top of the page. */
export function findings(data: RatesData): string[] {
  const s = snapshot(data);
  const out: string[] = [];
  const chg = s.policy1yAgo == null ? "" : s.policy > s.policy1yAgo + 0.001
    ? `, up from ${pp(s.policy1yAgo)} a year ago`
    : s.policy < s.policy1yAgo - 0.001 ? `, down from ${pp(s.policy1yAgo)} a year ago` : ", unchanged over the past year";
  out.push(`The Riksbank's policy rate is ${pp(s.policy)}${chg}.`);

  const gap = s.kpif - 2;
  out.push(
    `Inflation (CPIF, the Riksbank's target measure) was ${pp(s.kpif, 1)} in ${monthName(s.kpifMonth)}, ` +
    `${Math.abs(gap) < 0.25 ? "close to" : gap > 0 ? `${gap.toFixed(1)} points above` : `${(-gap).toFixed(1)} points below`} the 2% target. ` +
    `That puts the real policy rate at ${s.realPolicy >= 0 ? "+" : ""}${s.realPolicy.toFixed(2)}%${s.realPolicy > 0.5 ? ", so policy is restrictive in real terms" : s.realPolicy < -0.5 ? ", so policy is still stimulative in real terms" : ""}.`,
  );

  const shapeText: Record<CurveShape, string> = {
    inverted: "inverted: long rates are below short rates, which markets often read as expected rate cuts or a slowdown",
    flat: "flat: long and short rates are about the same",
    normal: "upward-sloping, as is normal: investors demand more to lend for longer",
    steep: "steep: long rates are well above short rates",
  };
  out.push(`The yield curve is ${shapeText[s.shape]} (10-year ${pp(s.y10)} vs 3-month ${pp(s.m3)}, a ${s.slope >= 0 ? "+" : ""}${(s.slope * 100).toFixed(0)} bp spread).`);

  if (s.mortgageSpread != null)
    out.push(
      `Banks charged ${pp(s.mortgage)} on new floating-rate mortgages in ${monthName(s.mortgageMonth)}, ` +
      `${s.mortgageSpread.toFixed(2)} points above the policy rate that month.` +
      (s.mortgage3to5 != null ? ` Fixing for 3–5 years cost ${pp(s.mortgage3to5)}.` : ""),
    );
  return out;
}
