import schemaText from "../../schema/resume.schema.json?raw";
import fullExample from "../../schema/examples/full.json?raw";
import { documentTitle } from "../lib/print";
import type { Resume } from "../lib/types";

export function downloadText(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Download the resume JSON; returns the file name used. */
export function downloadResume(doc: Resume): string {
  const name = documentTitle(doc).replace(/[\\/:*?"<>|]+/g, "-") + ".json";
  downloadText(name, JSON.stringify(doc, null, 2) + "\n");
  return name;
}

export const downloadSchema = () => downloadText("resume.schema.json", schemaText);
export const downloadExample = () => downloadText("example-resume.json", fullExample);

export function readFile(file: File): Promise<string> {
  return file.text();
}
