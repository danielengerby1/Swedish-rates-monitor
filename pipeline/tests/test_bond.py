import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bond import analyse, price  # noqa: E402


def test_par_bond_prices_at_100():
    assert price(0.03, 0.03, 10) == pytest.approx(100)


def test_zero_coupon_duration_equals_maturity():
    a = analyse(0.0, 0.025, 5)
    assert a["macaulay"] == pytest.approx(5)
    assert a["price"] == pytest.approx(100 / 1.025 ** 5)


def test_duration_and_convexity_approximate_repricing():
    a = analyse(0.02, 0.03, 10)
    dy = 0.01
    exact = price(0.02, 0.04, 10) / a["price"] - 1
    approx = -a["modified"] * dy + 0.5 * a["convexity"] * dy ** 2
    assert approx == pytest.approx(exact, abs=2e-4)          # second-order accurate
    assert abs(-a["modified"] * dy - exact) > abs(approx - exact)  # convexity improves it


def test_dv01_positive_and_small():
    a = analyse(0.03, 0.03, 10)
    assert 0.08 < a["dv01"] < 0.09   # ~8.5 öre per 100 SEK nominal for a 10y par bond
