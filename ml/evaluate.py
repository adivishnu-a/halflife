"""Score schedulers on identical splits and write ml/REPORT.md.

Metrics, all on the held-out rows:
- mae_p: mean |p - p_hat| per row, the paper's headline number.
- log_loss and auc: per trial. Each row is session_seen Bernoulli outcomes with
  session_correct successes, so a row counts as many trials as it contains.
- calibration: ten equal-width bins of p_hat, observed recall per trial.
- spearman_h: rank correlation of predicted half-life with the half-life the
  observed p implies. pearson_h is what the reference code reports as cor(h).

Run: `uv run python -m evaluate [--max-rows N] [--skip-lr]`
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import matplotlib
import numpy as np
import pandas as pd
from scipy.stats import pearsonr, spearmanr
from sklearn.metrics import roc_auc_score

from baselines import LogisticBaseline, expand_trials, leitner, sm2
from dataset import Split, delta_days, load_traces, split_by_user
from features import observed_half_life

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ML_DIR = Path(__file__).resolve().parent
REPORT_PATH = ML_DIR / "REPORT.md"
FIGURES_DIR = ML_DIR / "figures"
RUNS_DIR = ML_DIR / "runs"
MIN_PRIOR_REVIEWS = 3


def log_loss(p: np.ndarray, p_hat: np.ndarray, weights: np.ndarray) -> float:
    per_row = -(p * np.log(p_hat) + (1 - p) * np.log(1 - p_hat))
    return float(np.average(per_row, weights=weights))


def auc(p: np.ndarray, p_hat: np.ndarray, weights: np.ndarray) -> float:
    labels, w = expand_trials(p, weights)
    keep = w > 0
    return float(
        roc_auc_score(labels[keep], np.concatenate([p_hat, p_hat])[keep], sample_weight=w[keep])
    )


def calibration(
    p: np.ndarray, p_hat: np.ndarray, weights: np.ndarray, bins: int = 10
) -> pd.DataFrame:
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(p_hat, edges[1:-1]), 0, bins - 1)
    rows = []
    for b in range(bins):
        m = idx == b
        n = float(weights[m].sum())
        rows.append(
            {
                "bin": f"{edges[b]:.1f}-{edges[b + 1]:.1f}",
                "predicted": float(np.average(p_hat[m], weights=weights[m])) if n else np.nan,
                "observed": float(np.average(p[m], weights=weights[m])) if n else np.nan,
                "trials": int(n),
            }
        )
    return pd.DataFrame(rows)


def score(df: pd.DataFrame, p_hat: np.ndarray, h_hat: np.ndarray) -> dict[str, float]:
    p = df["p_recall"].to_numpy(dtype=np.float64)
    w = df["session_seen"].to_numpy(dtype=np.float64)
    h_obs = observed_half_life(p, delta_days(df))
    has_h = not np.all(np.isnan(h_hat))
    return {
        "rows": int(len(df)),
        "mae_p": float(np.mean(np.abs(p - p_hat))),
        "log_loss": log_loss(p, p_hat, w),
        "auc": auc(p, p_hat, w),
        "spearman_h": float(spearmanr(h_obs, h_hat).statistic) if has_h else float("nan"),
        "pearson_h": float(pearsonr(h_obs, h_hat).statistic) if has_h else float("nan"),
    }


def score_all(df: pd.DataFrame, predictions: dict[str, tuple[np.ndarray, np.ndarray]]) -> dict:
    """Metrics on the full held-out set and on rows with MIN_PRIOR_REVIEWS or more."""
    mature = (df["history_seen"] >= MIN_PRIOR_REVIEWS).to_numpy()
    out: dict[str, dict] = {"all": {}, "mature": {}, "calibration": {}}
    for name, (p_hat, h_hat) in predictions.items():
        out["all"][name] = score(df, p_hat, h_hat)
        out["mature"][name] = score(df[mature], p_hat[mature], h_hat[mature])
        out["calibration"][name] = calibration(
            df["p_recall"].to_numpy(dtype=np.float64),
            p_hat,
            df["session_seen"].to_numpy(dtype=np.float64),
        ).to_dict(orient="records")
    return out


def reference_split(df: pd.DataFrame) -> Split:
    """The MIT reference's split: first 90% of rows train, last 10% test, in file order."""
    cut = int(0.9 * len(df))
    test = np.zeros(len(df), dtype=bool)
    test[cut:] = True
    return Split(seed=-1, test_fraction=0.1, train=~test, test=test)


# ---------------------------------------------------------------- report


def markdown_table(rows: dict[str, dict], columns: list[str]) -> str:
    head = "| model | " + " | ".join(columns) + " |"
    sep = "|---|" + "|".join(["---:"] * len(columns)) + "|"
    body = []
    for name, m in rows.items():
        cells = [
            f"{m[c]:,}" if c == "rows" else ("n/a" if np.isnan(m[c]) else f"{m[c]:.4f}")
            for c in columns
        ]
        body.append(f"| {name} | " + " | ".join(cells) + " |")
    return "\n".join([head, sep, *body])


def plot_calibration(cal: dict[str, list[dict]], path: Path, title: str) -> None:
    fig, ax = plt.subplots(figsize=(5.5, 5))
    ax.plot([0, 1], [0, 1], color="#999", linewidth=1, linestyle="--", label="perfect")
    for name, rows in cal.items():
        d = pd.DataFrame(rows).dropna()
        ax.plot(d["predicted"], d["observed"], marker="o", label=name)
    ax.set_xlabel("predicted recall")
    ax.set_ylabel("observed recall")
    ax.set_title(title)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.legend(loc="upper left")
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=150)
    plt.close(fig)


