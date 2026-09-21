/**
 * Route-level, cookie-aware session tests.
 *
 * These drive the *real* BFF route handlers through a shared cookie jar, so
 * `Set-Cookie` behaviour is exercised for real: the assertions below fail if a
 * rejected refresh response deletes cookies that another tab just refreshed.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { NextRequest } from "next/server";

import { GET as mfaStatusRoute } from "../app/api/auth/mfa/status/route.ts";
import { POST as refreshRoute } from "../app/api/auth/refresh/route.ts";
import { DELETE as clearSessionRoute, GET as sessionRoute } from "../app/api/auth/session/route.ts";
import { createSessionClient } from "../lib/session-client.ts";

type Jar = Map<string, string>;

const ACCESS = "forge_access";
const REFRESH = "forge_refresh";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function cookieHeader(jar: Jar): string {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

/** Apply a response's Set-Cookie headers to a jar, exactly as a browser would. */
function applySetCookie(jar: Jar, response: Response): void {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attributes] = raw.split(";");
    const name = pair.slice(0, pair.indexOf("=")).trim();
    const value = pair.slice(pair.indexOf("=") + 1).trim();
    const clears = attributes.some((attribute) =>
      attribute.trim().toLowerCase().startsWith("max-age=0")
    );
    if (!value || clears) jar.delete(name);
    else jar.set(name, value);
  }
}

/** Stand-in for the FastAPI backend that the BFF route handlers call. */
class FakeBackend {
  access = "access-1";
  refresh = "refresh-1";
  refreshStatus: number | "network" | null = null;
  meStatus: number | null = null;
  refreshCalls = 0;
  meCalls = 0;
  private counter = 1;

  fetch: typeof fetch = async (input, init) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (url.includes("/auth/refresh")) {
      this.refreshCalls += 1;
      if (this.refreshStatus === "network") throw new TypeError("Failed to fetch");
      if (typeof this.refreshStatus === "number") return json(this.refreshStatus, {});
      const body = JSON.parse(String(init?.body ?? "{}")) as { refresh_token?: string };
      if (body.refresh_token !== this.refresh) return json(401, { detail: "Invalid session" });
      this.counter += 1;
      this.access = `access-${this.counter}`;
      this.refresh = `refresh-${this.counter}`;
      return json(200, {
        access_token: this.access,
        refresh_token: this.refresh,
        token_type: "bearer",
        expires_in: 900,
      });
    }

    if (url.includes("/auth/me")) {
      this.meCalls += 1;
      if (typeof this.meStatus === "number") return json(this.meStatus, {});
      const authorization = new Headers(init?.headers as HeadersInit | undefined).get(
        "authorization"
      );
      if (authorization !== `Bearer ${this.access}`) {
        return json(401, { detail: "Could not validate credentials" });
      }
      return json(200, {
        user_id: "u1",
        company_id: "c1",
        email: "owner@example.com",
        full_name: "Owner",
        company_name: "Ace HVAC",
        role: "owner",
      });
    }

    if (url.includes("/auth/mfa")) {
      const authorization = new Headers(init?.headers as HeadersInit | undefined).get(
        "authorization"
      );
      if (authorization !== `Bearer ${this.access}`) {
        return json(401, { detail: "Could not validate credentials" });
      }
      return json(200, { enrolled: false, confirmed: false, pending: false });
    }

    throw new Error(`unexpected backend call: ${url}`);
  };
}

type RouteFetch = (
  input: string,
  init?: RequestInit,
  cookiesFrom?: Jar
) => Promise<Response>;

