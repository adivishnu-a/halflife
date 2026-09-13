# Halflife model report

Generated 2026-09-13 22:02 by `ml/evaluate.py`. Every number here is
reproducible with `uv run python -m evaluate` in `ml/`.

## Data

Duolingo learning traces, Settles and Meeder 2016, doi:10.7910/DVN/N8XJME, CC BY-NC 4.0.
300,000 rows, 7,254 users, 8,649 lexemes, 0.3 days.

## Split

Held out by user, not by row, so every model is scored on learners it never saw.
Seed 42, test fraction 0.1: 6,542 train users (269,956 rows), 712 test users (30,044 rows).

## Metrics

`mae_p` is per row, the paper's headline. `log_loss` and `auc` are per trial: a row with
`session_seen` attempts counts that many times. `spearman_h` and `pearson_h` correlate
the predicted half-life with the half-life implied by the observed recall.

### Held-out users, all rows

| model | rows | mae_p | log_loss | auc | spearman_h | pearson_h |
|---|---:|---:|---:|---:|---:|---:|
| leitner | 30,044 | 0.2107 | 0.8746 | 0.5417 | -0.1047 | -0.1034 |
| sm2 | 30,044 | 0.1822 | 0.7616 | 0.5426 | 0.0175 | -0.0050 |
| logistic | 30,044 | 0.1671 | 0.3125 | 0.5963 | 0.6267 | 0.3104 |

### Held-out users, rows with at least 3 prior reviews

Where scheduling actually matters.

| model | rows | mae_p | log_loss | auc | spearman_h | pearson_h |
|---|---:|---:|---:|---:|---:|---:|
| leitner | 26,284 | 0.1803 | 0.7805 | 0.5406 | -0.0584 | -0.0658 |
| sm2 | 26,284 | 0.1477 | 0.6430 | 0.5429 | 0.0877 | 0.0556 |
| logistic | 26,284 | 0.1662 | 0.3113 | 0.6002 | 0.6425 | 0.3268 |

### Calibration on held-out users

![calibration](figures/calibration_user_split.png)

**leitner**

| bin     |   predicted |   observed |   trials |
|:--------|------------:|-----------:|---------:|
| 0.0-0.1 |       0.022 |      0.859 |     3270 |
| 0.1-0.2 |       0.151 |      0.887 |      813 |
| 0.2-0.3 |       0.251 |      0.885 |      955 |
| 0.3-0.4 |       0.355 |      0.885 |      838 |
| 0.4-0.5 |       0.465 |      0.869 |     1127 |
| 0.5-0.6 |       0.549 |      0.900 |     1296 |
| 0.6-0.7 |       0.661 |      0.898 |     1533 |
| 0.7-0.8 |       0.747 |      0.913 |     2229 |
| 0.8-0.9 |       0.852 |      0.894 |     3299 |
| 0.9-1.0 |       0.989 |      0.910 |    38021 |

**sm2**

| bin     |   predicted |   observed |   trials |
|:--------|------------:|-----------:|---------:|
| 0.0-0.1 |       0.019 |      0.858 |     1845 |
| 0.1-0.2 |       0.146 |      0.893 |      854 |
| 0.2-0.3 |       0.250 |      0.872 |      593 |
| 0.3-0.4 |       0.358 |      0.888 |      534 |
| 0.4-0.5 |       0.458 |      0.895 |      847 |
| 0.5-0.6 |       0.542 |      0.869 |      777 |
| 0.6-0.7 |       0.655 |      0.894 |     1138 |
| 0.7-0.8 |       0.754 |      0.900 |     2019 |
| 0.8-0.9 |       0.864 |      0.892 |     3055 |
| 0.9-1.0 |       0.989 |      0.909 |    41719 |

**logistic**

| bin     |   predicted |   observed |   trials |
|:--------|------------:|-----------:|---------:|
| 0.0-0.1 |     nan     |    nan     |        0 |
| 0.1-0.2 |     nan     |    nan     |        0 |
| 0.2-0.3 |     nan     |    nan     |        0 |
| 0.3-0.4 |     nan     |    nan     |        0 |
| 0.4-0.5 |     nan     |    nan     |        0 |
| 0.5-0.6 |     nan     |    nan     |        0 |
| 0.6-0.7 |       0.693 |      1.000 |       13 |
| 0.7-0.8 |       0.779 |      0.833 |      442 |
| 0.8-0.9 |       0.876 |      0.876 |    21731 |
| 0.9-1.0 |       0.925 |      0.924 |    31195 |

## Check against the reference implementation

The MIT reference splits the first 90% of rows from the last 10% in file order.
Scores on that split, for comparison with the paper's Table 2 (Leitner: MAE 0.235,
AUC 0.542, cor(h) 0.193; LR: MAE 0.211, AUC 0.514). The reference's cor(h) is Pearson.

| model | rows | mae_p | log_loss | auc | spearman_h | pearson_h |
|---|---:|---:|---:|---:|---:|---:|
| leitner | 30,000 | 0.1955 | 0.8357 | 0.5431 | -0.1378 | -0.1593 |
| sm2 | 30,000 | 0.1696 | 0.7312 | 0.5509 | 0.0275 | -0.0073 |
| logistic | 30,000 | 0.1631 | 0.3089 | 0.5998 | 0.6452 | 0.3501 |

## Notes

- Leitner reads 2^(correct - wrong) days as the half-life, as in the paper.
- SM-2 is Anki's variant with binary grades, replayed per user-lexeme in time order.
  Its scheduled interval is read as the half-life. Pre-window history is seeded from
  counts with lapses first, the pessimistic order.
- Logistic regression uses sqrt(1+correct), sqrt(1+wrong), the gap in days, a bias and
  a lexeme one-hot, with scikit-learn's default L2 (C=1), fitted on trials.
