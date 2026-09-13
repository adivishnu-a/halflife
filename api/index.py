"""FastAPI service for the Halflife scheduler, deployed as a Vercel Python function.

Next.js rewrites /api/py/* to this function. The TypeScript scheduler in
lib/scheduler/hlr.ts computes the same numbers if this function is slow or
down, and the parity test keeps the two in step.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated

import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field, model_validator

from api._inference import Model, next_interval_days, recall

MODEL = Model.load()
MAX_ITEMS = 1000

app = FastAPI(
    title="Halflife scheduler",
    version=str(MODEL.version),
    docs_url="/api/py/docs",
    openapi_url="/api/py/openapi.json",
)


class CardFeatures(BaseModel):
    """The raw history of one card for one learner. The service does the featurizing."""

    seen: Annotated[int, Field(ge=0, description="reviews before this one")]
    correct: Annotated[int, Field(ge=0, description="of those, remembered")]
    delta_days: Annotated[float, Field(ge=0, description="days since the last review")]
    days_since_first: Annotated[float, Field(ge=0)] = 0.0
    response_ms: Annotated[float, Field(ge=0)] = 0.0

    @model_validator(mode="after")
    def correct_within_seen(self) -> CardFeatures:
        if self.correct > self.seen:
            raise ValueError("correct cannot exceed seen")
        return self


class Item(BaseModel):
    card_id: str
    features: CardFeatures


class PredictRequest(BaseModel):
    items: Annotated[list[Item], Field(min_length=1, max_length=MAX_ITEMS)]


class Prediction(BaseModel):
    card_id: str
    p: float
    half_life_days: float
    features: dict[str, float]


class PredictResponse(BaseModel):
    model_version: int
    items: list[Prediction]


class ScheduleRequest(PredictRequest):
    target_retention: Annotated[float, Field(gt=0, lt=1)]
    now: datetime


class Scheduled(Prediction):
    next_interval_days: float
    due_at: datetime


class ScheduleResponse(BaseModel):
    model_version: int
    target_retention: float
    items: list[Scheduled]


def _predict(items: list[Item]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    f = [i.features for i in items]
    x = MODEL.featurize(
        np.array([c.seen for c in f], dtype=np.float64),
        np.array([c.correct for c in f], dtype=np.float64),
        np.array([c.days_since_first for c in f], dtype=np.float64),
        np.array([c.response_ms for c in f], dtype=np.float64),
    )
    h = MODEL.half_life(x)
    p = recall(h, np.array([c.delta_days for c in f], dtype=np.float64))
    return x, h, p


@app.get("/api/py/health")
def health() -> dict:
    return {"status": "ok", "model_version": MODEL.version}


@app.get("/api/py/model")
def model() -> dict:
    return {
        "version": MODEL.version,
        "trained_at": MODEL.trained_at,
        "features": list(MODEL.features),
        "theta": MODEL.theta.tolist(),
        "data_rows": MODEL.data_rows,
        "metrics": MODEL.metrics,
        "weights_sha256": MODEL.weights_sha256,
    }


@app.post("/api/py/predict")
def predict(req: PredictRequest) -> PredictResponse:
    x, h, p = _predict(req.items)
    return PredictResponse(
        model_version=MODEL.version,
        items=[
            Prediction(
                card_id=item.card_id,
                p=float(p[i]),
                half_life_days=float(h[i]),
                features=dict(zip(MODEL.features, x[i].tolist(), strict=True)),
            )
            for i, item in enumerate(req.items)
        ],
    )


@app.post("/api/py/schedule")
def schedule(req: ScheduleRequest) -> ScheduleResponse:
    x, h, p = _predict(req.items)
    gap = next_interval_days(h, req.target_retention)
    return ScheduleResponse(
        model_version=MODEL.version,
        target_retention=req.target_retention,
        items=[
            Scheduled(
                card_id=item.card_id,
                p=float(p[i]),
                half_life_days=float(h[i]),
                features=dict(zip(MODEL.features, x[i].tolist(), strict=True)),
                next_interval_days=float(gap[i]),
                due_at=req.now + timedelta(days=float(gap[i])),
            )
            for i, item in enumerate(req.items)
        ],
    )
