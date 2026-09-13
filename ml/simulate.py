"""Workload simulation: reviews per day each scheduler costs to hold 90% retention.

A synthetic learner studies 1,000 cards over 90 days. Each card has a latent
true half-life that the schedulers never see. On a review after a gap of d
days the learner remembers with probability p = 2 ** (-d / h_true). On success
the half-life is multiplied by 1 + (g - 1) * min(1 - p, 0.6) / 0.1, where g is
the card's growth factor: a review at 90% recall multiplies by g, an easier one
by less, a harder one by more, with the gain capped at p = 0.4. That is the
shape of the spacing effect FSRS fits (gain rises with 1 - R). On failure the
half-life drops to 30%, never below the card's starting value. This is a
stylised ground truth, not a fitted model, and it is the same for every
scheduler.

Fixed schedulers have no retention dial, so each scheduler gets one knob and a
bisection tunes it until realized retention is 0.90: an interval multiplier
for Leitner and SM-2 (Anki's "interval modifier"), the target retention for the
half-life model. The reported cost is mean reviews per day at that setting.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass, field

import numpy as np

from baselines import Sm2State
from features import next_interval_days

N_CARDS = 1000
N_DAYS = 90
NEW_PER_DAY = 34  # 1,000 cards enter over the first 30 days
TARGET_RETENTION = 0.90


@dataclass
class CardState:
    seen: int = 0
    correct: int = 0
    wrong: int = 0
    first_day: int = 0
    sm2: Sm2State = field(default_factory=Sm2State)


# A scheduler maps the card's state after a grade to the next gap in days.
Scheduler = Callable[[CardState, float], float]


def leitner_scheduler(state: CardState, knob: float) -> float:
    return knob * 2.0 ** (state.correct - state.wrong)


def sm2_scheduler(state: CardState, knob: float) -> float:
    return knob * max(state.sm2.interval, 1.0)


def make_hlr_scheduler(predict_half_life: Callable[[CardState], float]) -> Scheduler:
    """predict_half_life returns the model's h for the card; knob is the target retention."""

    def scheduler(state: CardState, knob: float) -> float:
        return next_interval_days(predict_half_life(state), knob)

    return scheduler


@dataclass(frozen=True)
class Outcome:
    reviews_per_day: float
    retention: float
    knob: float
    reviews_by_day: np.ndarray
    tested: int = 0

    @property
    def retention_for_search(self) -> float:
        """No card came back in the window: treat as zero retention so the search shortens gaps."""
        return self.retention if self.tested else 0.0


def run(scheduler: Scheduler, knob: float, seed: int = 42) -> Outcome:
    rng = np.random.default_rng(seed)
    # Latent memory: initial half-life about a week; about 2.5x growth at 90% recall.
    h0 = np.exp(rng.normal(math.log(7.0), 0.6, N_CARDS))
    growth = np.exp(rng.normal(math.log(2.5), 0.3, N_CARDS))
    h_true = h0.copy()
    states = [CardState() for _ in range(N_CARDS)]
    due = np.full(N_CARDS, np.inf)
    last_review = np.zeros(N_CARDS)
    introduced = 0
    reviews_by_day = np.zeros(N_DAYS)
    tested = remembered = 0

    for day in range(N_DAYS):
        # Learn new cards: the first exposure is a learning event, not a recall test.
        for card in range(introduced, min(N_CARDS, introduced + NEW_PER_DAY)):
            st = states[card]
            st.seen, st.correct, st.first_day = 1, 1, day
            st.sm2.good()
            last_review[card] = day
            due[card] = day + max(1.0, round(scheduler(st, knob)))
            reviews_by_day[day] += 1
        introduced = min(N_CARDS, introduced + NEW_PER_DAY)

        for card in np.flatnonzero(due <= day):
            st = states[card]
            gap = day - last_review[card]
            p_true = 2.0 ** (-gap / h_true[card])
            ok = rng.random() < p_true
            tested += 1
            remembered += ok
            st.seen += 1
            if ok:
                st.correct += 1
                st.sm2.good()
                h_true[card] *= 1.0 + (growth[card] - 1.0) * min(1.0 - p_true, 0.6) / 0.1
            else:
                st.wrong += 1
                st.sm2.again()
                h_true[card] = max(h0[card], h_true[card] * 0.3)
            last_review[card] = day
            due[card] = day + max(1.0, round(scheduler(st, knob)))
            reviews_by_day[day] += 1

    return Outcome(
        reviews_per_day=float(reviews_by_day.mean()),
        retention=remembered / tested if tested else float("nan"),
        knob=knob,
        reviews_by_day=reviews_by_day,
        tested=tested,
    )


def tune(
    scheduler: Scheduler,
    lo: float,
    hi: float,
    target: float = TARGET_RETENTION,
    seed: int = 42,
    steps: int = 18,
) -> Outcome:
    """Bisect the knob in log space until realized retention meets the target.

    Retention must rise as the knob falls (shorter gaps): true for interval
    multipliers. For the target-retention knob it rises as the knob rises, so
    callers pass lo > hi to flip the search.
    """
    flipped = lo > hi
    a, b = (math.log(hi), math.log(lo)) if flipped else (math.log(lo), math.log(hi))
    best = run(scheduler, math.exp(a), seed)
    for _ in range(steps):
        mid = 0.5 * (a + b)
        out = run(scheduler, math.exp(mid), seed)
        # Too much retention means the gaps are too short: move toward the long side.
        too_high = out.retention_for_search > target
        if flipped:
            too_high = not too_high
        if too_high:
            a = mid
        else:
            b = mid
        if abs(out.retention_for_search - target) < abs(best.retention_for_search - target):
            best = out
    return best


if __name__ == "__main__":
    for name, sched, lo, hi in [
        ("leitner", leitner_scheduler, 0.01, 20.0),
        ("sm2", sm2_scheduler, 0.01, 20.0),
    ]:
        out = tune(sched, lo, hi)
        print(
            f"{name:8s} knob={out.knob:7.3f} reviews/day={out.reviews_per_day:6.1f} "
            f"retention={out.retention:.3f}"
        )
