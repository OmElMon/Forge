/**
 * Client-side session coordinator — the single place that renews a session.
 *
 * Refresh sessions are rotating and single-use: `POST /auth/refresh` revokes the
 * presented token and issues a successor. If several requests each rotate the
 * same token, the losers get 401 and the browser can be signed out even though a
 * rotation succeeded. That is why nothing on the server side of the web app
 * rotates a refresh token any more; only this module does, and it does so once.
 *
 * Guarantees:
 * - single-flight: concurrent callers inside one page share one renewal promise,
 *   so a dashboard burst of parallel reads produces exactly one rotation;
 * - cross-tab: renewal runs under the Web Locks `crewpilot.session.refresh` lock
 *   and re-checks the session after acquiring it, so a tab that lost the race
 *   finds the session already renewed instead of rotating a second time;
 * - reads only: a failed read is retried once after a successful renewal, and a
 *   mutation (POST/PATCH/PUT/DELETE) is never replayed;
 * - infrastructure safe: a timeout or 5xx during renewal is reported as
 *   "unavailable" and never treated as a logout.
 *
 * The module is dependency-free and takes its `fetch`, lock and "session lost"
 * hooks as options so the concurrency behaviour can be unit tested in Node.
 */

export type SessionStatus = "ok" | "renewed" | "unavailable" | "rejected";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type SessionClientOptions = {
  fetch: FetchLike;
  /** Serializes renewal across tabs (Web Locks in the browser). */
  acquireLock?: <T>(work: () => Promise<T>) => Promise<T>;
  /** Called only after the backend definitively rejects the session. */
  onSessionLost?: () => void;
};

const SESSION_PATH = "/api/auth/session";
const REFRESH_PATH = "/api/auth/refresh";
const SESSION_LOCK = "crewpilot.session.refresh";

// Only idempotent, body-free methods are ever replayed. A mutation that hits an
// expired access token renews the session for the *next* attempt instead.
const REPLAYABLE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function classify(response: Response): SessionStatus {
  if (response.ok) return "ok";
  // A timeout or an upstream/server failure is not an authentication verdict.
  return response.status >= 500 ? "unavailable" : "rejected";
}

/**
 * Which requests may take part in session recovery. `/api/auth/*` is excluded:
 * a 401 from `POST /api/auth/login` means "wrong password", not "your session
 * expired", and treating it as the latter would burn a refresh rotation and
 * redirect the user mid-sign-in. The session probe itself is the one auth path
 * that does participate, because pages use it to load the signed-in principal.
 */
function shouldCoordinate(path: string): boolean {
  if (!path.startsWith("/api/")) return false;
  if (!path.startsWith("/api/auth/")) return true;
  return path === SESSION_PATH;
}

export function createSessionClient(options: SessionClientOptions) {
  const { fetch: doFetch, acquireLock, onSessionLost } = options;
  let inFlight: Promise<SessionStatus> | null = null;

  /** Read the current session without rotating anything. */
  async function readSession(): Promise<SessionStatus> {
    try {
      return classify(await doFetch(SESSION_PATH, { cache: "no-store" }));
    } catch {
      return "unavailable";
    }
  }

  async function rotate(): Promise<SessionStatus> {
    try {
      return classify(await doFetch(REFRESH_PATH, { method: "POST", cache: "no-store" }));
    } catch {
      return "unavailable";
    }
  }

  async function renew(): Promise<SessionStatus> {
    const run = async () => {
      // Re-check after taking the lock: another tab may have renewed the session
      // while this one was waiting, in which case rotating again would burn a
      // second single-use token for no reason.
      const current = await readSession();
      if (current !== "rejected") return current;
      return rotate();
    };
    return acquireLock ? acquireLock(run) : run();
  }

  function ensureSession(): Promise<SessionStatus> {
    if (!inFlight) {
      inFlight = renew()
        .then((status) => {
          if (status === "rejected") onSessionLost?.();
          return status;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  }

  async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
    const response = await doFetch(input, init);
    if (response.status !== 401) return response;
    if (!shouldCoordinate(input.split("?")[0])) return response;

    const status = await ensureSession();
    if (status !== "ok" && status !== "renewed") return response;

    const method = (init?.method ?? "GET").toUpperCase();
    if (!REPLAYABLE_METHODS.has(method)) return response;

    return doFetch(input, init);
  }

  return { apiFetch, ensureSession, readSession };
}

function browserLock<T>(work: () => Promise<T>): Promise<T> {
  const locks = globalThis.navigator?.locks;
  if (!locks) return work();
  return locks.request(SESSION_LOCK, work) as Promise<T>;
}

export const sessionClient = createSessionClient({
  fetch: (input, init) => globalThis.fetch(input, init),
  acquireLock: browserLock,
  onSessionLost: () => {
    globalThis.window?.location.assign("/login");
  },
});

export const apiFetch = sessionClient.apiFetch;
export const ensureSession = sessionClient.ensureSession;
