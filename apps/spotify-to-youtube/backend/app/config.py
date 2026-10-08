import os
from dataclasses import dataclass, field
from pathlib import Path


def _int(name: str, default: int) -> int:
    return int(os.environ.get(name, default))


@dataclass(frozen=True)
class Settings:
    max_tracks: int = field(default_factory=lambda: _int("MAX_TRACKS", 500))
    search_concurrency: int = field(default_factory=lambda: _int("SEARCH_CONCURRENCY", 3))
    temp_link_chunk: int = field(default_factory=lambda: _int("TEMP_LINK_CHUNK", 50))
    cache_path: Path = field(
        default_factory=lambda: Path(os.environ.get("CACHE_PATH", Path(__file__).resolve().parent.parent / "data" / "cache.sqlite3"))
    )
    cache_ttl_days: int = field(default_factory=lambda: _int("CACHE_TTL_DAYS", 30))
    ytmusic_location: str = field(default_factory=lambda: os.environ.get("YTMUSIC_LOCATION", ""))
    # Google OAuth client ("TVs and Limited Input devices") used for "save to my account".
    google_client_id: str | None = field(default_factory=lambda: os.environ.get("GOOGLE_CLIENT_ID") or None)
    google_client_secret: str | None = field(default_factory=lambda: os.environ.get("GOOGLE_CLIENT_SECRET") or None)
    # Persisted-query hash of Spotify's web player `fetchPlaylist` operation. Spotify rotates it
    # occasionally; when it goes stale the headless-browser fallback rediscovers the current one.
    spotify_fetch_playlist_hash: str = field(
        default_factory=lambda: os.environ.get(
            "SPOTIFY_FETCH_PLAYLIST_HASH", "8964e8eafb21aa992a7d951d256d83285c04be2105d209262901de70cb97584a"
        )
    )
    enable_browser_fallback: bool = field(
        default_factory=lambda: os.environ.get("ENABLE_BROWSER_FALLBACK", "1") not in ("0", "false", "")
    )
    chromium_executable: str | None = field(default_factory=lambda: os.environ.get("CHROMIUM_EXECUTABLE") or None)
    job_ttl_seconds: int = field(default_factory=lambda: _int("JOB_TTL_SECONDS", 4 * 3600))

    @property
    def save_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)


settings = Settings()

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
)
