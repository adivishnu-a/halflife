"""The shipped weights and fixtures must agree with the feature function.

This is the Python half of the parity test; lib/scheduler/hlr.test.ts is the
TypeScript half. Both read model/parity_fixtures.json.
"""

import json
from pathlib import Path

import numpy as np
import pytest

from features import featurize, half_life, next_interval_days, recall

MODEL_DIR = Path(__file__).resolve().parents[2] / "model"


@pytest.fixture(scope="module")
def shipped():
    fixtures = json.loads((MODEL_DIR / "parity_fixtures.json").read_text())
    weights = json.loads((MODEL_DIR / fixtures["weights"]).read_text())
    return weights, fixtures["cases"]


def test_fixtures_match_the_feature_function(shipped):
    weights, cases = shipped
    theta = np.asarray(weights["theta"])
    for case in cases:
        x = featurize(
            [case["seen"]],
            [case["correct"]],
            [case["days_since_first"]],
            [case["response_ms"]],
            names=weights["features"],
        )
        np.testing.assert_allclose(x[0], case["features"], atol=1e-9)
        h = half_life(x @ theta)
        assert h[0] == pytest.approx(case["half_life_days"], abs=1e-6)
        assert recall(h, np.array([case["delta_days"]]))[0] == pytest.approx(case["p"], abs=1e-6)
        assert next_interval_days(h, case["target_retention"])[0] == pytest.approx(
            case["next_interval_days"], abs=1e-6
        )


def test_weights_file_is_complete(shipped):
    weights, _ = shipped
    assert len(weights["theta"]) == len(weights["features"])
    assert weights["features"][0] == "bias"
    assert "all" in weights["metrics"] and "log_loss" in weights["metrics"]["all"]
    assert len(weights["weights_sha256"]) == 64
