"""Retrain on the app's own opted-in review logs and propose new weights.

    uv run python -m retrain --current ../model/weights.v1.json [--dry-run]

Reads DATABASE_URL. Pulls every review from users who have not opted out, with
no card text and ids hashed. Fine-tunes the global weights and learns per-card terms
starting from the current weights, scores the candidate and the current model
on a held-out slice, and writes model/weights.v<N+1>.json only if held-out
log-loss improves. Writes ml/runs/retrain-<date>/RETRAIN.md either way; the
workflow uses it as the pull request body.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg
import torch
import yaml
from sklearn.metrics import roc_auc_score

from evaluate import calibration
from export import fixtures, weights_payload
from features import featurize, half_life, recall
from train import HalfLifeRegression, Tensors, predict, slice_tensors, to_tensors

ML_DIR = Path(__file__).resolve().parent
MODEL_DIR = ML_DIR.parent / "model"
RUNS_DIR = ML_DIR / "runs"

PULL_SQL = """
select r.user_id, r.card_id, c.source_key, r.reviewed_at, r.delta_seconds, r.remembered,
       r.response_ms, r.seen_before, r.correct_before, r.scheduler,
       min(r.reviewed_at) over (partition by r.user_id, r.card_id) as first_seen_at
from reviews r
left join settings s on s.user_id = r.user_id
join cards c on c.id = r.card_id
where coalesce(s.share_logs, true)
order by r.reviewed_at
"""


def anonymise(value: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}:{value}".encode()).hexdigest()[:16]


def pull_logs(database_url: str) -> pd.DataFrame:
    """Reviews from users who have not opted out, ids hashed. Never card text."""
    salt = os.environ.get("RETRAIN_SALT", "halflife")
    with psycopg.connect(database_url) as conn:
        rows = conn.execute(PULL_SQL).fetchall()
    cols = [
        "user_id",
        "card_id",
        "source_key",
        "reviewed_at",
        "delta_seconds",
        "remembered",
        "response_ms",
        "seen_before",
        "correct_before",
        "scheduler",
        "first_seen_at",
    ]
    df = pd.DataFrame(rows, columns=cols)
    if df.empty:
        return df
    df["user"] = df["user_id"].map(lambda u: anonymise(u, salt))
    # Cards copied from a starter deck share their source key; private cards get a hashed id.
    df["card_key"] = np.where(
        df["source_key"].notna(),
        df["source_key"],
        df["card_id"].map(lambda c: "card:" + anonymise(c, salt)),
    )
    return df.drop(columns=["user_id", "card_id", "source_key"])


def to_frame(df: pd.DataFrame) -> pd.DataFrame:
    """The shape train.to_tensors expects, from app logs. Spaced reviews only."""
    spaced = df[df["seen_before"] > 0].copy()
    reviewed = pd.to_datetime(spaced["reviewed_at"], utc=True)
    first = pd.to_datetime(spaced["first_seen_at"], utc=True)
    return pd.DataFrame(
        {
            "history_seen": spaced["seen_before"].astype(int).to_numpy(),
            "history_correct": spaced["correct_before"].astype(int).to_numpy(),
            "delta": spaced["delta_seconds"].fillna(0).astype(float).to_numpy(),
            "p_recall": spaced["remembered"].astype(float).to_numpy(),
            "session_seen": 1,
            "days_since_first": ((reviewed - first).dt.total_seconds() / 86400)
            .clip(lower=0)
            .to_numpy(),
            "response_ms": spaced["response_ms"].fillna(0).astype(float).to_numpy(),
            "lexeme_id": pd.Categorical(spaced["card_key"]),
            "user": spaced["user"].to_numpy(),
            "reviewed_at": reviewed.to_numpy(),
            "scheduler": spaced["scheduler"].to_numpy(),
        }
    )


def split(df: pd.DataFrame, cfg: dict) -> tuple[np.ndarray, str]:
    """Held out by user when there are enough users; otherwise each user's latest reviews."""
    rng = np.random.default_rng(cfg["seed"])
    users = df["user"].unique()
    if len(users) >= cfg["min_users_for_user_split"]:
        held = set(
            rng.choice(users, size=max(1, int(len(users) * cfg["holdout_fraction"])), replace=False)
        )
        return df["user"].isin(held).to_numpy(), "user"
    test = np.zeros(len(df), dtype=bool)
    for user in users:
        idx = np.flatnonzero(df["user"].to_numpy() == user)
        order = idx[np.argsort(df["reviewed_at"].to_numpy()[idx])]
        cut = int(len(order) * (1 - cfg["holdout_fraction"]))
        test[order[cut:]] = True
    return test, "time"


