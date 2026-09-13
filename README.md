# Halflife

A spaced-repetition study tool whose review scheduler is a trained model. It
predicts the half-life of each memory and schedules the next review for the
moment predicted recall drops to your target.

The model is half-life regression (Settles and Meeder, ACL 2016), trained on the
13 million Duolingo learning traces and retrained on the app's own opt-in logs.

Status: the model is trained and exported, the service is written. The app comes next.

## Layout

```
app/             Next.js 16 App Router, TypeScript, Tailwind v4
ml/              training pipeline: download, features, baselines, train, evaluate, export
model/           the shipped weights, versioned JSON, plus the parity fixtures
api/             FastAPI service, NumPy inference, deployed as a Vercel Python function
lib/scheduler/   TypeScript schedulers: hlr.ts reads the weights, sm2.ts is Classic
content/         starter decks
```

## The service

`api/index.py` serves `/api/py/predict`, `/api/py/schedule`, `/api/py/model` and
`/api/py/health`. It loads the newest `model/weights.v<N>.json` at import time
and computes in NumPy. Vercel builds it as a Python function; `api/_inference.py`
starts with an underscore so Vercel does not build it as a second function. Run
it locally from the repo root with the ml environment:

```
ml/.venv/bin/uvicorn api.index:app --port 8000
```

Its tests live in `ml/tests/test_api.py` and run with the rest of the Python suite.

## How to train

Needs Python 3.12 and [uv](https://docs.astral.sh/uv/). Everything runs in `ml/`.

```
cd ml
uv sync
uv run python -m data.download          # 379 MB from Harvard Dataverse, checksum verified
uv run python -m train configs/hlr_v1.yaml --name v1
uv run python -m evaluate --hlr runs/v1  # writes ml/REPORT.md and the figures
uv run python -m export runs/v1 --version 1
```

`ml/REPORT.md` has every number: Leitner, SM-2, logistic regression and half-life
regression on the same held-out-by-user split, calibration, and a workload
simulation. The config records the seed.

## Parity

The Python function, the training code and the TypeScript fallback must agree. `ml/export.py`
writes `model/parity_fixtures.json` from the shipped weights, and
`ml/tests/test_export.py`, `ml/tests/test_api.py` and `lib/scheduler/hlr.test.ts` assert the same
half-life, recall and next interval to six decimal places. CI runs both.

```
npm install
npm run typecheck
npm run lint
npm test
```

## Run the app locally

```
ml/.venv/bin/uvicorn api.index:app --port 8000   # the Python function
npm run dev                                       # Next.js, rewrites /api/py/* to port 8000
```

## Attribution

Training data: Settles, B. and Meeder, B. (2016). A Trainable Spaced Repetition
Model for Language Learning. ACL 2016. Data: https://doi.org/10.7910/DVN/N8XJME,
CC BY-NC 4.0. This project is non-commercial.
