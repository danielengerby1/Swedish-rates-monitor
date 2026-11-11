"""Fixed-rate bond maths, the Python twin of lib/bond.ts (annual coupons by default).

Rates are decimals (0.03 = 3%). Valuation is on a coupon date (no accrued interest).
`python pipeline/bond.py` regenerates tests/fixture_bond.json, which the TypeScript tests
use to check that both implementations give identical numbers.
"""
from __future__ import annotations

import json
from pathlib import Path


def cashflows(coupon: float, years: float, freq: int = 1, face: float = 100.0):
    n = max(1, round(years * freq))
    return [((i + 1) / freq, coupon * face / freq + (face if i == n - 1 else 0.0)) for i in range(n)]


def price(coupon: float, ytm: float, years: float, freq: int = 1, face: float = 100.0) -> float:
    return sum(cf / (1 + ytm / freq) ** (t * freq) for t, cf in cashflows(coupon, years, freq, face))


def analyse(coupon: float, ytm: float, years: float, freq: int = 1, face: float = 100.0) -> dict:
    p = price(coupon, ytm, years, freq, face)
    mac = conv = 0.0
    for t, cf in cashflows(coupon, years, freq, face):
        k = t * freq
        df = 1 / (1 + ytm / freq) ** k
        mac += t * cf * df
        conv += cf * df * k * (k + 1)
    mac /= p
    return {
        "price": p,
        "macaulay": mac,
        "modified": mac / (1 + ytm / freq),
        "convexity": conv / (p * freq * freq * (1 + ytm / freq) ** 2),
        "dv01": price(coupon, ytm - 0.0001, years, freq, face) - p,
    }


CASES = [
    {"coupon": 0.03, "yield": 0.03, "years": 10},
    {"coupon": 0.0075, "yield": 0.029, "years": 7},
    {"coupon": 0.0, "yield": 0.025, "years": 5},
    {"coupon": 0.05, "yield": 0.02, "years": 2},
    {"coupon": 0.04, "yield": 0.035, "years": 10, "freq": 2},
]

if __name__ == "__main__":
    out = [{**c, "expected": analyse(c["coupon"], c["yield"], c["years"], c.get("freq", 1))} for c in CASES]
    path = Path(__file__).resolve().parents[1] / "tests" / "fixture_bond.json"
    path.write_text(json.dumps(out, indent=1) + "\n")
    print("wrote", path)
