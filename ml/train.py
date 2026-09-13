"""Train half-life regression in PyTorch from a YAML config.

    h = 2 ** (theta . x + w[lexeme])
    p = 2 ** (-delta / h)
    loss = (p - p_obs)^2 + hlwt * (h - h_obs)^2 + l2 * |theta|^2 + lexeme_l2 * |w|^2

The loss is the reference implementation's, per row and unweighted, so the
numbers are comparable. Optimisation is minibatch Adam instead of the
reference's one-pass SGD. Writes ml/runs/<timestamp>/ with config, metrics,
weights and the test-set predictions.

Run: `uv run python -m train configs/hlr_v1.yaml [--max-rows N]`
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import yaml
from torch import nn

from dataset import Split, delta_days, load_traces, split_by_user
from evaluate import reference_split, score_all
from features import MAX_HALF_LIFE, MIN_HALF_LIFE, clip_p, featurize, observed_half_life

RUNS_DIR = Path(__file__).resolve().parent / "runs"
LOG2_MIN_H = float(np.log2(MIN_HALF_LIFE))
LOG2_MAX_H = float(np.log2(MAX_HALF_LIFE))


class HalfLifeRegression(nn.Module):
    def __init__(self, n_features: int, n_lexemes: int):
        super().__init__()
        self.theta = nn.Parameter(torch.zeros(n_features))
        # One scalar per lexeme; zero rows for lexemes never seen in training.
        self.lexeme = nn.Embedding(n_lexemes, 1) if n_lexemes else None
        if self.lexeme is not None:
            nn.init.zeros_(self.lexeme.weight)

    def log2_half_life(self, x: torch.Tensor, lex: torch.Tensor | None) -> torch.Tensor:
        z = x @ self.theta
        if self.lexeme is not None and lex is not None:
            z = z + self.lexeme(lex).squeeze(-1)
        return z.clamp(LOG2_MIN_H, LOG2_MAX_H)

    def forward(
        self, x: torch.Tensor, lex: torch.Tensor | None, delta: torch.Tensor
    ) -> tuple[torch.Tensor, torch.Tensor]:
        h = torch.exp2(self.log2_half_life(x, lex))
        p = torch.exp2(-delta / h).clamp(1e-4, 1 - 1e-4)
        return p, h


@dataclass
class Tensors:
    x: torch.Tensor
    lex: torch.Tensor | None
    delta: torch.Tensor
    p: torch.Tensor
    h: torch.Tensor
    w: torch.Tensor


def to_tensors(df: pd.DataFrame, features: list[str], lexeme_term: bool) -> Tensors:
    x = featurize(df["history_seen"].to_numpy(), df["history_correct"].to_numpy(), names=features)
    delta = delta_days(df)
    p = clip_p(df["p_recall"].to_numpy(dtype=np.float64))
    return Tensors(
        x=torch.tensor(x, dtype=torch.float32),
        lex=torch.tensor(df["lexeme_id"].cat.codes.to_numpy(), dtype=torch.long)
        if lexeme_term
        else None,
        delta=torch.tensor(delta, dtype=torch.float32),
        p=torch.tensor(p, dtype=torch.float32),
        h=torch.tensor(observed_half_life(p, delta), dtype=torch.float32),
        w=torch.tensor(df["session_seen"].to_numpy(dtype=np.float64), dtype=torch.float32),
    )


def loss_fn(model: HalfLifeRegression, batch: Tensors, cfg: dict) -> torch.Tensor:
    p_hat, h_hat = model(batch.x, batch.lex, batch.delta)
    if cfg.get("objective", "mse") == "logloss":
        # Proper scoring rule per trial: each row is session_seen Bernoulli outcomes.
        nll = -(batch.p * torch.log(p_hat) + (1 - batch.p) * torch.log(1 - p_hat))
        loss = (nll * batch.w).sum() / batch.w.sum()
    else:
        loss = ((p_hat - batch.p) ** 2).mean()
    loss = loss + cfg["half_life_loss_weight"] * ((h_hat - batch.h) ** 2).mean()
    loss = loss + cfg["l2"] * (model.theta**2).sum()
    if model.lexeme is not None:
        loss = loss + cfg["lexeme_l2"] * (model.lexeme.weight**2).sum()
    return loss


def slice_tensors(t: Tensors, idx: torch.Tensor) -> Tensors:
    return Tensors(
        t.x[idx],
        t.lex[idx] if t.lex is not None else None,
        t.delta[idx],
        t.p[idx],
        t.h[idx],
        t.w[idx],
    )


def fit(model: HalfLifeRegression, train: Tensors, cfg: dict, log=print) -> None:
    torch.manual_seed(cfg["seed"])
    opt = torch.optim.Adam(model.parameters(), lr=cfg["learning_rate"])
    n = len(train.p)
    for epoch in range(cfg["epochs"]):
        perm = torch.randperm(n)
        total = 0.0
        t0 = time.time()
        for start in range(0, n, cfg["batch_size"]):
            batch = slice_tensors(train, perm[start : start + cfg["batch_size"]])
            opt.zero_grad()
            loss = loss_fn(model, batch, cfg)
            loss.backward()
            opt.step()
            total += loss.item() * len(batch.p)
        log(f"epoch {epoch + 1}/{cfg['epochs']} loss {total / n:.4f} ({time.time() - t0:.0f}s)")


@torch.no_grad()
def predict(
    model: HalfLifeRegression, t: Tensors, batch_size: int = 1 << 18
) -> tuple[np.ndarray, np.ndarray]:
    ps, hs = [], []
    for start in range(0, len(t.p), batch_size):
        b = slice_tensors(t, torch.arange(start, min(start + batch_size, len(t.p))))
        p, h = model(b.x, b.lex, b.delta)
        ps.append(p.numpy().astype(np.float64))
        hs.append(h.numpy().astype(np.float64))
    return np.concatenate(ps), np.concatenate(hs)


@torch.no_grad()
def canonical_predictions(model: HalfLifeRegression, features: list[str]) -> dict[str, float]:
    """Predicted half-life in days for a few card states, with no lexeme term. For sanity."""
    states = {
        "1 seen 1 right": (1, 1),
        "3 seen 3 right": (3, 3),
        "3 seen 1 right": (3, 1),
        "10 seen 9 right": (10, 9),
        "10 seen 5 right": (10, 5),
    }
    x = featurize([s for s, _ in states.values()], [c for _, c in states.values()], names=features)
    h = torch.exp2(model.log2_half_life(torch.tensor(x, dtype=torch.float32), None))
    return {k: round(float(v), 1) for k, v in zip(states, h, strict=True)}


def make_split(df: pd.DataFrame, cfg: dict) -> Split:
    if cfg["split"] == "reference":
        return reference_split(df)
    return split_by_user(df, seed=cfg["seed"], test_fraction=cfg["test_fraction"])


def save_run(
    run_dir: Path, cfg: dict, model: HalfLifeRegression, df: pd.DataFrame, metrics: dict
) -> None:
    run_dir.mkdir(parents=True)
    (run_dir / "config.yaml").write_text(yaml.safe_dump(cfg, sort_keys=False))
    (run_dir / "metrics.json").write_text(json.dumps(metrics, indent=2))
    weights = {
        "features": cfg["features"],
        "theta": model.theta.detach().tolist(),
    }
    (run_dir / "weights.json").write_text(json.dumps(weights, indent=2))
    if model.lexeme is not None:
        pd.DataFrame(
            {
                "lexeme_id": df["lexeme_id"].cat.categories,
                "weight": model.lexeme.weight.detach().squeeze(-1).numpy(),
            }
        ).to_parquet(run_dir / "lexeme_weights.parquet", index=False)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path)
    parser.add_argument("--max-rows", type=int, default=None)
    parser.add_argument("--name", default=None, help="run directory name, default timestamp")
    parser.add_argument("--set", action="append", default=[], help="override, e.g. epochs=2")
    args = parser.parse_args(argv)
    cfg = yaml.safe_load(args.config.read_text())
    for item in args.set:
        key, value = item.split("=", 1)
        cfg[key] = yaml.safe_load(value)

    def log(msg: str) -> None:
        print(msg, file=sys.stderr, flush=True)

    torch.manual_seed(cfg["seed"])
    np.random.seed(cfg["seed"])
    df = load_traces()
    if args.max_rows:
        df = df.iloc[: args.max_rows].copy()
        for col in ("user_id", "lexeme_id"):
            df[col] = df[col].cat.remove_unused_categories()
    split = make_split(df, cfg)
    log(f"{len(df):,} rows, split {cfg['split']}: {split.describe(df)}")

    train_mask = split.train
    if cfg.get("min_train_delta_days"):
        # Same-session repeats are not retention tests; optionally leave them out of training.
        train_mask = train_mask & (delta_days(df) >= cfg["min_train_delta_days"])
        log(f"training on {train_mask.sum():,} rows with gap >= {cfg['min_train_delta_days']} days")
    train = to_tensors(df[train_mask], cfg["features"], cfg["lexeme_term"])
    test = to_tensors(df[split.test], cfg["features"], cfg["lexeme_term"])
    n_lex = len(df["lexeme_id"].cat.categories) if cfg["lexeme_term"] else 0
    model = HalfLifeRegression(len(cfg["features"]), n_lex)
    t0 = time.time()
    fit(model, train, cfg, log)
    train_seconds = time.time() - t0

    p_hat, h_hat = predict(model, test)
    metrics = score_all(df[split.test], {"hlr": (p_hat, h_hat)})
    metrics["split"] = split.describe(df)
    metrics["train_seconds"] = train_seconds
    metrics["rows"] = int(len(df))
    log(f"test: {json.dumps(metrics['all']['hlr'])}")
    log(f"theta: {dict(zip(cfg['features'], model.theta.detach().tolist(), strict=True))}")
    log(f"canonical: {canonical_predictions(model, cfg['features'])}")

    run_dir = RUNS_DIR / (args.name or time.strftime("%Y%m%d-%H%M%S"))
    save_run(run_dir, cfg, model, df, metrics)
    log(f"saved {run_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
