"""Tests for the FastAPI service in api/. Run from ml/ with the rest of the suite.

The inference module is a third copy of the arithmetic, next to ml/features.py
and lib/scheduler/hlr.ts, so it is held to the same parity fixtures.
"""

import json
import sys
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from api._inference import Model, next_interval_days, recall  # noqa: E402
from api.index import app  # noqa: E402

FIXTURES = json.loads((ROOT / "model" / "parity_fixtures.json").read_text())
client = TestClient(app)


def _features(c: dict) -> dict:
    return {
        "seen": c["seen"],
        "correct": c["correct"],
        "delta_days": c["delta_days"],
        "days_since_first": c["days_since_first"],
        "response_ms": c["response_ms"],
    }


def test_inference_matches_the_parity_fixtures():
    m = Model.load()
    for c in FIXTURES["cases"]:
        x = m.featurize(
            *(
                np.array([c[k]], dtype=float)
                for k in ("seen", "correct", "days_since_first", "response_ms")
            )
        )
        np.testing.assert_allclose(x[0], c["features"], atol=1e-9)
        h = m.half_life(x)
        assert h[0] == pytest.approx(c["half_life_days"], abs=1e-6)
        assert recall(h, np.array([c["delta_days"]]))[0] == pytest.approx(c["p"], abs=1e-6)
        assert next_interval_days(h, c["target_retention"])[0] == pytest.approx(
            c["next_interval_days"], abs=1e-6
        )


def test_health_reports_the_model_version():
    r = client.get("/api/py/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "model_version": Model.load().version}


def test_model_metadata():
    body = client.get("/api/py/model").json()
    assert body["features"][0] == "bias"
    assert len(body["theta"]) == len(body["features"])
    assert "log_loss" in body["metrics"]["all"]


def test_predict_matches_the_fixtures():
    cases = FIXTURES["cases"]
    r = client.post(
        "/api/py/predict",
        json={
            "items": [{"card_id": str(i), "features": _features(c)} for i, c in enumerate(cases)]
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["model_version"] == Model.load().version
    for item, c in zip(body["items"], cases, strict=True):
        assert item["p"] == pytest.approx(c["p"], abs=1e-6)
        assert item["half_life_days"] == pytest.approx(c["half_life_days"], abs=1e-6)
        assert list(item["features"].values()) == pytest.approx(c["features"], abs=1e-9)


def test_schedule_adds_the_interval_to_now():
    c = FIXTURES["cases"][2]
    r = client.post(
        "/api/py/schedule",
        json={
            "items": [{"card_id": "abc", "features": _features(c)}],
            "target_retention": c["target_retention"],
            "now": "2026-09-13T12:00:00Z",
        },
    )
    assert r.status_code == 200
    item = r.json()["items"][0]
    assert item["next_interval_days"] == pytest.approx(c["next_interval_days"], abs=1e-6)
    expected_seconds = c["next_interval_days"] * 86400
    from datetime import datetime

    due = datetime.fromisoformat(item["due_at"])
    now = datetime.fromisoformat("2026-09-13T12:00:00+00:00")
    assert (due - now).total_seconds() == pytest.approx(expected_seconds, abs=1e-3)


@pytest.mark.parametrize(
    "features",
    [
        {"seen": 1, "correct": 2, "delta_days": 1},  # correct > seen
        {"seen": -1, "correct": 0, "delta_days": 1},
        {"seen": 1, "correct": 1, "delta_days": -0.5},
        {"seen": 1, "correct": 1},  # delta missing
    ],
)
def test_bad_features_are_rejected(features):
    r = client.post("/api/py/predict", json={"items": [{"card_id": "x", "features": features}]})
    assert r.status_code == 422


def test_schedule_rejects_target_retention_outside_0_1():
    body = {
        "items": [{"card_id": "x", "features": {"seen": 1, "correct": 1, "delta_days": 1}}],
        "target_retention": 1.0,
        "now": "2026-09-13T12:00:00Z",
    }
    assert client.post("/api/py/schedule", json=body).status_code == 422


def test_empty_batch_is_rejected():
    assert client.post("/api/py/predict", json={"items": []}).status_code == 422


def test_card_terms_shift_the_half_life():
    m = Model.load()
    with_terms = Model(**{**m.__dict__, "card_terms": {"deck:hard": -1.0}})
    x = m.featurize(np.array([3.0]), np.array([3.0]), np.array([0.0]), np.array([0.0]))
    plain = with_terms.half_life(x)[0]
    assert with_terms.half_life(x, ["deck:hard"])[0] == pytest.approx(plain / 2)
    assert with_terms.half_life(x, ["deck:other"])[0] == plain
    assert with_terms.half_life(x, [None])[0] == plain
