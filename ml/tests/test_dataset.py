import numpy as np
import pandas as pd

from dataset import split_by_user


def _frame(n_users: int = 200, rows_per_user: int = 5) -> pd.DataFrame:
    users = np.repeat([f"u:{i}" for i in range(n_users)], rows_per_user)
    return pd.DataFrame({"user_id": pd.Categorical(users), "delta": 86400})


def test_users_are_disjoint_between_splits():
    df = _frame()
    s = split_by_user(df, seed=42, test_fraction=0.1)
    assert not np.any(s.train & s.test)
    assert np.all(s.train | s.test)
    train_users = set(df.loc[s.train, "user_id"])
    test_users = set(df.loc[s.test, "user_id"])
    assert train_users.isdisjoint(test_users)
    assert len(test_users) > 0


def test_split_is_deterministic_for_a_seed():
    df = _frame()
    a = split_by_user(df, seed=42)
    b = split_by_user(df, seed=42)
    c = split_by_user(df, seed=7)
    assert np.array_equal(a.test, b.test)
    assert not np.array_equal(a.test, c.test)


def test_all_rows_of_a_user_land_on_the_same_side():
    df = _frame()
    s = split_by_user(df)
    per_user = pd.Series(s.test).groupby(df["user_id"].to_numpy()).nunique()
    assert (per_user == 1).all()
