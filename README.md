# Halflife

A spaced-repetition study tool whose review scheduler is a trained model. It
predicts the half-life of each memory and schedules the next review for the
moment predicted recall drops to your target.

The model is half-life regression (Settles and Meeder, ACL 2016), trained on the
13 million Duolingo learning traces and retrained on the app's own opt-in logs.

Status: milestone 1, data and baselines. Nothing to run yet.

## Layout

```
ml/        training pipeline: download, features, baselines, train, evaluate, export
model/     the shipped weights, versioned JSON
content/   starter decks
```

## Attribution

Training data: Settles, B. and Meeder, B. (2016). A Trainable Spaced Repetition
Model for Language Learning. ACL 2016. Data: https://doi.org/10.7910/DVN/N8XJME,
CC BY-NC 4.0. This project is non-commercial.
