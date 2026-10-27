import { describe, expect, it } from "vitest";
import type { Capture, CapturedRequest } from "../../src/research/capture.ts";
import { addCandidate, replaceTermInBody, replaceTermInUrl, searchCandidates } from "../../src/research/classify.ts";
import { productNames, replayHeaders } from "../../src/research/probe.ts";
import { customHeaderNames, REDACTED, redactValue, sensitiveKey } from "../../src/research/redact.ts";
import { findStringPaths, outline, responseJson } from "../../src/research/shape.ts";
import { isSiteHost, SITES } from "../../src/research/sites.ts";
import { safeUrl, summarize } from "../../src/research/summarize.ts";

const req = (over: Partial<CapturedRequest>): CapturedRequest => ({
  seq: 1,
  t: 0,
  step: "search",
  method: "GET",
  url: "https://www.jiomart.com/x",
  resourceType: "fetch",
  siteHost: true,
  reqHeaders: { accept: "*/*" },
  status: 200,
  ...over,
});

describe("redaction", () => {
  it("drops personal values but keeps product data", () => {
    expect(redactValue("call 9876543210 or +91 9876543210")).toBe(`call ${REDACTED} or ${REDACTED}`);
    expect(redactValue("mail a.b@example.co.in")).toBe(`mail ${REDACTED}`);
    expect(redactValue("Aashirvaad Atta 5 kg ₹289 sku 590001234")).toBe("Aashirvaad Atta 5 kg ₹289 sku 590001234");
    expect(redactValue("eyJhbGciOi.eyJzdWIiOjF9.sig")).toBe(REDACTED);
  });

  it("knows sensitive keys", () => {
    for (const k of ["pincode", "pin", "lat", "mobile_no", "authToken", "customer_name", "address_line1", "user_id"]) {
      expect(sensitiveKey(k), k).toBe(true);
    }
    for (const k of ["name", "display_name", "product_name", "price", "sku", "productCards", "brand"]) {
      expect(sensitiveKey(k), k).toBe(false);
    }
  });

  it("lists only headers a page script set", () => {
    expect(customHeaderNames({ accept: "x", cookie: "x", "sec-ch-ua": "x", "x-api-key": "x", authtoken: "x", ":path": "/" })).toEqual([
      "authtoken",
      "x-api-key",
    ]);
  });
});

describe("shape", () => {
  it("outlines JSON with redacted samples", () => {
    const text = outline({ data: { products: [{ name: "Atta", price: 289 }, { name: "Dal", mrp: 210 }] }, pincode: 560001, phone: "x" });
    expect(text).toContain("products: [2] of");
    expect(text).toContain('name: string "Atta"');
    expect(text).toContain("mrp: number 210");
    expect(text).toContain(`pincode: number ${REDACTED}`);
    expect(text).toContain(`phone: string ${REDACTED}`);
  });

  it("finds where a product name sits", () => {
    expect(findStringPaths({ a: [{ b: "x" }, { b: "Aashirvaad Select Atta 5 kg" }] }, "select atta")).toEqual(["a[1].b"]);
  });

  it("reads JSON embedded in server-rendered HTML", () => {
    const html = `<html><script type="application/ld+json">{"x":1}</script><script id="__NEXT_DATA__" type="application/json">{"props":{"items":[{"name":"Atta"}]}}</script></html>`;
    expect(responseJson(html)).toEqual({ props: { items: [{ name: "Atta" }] } });
    expect(responseJson(")]}'\n{\"a\":1}")).toEqual({ a: 1 });
    expect(responseJson("<html>no data</html>")).toBeUndefined();
  });
});

