"""Baseline schedulers scored on the same splits as the trained model.

Each predictor returns (p_hat, h_hat) per row: predicted recall for the row's
gap, and the half-life the scheduler implies. Following the reference paper,
a fixed scheduler's interval is read as its half-life so it can be scored.

1. Leitner: h = 2 ** (correct - wrong). The interval doubles on a success and
   halves on a failure.
2. SM-2 as Anki runs it, replayed per user-lexeme in time order with binary
   grades. Interval 1 day, then 6, then interval * ease; ease starts at 2.5,
   drops 0.2 on a lapse, never below 1.3; a lapse resets to 1 day.
3. Logistic regression directly on the features plus the log gap, no half-life
   structure. It predicts no half-life, so its h column is NaN and the
   half-life correlations are reported as not applicable.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
import scipy.sparse as sp
from sklearn.linear_model import LogisticRegression

from dataset import delta_days
from features import PAPER_FEATURES, clip_h, clip_p, featurize, recall

SM2_INITIAL_EASE = 2.5
SM2_MIN_EASE = 1.3
SM2_LAPSE_PENALTY = 0.2
SM2_FIRST_INTERVAL = 1.0
SM2_SECOND_INTERVAL = 6.0


def leitner(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    correct = df["history_correct"].to_numpy(dtype=np.float64)
    wrong = df["history_seen"].to_numpy(dtype=np.float64) - correct
    h = clip_h(np.exp2(np.clip(correct - wrong, -60, 60)))
    return recall(h, delta_days(df)), h


# ---------------------------------------------------------------- SM-2


@dataclass
class Sm2State:
    reps: int = 0
    ease: float = SM2_INITIAL_EASE
    interval: float = 0.0

    def good(self) -> None:
        self.reps += 1
        if self.reps == 1:
            self.interval = SM2_FIRST_INTERVAL
        elif self.reps == 2:
            self.interval = SM2_SECOND_INTERVAL
        else:
            self.interval = max(self.interval + 1.0, round(self.interval * self.ease))

    def again(self) -> None:
        self.reps = 0
        self.interval = SM2_FIRST_INTERVAL
        self.ease = max(SM2_MIN_EASE, self.ease - SM2_LAPSE_PENALTY)

    def apply(self, wrong: int, correct: int) -> None:
        """Apply a session's outcomes, failures first, then successes."""
        for _ in range(wrong):
            self.again()
        for _ in range(correct):
            self.good()


def sm2_seed(history_seen: int, history_correct: int) -> Sm2State:
    """State implied by counts alone: replay all lapses, then all successes.

    The traces only give counts for reviews before the window, so the order
    is unknown. Lapses first is the pessimistic reading: it leaves the card at
    reps == correct with the ease penalty fully applied.
    """
    state = Sm2State()
    wrong = history_seen - history_correct
    state.ease = max(SM2_MIN_EASE, SM2_INITIAL_EASE - SM2_LAPSE_PENALTY * wrong)
    if wrong > 0:
        state.interval = SM2_FIRST_INTERVAL
    for _ in range(history_correct):
        state.good()
        if state.interval > 10 * 365:
            state.reps = history_correct
            break
    return state


def sm2(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """Replay SM-2 per (user, lexeme) in timestamp order and score each row before its update."""
    order = np.lexsort(
        (
            df["timestamp"].to_numpy(),
            df["lexeme_id"].cat.codes.to_numpy(),
            df["user_id"].cat.codes.to_numpy(),
        )
    )
    users = df["user_id"].cat.codes.to_numpy()[order]
    lexemes = df["lexeme_id"].cat.codes.to_numpy()[order]
    seen = df["history_seen"].to_numpy()[order]
    correct = df["history_correct"].to_numpy()[order]
    s_seen = df["session_seen"].to_numpy()[order]
    s_correct = df["session_correct"].to_numpy()[order]

    interval = np.empty(len(df), dtype=np.float64)
    state = Sm2State()
    prev_user = prev_lex = -1
    for i in range(len(df)):
        if users[i] != prev_user or lexemes[i] != prev_lex:
            state = sm2_seed(int(seen[i]), int(correct[i]))
            prev_user, prev_lex = users[i], lexemes[i]
        interval[i] = state.interval
        state.apply(int(s_seen[i] - s_correct[i]), int(s_correct[i]))

    h = np.empty_like(interval)
    h[order] = interval
    h = clip_h(h)
    return recall(h, delta_days(df)), h


# ---------------------------------------------------------------- logistic regression


def design_matrix(df: pd.DataFrame, n_lexemes: int) -> sp.csr_matrix:
    dense = featurize(
        df["history_seen"].to_numpy(),
        df["history_correct"].to_numpy(),
        names=PAPER_FEATURES,
    )
    dense = np.column_stack([dense, np.log1p(delta_days(df))])
    rows = np.arange(len(df))
    lex = sp.csr_matrix(
        (np.ones(len(df)), (rows, df["lexeme_id"].cat.codes.to_numpy())),
        shape=(len(df), n_lexemes),
    )
    return sp.hstack([sp.csr_matrix(dense), lex], format="csr")


def expand_trials(p_recall: np.ndarray, session_seen: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Turn fractional recall into weighted binary outcomes: (labels, weights) over 2n rows."""
    correct = p_recall * session_seen
    wrong = session_seen - correct
    labels = np.concatenate([np.ones(len(p_recall)), np.zeros(len(p_recall))])
    weights = np.concatenate([correct, wrong])
    return labels, weights


class LogisticBaseline:
    def __init__(self, n_lexemes: int, c: float = 1.0, seed: int = 42):
        self.n_lexemes = n_lexemes
        self.model = LogisticRegression(C=c, solver="lbfgs", max_iter=1000, random_state=seed)

    def fit(self, df: pd.DataFrame) -> LogisticBaseline:
        x = design_matrix(df, self.n_lexemes)
        labels, weights = expand_trials(
            df["p_recall"].to_numpy(dtype=np.float64), df["session_seen"].to_numpy(dtype=np.float64)
        )
        keep = weights > 0
        x2 = sp.vstack([x, x], format="csr")[keep]
        self.model.fit(x2, labels[keep], sample_weight=weights[keep])
        return self

    def predict(self, df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        p = self.model.predict_proba(design_matrix(df, self.n_lexemes))[:, 1]
        # Deriving an h from p and the gap would correlate with the observed h
        # through the shared gap, a fake signal. Report none instead.
        return clip_p(p), np.full(len(p), np.nan)