def score(p: np.ndarray, y: np.ndarray) -> dict:
    p = np.clip(p, 1e-4, 1 - 1e-4)
    out = {
        "rows": int(len(y)),
        "log_loss": float(np.mean(-(y * np.log(p) + (1 - y) * np.log(1 - p)))),
        "mae_p": float(np.mean(np.abs(y - p))),
        "auc": float(roc_auc_score(y, p)) if 0 < y.mean() < 1 else float("nan"),
    }
    out["calibration"] = calibration(y, p, np.ones(len(y))).to_dict(orient="records")
    return out


def current_predictions(current: dict, frame: pd.DataFrame) -> np.ndarray:
    x = featurize(
        frame["history_seen"].to_numpy(),
        frame["history_correct"].to_numpy(),
        frame["days_since_first"].to_numpy(),
        frame["response_ms"].to_numpy(),
        names=current["features"],
    )
    terms = np.array(
        [current.get("card_terms", {}).get(k, 0.0) for k in frame["lexeme_id"].astype(str)]
    )
    h = half_life(x @ np.asarray(current["theta"]) + terms)
    return recall(h, frame["delta"].to_numpy() / 86400)


def fit(model: HalfLifeRegression, theta0: torch.Tensor, train: Tensors, cfg: dict, log) -> None:
    torch.manual_seed(cfg["seed"])
    opt = torch.optim.Adam(model.parameters(), lr=cfg["learning_rate"])
    n = len(train.p)
    for epoch in range(cfg["epochs"]):
        perm = torch.randperm(n)
        total = 0.0
        for start in range(0, n, cfg["batch_size"]):
            batch = slice_tensors(train, perm[start : start + cfg["batch_size"]])
            opt.zero_grad()
            p_hat, _ = model(batch.x, batch.lex, batch.delta)
            nll = -(batch.p * torch.log(p_hat) + (1 - batch.p) * torch.log(1 - p_hat)).mean()
            loss = nll + cfg["prior_l2"] * ((model.theta - theta0) ** 2).sum()
            loss = loss + cfg["card_l2"] * (model.lexeme.weight**2).sum()
            loss.backward()
            opt.step()
            total += loss.item() * len(batch.p)
        if epoch % 10 == 9 or epoch == cfg["epochs"] - 1:
            log(f"epoch {epoch + 1}/{cfg['epochs']} loss {total / n:.4f}")


class CandidateRun:
    """What export.weights_payload needs from a run, without a run directory."""

    def __init__(
        self,
        run_dir: Path,
        features: list[str],
        theta: np.ndarray,
        card_terms: dict[str, float],
        config: dict,
    ):
        self.run_dir = run_dir
        self.features = features
        self.theta = theta
        self.card_terms = card_terms
        self.config = config


