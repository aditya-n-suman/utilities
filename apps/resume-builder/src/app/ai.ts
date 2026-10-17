// The prompt users paste into any text AI to get importable JSON
// (prompts/ai-content.md, everything after its "---" line, with the schema
// filled in), and the "Copy for AI" variant that carries the current resume.

import promptFile from "../../prompts/ai-content.md?raw";
import schemaText from "../../schema/resume.schema.json?raw";
import type { Resume } from "../lib/types";

const body = promptFile.slice(promptFile.indexOf("\n---\n") + 5).trim();

export const AI_PROMPT = body.replace("{{SCHEMA}}", "```json\n" + schemaText.trim() + "\n```");

export function promptWithResume(doc: Resume): string {
  return (
    AI_PROMPT +
    "\n\n## My current resume\n\nThis is the JSON I have now, including my own edits. Improve the wording where it helps, keep every fact, and return the whole document.\n\n```json\n" +
    JSON.stringify(doc, null, 2) +
    "\n```"
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API refused (no focus, insecure context): fall back to a selection copy.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
