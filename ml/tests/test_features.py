import math

import numpy as np
import pytest

from features import (
    MAX_HALF_LIFE,
    MIN_HALF_LIFE,
    PAPER_FEATURES,
    V1_FEATURES,
    featurize,
    half_life,
    next_interval_days,
    observed_half_life,
    recall,
)


def test_paper_features_by_hand():
    x = featurize(seen=[6], correct=[4], names=PAPER_FEATURES)
    assert x.shape == (1, 3)
    np.testing.assert_allclose(x[0], [1.0, math.sqrt(5), math.sqrt(3)])


def test_v1_features_by_hand():
    x = featurize(
        seen=[3], correct=[3], days_since_first=[np.e - 1], response_ms=[1000 * (np.e - 1)]
    )
    assert x.shape == (1, len(V1_FEATURES))
    np.testing.assert_allclose(x[0], [1.0, 2.0, 2.0, 1.0, 1.0, 1.0])


def test_optional_features_are_inert_when_missing():
    x = featurize(seen=[10, 0], correct=[7, 0])
    np.testing.assert_array_equal(x[:, 4:], 0.0)
    assert x[1, 1] == 1.0  # sqrt(1 + 0)


def test_correct_above_seen_is_rejected():
    with pytest.raises(ValueError):
        featurize(seen=[1], correct=[2])


def test_half_life_and_recall_round_trip():
    h = half_life(np.array([3.0]))  # 2 ** 3 = 8 days
    assert h[0] == 8.0
    p = recall(h, np.array([8.0]))
    assert p[0] == pytest.approx(0.5)
    np.testing.assert_allclose(observed_half_life(p, np.array([8.0])), [8.0], rtol=1e-6)


def test_half_life_is_bounded():
    assert half_life(np.array([-100.0]))[0] == MIN_HALF_LIFE
    assert half_life(np.array([100.0]))[0] == MAX_HALF_LIFE


def test_schedule_for_target_retention():
    # recall after next_interval_days must equal the target
    h = 10.0
    gap = next_interval_days(h, 0.9)
    assert recall(np.array([h]), np.array([gap]))[0] == pytest.approx(0.9)
