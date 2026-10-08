"""Fallback input: a pasted track list or a CSV export (e.g. Exportify)."""

import csv
import io
import re

from ..models import Playlist, Track

_TITLE_KEYS = ("track name", "track", "title", "song", "name")
_ARTIST_KEYS = ("artist name(s)", "artist names", "artists", "artist")
_ALBUM_KEYS = ("album name", "album")
_DURATION_MS_KEYS = ("duration (ms)", "duration_ms")
_DURATION_KEYS = ("duration", "length", "time")
_URI_KEYS = ("track uri", "spotify uri", "uri")

_LEADING_NUMBER_RE = re.compile(r"^\s*\d+\s*[.)\-:]\s*")
_DASH_RE = re.compile(r"\s+[-–—]\s+")
_BY_RE = re.compile(r"^(?P<title>.+?)\s+by\s+(?P<artist>.+)$", re.I)


def _pick(row: dict[str, str], keys: tuple[str, ...]) -> str | None:
    for key in keys:
        if row.get(key):
            return row[key].strip()
    return None


def _parse_duration(value: str | None) -> int | None:
    if not value:
        return None
    value = value.strip()
    if m := re.fullmatch(r"(?:(\d+):)?(\d{1,2}):(\d{2})", value):
        h, mnt, s = (int(x) if x else 0 for x in m.groups())
        return ((h * 60 + mnt) * 60 + s) * 1000
    if value.isdigit():
        return int(value)
    return None


def _split_artists(value: str) -> list[str]:
    return [a.strip() for a in re.split(r"\s*[;,]\s*|\s+&\s+|\s+feat\.?\s+", value) if a.strip()]


def _looks_like_csv(text: str) -> bool:
    header = text.lstrip().splitlines()[0].lower() if text.strip() else ""
    return ("," in header or "\t" in header or ";" in header) and any(k in header for k in _TITLE_KEYS)


def parse_csv(text: str) -> list[Track]:
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    tracks = []
    for raw in reader:
        row = {(k or "").strip().lower(): (v or "") for k, v in raw.items()}
        title = _pick(row, _TITLE_KEYS)
        if not title:
            continue
        duration = _pick(row, _DURATION_MS_KEYS)
        tracks.append(
            Track(
                title=title,
                artists=_split_artists(_pick(row, _ARTIST_KEYS) or ""),
                album=_pick(row, _ALBUM_KEYS),
                duration_ms=int(float(duration)) if duration and duration.replace(".", "").isdigit() else _parse_duration(_pick(row, _DURATION_KEYS)),
                spotify_uri=_pick(row, _URI_KEYS),
            )
        )
    return tracks


def parse_line(line: str) -> Track | None:
    line = _LEADING_NUMBER_RE.sub("", line.strip())
    if not line or line.startswith("#"):
        return None
    duration_ms = None
    if m := re.search(r"[\s(\[]+(\d{1,2}:\d{2})[)\]]?\s*$", line):
        duration_ms = _parse_duration(m.group(1))
        line = line[: m.start()].strip()
    parts = _DASH_RE.split(line, maxsplit=1)
    if len(parts) == 2:
        artist, title = parts
        return Track(title=title.strip(), artists=_split_artists(artist), duration_ms=duration_ms)
    if m := _BY_RE.match(line):
        return Track(title=m["title"].strip(), artists=_split_artists(m["artist"]), duration_ms=duration_ms)
    return Track(title=line, artists=[], duration_ms=duration_ms)


def parse_track_text(text: str, name: str = "Pasted tracks") -> Playlist:
    """Parse `Artist - Title` lines (optionally numbered, optional trailing m:ss) or a CSV export."""
    tracks = parse_csv(text) if _looks_like_csv(text) else [t for t in map(parse_line, text.splitlines()) if t]
    return Playlist(name=name, total=len(tracks), source="paste", tracks=tracks)
