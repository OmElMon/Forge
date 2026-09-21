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

test("a rejected rotation another tab already superseded does not sign the user out", async () => {
  // Simulates a second tab that lost the rotation race: its refresh call is
  // rejected, but the winner's cookies are already shared with it, so the
  // follow-up session probe succeeds and there is no logout.
  let sessionProbes = 0;
  let refreshCalls = 0;
  let dataCalls = 0;
  let sessionLost = 0;
  const client = createSessionClient({
    fetch: async (input) => {
      if (input === "/api/auth/refresh") {
        refreshCalls += 1;
        return json(401);
      }
      if (input === "/api/auth/session") {
        sessionProbes += 1;
        return json(sessionProbes === 1 ? 401 : 200);
      }
      dataCalls += 1;
      return json(dataCalls === 1 ? 401 : 200);
    },
    onSessionLost: () => {
      sessionLost += 1;
    },
  });

  const response = await client.apiFetch("/api/customers");

  assert.equal(response.status, 200, "the read recovers using the other tab's tokens");
  assert.equal(sessionLost, 0, "a superseded rotation is not a logout");
  assert.equal(refreshCalls, 1, "the rejected rotation is not retried");
  assert.equal(sessionProbes, 2, "the probe is re-read after the rejected rotation");
});

test("a genuinely dead session is still reported after the confirming probe", async () => {
  let sessionProbes = 0;
  let sessionLost = 0;
  const client = createSessionClient({
    fetch: async (input) => {
      if (input === "/api/auth/session") sessionProbes += 1;
      return json(401);
    },
    onSessionLost: () => {
      sessionLost += 1;
    },
  });

  const response = await client.apiFetch("/api/customers");

  assert.equal(response.status, 401);
  assert.equal(sessionLost, 1);
  assert.equal(sessionProbes, 2, "confirming probe runs before declaring the session lost");
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

// --------------------------------------------------------------------------- //
// Auth-path classification: protected MFA routes participate, public ones do not
// --------------------------------------------------------------------------- //

/**
 * Backend where the access token is expired and only the listed paths answer
 * 401 permanently (a wrong password, a bad one-time code), so a rotation must
 * never be triggered by them.
 */
class AuthPathBackend {
  accessValid = false;
  refreshCalls = 0;
  private calls = new Map<string, number>();
  private readonly alwaysUnauthorized: string[];

  constructor(alwaysUnauthorized: string[] = []) {
    this.alwaysUnauthorized = alwaysUnauthorized;
  }

  fetch = async (input: string): Promise<Response> => {
    this.calls.set(input, (this.calls.get(input) ?? 0) + 1);
    // Checked first so a path can be declared permanently unauthorized even if
    // it is one the backend otherwise treats specially.
    if (this.alwaysUnauthorized.includes(input)) return json(401);
    if (input === "/api/auth/session") return json(this.accessValid ? 200 : 401);
    if (input === "/api/auth/refresh") {
      this.refreshCalls += 1;
      this.accessValid = true;
      return json(200);
    }
    return json(this.accessValid ? 200 : 401);
  };

  count(path: string): number {
    return this.calls.get(path) ?? 0;
  }
}

function clientFor(backend: AuthPathBackend, onLost?: () => void) {
  return createSessionClient({
    fetch: (input) => backend.fetch(input),
    onSessionLost: onLost,
  });
}

const PROTECTED_MFA_MUTATIONS = [
  "/api/auth/mfa/enroll",
  "/api/auth/mfa/enroll/confirm",
  "/api/auth/mfa/disable",
];

// Requirement: the four authenticated MFA routes opt in explicitly.
test("an expired-session GET to /api/auth/mfa/status renews once and retries once", async () => {
  const backend = new AuthPathBackend();
  const client = clientFor(backend);

  const response = await client.apiFetch("/api/auth/mfa/status", { cache: "no-store" });

  assert.equal(response.status, 200, "the MFA status read recovers after renewal");
  assert.equal(backend.refreshCalls, 1, "exactly one rotation");
  assert.equal(backend.count("/api/auth/mfa/status"), 2, "original read + exactly one retry");
});

for (const path of PROTECTED_MFA_MUTATIONS) {
  test(`${path} renews the session but is never replayed`, async () => {
    const backend = new AuthPathBackend();
    const client = clientFor(backend);

    const response = await client.apiFetch(path, { method: "POST", body: JSON.stringify({ code: "123456" }) });

    assert.equal(response.status, 401, "the caller still sees the failure");
    assert.equal(backend.refreshCalls, 1, "the session is renewed for the next attempt");
    assert.equal(backend.count(path), 1, "the mutation is sent exactly once, never replayed");
  });
}

// Requirement: a rate-limited or failing renewal on a protected MFA route is not
// a logout, whichever leg fails.
for (const failure of [429, 503, "network"] as const) {
  for (const failingLeg of ["session", "refresh"] as const) {
    test(`a ${failure} on the ${failingLeg} leg of MFA renewal keeps the session`, async () => {
      let logouts = 0;
      const client = createSessionClient({
        fetch: async (input) => {
          if (input === "/api/auth/session") {
            if (failingLeg === "session") return respond(failure);
            return json(401); // probe rejected, so a rotation is attempted
          }
          if (input === "/api/auth/refresh") {
            if (failingLeg === "refresh") return respond(failure);
            return json(200);
          }
          return json(401); // the protected MFA route: expired access token
        },
        onSessionLost: () => {
          logouts += 1;
        },
      });

      const response = await client.apiFetch("/api/auth/mfa/status", { cache: "no-store" });

      assert.equal(response.status, 401);
      assert.equal(logouts, 0, `${failure} on ${failingLeg} must not sign the user out`);
    });
  }
}

function respond(failure: 429 | 503 | "network"): Response {
  if (failure === "network") throw new TypeError("Failed to fetch");
  return json(failure);
}

// Requirement: public and login-time auth endpoints stay excluded by default.
const EXCLUDED_AUTH_PATHS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/auth/refresh",
  "/api/auth/mfa/verify",
  "/api/auth/password-reset",
  "/api/auth/password-reset/confirm",
  "/api/auth/email-verify",
  "/api/auth/email-verify/confirm",
  "/api/auth/invites/accept",
];

for (const path of EXCLUDED_AUTH_PATHS) {
  test(`${path} never triggers session renewal`, async () => {
    const backend = new AuthPathBackend([path]);
    const client = clientFor(backend);

    const response = await client.apiFetch(path, { method: "POST", body: "{}" });

    assert.equal(response.status, 401);
    assert.equal(backend.refreshCalls, 0, `${path} must stay out of session renewal`);
    assert.equal(backend.count(path), 1);
  });
}

test("a wrong password and a rejected login MFA code are not expired sessions", async () => {
  const backend = new AuthPathBackend(["/api/auth/login", "/api/auth/mfa/verify"]);
  const client = clientFor(backend);

  const login = await client.apiFetch("/api/auth/login", { method: "POST", body: "{}" });
  const mfa = await client.apiFetch("/api/auth/mfa/verify", { method: "POST", body: "{}" });

  assert.equal(login.status, 401);
  assert.equal(mfa.status, 401);
  assert.equal(backend.refreshCalls, 0, "sign-in failures must never rotate a session");
});