/** Dispatch to the real route handlers, applying Set-Cookie to the shared jar. */
function makeRouteFetch(jar: Jar, backend: FakeBackend) {
  const dataCalls = new Map<string, number>();
  const routeCalls = new Map<string, number>();

  const routeFetch: RouteFetch = async (input, init, cookiesFrom = jar) => {
    const url = new URL(input, "http://localhost");
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers({ cookie: cookieHeader(cookiesFrom), "sec-fetch-site": "same-origin" });
    const request = new NextRequest(url, {
      method,
      headers,
      body:
        method === "GET" || method === "DELETE"
          ? undefined
          : ((init?.body ?? undefined) as BodyInit | undefined),
    });

    let response: Response;
    if (url.pathname.startsWith("/api/auth/")) {
      routeCalls.set(url.pathname, (routeCalls.get(url.pathname) ?? 0) + 1);
    }
    if (url.pathname === "/api/auth/session" && method === "GET") {
      response = await sessionRoute(request);
    } else if (url.pathname === "/api/auth/session" && method === "DELETE") {
      response = await clearSessionRoute(request);
    } else if (url.pathname === "/api/auth/refresh" && method === "POST") {
      response = await refreshRoute(request);
    } else if (url.pathname === "/api/auth/mfa/status" && method === "GET") {
      response = await mfaStatusRoute(request);
    } else {
      dataCalls.set(input, (dataCalls.get(input) ?? 0) + 1);
      response =
        jar.get(ACCESS) === backend.access
          ? json(200, [])
          : json(401, { detail: "Could not validate credentials" });
    }

    applySetCookie(jar, response);
    return response;
  };

  return { routeFetch, dataCalls, routeCalls };
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// --------------------------------------------------------------------------- //
// The cookie-deletion regression
// --------------------------------------------------------------------------- //

test("a rejected losing refresh does not delete the winner's fresh cookies", async () => {
  const backend = new FakeBackend();
  globalThis.fetch = backend.fetch;

  const shared: Jar = new Map([
    [ACCESS, "expired"],
    [REFRESH, "refresh-1"],
  ]);
  const losingTab: Jar = new Map(shared);
  const { routeFetch } = makeRouteFetch(shared, backend);

  // The winning tab rotates first and the browser stores its fresh cookies.
  const winner = await routeFetch("/api/auth/refresh", { method: "POST" });
  assert.equal(winner.status, 200);
  assert.equal(shared.get(REFRESH), "refresh-2");

  // The losing tab still holds the token it captured before that rotation.
  // Its response is applied to the shared jar, as the browser would.
  const loser = await routeFetch("/api/auth/refresh", { method: "POST" }, losingTab);

  assert.equal(loser.status, 401);
  assert.deepEqual(
    loser.headers.getSetCookie(),
    [],
    "a rejected refresh must not emit cookie deletions"
  );
  assert.equal(shared.get(ACCESS), "access-2", "the winner's access cookie survives");
  assert.equal(shared.get(REFRESH), "refresh-2", "the winner's refresh cookie survives");
});

test("after the rejection, the winner's session still probes as valid", async () => {
  const backend = new FakeBackend();
  globalThis.fetch = backend.fetch;

  const shared: Jar = new Map([
    [ACCESS, "expired"],
    [REFRESH, "refresh-1"],
  ]);
  const losingTab: Jar = new Map(shared);
  const { routeFetch } = makeRouteFetch(shared, backend);

  await routeFetch("/api/auth/refresh", { method: "POST" });
  await routeFetch("/api/auth/refresh", { method: "POST" }, losingTab);

  const probe = await routeFetch("/api/auth/session");
  assert.equal(probe.status, 200, "the confirming probe must observe the winning session");
  assert.equal((await probe.json()).company_name, "Ace HVAC");
});

// --------------------------------------------------------------------------- //
// Coordinator behaviour against the real routes
// --------------------------------------------------------------------------- //

test("the coordinator confirms the other tab's rotation and retries the read once", async () => {
  const backend = new FakeBackend();
  globalThis.fetch = backend.fetch;

  const shared: Jar = new Map([
    [ACCESS, "expired"],
    [REFRESH, "refresh-1"],
  ]);
  // The losing tab's refresh request was already in flight with this snapshot of
  // the cookies, so it still carries the token the winner is rotating away.
  const inFlightSnapshot: Jar = new Map(shared);
  const { routeFetch, dataCalls } = makeRouteFetch(shared, backend);

  let logouts = 0;
  const client = createSessionClient({
    fetch: async (input, init) => {
      if (input === "/api/auth/refresh") {
        // The winner's rotation lands while this tab's request is in flight.
        assert.equal((await routeFetch("/api/auth/refresh", { method: "POST" })).status, 200);
        return routeFetch(input, init, inFlightSnapshot);
      }
      return routeFetch(input, init);
    },
    onSessionLost: () => {
      logouts += 1;
    },
  });

  const response = await client.apiFetch("/api/customers");

  assert.equal(response.status, 200, "the read recovers from the other tab's tokens");
  assert.equal(logouts, 0, "a losing rotation must not sign the user out");
  assert.equal(dataCalls.get("/api/customers"), 2, "the read is retried exactly once");
  assert.equal(backend.refreshCalls, 2, "one winning and one rejected rotation attempt");
  assert.equal(shared.get(REFRESH), "refresh-2", "the loser did not consume another rotation");
});

test("a genuinely dead session clears cookies once through the explicit endpoint", async () => {
  const backend = new FakeBackend();
  backend.refresh = "already-rotated-elsewhere"; // every rotation attempt is rejected
  globalThis.fetch = backend.fetch;

  const jar: Jar = new Map([
    [ACCESS, "expired"],
    [REFRESH, "refresh-1"],
  ]);
  const { routeFetch } = makeRouteFetch(jar, backend);

  let redirects = 0;
  let clears = 0;
  const client = createSessionClient({
    fetch: (input, init) => routeFetch(input, init),
    onSessionLost: async () => {
      redirects += 1;
      const cleared = await routeFetch("/api/auth/session", { method: "DELETE" });
      assert.equal(cleared.status, 200);
      clears += 1;
    },
  });

  const responses = await Promise.all([
    client.apiFetch("/api/customers"),
    client.apiFetch("/api/jobs"),
    client.apiFetch("/api/invoices"),
  ]);
  await client.apiFetch("/api/technicians"); // a later action must not clear again

  assert.deepEqual(
    responses.map((response) => response.status),
    [401, 401, 401]
  );
  assert.equal(clears, 1, "cookies are cleared exactly once");
  assert.equal(redirects, 1, "the redirect happens exactly once");
  assert.equal(jar.size, 0, "the dead session's cookies are gone");
});

test("an unexpected status such as 422 is never an authentication verdict", async () => {
  const backend = new FakeBackend();
  let refreshCalls = 0;
  const client = createSessionClient({
    fetch: async (input) => {
      if (input === "/api/auth/refresh") {
        refreshCalls += 1;
        return json(422, { detail: "Unprocessable" });
      }
      if (input === "/api/auth/session") return json(401, {});
      return json(401, {});
    },
    onSessionLost: () => {
      throw new Error("unexpected statuses must not sign the user out");
    },
  });

  const response = await client.apiFetch("/api/customers");

  assert.equal(response.status, 401);
  assert.equal(refreshCalls, 1);
});

// --------------------------------------------------------------------------- //
// Retryable statuses
// --------------------------------------------------------------------------- //

test("a 429 from the session probe preserves cookies and does not redirect", async () => {
  const backend = new FakeBackend();
  backend.meStatus = 429;
  globalThis.fetch = backend.fetch;

  const jar: Jar = new Map([
    [ACCESS, "expired"],
    [REFRESH, "refresh-1"],
  ]);
  const { routeFetch } = makeRouteFetch(jar, backend);

  const probe = await routeFetch("/api/auth/session");
  assert.equal(probe.status, 429, "the BFF must pass a rate limit through, not turn it into 401");
  assert.deepEqual(probe.headers.getSetCookie(), []);

  let logouts = 0;
  const client = createSessionClient({
    fetch: (input, init) => routeFetch(input, init),
    onSessionLost: () => {
      logouts += 1;
    },
  });
  const response = await client.apiFetch("/api/customers");

  assert.equal(response.status, 401);
  assert.equal(logouts, 0, "a rate-limited user is still a signed-in user");
  assert.equal(jar.get(REFRESH), "refresh-1", "cookies survive the rate limit");
  assert.equal(backend.refreshCalls, 0, "a rate limit must not trigger a rotation");
});

test("a 429 from refresh preserves cookies and does not redirect", async () => {
  const backend = new FakeBackend();
  backend.refreshStatus = 429;
  globalThis.fetch = backend.fetch;

  const jar: Jar = new Map([
    [ACCESS, "expired"],
    [REFRESH, "refresh-1"],
  ]);
  const { routeFetch } = makeRouteFetch(jar, backend);

  let logouts = 0;
  const client = createSessionClient({
    fetch: (input, init) => routeFetch(input, init),
    onSessionLost: () => {
      logouts += 1;
    },
  });
  const response = await client.apiFetch("/api/customers");

  assert.equal(response.status, 401);
  assert.equal(logouts, 0);
  assert.equal(jar.get(REFRESH), "refresh-1", "the refresh cookie survives");
  assert.equal(jar.get(ACCESS), "expired", "the access cookie survives");
});

test("a 503 and a network failure from refresh preserve cookies", async () => {
  for (const failure of [503, "network"] as const) {
    const backend = new FakeBackend();
    backend.refreshStatus = failure;
    globalThis.fetch = backend.fetch;

    const jar: Jar = new Map([
      [ACCESS, "expired"],
      [REFRESH, "refresh-1"],
    ]);
    const { routeFetch } = makeRouteFetch(jar, backend);

    let logouts = 0;
    const client = createSessionClient({
      fetch: (input, init) => routeFetch(input, init),
      onSessionLost: () => {
        logouts += 1;
      },
    });
    await client.apiFetch("/api/customers");

    assert.equal(logouts, 0, `${failure} must not sign the user out`);
    assert.equal(jar.get(REFRESH), "refresh-1", `${failure} must preserve cookies`);
  }
});

// --------------------------------------------------------------------------- //
// Concurrency
// --------------------------------------------------------------------------- //

test("without Web Locks, a simulated refresh race cannot delete the winner's cookies", async () => {
  const backend = new FakeBackend();
  globalThis.fetch = backend.fetch;

  const shared: Jar = new Map([
    [ACCESS, "expired"],
    [REFRESH, "refresh-1"],
  ]);
  // Both tabs captured the same cookies before either response landed.
  const tabA: Jar = new Map(shared);
  const tabB: Jar = new Map(shared);
  const { routeFetch } = makeRouteFetch(shared, backend);

  let logouts = 0;
  const clientFor = (staleJar: Jar) =>
    createSessionClient({
      // No acquireLock: the pre-Web-Locks path.
      fetch: (input, init) =>
        input === "/api/auth/refresh" ? routeFetch(input, init, staleJar) : routeFetch(input, init),
      onSessionLost: () => {
        logouts += 1;
      },
    });

  const [a, b] = await Promise.all([
    clientFor(tabA).apiFetch("/api/customers"),
    clientFor(tabB).apiFetch("/api/jobs"),
  ]);

  assert.equal(a.status, 200);
  assert.equal(b.status, 200, "the losing tab recovers from the winner's cookies");
  assert.equal(logouts, 0, "the race must not delete a valid session");
  assert.equal(backend.refreshCalls, 2, "two attempts");
  assert.equal(shared.get(REFRESH), "refresh-2", "exactly one effective rotation");
});

// --------------------------------------------------------------------------- //
// Replay rules
// --------------------------------------------------------------------------- //

test("mutations are never replayed while reads are retried at most once", async () => {
  const backend = new FakeBackend();
  globalThis.fetch = backend.fetch;

  const jar: Jar = new Map([
    [ACCESS, "expired"],
    [REFRESH, "refresh-1"],
  ]);
  const { routeFetch, dataCalls } = makeRouteFetch(jar, backend);
  const client = createSessionClient({ fetch: (input, init) => routeFetch(input, init) });

  const read = await client.apiFetch("/api/customers");
  assert.equal(read.status, 200);
  assert.equal(dataCalls.get("/api/customers"), 2, "original read + one retry");

  jar.set(ACCESS, "expired-again");
  const mutation = await client.apiFetch("/api/customers", {
    method: "POST",
    body: JSON.stringify({ name: "Ada" }),
  });
  assert.equal(mutation.status, 401, "the caller still sees the failure");
  assert.equal(dataCalls.get("/api/customers"), 3, "the mutation is never replayed");
});

// --------------------------------------------------------------------------- //
// Protected MFA routes participate in renewal (route level)
// --------------------------------------------------------------------------- //

test("an expired-session MFA status read renews once and retries through the API", async () => {
  const backend = new FakeBackend();
  globalThis.fetch = backend.fetch;

  const jar: Jar = new Map([
    [ACCESS, "expired"],
    [REFRESH, "refresh-1"],
  ]);
  const { routeFetch, routeCalls } = makeRouteFetch(jar, backend);

  let logouts = 0;
  const client = createSessionClient({
    fetch: (input, init) => routeFetch(input, init),
    onSessionLost: () => {
      logouts += 1;
    },
  });

  const response = await client.apiFetch("/api/auth/mfa/status", { cache: "no-store" });

  assert.equal(response.status, 200, "the protected MFA read recovers after renewal");
  assert.equal((await response.json()).confirmed, false);
  assert.equal(backend.refreshCalls, 1, "exactly one rotation");
  assert.equal(jar.get(REFRESH), "refresh-2", "the rotation was stored");
  assert.equal(routeCalls.get("/api/auth/mfa/status"), 2, "original read + exactly one retry");
  assert.equal(logouts, 0);
});
