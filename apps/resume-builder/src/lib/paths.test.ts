import { describe, expect, it } from "vitest";
import { deleteAt, getAt, move, setAt, toBracket, updateList } from "./paths";

describe("paths", () => {
  const doc = { basics: { name: "A", email: "a@b.c" }, work: [{ title: "x", highlights: [{ text: "1" }] }] };
  it("reads and writes without mutating", () => {
    const next = setAt(doc, "work.0.highlights.0.text", "2");
    expect(getAt(next, "work.0.highlights.0.text")).toBe("2");
    expect(doc.work[0].highlights[0].text).toBe("1");
    expect(next.basics).toBe(doc.basics); // untouched branches are shared
  });
  it("creates missing containers, arrays for numeric keys", () => {
    expect(setAt({}, "work.0.title", "t")).toEqual({ work: [{ title: "t" }] });
  });
  it("removes a key set to empty", () => {
    expect(setAt(doc, "basics.email", "")).toEqual({ ...doc, basics: { name: "A" } });
  });
  it("deletes keys and array items", () => {
    expect(deleteAt(doc, "basics.email").basics).toEqual({ name: "A" });
    expect(deleteAt(doc, "work.0").work).toEqual([]);
  });
  it("updates lists and moves items", () => {
    expect(updateList(doc, "work.0.highlights", (l) => l.push({ text: "3" })).work[0].highlights).toHaveLength(2);
    expect(move(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });
  it("formats bracket paths", () => {
    expect(toBracket("work.10.highlights.2.text")).toBe("work[10].highlights[2].text");
  });
});
