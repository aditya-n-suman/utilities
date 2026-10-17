// Screens and the journeys between them (UX.md): Home → form or Import →
// workspace. The hash keeps the back button working: #/, #/import, #/edit,
// and #/templates for the template sheet.

import { useEffect, useState } from "react";
import { TemplatesPage } from "../pages/TemplatesPage";
import { Home } from "./Home";
import { ImportScreen } from "./ImportScreen";
import { loadDraft, removeDraft, type Draft } from "./storage";
import { normalizeForForm } from "./validate";
import { blankResume, Workspace, type WorkspaceStart } from "./workspace/Workspace";

type Route = "home" | "import" | "edit" | "templates";

const routeOf = (h: string): Route => (h === "#/import" ? "import" : h === "#/edit" ? "edit" : h === "#/templates" ? "templates" : "home");

export function App() {
  const [route, setRoute] = useState<Route>(routeOf(location.hash));
  const [draft, setDraft] = useState<Draft | null>(() => loadDraft());
  const [start, setStart] = useState<WorkspaceStart | null>(null);
  const [startId, setStartId] = useState(0);

  useEffect(() => {
    const on = () => setRoute(routeOf(location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const go = (r: Route) => {
    location.hash = r === "home" ? "#/" : `#/${r}`;
    setRoute(r);
  };
  const open = (s: WorkspaceStart) => {
    setStart(s);
    setStartId((n) => n + 1);
    go("edit");
  };
  const home = () => {
    setDraft(loadDraft());
    setStart(null);
    go("home");
  };

  useEffect(() => {
    // #/edit opened directly (reload, bookmark): continue the draft, or start blank.
    if (route === "edit" && !start) {
      const d = loadDraft();
      setStart(d ? { doc: normalizeForForm(d.doc), mode: "draft", ui: d.ui } : { doc: blankResume(), mode: "new" });
    }
    document.title = route === "templates" ? "Folio · Templates" : route === "import" ? "Folio · Import JSON" : "Folio · Resume builder";
  }, [route, start]);

  if (route === "templates") return <TemplatesPage />;
  if (route === "import") return <ImportScreen draft={draft?.doc ?? null} onBack={home} onDone={open} />;
  if (route === "edit") return start ? <Workspace key={startId} start={start} onHome={home} /> : null;
  return (
    <Home
      draft={draft}
      onContinue={() => draft && open({ doc: normalizeForForm(draft.doc), mode: "draft", ui: draft.ui })}
      onStartFresh={() => {
        removeDraft();
        setDraft(null);
      }}
      onNew={() => open({ doc: blankResume(), mode: "new" })}
      onImport={() => go("import")}
    />
  );
}