def write_report(results: dict, path: Path = REPORT_PATH) -> None:
    columns = ["rows", "mae_p", "log_loss", "auc", "spearman_h", "pearson_h"]
    user = results["user_split"]
    ref = results["reference_split"]
    lines = [
        "# Halflife model report",
        "",
        f"Generated {results['generated_at']} by `ml/evaluate.py`. Every number here is",
        "reproducible with `uv run python -m evaluate` in `ml/`.",
        "",
        "## Data",
        "",
        "Duolingo learning traces, Settles and Meeder 2016, doi:10.7910/DVN/N8XJME, CC BY-NC 4.0.",
        f"{results['data']['rows']:,} rows, {results['data']['users']:,} users, "
        f"{results['data']['lexemes']:,} lexemes, {results['data']['days']:.1f} days.",
        "",
        "## Split",
        "",
        "Held out by user, not by row, so every model is scored on learners it never saw.",
        f"Seed {user['split']['seed']}, test fraction {user['split']['test_fraction']}: "
        f"{user['split']['train_users']:,} train users ({user['split']['train_rows']:,} rows), "
        f"{user['split']['test_users']:,} test users ({user['split']['test_rows']:,} rows).",
        "",
        "## Metrics",
        "",
        "`mae_p` is per row, the paper's headline. `log_loss` and `auc` are per trial: a row with",
        "`session_seen` attempts counts that many times. `spearman_h` and `pearson_h` correlate",
        "the predicted half-life with the half-life implied by the observed recall.",
        "",
        "### Held-out users, all rows",
        "",
        markdown_table(user["all"], columns),
        "",
        f"### Held-out users, rows with at least {MIN_PRIOR_REVIEWS} prior reviews",
        "",
        "Where scheduling actually matters.",
        "",
        markdown_table(user["mature"], columns),
        "",
        "### Calibration on held-out users",
        "",
        "![calibration](figures/calibration_user_split.png)",
        "",
    ]
    for name, rows in user["calibration"].items():
        d = pd.DataFrame(rows)
        lines += [f"**{name}**", "", d.to_markdown(index=False, floatfmt=".3f"), ""]
    lines += [
        "## Check against the reference implementation",
        "",
        "The MIT reference splits the first 90% of rows from the last 10% in file order.",
        "Scores on that split, for comparison with the paper's Table 2 (Leitner: MAE 0.235,",
        "AUC 0.542, cor(h) 0.193; LR: MAE 0.211, AUC 0.514). The reference's cor(h) is Pearson.",
        "",
        markdown_table(ref["all"], columns),
        "",
        "## Notes",
        "",
        "- Leitner reads 2^(correct - wrong) days as the half-life, as in the paper.",
        "- SM-2 is Anki's variant with binary grades, replayed per user-lexeme in time order.",
        "  Its scheduled interval is read as the half-life. Pre-window history is seeded from",
        "  counts with lapses first, the pessimistic order.",
        "- Logistic regression uses sqrt(1+correct), sqrt(1+wrong), log(1 + gap in days), a bias",
        "  and a lexeme one-hot, scikit-learn lbfgs with default L2 (C=1), fitted on trials.",
        "  It predicts no half-life, so its half-life correlations are not applicable.",
        "",
    ]
    path.write_text("\n".join(lines))


# ---------------------------------------------------------------- main


def run_baselines(
    df: pd.DataFrame, split: Split, n_lexemes: int, skip_lr: bool, log
) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    test = df[split.test]
    preds = {}
    t0 = time.time()
    preds["leitner"] = leitner(test)
    log(f"leitner done in {time.time() - t0:.0f}s")
    t0 = time.time()
    p, h = sm2(df)
    preds["sm2"] = (p[split.test], h[split.test])
    log(f"sm2 done in {time.time() - t0:.0f}s")
    if not skip_lr:
        t0 = time.time()
        model = LogisticBaseline(n_lexemes).fit(df[split.train])
        preds["logistic"] = model.predict(test)
        log(f"logistic done in {time.time() - t0:.0f}s, iterations {model.model.n_iter_}")
    return preds


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-rows", type=int, default=None, help="subsample for a quick run")
    parser.add_argument("--skip-lr", action="store_true")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args(argv)

    def log(msg: str) -> None:
        print(msg, file=sys.stderr, flush=True)

    df = load_traces()
    if args.max_rows:
        df = df.iloc[: args.max_rows].copy()
        for col in ("user_id", "lexeme_id"):
            df[col] = df[col].cat.remove_unused_categories()
    n_lexemes = len(df["lexeme_id"].cat.categories)
    log(f"loaded {len(df):,} rows")

    results = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M"),
        "data": {
            "rows": int(len(df)),
            "users": int(df["user_id"].nunique()),
            "lexemes": n_lexemes,
            "days": float((df["timestamp"].max() - df["timestamp"].min()) / 86400),
        },
    }

    user_split = split_by_user(df, seed=args.seed)
    preds = run_baselines(df, user_split, n_lexemes, args.skip_lr, log)
    results["user_split"] = {
        "split": user_split.describe(df),
        **score_all(df[user_split.test], preds),
    }
    plot_calibration(
        results["user_split"]["calibration"],
        FIGURES_DIR / "calibration_user_split.png",
        "Calibration, held-out users",
    )

    ref = reference_split(df)
    ref_preds = run_baselines(df, ref, n_lexemes, args.skip_lr, log)
    results["reference_split"] = {"split": ref.describe(df), **score_all(df[ref.test], ref_preds)}

    RUNS_DIR.mkdir(exist_ok=True)
    (RUNS_DIR / "baselines.json").write_text(json.dumps(results, indent=2))
    write_report(results)
    log(f"wrote {REPORT_PATH}")
    print(
        markdown_table(
            results["user_split"]["all"], ["rows", "mae_p", "log_loss", "auc", "spearman_h"]
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
