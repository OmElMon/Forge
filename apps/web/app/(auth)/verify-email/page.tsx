"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck, Copy, KeyRound, LoaderCircle, MailCheck } from "lucide-react";

import { Logo } from "@/components/logo";

type ResetCodeDelivery = {
  status: string;
  channel: string;
  code_valid_seconds: number;
  dev_code: string | null;
};

export default function VerifyEmailPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [delivery, setDelivery] = useState<ResetCodeDelivery | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/email-verify", {
        body: JSON.stringify({ email: form.get("email") }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string } & Partial<ResetCodeDelivery>;
      if (!response.ok) {
        setError(payload.error ?? "Unable to request a verification code.");
        return;
      }
      setDelivery({
        status: payload.status ?? "sent",
        channel: payload.channel ?? "email",
        code_valid_seconds: payload.code_valid_seconds ?? 1440,
        dev_code: payload.dev_code ?? null,
      });
    } catch {
      setError("CrewPilot OS could not reach the authentication service.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setVerifying(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/email-verify/confirm", {
        body: JSON.stringify({ token: form.get("token") }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "That code didn’t verify. Try again.");
        return;
      }
      setVerified(true);
    } catch {
      setError("CrewPilot OS could not reach the authentication service.");
    } finally {
      setVerifying(false);
    }
  }

  async function copyCode() {
    if (!delivery?.dev_code) return;
    await navigator.clipboard.writeText(delivery.dev_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-2">
      <section className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <Logo />
          <div className="mt-14">
            <p className="text-sm font-semibold text-orange-600">Email verification</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Confirm your email</h1>
            <p className="mt-2 text-sm text-gray-500">
              Prove you own this address so your workspace credentials are locked to it.
            </p>
          </div>

          {verified ? (
            <div className="mt-8 space-y-5">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-lg bg-emerald-600 text-white">
                    <BadgeCheck className="size-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-emerald-900">Email verified</p>
                    <p className="text-sm text-emerald-800">Your address is confirmed. You’re all set.</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => router.replace("/login")}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-900 text-sm font-semibold text-white hover:bg-gray-800"
              >
                Continue to sign in <ArrowRight className="size-4" />
              </button>
            </div>
          ) : delivery ? (
            <div className="mt-8 space-y-5">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-lg bg-emerald-600 text-white">
                    <MailCheck className="size-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-emerald-900">Check your inbox</p>
                    <p className="text-sm text-emerald-800">
                      The verification code is valid for {Math.round(delivery.code_valid_seconds / 60)} minutes and can only be used once.
                    </p>
                  </div>
                </div>
                {delivery.dev_code && (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Local dev verification code
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <code className="break-all text-sm font-semibold text-gray-900">{delivery.dev_code}</code>
                      <button
                        type="button"
                        onClick={copyCode}
                        className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                      >
                        <Copy className="size-3.5" /> {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      No real email provider is configured, so your code is shown here.
                    </p>
                  </div>
                )}
              </div>

              <form onSubmit={confirmCode} className="space-y-4">
                <label className="block text-sm font-medium">
                  <span className="flex items-center gap-1.5"><KeyRound className="size-3.5 text-gray-400" /> Verification code</span>
                  <input
                    name="token"
                    required
                    minLength={20}
                    maxLength={200}
                    className="mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    placeholder="Paste your verification code"
                  />
                </label>
                {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
                <button disabled={verifying} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-900 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60">
                  {verifying ? <LoaderCircle className="size-4 animate-spin" /> : <>Verify email <ArrowRight className="size-4" /></>}
                </button>
              </form>
              <p className="text-center text-sm text-gray-500">
                {delivery.dev_code ? (
                  <button type="button" onClick={() => setDelivery(null)} className="font-medium text-orange-600 hover:text-orange-700">
                    Use a different email
                  </button>
                ) : (
                  <span>Didn’t get a code? Check spam, then try again.</span>
                )}
              </p>
            </div>
          ) : (
            <form onSubmit={requestCode} className="mt-8 space-y-5">
              <label className="block text-sm font-medium">
                Email address
                <input name="email" type="email" autoComplete="email" required className="mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="you@company.com" />
              </label>
              {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
              <button disabled={submitting} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-900 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <>Send verification code <ArrowRight className="size-4" /></>}
              </button>
              <p className="text-center text-sm text-gray-500">
                Already verified? <Link href="/login" className="font-semibold text-orange-600 hover:text-orange-700">Sign in</Link>
              </p>
            </form>
          )}
        </div>
      </section>
      <section className="relative hidden overflow-hidden bg-gray-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_75%_25%,#f97316_0,transparent_30%),radial-gradient(circle_at_20%_80%,#7c2d12_0,transparent_28%)]" />
        <p className="relative text-sm font-medium text-orange-400">SECURE ACCESS</p>
        <div className="relative max-w-xl">
          <blockquote className="text-3xl font-medium leading-tight tracking-tight">“Verification keeps your account recovery honest—someone’s in, only if you say so.”</blockquote>
          <p className="mt-5 text-sm text-gray-400">Verification codes are single-use and time-limited.</p>
        </div>
        <p className="relative text-xs text-gray-600">© 2026 CrewPilot OS</p>
      </section>
    </main>
  );
}