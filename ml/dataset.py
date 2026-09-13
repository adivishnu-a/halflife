"""Load the Duolingo traces with tight dtypes, cache as parquet, split by user.

The raw file has 12.85M rows. Read once from CSV with explicit dtypes (about 2 GB
in memory), then cache to parquet so later runs load in seconds.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from data.download import RAW_PATH

CACHE_PATH = RAW_PATH.parent / "traces.parquet"

DTYPES = {
    "p_recall": "float32",
    "timestamp": "int64",
    "delta": "int64",
    "user_id": "category",
    "learning_language": "category",
    "ui_language": "category",
    "lexeme_id": "category",
    "lexeme_string": "category",
    "history_seen": "int32",
    "history_correct": "int32",
    "session_seen": "int16",
    "session_correct": "int16",
}

SECONDS_PER_DAY = 60 * 60 * 24


def load_traces(raw: Path = RAW_PATH, cache: Path = CACHE_PATH) -> pd.DataFrame:
    """Return the full trace table, building the parquet cache on first call."""
    if cache.exists():
        return pd.read_parquet(cache)
    if not raw.exists():
        raise FileNotFoundError(f"{raw} missing; run `uv run python -m data.download` first")
    df = pd.read_csv(raw, dtype=DTYPES, compression="gzip")
    df.to_parquet(cache, index=False)
    return df


@dataclass(frozen=True)
class Split:
    """Boolean masks over the trace table. Users are disjoint between the two."""

    seed: int
    test_fraction: float
    train: np.ndarray
    test: np.ndarray

    def describe(self, df: pd.DataFrame) -> dict[str, int | float]:
        return {
            "seed": self.seed,
            "test_fraction": self.test_fraction,
            "train_rows": int(self.train.sum()),
            "test_rows": int(self.test.sum()),
            "train_users": int(df.loc[self.train, "user_id"].nunique()),
            "test_users": int(df.loc[self.test, "user_id"].nunique()),
        }


def split_by_user(df: pd.DataFrame, seed: int = 42, test_fraction: float = 0.1) -> Split:
    """Hold out a fraction of users, not rows, so the model is scored on unseen learners."""
    users = df["user_id"].cat.categories.to_numpy()
    rng = np.random.default_rng(seed)
    held_out = rng.random(len(users)) < test_fraction
    codes = df["user_id"].cat.codes.to_numpy()
    test = held_out[codes]
    return Split(seed=seed, test_fraction=test_fraction, train=~test, test=test)


def delta_days(df: pd.DataFrame) -> np.ndarray:
    return df["delta"].to_numpy(dtype=np.float64) / SECONDS_PER_DAY
