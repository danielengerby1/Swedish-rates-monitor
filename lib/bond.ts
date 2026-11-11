/**
 * Fixed-rate bond maths. Rates are decimals (0.03 = 3%). Swedish government bonds pay an
 * annual coupon, so freq defaults to 1. Valuation is on a coupon date (no accrued interest).
 * The Python twin is pipeline/bond.py; tests/fixture_bond.json pins both to the same numbers.
 */

export interface BondInput {
  coupon: number; // annual coupon rate
  yield: number; // yield to maturity
  years: number; // whole years to maturity
  freq?: number; // coupons per year
  face?: number;
}

export interface BondResult {
  price: number;
  macaulay: number; // years
  modified: number; // % price change per 1.00 change in yield (i.e. per 100%)
  convexity: number;
  dv01: number; // price change for a 1 bp fall in yield, per `face`
}

export function cashflows({ coupon, years, freq = 1, face = 100 }: BondInput) {
  const n = Math.max(1, Math.round(years * freq));
  return Array.from({ length: n }, (_, i) => ({ t: (i + 1) / freq, cf: (coupon * face) / freq + (i === n - 1 ? face : 0) }));
}

export function price(b: BondInput): number {
  const f = b.freq ?? 1;
  return cashflows(b).reduce((s, { t, cf }) => s + cf / (1 + b.yield / f) ** (t * f), 0);
}

export function analyse(b: BondInput): BondResult {
  const f = b.freq ?? 1;
  const p = price(b);
  let mac = 0, conv = 0;
  for (const { t, cf } of cashflows(b)) {
    const k = t * f;
    const df = 1 / (1 + b.yield / f) ** k;
    mac += t * cf * df;
    conv += cf * df * k * (k + 1);
  }
  mac /= p;
  const modified = mac / (1 + b.yield / f);
  const convexity = conv / (p * f * f * (1 + b.yield / f) ** 2);
  return { price: p, macaulay: mac, modified, convexity, dv01: price({ ...b, yield: b.yield - 0.0001 }) - p };
}

/** Price change for a yield shock: exact repricing vs the duration and duration+convexity approximations. */
export function shock(b: BondInput, dy: number) {
  const a = analyse(b);
  const exact = price({ ...b, yield: b.yield + dy }) / a.price - 1;
  const durationOnly = -a.modified * dy;
  const withConvexity = durationOnly + 0.5 * a.convexity * dy * dy;
  return { exact, durationOnly, withConvexity };
}
