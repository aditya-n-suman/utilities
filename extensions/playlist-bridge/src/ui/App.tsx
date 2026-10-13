import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { hasAccess, onAccessChange, requestAccess } from "@/platform/access";
import { api, ApiError, type Candidate, type TempLinks } from "./api";
import { AccessLostBanner, AccessScreen } from "./components/Access";
import { ErrorScreen } from "./components/ErrorScreen";
import { Header } from "./components/Header";
import { Landing } from "./components/Landing";
import { MatchList } from "./components/MatchList";
import { Fetching, PlaylistCard } from "./components/PlaylistCard";
import { Result } from "./components/Result";
import type { PanelState, RowHandlers } from "./components/TrackRow";
import { INVALID_LINK, type ErrorAction } from "./copy";
import { initialJob, isSettled, jobReducer, type Filter } from "./state";

type Theme = "light" | "dark";
type ConvertInput = { url: string } | { text: string; name: string };
type Access = "checking" | "ok" | "missing";

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("pb-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [job, dispatch] = useReducer(jobReducer, initialJob);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [links, setLinks] = useState<TempLinks | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [access, setAccess] = useState<Access>("checking");
  const [live, setLive] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const jobIdRef = useRef<string | null>(null);
  const lastInput = useRef<ConvertInput | null>(null);
  jobIdRef.current = job.jobId;

  const announce = useCallback((msg: string) => setLive((prev) => (prev === msg ? `${msg}​` : msg)), []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("pb-theme", theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  // Site access: Chrome grants it at install; Firefox asks on first run. Either can be revoked later.
  useEffect(() => {
    void hasAccess().then((ok) => setAccess(ok ? "ok" : "missing"));
    return onAccessChange((ok) => setAccess(ok ? "ok" : "missing"));
  }, []);

  const allowAccess = useCallback(async () => {
    const ok = await requestAccess();
    if (ok) setAccess("ok");
    return ok;
  }, []);

  // Live job updates from the in-browser engine (replaces the web app's SSE stream).
  useEffect(() => {
    if (!job.jobId) return;
    return api.subscribe(job.jobId, (event) => {
      switch (event.type) {
        case "fetching":
          dispatch({ type: "fetching", playlist: event.data.playlist, loadingMore: event.data.loading_more });
          break;
        case "playlist":
          dispatch({ type: "playlist", playlist: event.data.playlist, matches: event.data.matches });
          announce(`Found ${event.data.matches.length} tracks. Searching YouTube…`);
          break;
        case "match":
          dispatch({ type: "match", match: event.data.match, counts: event.data.counts });
          break;
        case "done":
          dispatch({ type: "done", counts: event.data.counts });
          announce(`All ${event.data.counts.total} tracks searched`);
          break;
        case "failed":
          dispatch({ type: "failed", code: event.data.code });
          break;
      }
    });
  }, [job.jobId, announce]);

  const resetView = () => {
    setFilter("all");
    setPanel(null);
    setLinks(null);
    setCreateError("");
  };

  const start = useCallback(
    async (input: ConvertInput) => {
      lastInput.current = input;
      setBusy(true);
      try {
        const { job_id } = await api.convert(input);
        resetView();
        dispatch({ type: "started", jobId: job_id });
        announce("Loading playlist");
      } catch (e) {
        if (e instanceof ApiError && e.code === "invalid_link") setUrlError(INVALID_LINK);
        else if ("url" in input) setUrlError(e instanceof Error ? e.message : "Something went wrong. Try again.");
        else dispatch({ type: "failed", code: "spotify_unreachable" });
      } finally {
        setBusy(false);
      }
    },
    [announce],
  );

  // Opened with a link: from the right-click menu or the button on Spotify (?url=…), or an already-open tab claiming it.
  const startFromSpotify = useRef(start);
  startFromSpotify.current = start;
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const link = params.get("url");
    if (link) {
      history.replaceState(null, "", location.pathname);
      setUrl(link);
      void startFromSpotify.current({ url: link });
    }
  }, []);
  const screenRef = useRef(job.screen);
  screenRef.current = job.screen;
  useEffect(() => {
    const onMessage = (message: unknown): Promise<boolean> | undefined => {
      const m = message as { type?: string; url?: string };
      if (m?.type !== "pb:open") return undefined;
      // Never interrupt a conversion in progress; the background opens a new tab instead.
      if (!["landing", "result", "error"].includes(screenRef.current)) return Promise.resolve(false);
      if (m.url) {
        setUrl(m.url);
        void startFromSpotify.current({ url: m.url });
      }
      void browser.tabs.getCurrent().then((tab) => {
        if (tab?.id != null) void browser.tabs.update(tab.id, { active: true });
        if (tab?.windowId != null) void browser.windows.update(tab.windowId, { focused: true });
      });
      return Promise.resolve(true);
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, []);

  const goHome = useCallback(() => {
    resetView();
    setUrlError("");
    setShowPaste(false);
    dispatch({ type: "reset" });
  }, []);

  const onErrorAction = (action: ErrorAction) => {
    if (action === "retry" && lastInput.current) return start(lastInput.current);
    goHome();
    if (action === "paste") setShowPaste(true);
  };

  // Escape closes an open row panel (the sign-in dialog handles its own Escape).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"]')) setPanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (panel?.mode === "search") searchRef.current?.focus();
  }, [panel?.index, panel?.mode]);

  const applyEdit = useCallback(async (index: number, body: Parameters<typeof api.edit>[2], message: string) => {
    const id = jobIdRef.current;
    if (!id) return;
    try {
      const { match, counts } = await api.edit(id, index, body);
      dispatch({ type: "match", match, counts });
      announce(message);
    } catch (e) {
      announce(e instanceof Error ? e.message : "Something went wrong");
    }
  }, [announce]);

  const handlers: RowHandlers = useMemo(
    () => ({
      togglePanel: (m, mode) =>
        setPanel((p) =>
          p?.index === m.index && p.mode === mode
            ? null
            : {
                index: m.index, mode, results: null, searching: false, error: "", previewId: null,
                query: `${m.track.artists[0] ?? ""} ${m.track.title}`.trim(),
              },
        ),
      setQuery: (q) => setPanel((p) => (p ? { ...p, query: q } : p)),
      search: async (index, q) => {
        const id = jobIdRef.current;
        if (!id) return;
        setPanel((p) => (p && p.index === index ? { ...p, searching: true, error: "", previewId: null } : p));
        try {
          const { results } = await api.search(id, index, q);
          setPanel((p) => (p && p.index === index ? { ...p, searching: false, results } : p));
          announce(`${results.length} results`);
        } catch (e) {
          const msg = e instanceof ApiError && e.code === "search_unavailable" ? "YouTube search isn’t responding. Try again in a moment." : "Search failed. Try again.";
          setPanel((p) => (p && p.index === index ? { ...p, searching: false, error: msg } : p));
        }
      },
      preview: (videoId) => setPanel((p) => (p ? { ...p, previewId: videoId } : p)),
      use: (index: number, candidate: Candidate) => {
        setPanel(null);
        applyEdit(index, { action: "choose", candidate }, "Match updated");
      },
      remove: (m) => {
        setPanel((p) => (p?.index === m.index ? null : p));
        applyEdit(m.index, { action: "remove" }, `Removed ${m.track.title}`);
      },
      undo: (m) => applyEdit(m.index, { action: "restore" }, `Restored ${m.track.title}`),
      retry: (m) => {
        announce("Retrying");
        applyEdit(m.index, { action: "retry" }, `Searched again for ${m.track.title}`);
      },
    }),
    [applyEdit, announce],
  );

  const retryErrors = useCallback(() => {
    const id = jobIdRef.current;
    if (!id) return;
    announce("Retrying");
    api.retryErrors(id).catch(() => announce("Retry failed"));
  }, [announce]);

  const createPlaylist = async () => {
    if (!job.jobId) return;
    setCreating(true);
    setCreateError("");
    try {
      setLinks(await api.links(job.jobId));
      setPanel(null);
      dispatch({ type: "screen", screen: "result" });
      announce("Your YouTube playlist is ready");
      window.scrollTo({ top: 0 });
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Couldn’t create the playlist");
    } finally {
      setCreating(false);
    }
  };

  const scr = job.screen;
  const isList = scr === "matching" || scr === "review";
  const settled = isSettled(job);
  const c = job.counts;

  return (
    <div className="app">
      <Header
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        onHome={goHome}
        showStartOver={scr !== "landing" && access === "ok"}
        accessOk={access === "ok"}
        onAllowAccess={() => void allowAccess()}
        onClearCache={() => api.clearCache()}
      />
      <main id="main" className="main">
        <div aria-live="polite" className="sr-only">
          {live}
        </div>

        {access === "missing" && scr !== "landing" && <AccessLostBanner onAllow={() => void allowAccess()} />}
        {access === "missing" && scr === "landing" && <AccessScreen onAllow={allowAccess} />}

        {scr === "landing" && access === "ok" && (
          <Landing
            url={url}
            onUrl={(u) => {
              setUrl(u);
              setUrlError("");
            }}
            urlError={urlError}
            onUrlError={setUrlError}
            showPaste={showPaste}
            onTogglePaste={() => setShowPaste((s) => !s)}
            busy={busy}
            onConvertUrl={(u) => start({ url: u })}
            onConvertList={(text, name) => start({ text, name })}
          />
        )}

        {(scr === "fetching" || isList) && (
          <PlaylistCard
            playlist={job.playlist}
            progress={
              isList
                ? {
                    label: scr === "review" ? "Matching complete" : settled ? "Done" : "Searching YouTube…",
                    matched: c.high + c.medium + c.low,
                    counts: c,
                  }
                : null
            }
          />
        )}

        {scr === "fetching" && <Fetching loadingMore={job.loadingMore} />}

        {isList && (
          <MatchList
            isReview={scr === "review"}
            settled={settled}
            matches={job.matches}
            counts={c}
            filter={filter}
            onFilter={(f) => {
              setFilter(f);
              setPanel(null);
            }}
            panel={panel}
            handlers={handlers}
            searchRef={searchRef}
            onRetryErrors={retryErrors}
            onReview={() => {
              dispatch({ type: "screen", screen: "review" });
              announce("Review matches");
            }}
            onCreate={createPlaylist}
            creating={creating}
            createError={createError}
          />
        )}

        {scr === "result" && job.jobId && links && (
          <Result
            jobId={job.jobId}
            playlistName={job.playlist?.name ?? "Playlist"}
            links={links}
            counts={c}
            announce={announce}
          />
        )}

        {scr === "error" && <ErrorScreen code={job.errorCode} onAction={onErrorAction} />}
      </main>
    </div>
  );
}
