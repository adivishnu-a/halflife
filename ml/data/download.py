"""Fetch the Duolingo learning traces from Harvard Dataverse and verify the checksum.

Settles and Meeder (2016), doi:10.7910/DVN/N8XJME, CC BY-NC 4.0.
The file is never committed. Run: `uv run python -m data.download`.
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

import requests
from tqdm import tqdm

DOI = "doi:10.7910/DVN/N8XJME"
DATAVERSE = "https://dataverse.harvard.edu"
FILENAME = "settles.acl16.learning_traces.13m.csv.gz"
# Published by Dataverse for the file above, checked against the API on 2026-09-13.
EXPECTED_MD5 = "0a1cae5eb7ad4b0bd9c0de91d74fcced"
EXPECTED_SIZE = 379_004_009

# Dataverse returns 403 to the default python-requests user agent.
HEADERS = {"User-Agent": "halflife-ml/0.1 (+https://github.com/adivishnu-a/halflife)"}

DATA_DIR = Path(__file__).resolve().parent
RAW_PATH = DATA_DIR / FILENAME


def resolve_file_id() -> int:
    """Look up the numeric file id for FILENAME from the dataset's latest version."""
    url = f"{DATAVERSE}/api/datasets/:persistentId/"
    resp = requests.get(url, params={"persistentId": DOI}, headers=HEADERS, timeout=60)
    resp.raise_for_status()
    files = resp.json()["data"]["latestVersion"]["files"]
    for entry in files:
        data_file = entry["dataFile"]
        if data_file["filename"] == FILENAME:
            published = data_file["checksum"]["value"]
            if published != EXPECTED_MD5:
                raise RuntimeError(
                    f"Dataverse now publishes md5 {published}, expected {EXPECTED_MD5}. "
                    "The dataset changed; review before trusting it."
                )
            return int(data_file["id"])
    raise RuntimeError(f"{FILENAME} not found in dataset {DOI}")


def md5_of(path: Path) -> str:
    digest = hashlib.md5()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(file_id: int, dest: Path) -> None:
    url = f"{DATAVERSE}/api/access/datafile/{file_id}"
    tmp = dest.with_suffix(dest.suffix + ".part")
    with requests.get(url, stream=True, headers=HEADERS, timeout=120) as resp:
        resp.raise_for_status()
        total = int(resp.headers.get("Content-Length", EXPECTED_SIZE))
        with tmp.open("wb") as fh, tqdm(total=total, unit="B", unit_scale=True) as bar:
            for chunk in resp.iter_content(chunk_size=1 << 20):
                fh.write(chunk)
                bar.update(len(chunk))
    tmp.replace(dest)


def main() -> int:
    if RAW_PATH.exists() and md5_of(RAW_PATH) == EXPECTED_MD5:
        print(f"already present and verified: {RAW_PATH}")
        return 0
    file_id = resolve_file_id()
    print(f"downloading file {file_id} to {RAW_PATH}")
    download(file_id, RAW_PATH)
    actual = md5_of(RAW_PATH)
    if actual != EXPECTED_MD5:
        RAW_PATH.unlink()
        print(f"checksum mismatch: got {actual}, expected {EXPECTED_MD5}; file removed")
        return 1
    print(f"verified md5 {actual}, {RAW_PATH.stat().st_size:,} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
