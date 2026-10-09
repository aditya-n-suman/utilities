import { useCallback, useEffect, useRef, useState } from "react";
import type { Confidence, Privacy } from "./api";

export const QUAL: Record<Confidence, string> = { high: "High", medium: "Medium", low: "Low", none: "Not found" };

export const sourceLabel = (source: string) => (source.startsWith("ytmusic") ? "YouTube Music" : "YouTube");

export const PRIVACY_HINT: Record<Privacy, string> = {
  private: "Only you can see it.",
  unlisted: "Anyone with the link can watch. It won’t appear in search.",
  public: "Anyone can find and watch it.",
};

export const INVALID_LINK =
  "That doesn’t look like a Spotify playlist link. It should start with open.spotify.com/playlist/";
export const EMPTY_LINK = "Paste a Spotify playlist link to start.";
export const EXAMPLE_LINK = "https://open.spotify.com/playlist/37i9dQZF1DX4UtSsGT1Sbe";

export type ErrorAction = "paste" | "home" | "retry";
export interface ErrorCopy {
  label: string;
  icon: string;
  tone: "nf" | "md" | "neutral";
  title: string;
  body: string;
  primary: [string, ErrorAction];
  secondary: [string, ErrorAction] | null;
}

export const JOB_ERRORS: Record<string, ErrorCopy> = {
  playlist_unavailable: {
    label: "Private playlist", icon: "?", tone: "nf", title: "We can’t see this playlist",
    body: "It’s private, or it no longer exists. Make it public in Spotify and try again, or paste the track list instead.",
    primary: ["Paste a track list", "paste"], secondary: ["Try another link", "home"],
  },
  spotify_changed: {
    label: "Spotify changed", icon: "!", tone: "md", title: "Spotify links aren’t working right now",
    body: "Spotify changed how playlists load, and we’re catching up. Pasting a track list or uploading a CSV still works.",
    primary: ["Paste a track list", "paste"], secondary: ["Try another link", "home"],
  },
  spotify_unreachable: {
    label: "Spotify fetch failed", icon: "!", tone: "md", title: "Spotify didn’t respond",
    body: "We couldn’t load the playlist. This is usually temporary, so try again in a moment.",
    primary: ["Try again", "retry"], secondary: ["Paste a track list", "paste"],
  },
  empty: {
    label: "Empty playlist", icon: "0", tone: "neutral", title: "This playlist is empty",
    body: "There are no tracks to convert. Add some songs in Spotify, or try a different playlist.",
    primary: ["Try another link", "home"], secondary: null,
  },
};
// Unknown failures (internal errors, lost job) read like a fetch failure: retrying is the right move.
export const errorCopy = (code: string | null) => JOB_ERRORS[code ?? ""] ?? JOB_ERRORS.spotify_unreachable;

export const SAVE_ERRORS: Record<string, { title: string; body: string; btn: string }> = {
  not_signed_in: {
    title: "You’re signed out", body: "Your Google sign-in ended before we could save. Sign in again to finish.", btn: "Sign in again",
  },
  save_failed: {
    title: "Couldn’t save to YouTube", body: "YouTube didn’t accept the playlist. Your temporary links above still work.", btn: "Try again",
  },
  signin_failed: {
    title: "Google sign-in isn’t available",
    body: "We couldn’t start the sign-in. Try again in a moment. Your temporary links above still work.",
    btn: "Try again",
  },
};

/** Copy-to-clipboard with a short-lived "Copied ✓" key. */
export function useCopy(announce: (msg: string) => void) {
  const [copied, setCopied] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = useCallback(
    (text: string, key: string) => {
      navigator.clipboard?.writeText(text).catch(() => {});
      clearTimeout(timer.current);
      setCopied(key);
      announce("Copied");
      timer.current = setTimeout(() => setCopied(""), 1600);
    },
    [announce],
  );
  return { copied, copy };
}
