// Redaction for summary.md. The summary is meant to be pasted into a chat or committed, so it must not carry
// cookies, tokens or anything that identifies you. Header values are never written; JSON strings and numbers are
// dropped by key name (sensitiveKey; objects under such keys are still walked) or by what they look like
// (redactValue). Product names, prices and ids are kept: they are what the next phases need.

export const REDACTED = "‹redacted›";

const SENSITIVE_KEY =
  /(pin_?code|pincode|zip|^pin$|area_?code|lat(itude)?$|^lng$|lon(gitude)?$|long_?lat|lat_?l(o)?ng|geo|coord|location|phone|mobile|msisdn|e_?mail|token|auth|session|^sid$|cookie|secret|password|otp|address|addr|landmark|(first|last|full|customer|user|cust)_?name|^name_?on|customer_?id|user_?id|cust_?id|device_?id|imei|card_?(no|num)|cvv|upi|vpa)/i;

export function sensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

const VALUE_PATTERNS: RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/g, // e-mail
  /(?<!\d)(\+?91[- ]?)?[6-9]\d{9}(?!\d)/g, // Indian mobile number
  /eyJ[\w-]+\.[\w-]+\.[\w-]*/g, // JWT
  /\b[A-Fa-f0-9]{32,}\b/g, // long hex (session ids, hashes)
  /\b[A-Za-z0-9+/_-]{40,}={0,2}/g, // long base64-ish tokens
];

export function redactValue(s: string): string {
  let out = s;
  for (const re of VALUE_PATTERNS) out = out.replace(re, REDACTED);
  return out;
}

/** Headers worth naming in the summary: the ones a page script sets, which a replay may need. */
const STANDARD_HEADERS = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "cache-control",
  "connection",
  "content-length",
  "content-type",
  "cookie",
  "host",
  "origin",
  "pragma",
  "priority",
  "referer",
  "user-agent",
]);

export function customHeaderNames(headers: Record<string, string> | undefined): string[] {
  return Object.keys(headers ?? {})
    .filter((h) => !h.startsWith(":") && !h.startsWith("sec-") && !STANDARD_HEADERS.has(h.toLowerCase()))
    .sort();
}
