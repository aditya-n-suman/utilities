"""Score YouTube candidates against a Spotify track."""

import re
import unicodedata

from rapidfuzz import fuzz

from ..models import Candidate, Confidence, Track

# Spotify title suffixes that describe the release rather than the recording.
_RELEASE_SUFFIX_RE = re.compile(
    r"\s+-\s+(?:"
    r"(?:\d{4}\s+)?(?:digital\s+)?remaster(?:ed)?(?:\s+\d{4})?(?:\s+version)?"
    r"|from\s+.+"
    r"|(?:single|album|radio|original|mono|stereo|explicit|clean)\s+(?:version|edit|mix)"
    r"|radio\s+edit|mono|stereo|bonus\s+track|deluxe(?:\s+edition)?|\d+(?:th|st|nd|rd)\s+anniversary.*"
    r"|original\s+(?:motion\s+picture\s+)?soundtrack"
    r")\s*$",
    re.I,
)
_FEAT_RE = re.compile(r"\s*[(\[]\s*(?:feat\.?|ft\.?|featuring|with|from)\s+[^)\]]*[)\]]", re.I)
_BRACKETS_RE = re.compile(r"[(\[][^)\]]*[)\]]")
_NON_WORD_RE = re.compile(r"[^\w\s]")
_WS_RE = re.compile(r"\s+")

# Variant markers: penalise a candidate that has one the source track doesn't.
_VARIANT_WORDS = (
    "live", "cover", "remix", "karaoke", "instrumental", "acoustic", "sped up", "slowed",
    "nightcore", "8d", "reverb", "bass boosted", "tutorial", "reaction", "lesson", "piano version",
    "16d", "chords", "play along", "mashup", "fan made", "loop", "hours", "hour version", "drum cam", "guitar cam",
)
# Fine but not first choice: prefer the artist's own upload over lyric channels.
_SOFT_PENALTY_RE = re.compile(r"\blyrics?\b|\blyric video\b", re.I)
_VARIANT_RES = {w: re.compile(rf"\b{re.escape(w)}\b", re.I) for w in _VARIANT_WORDS}
_OFFICIAL_RE = re.compile(r"\b(official (?:audio|video|music video|lyric video|visualizer)|vevo)\b", re.I)

HIGH, MEDIUM, LOW = 0.78, 0.6, 0.42


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    text = text.replace("&", " and ")
    text = _NON_WORD_RE.sub(" ", text)
    return _WS_RE.sub(" ", text).strip()


def clean_title(title: str) -> str:
    """Drop release noise ("- Remastered 2011", "(feat. X)", "- From 'Film' Soundtrack")."""
    title = _FEAT_RE.sub("", title)
    previous = None
    while previous != title:
        previous, title = title, _RELEASE_SUFFIX_RE.sub("", title)
    return title.strip()


def search_query(track: Track) -> str:
    artists = " ".join(track.artists[:2])
    return f"{artists} {clean_title(track.title)}".strip()


def _channel_clean(channel: str | None) -> str:
    channel = channel or ""
    channel = re.sub(r"\s*-\s*topic$", "", channel, flags=re.I)
    return re.sub(r"vevo$", "", channel, flags=re.I).strip()


def _title_without_artist(cand_title: str, artists: list[str]) -> str:
    """Video titles are often "Artist - Song (Official Video)"; keep only the song part."""
    parts = re.split(r"\s+[-–—|]\s+", cand_title, maxsplit=1)
    if len(parts) == 2:
        left, right = (normalize(p) for p in parts)
        for artist in artists:
            a = normalize(artist)
            if a and fuzz.partial_ratio(a, left) >= 85:
                return parts[1]
            if a and fuzz.partial_ratio(a, right) >= 85:
                return parts[0]
    return cand_title


def raw_score(track: Track, cand: Candidate) -> float:
    """Unclamped score: bonuses can push past 1.0 so they still break ties between good matches."""
    src_title = clean_title(track.title)
    cand_song = _title_without_artist(cand.title, track.artists)
    norm_src = normalize(src_title)
    norm_cand = normalize(_BRACKETS_RE.sub(" ", cand_song)) or normalize(cand_song)
    title_sim = max(fuzz.token_set_ratio(norm_src, norm_cand), fuzz.ratio(norm_src, norm_cand)) / 100
    # Penalise extra words in the candidate (e.g. "Song" vs "Song Part II").
    title_sim = 0.7 * title_sim + 0.3 * fuzz.token_sort_ratio(norm_src, norm_cand) / 100

    haystack = normalize(f"{_channel_clean(cand.channel)} {cand.title}")
    if track.artists:
        artist_sim = max(fuzz.partial_ratio(normalize(a), haystack) for a in track.artists if a) / 100
        # partial_ratio gives ~0.5 for unrelated strings; rescale so only real overlap counts.
        artist_sim = max(0.0, (artist_sim - 0.5) / 0.5)
    else:
        artist_sim = 0.5  # pasted titles without artist: neutral

    if track.duration_ms and cand.duration_s:
        delta = abs(track.duration_ms / 1000 - cand.duration_s)
        duration_score = 1.0 if delta <= 3 else max(0.0, 1 - (delta - 3) / 30)
    else:
        duration_score = 0.5

    total = 0.45 * title_sim + 0.3 * artist_sim + 0.25 * duration_score

    source_text = track.title.lower()
    for word, rx in _VARIANT_RES.items():
        if rx.search(cand.title) and not rx.search(source_text):
            total -= 0.15
    if _SOFT_PENALTY_RE.search(cand.title) and not _SOFT_PENALTY_RE.search(source_text):
        total -= 0.04
    if cand.source == "ytmusic_song":
        total += 0.05
    if (cand.channel or "").lower().endswith("- topic") or _OFFICIAL_RE.search(cand.title):
        total += 0.04
    channel = normalize(_channel_clean(cand.channel))
    if channel and any(fuzz.ratio(channel, normalize(a)) >= 90 for a in track.artists if a):
        total += 0.08  # uploaded by the artist's own channel
    return total


def score(track: Track, cand: Candidate) -> float:
    return round(max(0.0, min(1.0, raw_score(track, cand))), 3)


def confidence_for(value: float) -> Confidence:
    if value >= HIGH:
        return "high"
    if value >= MEDIUM:
        return "medium"
    if value >= LOW:
        return "low"
    return "none"


def rank(track: Track, candidates: list[Candidate]) -> list[Candidate]:
    seen: set[str] = set()
    scored = []
    for cand in candidates:
        if cand.video_id in seen:
            continue
        seen.add(cand.video_id)
        raw = raw_score(track, cand)
        scored.append((raw, cand.model_copy(update={"score": round(max(0.0, min(1.0, raw)), 3)})))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [cand for _, cand in scored]
