from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

PlaylistSource = Literal["embed", "pathfinder", "webplayer", "paste"]
CandidateSource = Literal["ytmusic_song", "ytmusic_video", "ytdlp"]
Confidence = Literal["high", "medium", "low", "none"]
MatchStatus = Literal["pending", "matched", "not_found", "removed", "error"]


class Track(BaseModel):
    title: str
    artists: list[str] = Field(default_factory=list)
    album: str | None = None
    duration_ms: int | None = None
    explicit: bool = False
    spotify_uri: str | None = None
    cover_url: str | None = None

    @property
    def artist_line(self) -> str:
        return ", ".join(self.artists)


class Playlist(BaseModel):
    """`total` is the size of the source playlist; `tracks` may be capped at MAX_TRACKS."""

    id: str | None = None
    name: str
    owner: str | None = None
    description: str | None = None
    cover_url: str | None = None
    total: int
    source: PlaylistSource
    tracks: list[Track]


class Candidate(BaseModel):
    video_id: str
    title: str
    channel: str | None = None
    duration_s: int | None = None
    source: CandidateSource
    score: float = 0.0

    @property
    def thumbnail(self) -> str:
        return f"https://i.ytimg.com/vi/{self.video_id}/mqdefault.jpg"

    @property
    def url(self) -> str:
        return f"https://www.youtube.com/watch?v={self.video_id}"

    def public(self) -> dict:
        return {**self.model_dump(), "thumbnail": self.thumbnail, "url": self.url}


class Match(BaseModel):
    index: int
    track: Track
    status: MatchStatus = "pending"
    confidence: Confidence | None = None
    chosen: Candidate | None = None
    alternatives: list[Candidate] = Field(default_factory=list)
    error: str | None = None
    picked: bool = False  # chosen by the user during review

    def public(self) -> dict:
        data = self.model_dump(exclude={"chosen", "alternatives"})
        data["chosen"] = self.chosen.public() if self.chosen else None
        data["alternatives"] = [c.public() for c in self.alternatives]
        return data
