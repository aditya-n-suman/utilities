import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pagingReport } from "../../src/research/paging.ts";

describe("paging report", () => {
  it("says which answer field the page sent back as page_id, without printing tokens", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "gc-paging-")), "jiomart-x");
    mkdirSync(dir);
    const base = "https://www.jiomart.com/ext/vertex/application/api/v1.0/products?f=journey%3Aquickcommerce&q=atta";
    const token = "CgwI4LDzxgYQgM6WtwISJDY4ZjQ4";
    const req = (seq: number, url: string, body: unknown) =>
      JSON.stringify({ seq, t: seq, step: "scroll", method: "GET", url, resourceType: "xhr", siteHost: true, reqHeaders: {}, status: 200, resBody: JSON.stringify(body) });
    writeFileSync(
      join(dir, "raw.jsonl"),
      [
        req(1, base, { items: [{ uid: 1 }], page: { has_next: true, next_id: "2" }, meta: { nextPageToken: token, attributionToken: "zzzzzzzzzzzzzzzzzzzz" } }),
        req(2, `${base}&page_id=${token}&page_size=50`, { items: [{ uid: 2 }], page: { has_next: false } }),
      ].join("\n"),
    );
    writeFileSync(join(dir, "steps.json"), "[]");
    const report = pagingReport(dir);
    expect(report).toContain("page_id matches the previous answer's: `meta.nextPageToken`");
    expect(report).toContain("page_id=28 chars, page_size=\"50\"");
    expect(report).not.toContain(token);
  });
});
