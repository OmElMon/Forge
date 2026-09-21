import assert from "node:assert/strict";
import { test } from "node:test";

import {
  accessTokenNeedsRefresh,
  isAuthRejection,
  isUpstreamUnavailable,
  UPSTREAM_UNAVAILABLE_MESSAGE,
} from "./session-policy.ts";

function encodeSegment(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function tokenWithClaims(claims: Record<string, unknown>): string {
  const header = encodeSegment(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodeSegment(JSON.stringify(claims));
  return `${header}.${payload}.signature-not-verified-here`;
}

const NOW = 1_800_000_000_000; // fixed clock for deterministic assertions

// Regression: an unreachable or failing API (Render cold start, paused Supabase,
// 5xx from the proxy) must never be mistaken for an authentication verdict.
test("server-side and transport failures count as upstream unavailable", () => {
  for (const status of [0, 500, 502, 503, 504]) {
    assert.equal(isUpstreamUnavailable(status), true, `expected ${status} to be unavailable`);
  }
});

test("definitive HTTP answers are not treated as upstream unavailable", () => {
  for (const status of [200, 201, 204, 400, 401, 403, 409, 422, 429]) {
    assert.equal(isUpstreamUnavailable(status), false, `expected ${status} not to be unavailable`);
  }
});

test("only credential rejections count as auth rejections", () => {
  for (const status of [400, 401, 403]) {
    assert.equal(isAuthRejection(status), true, `expected ${status} to be an auth rejection`);
  }
  for (const status of [0, 200, 429, 500, 502, 503]) {
    assert.equal(isAuthRejection(status), false, `expected ${status} not to be an auth rejection`);
  }
});

test("the two classifications never overlap (an outage cannot log a user out)", () => {
  for (let status = 0; status <= 599; status += 1) {
    assert.ok(
      !(isUpstreamUnavailable(status) && isAuthRejection(status)),
      `status ${status} must not be both unavailable and an auth rejection`
    );
  }
});

test("the outage message is user-facing and mentions retrying", () => {
  assert.match(UPSTREAM_UNAVAILABLE_MESSAGE, /try again/i);
});

test("missing or unreadable access tokens need a refresh", () => {
  assert.equal(accessTokenNeedsRefresh(undefined, NOW), true);
  assert.equal(accessTokenNeedsRefresh(null, NOW), true);
  assert.equal(accessTokenNeedsRefresh("", NOW), true);
  assert.equal(accessTokenNeedsRefresh("not-a-jwt", NOW), true);
  assert.equal(accessTokenNeedsRefresh("a.!!!not-base64!!!.c", NOW), true);
  assert.equal(accessTokenNeedsRefresh(tokenWithClaims({ sub: "user" }), NOW), true);
  assert.equal(accessTokenNeedsRefresh(tokenWithClaims({ exp: "soon" }), NOW), true);
});

test("a healthy access token is reused without a refresh round trip", () => {
  const token = tokenWithClaims({ exp: Math.floor((NOW + 10 * 60_000) / 1000) });
  assert.equal(accessTokenNeedsRefresh(token, NOW), false);
});

test("an expired access token is refreshed before the next API call", () => {
  const token = tokenWithClaims({ exp: Math.floor((NOW - 60_000) / 1000) });
  assert.equal(accessTokenNeedsRefresh(token, NOW), true);
});

test("a token inside the clock-skew margin is refreshed early", () => {
  const token = tokenWithClaims({ exp: Math.floor((NOW + 10_000) / 1000) });
  assert.equal(accessTokenNeedsRefresh(token, NOW, 30_000), true);
  assert.equal(accessTokenNeedsRefresh(token, NOW, 0), false);
});

test("a token expiring exactly now is refreshed", () => {
  const token = tokenWithClaims({ exp: Math.floor(NOW / 1000) });
  assert.equal(accessTokenNeedsRefresh(token, NOW, 0), true);
});
