import { useState } from "react";
import Explorer from "./components/Explorer";
import Upload from "./components/Upload";
import { buildModel, type Model } from "./parser/build";
import { splitDump } from "./parser/split";

export interface Loaded {
  model: Model;
  name: string;
  size: number;
}

export default function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = (text: string, name: string, size: number) => {
    const dump = splitDump(text, name);
    if (dump.files.length === 0) {
      setError(
        dump.status === "failed"
          ? "This output only holds a failed config test, so there is no configuration to show. Fix the error nginx reports and run nginx -T again."
          : "No nginx configuration found in that text.",
      );
      return;
    }
    setError(null);
    setLoaded({ model: buildModel(dump), name, size });
    window.scrollTo(0, 0);
  };

  if (loaded) return <Explorer {...loaded} onClose={() => setLoaded(null)} />;
  return <Upload onOpen={open} error={error} onError={setError} />;
}
