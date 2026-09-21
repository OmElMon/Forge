import assert from "node:assert/strict";
import { test } from "node:test";

import { createSessionClient, type SessionStatus } from "./session-client.ts";

/**
 * Minimal stand-in for the BFF session endpoints. `accessValid` models the
 * short-lived access cookie; a successful `/api/auth/refresh` rotates the
 * single-use refresh token and issues a new access token.
 */
class FakeBackend {
  accessValid = false;
  refreshOutcome: "ok" | "rejected" | "unavailable" | "network" = "ok";
  refreshCalls = 0;
  sessionCalls = 0;
  dataCalls = new Map<string, number>();
  private inFlightRefreshes = 0;
  peakConcurrentRefreshes = 0;

  async fetch(input: string, init?: RequestInit): Promise<Response> {
    if (input === "/api/auth/session") {
      this.sessionCalls += 1;
      return json(this.accessValid ? 200 : 401);
    }
    if (input === "/api/auth/refresh") {
      this.refreshCalls += 1;
      this.inFlightRefreshes += 1;
      this.peakConcurrentRefreshes = Math.max(this.peakConcurrentRefreshes, this.inFlightRefreshes);
      // A real rotation is a network + DB round trip; yield so any racing
      // request would overlap here if the client were not serializing them.
      await new Promise((resolve) => setTimeout(resolve, 5));
      this.inFlightRefreshes -= 1;
      if (this.refreshOutcome === "network") throw new TypeError("Failed to fetch");
      if (this.refreshOutcome === "unavailable") return json(503);
      if (this.refreshOutcome === "rejected") return json(401);
      this.accessValid = true;
      return json(200);
    }
    this.dataCalls.set(input, (this.dataCalls.get(input) ?? 0) + 1);
    return json(this.accessValid ? 200 : 401);
  }

  dataCallCount(input: string): number {
    return this.dataCalls.get(input) ?? 0;
  }
}

