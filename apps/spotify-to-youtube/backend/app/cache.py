"""SQLite cache of track → ranked YouTube candidates (keeps repeat conversions fast and polite)."""

import json
import sqlite3
import threading
import time
from pathlib import Path

from .models import Candidate, Track
from .youtube.matcher import clean_title, normalize


def cache_key(track: Track) -> str:
    duration_bucket = round(track.duration_ms / 5000) if track.duration_ms else "-"
    artists = normalize(" ".join(sorted(track.artists)))
    return f"{artists}|{normalize(clean_title(track.title))}|{duration_bucket}"


class MatchCache:
    def __init__(self, path: Path, ttl_days: int):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._ttl = ttl_days * 86400
        self._lock = threading.Lock()
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS matches (key TEXT PRIMARY KEY, candidates TEXT NOT NULL, created_at REAL NOT NULL)"
        )
        self._db.commit()

    def get(self, track: Track) -> list[Candidate] | None:
        with self._lock:
            row = self._db.execute(
                "SELECT candidates, created_at FROM matches WHERE key = ?", (cache_key(track),)
            ).fetchone()
        if not row or time.time() - row[1] > self._ttl:
            return None
        return [Candidate.model_validate(c) for c in json.loads(row[0])]

    def put(self, track: Track, candidates: list[Candidate]) -> None:
        payload = json.dumps([c.model_dump() for c in candidates])
        with self._lock:
            self._db.execute(
                "INSERT OR REPLACE INTO matches (key, candidates, created_at) VALUES (?, ?, ?)",
                (cache_key(track), payload, time.time()),
            )
            self._db.commit()
