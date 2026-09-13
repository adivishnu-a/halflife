"""Retraining on synthetic app logs that carry a real spacing effect."""

import json
from pathlib import Path

import numpy as np
import pandas as pd

from retrain import main, split, to_frame

MODEL_DIR = Path(__file__).resolve().parents[2] / "model"


def synthetic_logs(n_users: int, reviews_per_user: int, seed: int = 0) -> pd.DataFrame:
    """Learners whose recall follows a forgetting curve with h that doubles per success."""
    rng = np.random.default_rng(seed)
    rows = []
    t0 = pd.Timestamp("2026-06-01", tz="UTC")
    for u in range(n_users):
        for c in range(reviews_per_user // 8):
            seen, correct, h = 0, 0, 2.0
            first = t0 + pd.Timedelta(days=int(rng.integers(0, 60)))
            t = first
            for _ in range(8):
                gap = float(rng.uniform(0.5, 12)) if seen else 0.0
                t = t + pd.Timedelta(days=gap)
                p = 2 ** (-gap / h) if seen else 1.0
                remembered = bool(rng.random() < p)
                rows.append(
                    dict(
                        user=f"u{u}",
                        card_key=f"german-a1:{c % 40}",
                        reviewed_at=t,
                        first_seen_at=first,
                        delta_seconds=gap * 86400 if seen else None,
                        remembered=remembered,
                        response_ms=int(rng.integers(500, 6000)),
                        seen_before=seen,
                        correct_before=correct,
                        scheduler="classic" if seen else None,
                    )
                )
                seen += 1
                correct += remembered
                h = h * 2.2 if remembered else max(1.0, h * 0.4)
    return pd.DataFrame(rows)


def test_to_frame_keeps_spaced_reviews_only():
    frame = to_frame(synthetic_logs(2, 80))
    assert (frame["history_seen"] > 0).all()
    assert set(frame.columns) >= {"days_since_first", "response_ms", "lexeme_id", "user"}


def test_split_falls_back_to_time_with_few_users():
    frame = to_frame(synthetic_logs(2, 80))
    cfg = dict(seed=1, holdout_fraction=0.25, min_users_for_user_split=5)
    test, kind = split(frame, cfg)
    assert kind == "time"
    for user in frame["user"].unique():
        rows = frame[frame["user"] == user]
        latest = rows["reviewed_at"].to_numpy()[test[(frame["user"] == user).to_numpy()]]
        earliest_train = rows["reviewed_at"].to_numpy()[~test[(frame["user"] == user).to_numpy()]]
        assert latest.min() >= earliest_train.max()
    test_u, kind_u = split(to_frame(synthetic_logs(8, 80)), {**cfg, "min_users_for_user_split": 5})
    assert kind_u == "user" and 0 < test_u.mean() < 1


def test_retrain_promotes_when_logs_carry_a_spacing_effect(tmp_path: Path):
    logs = tmp_path / "logs.parquet"
    synthetic_logs(8, 400, seed=3).to_parquet(logs, index=False)
    code = main(
        [
            "--current",
            str(MODEL_DIR / "weights.v1.json"),
            "--logs",
            str(logs),
            "--runs-dir",
            str(tmp_path / "runs"),
            "--model-dir",
            str(tmp_path / "model"),
        ]
    )
    assert code == 0
    run_dir = next((tmp_path / "runs").iterdir())
    summary = json.loads((run_dir / "summary.json").read_text())
    metrics = json.loads((run_dir / "metrics.json").read_text())
    assert summary["promoted"], summary
    assert metrics["all"]["hlr"]["log_loss"] < metrics["current"]["log_loss"]
    weights = json.loads((tmp_path / "model" / "weights.v2.json").read_text())
    assert weights["version"] == 2 and len(weights["theta"]) == 6
    assert weights["theta"][2] > 0  # more successes, longer half-life
    fixtures = json.loads((tmp_path / "model" / "parity_fixtures.json").read_text())
    assert fixtures["weights"] == "weights.v2.json"
    assert "RETRAIN.md" in {p.name for p in run_dir.iterdir()}


def test_retrain_stops_short_without_enough_rows(tmp_path: Path):
    logs = tmp_path / "logs.parquet"
    synthetic_logs(1, 40).to_parquet(logs, index=False)
    main(
        [
            "--current",
            str(MODEL_DIR / "weights.v1.json"),
            "--logs",
            str(logs),
            "--runs-dir",
            str(tmp_path / "runs"),
            "--model-dir",
            str(tmp_path / "model"),
        ]
    )
    run_dir = next((tmp_path / "runs").iterdir())
    assert not json.loads((run_dir / "summary.json").read_text())["promoted"]
    assert not (tmp_path / "model").exists()
