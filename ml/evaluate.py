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
import yaml
from scipy.stats import pearsonr, spearmanr
from sklearn.metrics import roc_auc_score

from baselines import LogisticBaseline, expand_trials, leitner, sm2
from dataset import Split, delta_days, load_traces, split_by_user
from features import featurize, half_life, observed_half_life, recall
from simulate import (
    N_CARDS,
    N_DAYS,
    TARGET_RETENTION,
    leitner_scheduler,
    make_hlr_scheduler,
    sm2_scheduler,
    tune,
)

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ML_DIR = Path(__file__).resolve().parent
REPORT_PATH = ML_DIR / "REPORT.md"
FIGURES_DIR = ML_DIR / "figures"
RUNS_DIR = ML_DIR / "runs"
MIN_PRIOR_REVIEWS = 3
MIN_SPACED_GAP_DAYS = 1.0


def log_loss(p: np.ndarray, p_hat: np.ndarray, weights: np.ndarray) -> float:
    per_row = -(p * np.log(p_hat) + (1 - p) * np.log(1 - p_hat))
    return float(np.average(per_row, weights=weights))


def auc(p: np.ndarray, p_hat: np.ndarray, weights: np.ndarray) -> float:
    labels, w = expand_trials(p, weights)
    keep = w > 0
    return float(
        roc_auc_score(labels[keep], np.concatenate([p_hat, p_hat])[keep], sample_weight=w[keep])
    )


def auc_paper(p: np.ndarray, p_hat: np.ndarray) -> float:
    """The paper's evaluation.r labels each row by rounding p_recall; no trial weighting."""
    return float(roc_auc_score(np.round(p), p_hat))


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
        "auc_paper": auc_paper(p, p_hat),
        "spearman_h": float(spearmanr(h_obs, h_hat).statistic) if has_h else float("nan"),
        "pearson_h": float(pearsonr(h_obs, h_hat).statistic) if has_h else float("nan"),
    }


def score_all(df: pd.DataFrame, predictions: dict[str, tuple[np.ndarray, np.ndarray]]) -> dict:
    """Metrics on all held-out rows, on rows with MIN_PRIOR_REVIEWS or more, and on
    spaced reviews with a gap of at least MIN_SPACED_GAP_DAYS."""
    mature = (df["history_seen"] >= MIN_PRIOR_REVIEWS).to_numpy()
    spaced = delta_days(df) >= MIN_SPACED_GAP_DAYS
    out: dict[str, dict] = {"all": {}, "mature": {}, "spaced": {}, "calibration": {}}
    for name, (p_hat, h_hat) in predictions.items():
        out["all"][name] = score(df, p_hat, h_hat)
        out["mature"][name] = score(df[mature], p_hat[mature], h_hat[mature])
        out["spaced"][name] = score(df[spaced], p_hat[spaced], h_hat[spaced])
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


# ---------------------------------------------------------------- trained model


