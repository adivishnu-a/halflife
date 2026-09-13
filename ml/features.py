"""The feature function and the half-life arithmetic shared by training, export and serving.

This file is the contract the TypeScript fallback mirrors. Keep it small and pure.

Half-life regression (Settles and Meeder, 2016):
    h = 2 ** (theta . x)          predicted half-life in days
    p = 2 ** (-delta_days / h)    predicted recall after a gap of delta_days
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

# Bounds from the reference implementation: 15 minutes to 9 months.
MIN_HALF_LIFE = 15.0 / (24 * 60)
MAX_HALF_LIFE = 274.0
P_EPS = 1e-4

# Dense feature names in the order the shipped weights use them.
# The reference paper uses only sqrt_correct, sqrt_wrong and bias.
# The brief adds sqrt_seen, log_days_since_first and log_response_s, which the
# Duolingo traces cannot supply; they are zero at training time and their
# weights are zero until the app's own logs train them.
PAPER_FEATURES = ("bias", "sqrt_correct", "sqrt_wrong")
V1_FEATURES = (
    "bias",
    "sqrt_seen",
    "sqrt_correct",
    "sqrt_wrong",
    "log_days_since_first",
    "log_response_s",
)


def featurize(
    seen: np.ndarray,
    correct: np.ndarray,
    days_since_first: np.ndarray | None = None,
    response_ms: np.ndarray | None = None,
    names: Sequence[str] = V1_FEATURES,
) -> np.ndarray:
    """Build the dense feature matrix, shape (n, len(names)), float64.

    seen and correct are the counts before this review. Unknown optional inputs
    are treated as zero after their transform, which makes them inert.
    """
    seen = np.asarray(seen, dtype=np.float64)
    correct = np.asarray(correct, dtype=np.float64)
    wrong = seen - correct
    if np.any(wrong < 0):
        raise ValueError("correct cannot exceed seen")
    n = seen.shape[0]
    columns = {
        "bias": np.ones(n),
        "sqrt_seen": np.sqrt(1.0 + seen),
        "sqrt_correct": np.sqrt(1.0 + correct),
        "sqrt_wrong": np.sqrt(1.0 + wrong),
        "log_days_since_first": (
            np.log1p(np.asarray(days_since_first, dtype=np.float64))
            if days_since_first is not None
            else np.zeros(n)
        ),
        "log_response_s": (
            np.log1p(np.asarray(response_ms, dtype=np.float64) / 1000.0)
            if response_ms is not None
            else np.zeros(n)
        ),
    }
    return np.column_stack([columns[name] for name in names])


def clip_p(p: np.ndarray | float) -> np.ndarray | float:
    return np.clip(p, P_EPS, 1.0 - P_EPS)


def clip_h(h: np.ndarray | float) -> np.ndarray | float:
    return np.clip(h, MIN_HALF_LIFE, MAX_HALF_LIFE)


def half_life(theta_x: np.ndarray) -> np.ndarray:
    """h = 2 ** (theta . x), clipped to the reference bounds."""
    return clip_h(np.exp2(np.clip(theta_x, -60.0, 60.0)))


def recall(h: np.ndarray, delta_days: np.ndarray) -> np.ndarray:
    """p = 2 ** (-delta / h), clipped away from 0 and 1."""
    return clip_p(np.exp2(-np.asarray(delta_days, dtype=np.float64) / h))


def observed_half_life(p: np.ndarray, delta_days: np.ndarray) -> np.ndarray:
    """Invert the forgetting curve to get the half-life implied by an observed p."""
    p = clip_p(np.asarray(p, dtype=np.float64))
    return clip_h(-np.asarray(delta_days, dtype=np.float64) / np.log2(p))


def next_interval_days(h: np.ndarray | float, target_retention: float) -> np.ndarray | float:
    """The gap after which recall is predicted to fall to target_retention."""
    return h * np.log2(1.0 / target_retention)
