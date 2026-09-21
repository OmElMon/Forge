import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isAuthRejection,
  isUpstreamUnavailable,
  UPSTREAM_UNAVAILABLE_MESSAGE,
} from "./session-policy.ts";

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