def write_report(path: Path, ctx: dict) -> None:
    c, cur, cand = ctx, ctx["current_metrics"], ctx["candidate_metrics"]
    lines = [
        f"# Retrain {c['date']}",
        "",
        f"Opted-in reviews pulled: {c['pulled']:,} from {c['users']} users; "
        f"{c['spaced']:,} spaced reviews used.",
        f"Split: {c['split']} ({c['train_rows']:,} train, {c['test_rows']:,} held out). "
        f"Seed {c['seed']}.",
        "",
        "| model | held-out log-loss | mae_p | auc |",
        "|---|---:|---:|---:|",
        f"| current v{c['current_version']} | {cur['log_loss']:.4f} | {cur['mae_p']:.4f} "
        f"| {cur['auc']:.4f} |",
        f"| candidate v{c['candidate_version']} | {cand['log_loss']:.4f} | {cand['mae_p']:.4f} "
        f"| {cand['auc']:.4f} |",
        "",
        f"**{'Promoted' if c['promoted'] else 'Not promoted'}.** {c['reason']}",
        "",
        "| feature | current | candidate |",
        "|---|---:|---:|",
        *[
            f"| {f} | {a:.4f} | {b:.4f} |"
            for f, a, b in zip(c["features"], c["theta_current"], c["theta_candidate"], strict=True)
        ],
        "",
        f"Per-card terms learned: {c['card_terms']:,}.",
        "",
        "Retention on spaced reviews by the scheduler that set the date (information, not a gate):",
        "",
        "| scheduler | reviews | retention |",
        "|---|---:|---:|",
        *[
            f"| {k} | {v['reviews']:,} | {v['retention']:.3f} |"
            for k, v in c["by_scheduler"].items()
        ],
        "",
    ]
    path.write_text("\n".join(lines))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--current", type=Path, required=True, help="the shipped weights file")
    parser.add_argument("--config", type=Path, default=ML_DIR / "configs" / "retrain.yaml")
    parser.add_argument("--dry-run", action="store_true", help="evaluate but never write weights")
    parser.add_argument(
        "--logs", type=Path, default=None, help="parquet of pulled logs instead of the database"
    )
    parser.add_argument("--runs-dir", type=Path, default=RUNS_DIR)
    parser.add_argument("--model-dir", type=Path, default=MODEL_DIR)
    args = parser.parse_args(argv)
    cfg = yaml.safe_load(args.config.read_text())
    current = json.loads(args.current.read_text())
    date = time.strftime("%Y-%m-%d")
    run_dir = args.runs_dir / f"retrain-{date}"
    run_dir.mkdir(parents=True, exist_ok=True)

    def log(msg: str) -> None:
        print(msg, file=sys.stderr, flush=True)

    def finish(promoted: bool, reason: str, extra: dict | None = None) -> int:
        summary = {"promoted": promoted, "reason": reason, **(extra or {})}
        (run_dir / "summary.json").write_text(json.dumps(summary, indent=2, default=str))
        if out := os.environ.get("GITHUB_OUTPUT"):
            with open(out, "a") as fh:
                fh.write(f"promoted={'true' if promoted else 'false'}\nreason={reason}\n")
                fh.write(f"spaced_reviews={summary.get('spaced_reviews', 0)}\n")
        log(f"{'promoted' if promoted else 'not promoted'}: {reason}")
        return 0

    if args.logs:
        logs = pd.read_parquet(args.logs)
    else:
        url = os.environ.get("DATABASE_URL")
        if not url:
            log("DATABASE_URL is not set")
            return 2
        logs = pull_logs(url)
        logs.to_parquet(ML_DIR / "data" / f"app_reviews_{date}.parquet", index=False)
    frame = to_frame(logs) if not logs.empty else pd.DataFrame()
    users = int(logs["user"].nunique()) if not logs.empty else 0
    if len(frame) < cfg["min_rows"]:
        (run_dir / "RETRAIN.md").write_text(
            f"# Retrain {date}\n\nNot enough data: {len(frame):,} spaced reviews "
            f"from {users} opted-in users, "
            f"{cfg['min_rows']:,} needed. Nothing changed.\n"
        )
        return finish(
            False,
            f"{len(frame)} spaced reviews, {cfg['min_rows']} needed",
            {"spaced_reviews": int(len(frame))},
        )

    test, split_kind = split(frame, cfg)
    train_df, test_df = frame[~test], frame[test]
    log(
        f"{len(frame):,} spaced reviews, split by {split_kind}: "
        f"{len(train_df):,} train, {len(test_df):,} held out"
    )

    theta0 = torch.tensor([float(v) for v in current["theta"]], dtype=torch.float32)
    keys = list(frame["lexeme_id"].cat.categories)
    model = HalfLifeRegression(len(cfg["features"]), len(keys))
    with torch.no_grad():
        model.theta.copy_(theta0)
        for i, k in enumerate(keys):
            model.lexeme.weight[i, 0] = float(current.get("card_terms", {}).get(k, 0.0))
    fit(model, theta0, to_tensors(train_df, cfg["features"], True), cfg, log)

    p_cand, _ = predict(model, to_tensors(test_df, cfg["features"], True))
    p_cur = current_predictions(current, test_df)
    y = test_df["p_recall"].to_numpy()
    cand_metrics, cur_metrics = score(p_cand, y), score(p_cur, y)
    promoted = cand_metrics["log_loss"] < cur_metrics["log_loss"] and not args.dry_run
    reason = (
        f"held-out log-loss {cand_metrics['log_loss']:.4f} against "
        f"{cur_metrics['log_loss']:.4f} for the current model"
        + (" (dry run)" if args.dry_run else "")
    )

    by_scheduler = {}
    for name in ("classic", "halflife"):
        rows = frame[frame["scheduler"] == name]
        by_scheduler[name] = {
            "reviews": int(len(rows)),
            "retention": float(rows["p_recall"].mean()) if len(rows) else float("nan"),
        }

    learned = model.lexeme.weight.detach()
    card_terms = {k: float(learned[i, 0]) for i, k in enumerate(keys)}
    card_terms = {k: v for k, v in card_terms.items() if abs(v) > 1e-6}
    candidate_version = int(current["version"]) + 1
    ctx = {
        "date": date,
        "pulled": int(len(logs)),
        "users": users,
        "spaced": int(len(frame)),
        "split": split_kind,
        "train_rows": int(len(train_df)),
        "test_rows": int(len(test_df)),
        "seed": cfg["seed"],
        "current_version": current["version"],
        "candidate_version": candidate_version,
        "current_metrics": cur_metrics,
        "candidate_metrics": cand_metrics,
        "promoted": promoted,
        "reason": reason,
        "features": cfg["features"],
        "theta_current": [float(v) for v in current["theta"]],
        "theta_candidate": model.theta.detach().tolist(),
        "card_terms": len(card_terms),
        "by_scheduler": by_scheduler,
    }
    write_report(run_dir / "RETRAIN.md", ctx)
    (run_dir / "metrics.json").write_text(
        json.dumps(
            {
                "all": {"hlr": cand_metrics},
                "current": cur_metrics,
                "rows": len(frame),
                "split": ctx["split"],
            },
            indent=2,
        )
    )
    (run_dir / "config.yaml").write_text(yaml.safe_dump(cfg, sort_keys=False))

    if promoted:
        run = CandidateRun(
            run_dir,
            cfg["features"],
            model.theta.detach().numpy().astype(np.float64),
            card_terms,
            cfg,
        )
        payload = weights_payload(run, candidate_version)
        payload["source"] = (
            f"Halflife opted-in review logs, {len(frame):,} spaced reviews, "
            f"fine-tuned from v{current['version']}"
        )
        payload["metrics"] = {"held_out": cand_metrics, "current_model_on_same_split": cur_metrics}
        args.model_dir.mkdir(parents=True, exist_ok=True)
        (args.model_dir / f"weights.v{candidate_version}.json").write_text(
            json.dumps(payload, indent=2) + "\n"
        )
        (args.model_dir / "parity_fixtures.json").write_text(
            json.dumps(
                {"weights": f"weights.v{candidate_version}.json", "cases": fixtures(run)}, indent=2
            )
            + "\n"
        )
        if url := os.environ.get("DATABASE_URL"):
            with psycopg.connect(url) as conn:
                conn.execute(
                    "insert into model_versions "
                    "(version, trained_at, data_rows, metrics, weights_sha) "
                    "values (%s, now(), %s, %s, %s) "
                    "on conflict (version) do update set metrics = excluded.metrics",
                    (
                        candidate_version,
                        len(frame),
                        json.dumps(payload["metrics"]),
                        payload["weights_sha256"],
                    ),
                )
    return finish(
        promoted,
        reason,
        {"candidate_version": candidate_version, "spaced_reviews": int(len(frame))},
    )


if __name__ == "__main__":
    sys.exit(main())
