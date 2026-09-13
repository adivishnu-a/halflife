# Halflife

A spaced-repetition study tool whose review scheduler is a trained model. It
predicts the half-life of each memory and schedules the next review for the
moment predicted recall drops to your target.

The model is half-life regression (Settles and Meeder, ACL 2016), trained on the
13 million Duolingo learning traces and retrained on the app's own opt-in logs.

Status: the model is trained and exported. The app comes next.

## Layout

```
ml/              training pipeline: download, features, baselines, train, evaluate, export
model/           the shipped weights, versioned JSON, plus the parity fixtures
lib/scheduler/   TypeScript schedulers: hlr.ts reads the weights, sm2.ts is Classic
content/         starter decks
```

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

The Python function and the TypeScript fallback must agree. `ml/export.py`
writes `model/parity_fixtures.json` from the shipped weights, and both
`ml/tests/test_export.py` and `lib/scheduler/hlr.test.ts` assert the same
half-life, recall and next interval to six decimal places. CI runs both.

```
npm install
npm run typecheck
npm test
```

## Attribution

Training data: Settles, B. and Meeder, B. (2016). A Trainable Spaced Repetition
Model for Language Learning. ACL 2016. Data: https://doi.org/10.7910/DVN/N8XJME,
CC BY-NC 4.0. This project is non-commercial.
