# Halflife

A spaced-repetition study tool whose review scheduler is a trained model. It
predicts the half-life of each memory and schedules the next review for the
moment predicted recall drops to your target.

The model is half-life regression (Settles and Meeder, ACL 2016), trained on the
13 million Duolingo learning traces and retrained on the app's own opt-in logs.

Live at https://halflifecards.vercel.app.

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

## How the model is promoted

`ml/retrain.py` pulls every review from users who have not opted out of sharing logs: the
counts seen and remembered, the gap, the response time, the outcome, a hashed
user id and the card's shared key. Never card text. It fine-tunes the global
weights from the shipped file, learns a per-card term for each card key, and
scores the candidate and the current model on a held-out slice: by user when
there are five or more opted-in users, otherwise each user's latest reviews.

`.github/workflows/retrain.yml` runs it on the first of every month, or by hand.
If held-out log-loss improves, the workflow writes `model/weights.v<N+1>.json`
and new parity fixtures, points `lib/scheduler/weights.ts` at the new file, runs
the parity tests, and opens a pull request whose body is the run's report. If
not, it only writes the report to the job summary. Nothing reaches production
without a merged pull request, and every promoted run's report is kept in
`ml/reports/`.

Classic (SM-2) is the default scheduler until a retrained model beats it on the
app's own reviews. That switch is a one-line change in a promotion pull request.

## Version 2

Version 1 looks only at counts. A sequence model, a small GRU over a card's last
16 reviews, could tell "wrong, right, right" from "right, right, wrong". It is
not built because there is nothing to train it on yet: the Duolingo window holds
a median of one review per learner-word. The monthly retrain job counts shared
spaced reviews and opens an issue when there are 50,000. The gates it must pass
are in `.github/version-2-issue.md`. Failing any of them is a result too, and
goes in the case study.

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

## Smoke tests

Playwright drives a real dev server against the database in `.env.local`, with the
Python function pointed at a dead port so every prediction goes through the
TypeScript fallback. Two flows from the brief plus an axe pass on every screen,
on a desktop and a phone viewport.

```
npx playwright install chromium
npm run e2e
```

## Run the app locally

```
ml/.venv/bin/uvicorn api.index:app --port 8000   # the Python function
npm run dev                                       # Next.js, rewrites /api/py/* to port 8000
```

## Attribution

Model and training data: Settles, B. and Meeder, B. (2016). A Trainable Spaced
Repetition Model for Language Learning. ACL 2016, pages 1848 to 1858.
Paper: https://doi.org/10.18653/v1/P16-1174. Data: https://doi.org/10.7910/DVN/N8XJME,
CC BY-NC 4.0. Reference code: https://github.com/duolingo/halflife-regression, MIT.
This project is non-commercial.
