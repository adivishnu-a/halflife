import numpy as np
import pandas as pd
import pytest

from baselines import LogisticBaseline, Sm2State, leitner, sm2, sm2_seed
from features import MAX_HALF_LIFE, MIN_HALF_LIFE


def row(user, lexeme, ts, delta_days, seen, correct, s_seen=1, s_correct=1):
    return dict(
        user_id=user,
        lexeme_id=lexeme,
        timestamp=ts,
        delta=float(delta_days * 86400),
        history_seen=seen,
        history_correct=correct,
        session_seen=s_seen,
        session_correct=s_correct,
        p_recall=s_correct / s_seen,
    )


def _frame(rows):
    df = pd.DataFrame(rows)
    df["user_id"] = df["user_id"].astype("category")
    df["lexeme_id"] = df["lexeme_id"].astype("category")
    return df


def test_leitner_doubles_and_halves():
    df = _frame(
        [
            row("a", "x", 0, 1, seen=3, correct=3),
            row("a", "y", 0, 1, seen=3, correct=1),
        ]
    )
    p, h = leitner(df)
    assert h[0] == 8.0  # 2 ** (3 - 0)
    assert h[1] == 0.5  # 2 ** (1 - 2)
    assert p[0] == pytest.approx(2 ** (-1 / 8))
    assert p[1] == pytest.approx(2 ** (-1 / 0.5))


def test_leitner_is_bounded():
    df = _frame(
        [
            row("a", "x", 0, 1e-5, seen=100, correct=100),
            row("a", "y", 0, 1e-5, seen=100, correct=0),
        ]
    )
    _, h = leitner(df)
    assert h[0] == MAX_HALF_LIFE and h[1] == MIN_HALF_LIFE


def test_sm2_interval_sequence():
    s = Sm2State()
    s.good()
    assert s.interval == 1
    s.good()
    assert s.interval == 6
    s.good()
    assert s.interval == 15  # round(6 * 2.5)
    s.again()
    assert (s.reps, s.interval, s.ease) == (0, 1, pytest.approx(2.3))
    s.good()
    s.good()
    s.good()
    assert s.interval == 14  # round(6 * 2.3)


def test_sm2_ease_floor():
    s = Sm2State()
    for _ in range(20):
        s.again()
    assert s.ease == pytest.approx(1.3)


def test_sm2_seed_from_counts():
    assert sm2_seed(0, 0).interval == 0
    assert sm2_seed(2, 2).interval == 6
    assert sm2_seed(3, 1).ease == pytest.approx(2.1)
    assert sm2_seed(3, 1).interval == 1


def test_sm2_replay_uses_state_before_each_row():
    df = _frame(
        [
            # second row first in the table to prove ordering by timestamp
            row("a", "x", 200, 1, seen=3, correct=3),
            row("a", "x", 100, 1, seen=2, correct=2),
            row("b", "x", 100, 1, seen=2, correct=2, s_correct=0),
            row("b", "x", 200, 1, seen=3, correct=2),
        ]
    )
    _, h = sm2(df)
    assert h[1] == 6.0  # seeded from two successes
    assert h[0] == 15.0  # after one more success in the window
    assert h[2] == 6.0
    assert h[3] == 1.0  # the lapse at t=100 reset the interval


def test_logistic_baseline_learns_the_gap():
    rng = np.random.default_rng(0)
    n = 4000
    delta = rng.uniform(0, 30, n)
    p_true = 2 ** (-delta / 5)
    df = _frame(
        [
            row("a", "x", 0, d, seen=5, correct=4, s_correct=int(rng.random() < p))
            for d, p in zip(delta, p_true, strict=True)
        ]
    )
    model = LogisticBaseline(n_lexemes=1).fit(df)
    p, h = model.predict(df)
    assert p[np.argmin(delta)] > p[np.argmax(delta)]
    assert np.all((p > 0) & (p < 1)) and np.all(np.isnan(h))