describe("term replacement", () => {
  it("swaps the term in query values and path segments, keeping encoding", () => {
    expect(replaceTermInUrl("https://s.example/search?q=atta&page=1", "atta", "toor dal")).toBe(
      "https://s.example/search?q=toor+dal&page=1",
    );
    expect(replaceTermInUrl("https://s.example/search/Atta%20flour?x=1", "atta", "toor dal")).toBe(
      "https://s.example/search/toor%20dal%20flour?x=1",
    );
  });

  it("swaps the term in JSON and form bodies", () => {
    expect(JSON.parse(replaceTermInBody(JSON.stringify({ query: "atta", filters: ["atta"], page: 1 }), "atta", "dal"))).toEqual({
      query: "dal",
      filters: ["dal"],
      page: 1,
    });
    expect(replaceTermInBody("q=atta&n=20", "atta", "toor dal")).toBe("q=toor+dal&n=20");
  });
});

describe("classification", () => {
  const capture: Capture = {
    dir: "captures/jiomart-x",
    site: "jiomart",
    steps: [
      { step: "start", t: 0 },
      { step: "search", t: 1, data: { term: "atta" } },
      { step: "add", t: 2, data: { product: "Aashirvaad Select Atta 5 kg" } },
    ],
    requests: [
      req({ seq: 1, url: "https://www.jiomart.com/suggest?q=atta", resBody: '{"s":["atta"]}' }),
      req({
        seq: 2,
        method: "POST",
        url: "https://www.jiomart.com/api/search",
        reqBody: '{"query":"atta"}',
        resBody: '{"items":[{"name":"Aashirvaad Select Atta 5 kg"}]}',
      }),
      req({ seq: 3, url: "https://ads.example/pixel?q=atta", siteHost: false, reqHeaders: undefined }),
      req({ seq: 4, step: "add", method: "POST", url: "https://www.jiomart.com/api/log", reqBody: "{}" }),
      req({ seq: 5, step: "add", method: "POST", url: "https://www.jiomart.com/api/cart/add", reqBody: '{"id":1}' }),
    ],
  };

  it("ranks the request whose response holds the added product first", () => {
    const [best] = searchCandidates(capture);
    expect(best.req.seq).toBe(2);
    expect(best.productPaths).toEqual(["items[0].name"]);
  });

  it("prefers a cart-named write for the add", () => {
    expect(addCandidate(capture)?.seq).toBe(5);
  });

  it("summarises without header values", () => {
    const md = summarize({ ...capture, requests: capture.requests.map((r) => ({ ...r, reqHeaders: { cookie: "SECRET", "x-token": "SECRET2" } })) });
    expect(md).toContain("`x-token`");
    expect(md).not.toContain("SECRET");
    expect(md).toContain("items[0].name");
  });

  it("redacts query values except the term and short plain ones", () => {
    expect(safeUrl("https://www.jiomart.com/s?q=atta&page=2&pincode=560001&sid=abcdefghijklmnopqrstuvwxyz0123456789", "atta")).toBe(
      `www.jiomart.com/s?q=atta&page=2&pincode=${REDACTED}&sid=${REDACTED}`,
    );
  });
});

describe("probe helpers", () => {
  it("finds the biggest named list", () => {
    const found = productNames({ nav: [{ title: "Home" }], data: { list: [{ display_name: "A" }, { display_name: "B" }] } });
    expect(found).toEqual({ path: "data.list", count: 2, names: ["A", "B"] });
  });

  it("replays custom headers only when asked, never browser-set ones", () => {
    const r = req({ reqHeaders: { cookie: "c", "user-agent": "u", "content-type": "application/json", authtoken: "t", "sec-fetch-mode": "cors" } });
    expect(replayHeaders(r, true)).toEqual({ "content-type": "application/json", authtoken: "t" });
    expect(replayHeaders(r, false)).toEqual({ "content-type": "application/json" });
  });
});

describe("sites", () => {
  it("matches subdomains only", () => {
    expect(isSiteHost(SITES.jiomart, "www.jiomart.com")).toBe(true);
    expect(isSiteHost(SITES.jiomart, "jiomart.com")).toBe(true);
    expect(isSiteHost(SITES.jiomart, "notjiomart.com")).toBe(false);
  });
});
