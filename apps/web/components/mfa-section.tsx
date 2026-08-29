"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";

type MfaStatus = {
  configured: boolean;
  confirmed: boolean;
};

type EnrollResult = {
  secret: string;
  provisioning_uri: string;
  recovery_codes: string[];
};

async function readApiResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
}

function errorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string") return error;
  return fallback;
}

export function MfaSection() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [enroll, setEnroll] = useState<EnrollResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [codesSaved, setCodesSaved] = useState(false);
  const [disablePrompt, setDisablePrompt] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"secret" | "all" | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/mfa/status", { cache: "no-store" })
      .then(async (response) => {
        const payload = await readApiResponse(response);
        if (!cancelled) {
          if (response.ok) setStatus(payload as MfaStatus);
          else setError(errorMessage(payload, "Unable to load two-factor status."));
        }
      })
      .catch(() => {
        if (!cancelled) setError("CrewPilot OS could not load two-factor status.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function startSetup() {
    setEnrolling(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa/enroll", { method: "POST" });
      const payload = await readApiResponse(response);
      if (response.status === 403) {
        setError("Only owners and admins can configure two-factor authentication.");
        return;
      }
      if (!response.ok) {
        setError(errorMessage(payload, "Unable to start two-factor setup."));
        return;
      }
      setEnroll(payload as EnrollResult);
    } catch {
      setError("CrewPilot OS could not start two-factor setup.");
    } finally {
      setEnrolling(false);
    }
  }

  async function confirmSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirming(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/mfa/enroll/confirm", {
        body: JSON.stringify({ code: form.get("code") }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(payload, "Unable to enable two-factor authentication."));
        return;
      }
      setStatus({ configured: true, confirmed: true });
    } catch {
      setError("CrewPilot OS could not enable two-factor authentication.");
    } finally {
      setConfirming(false);
    }
  }

  async function disable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDisabling(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/mfa/disable", {
        body: JSON.stringify({ code: form.get("code") }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(payload, "Unable to disable two-factor authentication."));
        return;
      }
      setStatus({ configured: false, confirmed: false });
      setEnroll(null);
      setCodesSaved(false);
      setDisablePrompt(false);
    } catch {
      setError("CrewPilot OS could not disable two-factor authentication.");
    } finally {
      setDisabling(false);
    }
  }

  async function copy(value: string, key: "secret" | "all") {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  }

  const enabled = status?.confirmed === true && !(enroll && !codesSaved);

  return (
    <section className="mt-8 overflow-hidden rounded-xl border bg-white shadow-panel">
      <div className="flex items-center gap-3 border-b px-5 py-4">
        <span className="grid size-9 place-items-center rounded-lg bg-indigo-50 text-indigo-700">
          <ShieldCheck className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold">Two-factor authentication</h2>
          <p className="text-xs text-gray-500">
            Adds a one-time code to sign-in for owners and admins.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-gray-500">
          <LoaderCircle className="size-4 animate-spin" />Loading…
        </div>
      ) : (
        <div className="space-y-4 p-5">
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}

          {enabled && (
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="size-4" />
                </span>
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    Two-factor authentication is on
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Enabled</span>
                  </p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    Sign-in requires a 6-digit code from your authenticator app or a recovery code.
                  </p>
                </div>
              </div>
              <div className="shrink-0">
                {disablePrompt ? (
                  <form onSubmit={disable} className="flex items-center gap-2">
                    <input
                      name="code"
                      required
                      inputMode="numeric"
                      minLength={6}
                      maxLength={64}
                      placeholder="Current code"
                      className="h-10 w-40 rounded-lg border px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    />
                    <button disabled={disabling} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
                      {disabling ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldOff className="size-4" />} Disable
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisablePrompt(false)}
                      className="h-10 rounded-lg px-2 text-sm font-medium text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setDisablePrompt(true);
                      setError("");
                    }}
                    className="inline-flex h-10 items-center rounded-lg border bg-white px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    Disable two-factor authentication
                  </button>
                )}
              </div>
            </div>
          )}

          {enroll && !codesSaved && (
            <div className="space-y-4">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-8 place-items-center rounded-lg bg-indigo-600 text-white">
                    <KeyRound className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-indigo-900">Scan or add your authenticator key</p>
                    <p className="text-sm text-indigo-800">
                      {status?.confirmed ? "Verification saved. Store these recovery codes somewhere safe." : "Open your authenticator app, then enter the rotating code below."}
                    </p>
                  </div>
                </div>
                <div className="mt-4 rounded-lg border border-indigo-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Manual setup key</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                    <code className="break-all text-sm font-semibold text-gray-900">{enroll.secret}</code>
                    <button
                      type="button"
                      onClick={() => copy(enroll.secret, "secret")}
                      className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      <Copy className="size-3.5" /> {copied === "secret" ? "Copied" : "Copy key"}
                    </button>
                  </div>
                </div>
                <a
                  href={enroll.provisioning_uri}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:text-indigo-900"
                >
                  Open in authenticator app <ExternalLink className="size-3.5" />
                </a>
              </div>

              {status?.confirmed ? (
                <div className="space-y-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                    <CheckCircle2 className="size-4" /> Two-factor authentication enabled
                  </p>
                  <div className="space-y-2">
                    {enroll.recovery_codes.map((code) => (
                      <code key={code} className="block rounded-lg border bg-gray-50 px-3 py-2 text-sm font-semibold tracking-wide text-gray-900">{code}</code>
                    ))}
                  </div>
                  <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                    Each recovery code works once. Save them now — they’re never shown again.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => copy(enroll.recovery_codes.join("\n"), "all")}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      <Copy className="size-4" /> {copied === "all" ? "Copied" : "Copy all codes"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCodesSaved(true)}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                      I’ve saved my codes
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={confirmSetup} className="flex flex-wrap items-end gap-2">
                  <label className="block flex-1 text-sm font-medium">
                    Verification code
                    <input
                      name="code"
                      required
                      inputMode="numeric"
                      minLength={6}
                      maxLength={6}
                      placeholder="6-digit code"
                      className="mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    />
                  </label>
                  <button
                    disabled={confirming}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {confirming ? <LoaderCircle className="size-4 animate-spin" /> : <><ShieldCheck className="size-4" /> Verify &amp; enable</>}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnroll(null)}
                    className="inline-flex h-11 items-center px-3 text-sm font-medium text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </form>
              )}
            </div>
          )}

          {!status?.confirmed && !enroll && (
            <div className="flex items-start justify-between gap-4">
              <p className="max-w-lg text-sm text-gray-500">
                Require a rotating 6-digit code on top of your password when signing in. Recommended for
                owners and admins; recovery codes keep you signed in even if you lose your device.
              </p>
              <button
                type="button"
                disabled={enrolling}
                onClick={startSetup}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {enrolling ? <LoaderCircle className="size-4 animate-spin" /> : <><ShieldCheck className="size-4" /> Set up</>}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}