class HlrRun:
    """A saved training run: dense weights plus per-lexeme weights, scored in NumPy."""

    def __init__(self, run_dir: Path):
        self.run_dir = run_dir
        self.config = yaml.safe_load((run_dir / "config.yaml").read_text())
        weights = json.loads((run_dir / "weights.json").read_text())
        self.features = weights["features"]
        self.theta = np.asarray(weights["theta"], dtype=np.float64)
        lex_path = run_dir / "lexeme_weights.parquet"
        self.lexeme = (
            pd.read_parquet(lex_path).set_index("lexeme_id")["weight"]
            if lex_path.exists()
            else None
        )
        self.card_terms: dict[str, float] = weights.get("card_terms", {})

    def predict(self, df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        x = featurize(
            df["history_seen"].to_numpy(), df["history_correct"].to_numpy(), names=self.features
        )
        z = x @ self.theta
        if self.lexeme is not None:
            z = z + self.lexeme.reindex(df["lexeme_id"].astype(str)).fillna(0.0).to_numpy()
        h = half_life(z)
        return recall(h, delta_days(df)), h

    def scheduler(self):
        """The app's cold-start scheduler: global weights only, no per-card term."""

        def predict_h(state) -> float:
            x = featurize([state.seen], [state.correct], names=self.features)
            return float(half_life(x @ self.theta)[0])

        return make_hlr_scheduler(predict_h)

    def canonical(self) -> dict[str, float]:
        states = {
            "1 seen, 1 right": (1, 1),
            "3 seen, 3 right": (3, 3),
            "3 seen, 1 right": (3, 1),
            "10 seen, 9 right": (10, 9),
            "10 seen, 5 right": (10, 5),
        }
        x = featurize(
            [s for s, _ in states.values()], [c for _, c in states.values()], names=self.features
        )
        return dict(zip(states, half_life(x @ self.theta).round(1), strict=True))


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


def run_simulation(hlr: HlrRun | None) -> dict[str, dict]:
    out = {}
    schedulers = [("leitner", leitner_scheduler, 0.01, 20.0), ("sm2", sm2_scheduler, 0.01, 20.0)]
    if hlr is not None:
        # The knob is the target retention; lo > hi flips the search direction.
        schedulers.append(("hlr", hlr.scheduler(), 0.9999, 0.5))
    for name, sched, lo, hi in schedulers:
        o = tune(sched, lo, hi)
        out[name] = {
            "reviews_per_day": o.reviews_per_day,
            "retention": o.retention,
            "knob": o.knob,
            "reviews_by_day": o.reviews_by_day.tolist(),
        }
    return out


def plot_workload(sim: dict[str, dict], path: Path) -> None:
    fig, (left, right) = plt.subplots(1, 2, figsize=(10, 4), gridspec_kw={"width_ratios": [1, 2]})
    names = list(sim)
    left.bar(names, [sim[n]["reviews_per_day"] for n in names], color="#4a6fa5")
    left.set_ylabel("reviews per day")
    left.set_title(f"cost of {TARGET_RETENTION:.0%} retention")
    for n in names:
        right.plot(np.arange(1, N_DAYS + 1), sim[n]["reviews_by_day"], label=n)
    right.set_xlabel("day")
    right.set_ylabel("reviews")
    right.set_title(f"daily workload, {N_CARDS:,} cards")
    right.legend()
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
        markdown_table(user["mature"], columns),
        "",
        f"### Held-out users, spaced reviews with a gap of at least {MIN_SPACED_GAP_DAYS:g} day",
        "",
        "Where scheduling actually matters. Half-life regression assumes perfect recall at a",
        "gap of zero, and 30% of the traces are same-session repeats with 8% failures that",
        "no forgetting curve can fit. This subset compares the models on real spaced reviews.",
        "",
        markdown_table(user["spaced"], columns),
        "",
        "### Calibration on held-out users",
        "",
        "![calibration](figures/calibration_user_split.png)",
        "",
    ]
    for name, rows in user["calibration"].items():
        d = pd.DataFrame(rows)
        lines += [f"**{name}**", "", d.to_markdown(index=False, floatfmt=".3f"), ""]
    if results.get("hlr"):
        hlr = results["hlr"]
        lines += [
            "## The trained model",
            "",
            f"Run `{hlr['run']}`: objective {hlr['config']['objective']}, half-life loss",
            f"weight {hlr['config']['half_life_loss_weight']}, {hlr['config']['epochs']} epochs,",
            f"seed {hlr['config']['seed']}.",
            "",
            "| feature | weight |",
            "|---|---:|",
            *[f"| {f} | {w:.4f} |" for f, w in zip(hlr["features"], hlr["theta"], strict=True)],
            "",
            "Predicted half-life in days for a few card states, global weights only, no",
            "per-lexeme term. This is what the app sees for a card nobody has reviewed yet.",
            "",
            "| card state | half-life (days) |",
            "|---|---:|",
            *[f"| {k} | {v:.1f} |" for k, v in hlr["canonical"].items()],
            "",
        ]
    if results.get("ablation"):
        lines += [
            "### Ablation on held-out users",
            "",
            "| run | objective | h loss wt | lexeme | mae_p | log_loss | auc | spearman_h |",
            "|---|---|---:|---|---:|---:|---:|---:|",
            *[
                f"| {a['run']} | {a['objective']} | {a['half_life_loss_weight']} | "
                f"{a['lexeme_term']} | {a['mae_p']:.4f} | {a['log_loss']:.4f} | "
                f"{a['auc']:.4f} | {a['spearman_h']:.4f} |"
                for a in results["ablation"]
            ],
            "",
        ]
    sim = results["simulation"]
    lines += [
        "## Workload simulation",
        "",
        f"A synthetic learner studies {N_CARDS:,} cards over {N_DAYS} days against a latent",
        "memory the schedulers never see (see `simulate.py` for the ground truth). Each",
        "scheduler gets one knob, tuned until realized retention is",
        f"{TARGET_RETENTION:.0%}: an interval multiplier for the fixed schedulers, the target",
        "retention for the model. The cost is reviews per day at that setting.",
        "",
        "![workload](figures/workload.png)",
        "",
        "| scheduler | knob | realized retention | reviews per day |",
        "|---|---:|---:|---:|",
        *[
            f"| {n} | {m['knob']:.3f} | {m['retention']:.3f} | {m['reviews_per_day']:.1f} |"
            for n, m in sim.items()
        ],
        "",
        "## Check against the reference implementation",
        "",
        "The MIT reference splits the first 90% of rows from the last 10% in file order.",
        "Scores on that split, for comparison with the paper's Table 2 (Leitner: MAE 0.235,",
        "AUC 0.542, cor(h) 0.193; LR: MAE 0.211, AUC 0.514). `auc_paper` labels each row by",
        "rounding p_recall, as the paper's `evaluation.r` does. On the first 1.3M rows the",
        "reference script and this code agree to three decimals on MAE, mean half-life error",
        "and Pearson cor(h), so the released code does not reproduce the paper's positive",
        "Leitner cor(h); this report uses the released code's numbers.",
        "",
        markdown_table(ref["all"], [*columns, "auc_paper"]),
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
    parser.add_argument("--hlr", type=Path, default=None, help="run dir of the model to report")
    parser.add_argument("--ablation", type=Path, nargs="*", default=[], help="extra run dirs")
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
    hlr = HlrRun(args.hlr) if args.hlr else None
    if hlr is not None:
        assert hlr.config["split"] == "user" and hlr.config["seed"] == args.seed, "split mismatch"
        preds["hlr"] = hlr.predict(df[user_split.test])
        results["hlr"] = {
            "run": args.hlr.name,
            "config": hlr.config,
            "features": hlr.features,
            "theta": hlr.theta.tolist(),
            "canonical": hlr.canonical(),
        }
        log("hlr scored")
    results["user_split"] = {
        "split": user_split.describe(df),
        **score_all(df[user_split.test], preds),
    }
    ablation = []
    for run_dir in [args.hlr, *args.ablation] if args.hlr else args.ablation:
        run = HlrRun(run_dir)
        m = score(df[user_split.test], *run.predict(df[user_split.test]))
        ablation.append(
            {
                "run": run_dir.name,
                "objective": run.config.get("objective", "mse"),
                "half_life_loss_weight": run.config["half_life_loss_weight"],
                "lexeme_term": run.config["lexeme_term"],
                **m,
            }
        )
    results["ablation"] = ablation
    plot_calibration(
        results["user_split"]["calibration"],
        FIGURES_DIR / "calibration_user_split.png",
        "Calibration, held-out users",
    )

    ref = reference_split(df)
    ref_preds = run_baselines(df, ref, n_lexemes, args.skip_lr, log)
    results["reference_split"] = {"split": ref.describe(df), **score_all(df[ref.test], ref_preds)}

    results["simulation"] = run_simulation(hlr)
    plot_workload(results["simulation"], FIGURES_DIR / "workload.png")
    log("simulation done")

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
