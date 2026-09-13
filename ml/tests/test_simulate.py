import numpy as np

from simulate import (
    N_CARDS,
    N_DAYS,
    CardState,
    leitner_scheduler,
    make_hlr_scheduler,
    run,
    sm2_scheduler,
    tune,
)


def test_run_is_deterministic_for_a_seed():
    a = run(leitner_scheduler, 1.0, seed=1)
    b = run(leitner_scheduler, 1.0, seed=1)
    assert a.reviews_per_day == b.reviews_per_day and a.retention == b.retention
    assert len(a.reviews_by_day) == N_DAYS


def test_every_card_is_learned_and_reviews_are_counted():
    out = run(sm2_scheduler, 1.0)
    assert out.reviews_by_day.sum() >= N_CARDS
    assert 0.0 < out.retention < 1.0


def test_shorter_gaps_raise_retention_and_cost():
    short = run(leitner_scheduler, 0.1)
    long = run(leitner_scheduler, 2.0)
    assert short.retention > long.retention
    assert short.reviews_per_day > long.reviews_per_day


def test_tune_hits_the_target():
    out = tune(leitner_scheduler, 0.01, 20.0, target=0.9)
    assert abs(out.retention - 0.9) < 0.01


def test_hlr_scheduler_uses_target_retention_as_knob():
    sched = make_hlr_scheduler(lambda state: 10.0)
    assert np.isclose(sched(CardState(), 0.5), 10.0)
    assert sched(CardState(), 0.9) < sched(CardState(), 0.8)
