// Engine errors. `code` matches the web app's error codes so the copied UI can show them unchanged.

export class EngineError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidPlaylistLink extends EngineError {
  constructor(message = "Not a Spotify playlist link.") {
    super("invalid_link", message);
  }
}

/** The playlist is private, deleted, or otherwise not public. */
export class PlaylistUnavailable extends EngineError {
  constructor(message = "Playlist not found or not public.") {
    super("playlist_unavailable", message);
  }
}

/** Spotify's page or response no longer matches what we parse. */
export class SourceChanged extends EngineError {
  constructor(message: string) {
    super("spotify_changed", message);
  }
}

/** Spotify rejected the persisted-query hash (it changes with web-player releases). */
export class StaleQueryHash extends EngineError {
  constructor(message: string) {
    super("spotify_changed", message);
  }
}

export class NetworkError extends EngineError {
  constructor(message: string) {
    super("spotify_unreachable", message);
  }
}

/** Short links need an optional permission the user hasn't granted. */
export class ShortLinkAccessNeeded extends EngineError {
  constructor() {
    super("short_link_access", "Allow access to Spotify short links to open this one.");
  }
}