function json(status: number): Response {
  return new Response(JSON.stringify({ status }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Serializes work the way the browser's Web Locks API does across tabs. */
function makeSharedLock() {
  let tail: Promise<unknown> = Promise.resolve();
  return function acquireLock<T>(work: () => Promise<T>): Promise<T> {
    const run = tail.then(work, work);
    tail = run.catch(() => undefined);
    return run;
  };
}

function makeClient(backend: FakeBackend, onLost?: () => void, lock?: ReturnType<typeof makeSharedLock>) {
  return createSessionClient({
    fetch: (input, init) => backend.fetch(input, init),
    acquireLock: lock,
    onSessionLost: onLost,
  });
}

const DASHBOARD_BURST = [
  "/api/customers",
  "/api/jobs",
  "/api/invoices",
  "/api/technicians",
  "/api/audit-logs?limit=100",
  "/api/analytics/summary",
];

test("a concurrent dashboard burst rotates the refresh token exactly once", async () => {
  const backend = new FakeBackend(); // access token already expired
  const client = makeClient(backend);

  const responses = await Promise.all(DASHBOARD_BURST.map((path) => client.apiFetch(path)));

  assert.equal(backend.refreshCalls, 1, "exactly one rotation for the whole burst");
  assert.equal(backend.peakConcurrentRefreshes, 1, "no two rotations overlapped");
  assert.deepEqual(
    responses.map((response) => response.status),
    DASHBOARD_BURST.map(() => 200),
    "every read recovered, so the user stays signed in"
  );
});

test("the user is not signed out by their own parallel requests", async () => {
  const backend = new FakeBackend();
  let sessionLost = 0;
  const client = makeClient(backend, () => {
    sessionLost += 1;
  });

  await Promise.all(DASHBOARD_BURST.map((path) => client.apiFetch(path)));

  assert.equal(sessionLost, 0, "no logout while a rotation succeeded");
  assert.equal(backend.refreshCalls, 1);
});

test("two tabs sharing a session rotate once, not once per tab", async () => {
  const backend = new FakeBackend();
  const lock = makeSharedLock();
  const tabA = makeClient(backend, undefined, lock);
  const tabB = makeClient(backend, undefined, lock);

  const [a, b] = await Promise.all([tabA.apiFetch("/api/customers"), tabB.apiFetch("/api/jobs")]);

  assert.equal(backend.refreshCalls, 1, "the second tab found the session already renewed");
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
});

test("every read is replayed at most once", async () => {
  const backend = new FakeBackend();
  // Renewal succeeds but the access token still fails: the retry must not loop.
  backend.refreshOutcome = "ok";
  const client = createSessionClient({
    fetch: async (input, init) => {
      if (input === "/api/auth/refresh") {
        backend.refreshCalls += 1;
        return json(200); // pretend success without validating access
      }
      if (input === "/api/auth/session") return json(401);
      backend.dataCalls.set(input, (backend.dataCalls.get(input) ?? 0) + 1);
      return json(401);
    },
  });

  const response = await client.apiFetch("/api/customers");

  assert.equal(response.status, 401);
  assert.equal(backend.dataCallCount("/api/customers"), 2, "original + exactly one retry");
});

test("mutations are never replayed, but the session is renewed for the next attempt", async () => {
  const backend = new FakeBackend();
  const client = makeClient(backend);

  const response = await client.apiFetch("/api/customers", {
    method: "POST",
    body: JSON.stringify({ name: "Ada" }),
  });

  assert.equal(response.status, 401, "the caller still sees the failure");
  assert.equal(backend.dataCallCount("/api/customers"), 1, "the POST was sent exactly once");
  assert.equal(backend.refreshCalls, 1, "the session was renewed for the next attempt");
  assert.equal(backend.accessValid, true);
});

test("PUT, PATCH and DELETE are not replayed either", async () => {
  for (const method of ["PUT", "PATCH", "DELETE"]) {
    const backend = new FakeBackend();
    const client = makeClient(backend);
    await client.apiFetch("/api/customers/1", { method });
    assert.equal(backend.dataCallCount("/api/customers/1"), 1, `${method} must not be replayed`);
  }
});

test("a definitively rejected session is reported once and clears nothing itself", async () => {
  const backend = new FakeBackend();
  backend.refreshOutcome = "rejected";
  let sessionLost = 0;
  const client = makeClient(backend, () => {
    sessionLost += 1;
  });

  const responses = await Promise.all(DASHBOARD_BURST.map((path) => client.apiFetch(path)));

  assert.equal(backend.refreshCalls, 1, "one rejection attempt, not one per request");
  assert.equal(sessionLost, 1);
  assert.deepEqual(
    responses.map((response) => response.status),
    DASHBOARD_BURST.map(() => 401)
  );
});

test("an outage is never treated as a logout", async () => {
  for (const outcome of ["unavailable", "network"] as const) {
    const backend = new FakeBackend();
    backend.refreshOutcome = outcome;
    let sessionLost = 0;
    const client = makeClient(backend, () => {
      sessionLost += 1;
    });

    const response = await client.apiFetch("/api/customers");

    assert.equal(response.status, 401);
    assert.equal(sessionLost, 0, `${outcome} must not sign the user out`);
    assert.equal(backend.refreshCalls, 1);
  }
});

test("no rotation happens when the session is already valid", async () => {
  const backend = new FakeBackend();
  backend.accessValid = true;
  const client = makeClient(backend);

  const response = await client.apiFetch("/api/customers");

  assert.equal(response.status, 200);
  assert.equal(backend.refreshCalls, 0, "a healthy session must not rotate");
  assert.equal(backend.sessionCalls, 0, "and must not need a renewal check");
});

test("non-401 failures pass straight through without renewal", async () => {
  for (const status of [400, 403, 404, 409, 422, 500, 503]) {
    const backend = new FakeBackend();
    const client = createSessionClient({
      fetch: async (input) => {
        if (input === "/api/auth/refresh") {
          backend.refreshCalls += 1;
          return json(200);
        }
        return json(status);
      },
    });

    const response = await client.apiFetch("/api/customers");

    assert.equal(response.status, status);
    assert.equal(backend.refreshCalls, 0, `status ${status} must not trigger renewal`);
  }
});

test("a renewal that another context already performed is reused", async () => {
  const backend = new FakeBackend();
  backend.accessValid = true; // e.g. a previous tab just rotated the tokens
  const client = makeClient(backend);

  const status: SessionStatus = await client.ensureSession();

  assert.equal(status, "ok");
  assert.equal(backend.refreshCalls, 0);
});

test("a failed sign-in is not mistaken for an expired session", async () => {
  const backend = new FakeBackend();
  let sessionLost = 0;
  const client = createSessionClient({
    fetch: async (input) => {
      if (input === "/api/auth/refresh") {
        backend.refreshCalls += 1;
        return json(200);
      }
      return json(401);
    },
    onSessionLost: () => {
      sessionLost += 1;
    },
  });

  const response = await client.apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "owner@example.com", password: "wrong" }),
  });

  assert.equal(response.status, 401);
  assert.equal(backend.refreshCalls, 0, "a wrong password must not rotate the session");
  assert.equal(sessionLost, 0, "and must not redirect the user away from sign-in");
});

test("the session probe does participate so pages can recover on load", async () => {
  const backend = new FakeBackend();
  const client = makeClient(backend);

  const response = await client.apiFetch("/api/auth/session");

  assert.equal(response.status, 200);
  assert.equal(backend.refreshCalls, 1);
});

test("requests outside /api are left alone", async () => {
  const backend = new FakeBackend();
  const client = makeClient(backend);

  const response = await client.apiFetch("/dashboard/customers?_rsc=abc");

  assert.equal(response.status, 401);
  assert.equal(backend.refreshCalls, 0);
});
