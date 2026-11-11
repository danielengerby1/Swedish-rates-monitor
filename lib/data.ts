/** Shape of data/rates.json, written by pipeline/fetch_data.py. All values are in percent. */
export type Num = number | null;

export interface RatesData {
  updated: string;
  sources: Record<string, string>;
  meta: Record<string, { series: string; label: string; maturity: number }>;
  daily: { dates: string[]; series: Record<DailyKey, Num[]> };
  monthly: { months: string[]; series: Record<MonthlyKey, Num[]> };
}

export type DailyKey = "policy" | "tb1m" | "tb3m" | "tb6m" | "gb2y" | "gb5y" | "gb7y" | "gb10y";
export type MonthlyKey = "kpif" | "kpifxe" | "mortgageFloating" | "mortgage3to5y" | "mortgageAll";

/** Curve points in maturity order (years). The policy rate is the overnight anchor. */
export const CURVE: { key: DailyKey; label: string; years: number }[] = [
  { key: "tb1m", label: "1M", years: 1 / 12 },
  { key: "tb3m", label: "3M", years: 0.25 },
  { key: "tb6m", label: "6M", years: 0.5 },
  { key: "gb2y", label: "2Y", years: 2 },
  { key: "gb5y", label: "5Y", years: 5 },
  { key: "gb7y", label: "7Y", years: 7 },
  { key: "gb10y", label: "10Y", years: 10 },
];

/** Index of the last date on or before `iso` (or -1). Dates are sorted ascending. */
export function indexOnOrBefore(dates: string[], iso: string): number {
  let lo = 0, hi = dates.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] <= iso) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** Last non-null value of a series, with its index. */
export function lastValue(values: Num[]): { value: number; index: number } | null {
  for (let i = values.length - 1; i >= 0; i--) if (values[i] != null) return { value: values[i] as number, index: i };
  return null;
}

export function shiftDate(iso: string, { days = 0, months = 0, years = 0 }: { days?: number; months?: number; years?: number }) {
  const d = new Date(`${iso}T00:00:00Z`);
  const y = d.getUTCFullYear() + years, m = d.getUTCMonth() + months;
  // Clamp to the target month's length: one month before 31 March is 28/29 February.
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const out = new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay)));
  out.setUTCDate(out.getUTCDate() + days);
  return out.toISOString().slice(0, 10);
}

/** Value of a daily series on (or just before) a date. */
export function valueAt(data: RatesData, key: DailyKey, iso: string): number | null {
  const i = indexOnOrBefore(data.daily.dates, iso);
  for (let j = i; j >= 0 && j > i - 10; j--) {
    const v = data.daily.series[key][j];
    if (v != null) return v;
  }
  return null;
}

/** Average of a daily series over a calendar month (YYYY-MM). */
export function monthlyAverage(data: RatesData, key: DailyKey, month: string): number | null {
  let s = 0, n = 0;
  data.daily.dates.forEach((d, i) => {
    const v = data.daily.series[key][i];
    if (d.startsWith(month) && v != null) { s += v; n++; }
  });
  return n ? s / n : null;
}
