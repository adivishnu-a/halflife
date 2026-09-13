"""NumPy inference for the shipped half-life model. No PyTorch here.

Loads the highest-numbered model/weights.v<N>.json at import time, so a warm
function answers without touching the disk. The arithmetic mirrors
ml/features.py and lib/scheduler/hlr.ts; model/parity_fixtures.json holds
the cases all three must agree on.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np

MODEL_DIR = Path(__file__).resolve().parents[1] / "model"
MIN_HALF_LIFE = 15.0 / (24 * 60)
MAX_HALF_LIFE = 274.0
P_EPS = 1e-4


@dataclass(frozen=True)
class Model:
    version: int
    trained_at: str
    features: tuple[str, ...]
    theta: np.ndarray
    metrics: dict
    data_rows: int | None
    weights_sha256: str

    @classmethod
    def load(cls, model_dir: Path = MODEL_DIR) -> Model:
        candidates = {
            int(m.group(1)): p
            for p in model_dir.glob("weights.v*.json")
            if (m := re.fullmatch(r"weights\.v(\d+)\.json", p.name))
        }
        if not candidates:
            raise FileNotFoundError(f"no weights.v<N>.json in {model_dir}")
        raw = json.loads(candidates[max(candidates)].read_text())
        return cls(
            version=raw["version"],
            trained_at=raw["trained_at"],
            features=tuple(raw["features"]),
            theta=np.asarray(raw["theta"], dtype=np.float64),
            metrics=raw["metrics"],
            data_rows=raw.get("data_rows"),
            weights_sha256=raw["weights_sha256"],
        )

    def featurize(
        self,
        seen: np.ndarray,
        correct: np.ndarray,
        days_since_first: np.ndarray,
        response_ms: np.ndarray,
    ) -> np.ndarray:
        n = seen.shape[0]
        columns = {
            "bias": np.ones(n),
            "sqrt_seen": np.sqrt(1.0 + seen),
            "sqrt_correct": np.sqrt(1.0 + correct),
            "sqrt_wrong": np.sqrt(1.0 + seen - correct),
            "log_days_since_first": np.log1p(days_since_first),
            "log_response_s": np.log1p(response_ms / 1000.0),
        }
        return np.column_stack([columns[name] for name in self.features])

    def half_life(self, x: np.ndarray) -> np.ndarray:
        z = np.clip(x @ self.theta, -60.0, 60.0)
        return np.clip(np.exp2(z), MIN_HALF_LIFE, MAX_HALF_LIFE)


def recall(h: np.ndarray, delta_days: np.ndarray) -> np.ndarray:
    return np.clip(np.exp2(-delta_days / h), P_EPS, 1.0 - P_EPS)


def next_interval_days(h: np.ndarray, target_retention: float) -> np.ndarray:
    return h * np.log2(1.0 / target_retention)
