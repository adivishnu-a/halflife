"""Write the shipped weights file from a training run.

    model/weights.v<N>.json: version, features in order, dense weights, the
    training data size, the held-out metrics of the run, and the sha256 of the
    weights themselves for the model_versions table.

Also writes model/parity_fixtures.json: fixed feature inputs with the expected
half-life and recall, which both the Python and TypeScript tests must match to
six decimal places.

Run: `uv run python -m export runs/<run> --version 1`
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np

from evaluate import HlrRun
from features import featurize, half_life, next_interval_days, recall

MODEL_DIR = Path(__file__).resolve().parents[1] / "model"

FIXTURE_STATES = [
    # seen, correct, days_since_first, response_ms, delta_days, target_retention
    (1, 1, 0.0, 0, 1.0, 0.9),
    (1, 1, 0.0, 0, 14.0, 0.9),
    (3, 3, 4.0, 2500, 7.0, 0.9),
    (3, 1, 4.0, 9000, 0.5, 0.85),
    (10, 9, 30.0, 1800, 21.0, 0.95),
    (10, 5, 30.0, 6000, 2.0, 0.8),
    (50, 48, 200.0, 1200, 60.0, 0.9),
    (200, 120, 400.0, 20000, 0.01, 0.9),
]


def weights_payload(run: HlrRun, version: int) -> dict:
    metrics = json.loads((run.run_dir / "metrics.json").read_text())
    theta = [float(w) for w in run.theta]
    return {
        "version": version,
        "trained_at": time.strftime("%Y-%m-%d"),
        "source": "Duolingo learning traces, Settles and Meeder 2016, "
        "doi:10.7910/DVN/N8XJME, CC BY-NC 4.0",
        "run": run.run_dir.name,
        "config": run.config,
        "features": run.features,
        "theta": theta,
        # Per-card difficulty terms keyed by the card's shared source key, added to
        # theta . x before the power of two. Empty until the app's own logs train them.
        "card_terms": run.card_terms,
        "data_rows": metrics.get("rows"),
        "split": metrics.get("split"),
        "metrics": {k: metrics[k]["hlr"] for k in ("all", "mature", "spaced") if k in metrics},
        "weights_sha256": hashlib.sha256(
            json.dumps({"theta": theta, "card_terms": run.card_terms}, sort_keys=True).encode()
        ).hexdigest(),
    }


def fixtures(run: HlrRun) -> list[dict]:
    out = []
    for seen, correct, days, response_ms, delta, target in FIXTURE_STATES:
        x = featurize([seen], [correct], [days], [response_ms], names=run.features)
        h = half_life(x @ run.theta)
        out.append(
            {
                "seen": seen,
                "correct": correct,
                "days_since_first": days,
                "response_ms": response_ms,
                "delta_days": delta,
                "target_retention": target,
                "features": [float(v) for v in x[0]],
                "half_life_days": float(h[0]),
                "p": float(recall(h, np.array([delta]))[0]),
                "next_interval_days": float(next_interval_days(h, target)[0]),
            }
        )
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("run", type=Path)
    parser.add_argument("--version", type=int, required=True)
    args = parser.parse_args(argv)
    run = HlrRun(args.run)
    MODEL_DIR.mkdir(exist_ok=True)
    weights_path = MODEL_DIR / f"weights.v{args.version}.json"
    weights_path.write_text(json.dumps(weights_payload(run, args.version), indent=2) + "\n")
    fixtures_path = MODEL_DIR / "parity_fixtures.json"
    fixtures_path.write_text(
        json.dumps({"weights": f"weights.v{args.version}.json", "cases": fixtures(run)}, indent=2)
        + "\n"
    )
    print(f"wrote {weights_path} and {fixtures_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
