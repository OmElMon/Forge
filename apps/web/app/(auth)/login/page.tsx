"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LoaderCircle, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/logo";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [challenge, setChallenge] = useState<{ mfa_session: string } | null>(null);
  const [verifySubmitting, setVerifySubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        mfa_required?: boolean;
        mfa_session?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "Unable to sign in.");
        return;
      }
      if (payload.mfa_required && payload.mfa_session) {
        setChallenge({ mfa_session: payload.mfa_session });
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("CrewPilot OS could not reach the authentication service.");
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setVerifySubmitting(true);
    const form = new FormData(event.currentTarget);
    const mfaSession = challenge?.mfa_session ?? "";

    try {
      const response = await fetch("/api/auth/mfa/verify", {
        body: JSON.stringify({ mfa_session: mfaSession, code: form.get("code") }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "That code didn’t verify. Try again.");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("CrewPilot OS could not reach the authentication service.");
    } finally {
      setVerifySubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-2">
      <section className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <Logo />
          <div className="mt-14">
            <p className="text-sm font-semibold text-orange-600">Welcome back</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              {challenge ? "Verify it’s you" : "Sign in to CrewPilot OS"}
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              {challenge
                ? "Two-factor authentication is on for this account."
                : "Run your entire service operation from one place."}
            </p>
          </div>

          {challenge ? (
            <div className="mt-8 rounded-xl border bg-gray-50 p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-lg bg-indigo-600 text-white">
                  <ShieldCheck className="size-5" />
                </span>
                <div>
                  <p className="font-semibold text-gray-900">Enter your verification code</p>
                  <p className="text-sm text-gray-500">Use your authenticator app or a recovery code.</p>
                </div>
              </div>
              <form onSubmit={verifyCode} className="mt-5 space-y-4">
                <label className="block text-sm font-medium">
                  Verification code
                  <input
                    name="code"
                    required
                    autoFocus
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    minLength={6}
                    maxLength={64}
                    className="mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    placeholder="6-digit code"
                  />
                </label>
                {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
                <button
                  disabled={verifySubmitting}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-900 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {verifySubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <>Verify code <ArrowRight className="size-4" /></>}
                </button>
                <button
                  type="button"
                  onClick={() => setChallenge(null)}
                  className="w-full text-center text-sm font-medium text-gray-500 hover:text-gray-700"
                >
                  Use a different account
                </button>
              </form>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-8 space-y-5">
              <label className="block text-sm font-medium">
                Email address
                <input name="email" type="email" autoComplete="email" required className="mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="you@company.com" />
              </label>
              <label className="block text-sm font-medium">
                Password
                <div className="relative mt-2">
                  <input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required className="h-11 w-full rounded-lg border px-3 pr-11 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="••••••••••••" />
                  <button type="button" aria-label="Toggle password visibility" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </label>
              {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
              <div className="flex items-center justify-between">
                <button disabled={submitting} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-gray-900 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60">
                  {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <>Sign in <ArrowRight className="size-4" /></>}
                </button>
                <Link href="/forgot-password" className="ml-4 text-sm font-medium text-gray-500 hover:text-gray-700">
                  Forgot password?
                </Link>
              </div>
              <p className="text-center text-xs text-gray-400">
                Need to confirm your email address?{" "}
                <Link href="/verify-email" className="font-semibold text-orange-600 hover:text-orange-700">
                  Verify email
                </Link>
              </p>
            </form>
          )}

          {!challenge && (
            <p className="mt-6 text-center text-sm text-gray-500">
              Starting a new company? <Link href="/register" className="font-semibold text-orange-600 hover:text-orange-700">Create your workspace</Link>
            </p>
          )}
          <p className="mt-8 text-center text-xs text-gray-400">Protected with secure, rotating sessions</p>
        </div>
      </section>
      <section className="relative hidden overflow-hidden bg-gray-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_75%_25%,#f97316_0,transparent_30%),radial-gradient(circle_at_20%_80%,#7c2d12_0,transparent_28%)]" />
        <p className="relative text-sm font-medium text-orange-400">BUILT FOR THE TRADES</p>
        <div className="relative max-w-xl">
          <blockquote className="text-3xl font-medium leading-tight tracking-tight">“Your team should spend their day serving customers—not wrestling with software.”</blockquote>
          <p className="mt-5 text-sm text-gray-400">CrewPilot OS brings the office, field, and customer experience together.</p>
        </div>
        <p className="relative text-xs text-gray-600">© 2026 CrewPilot OS</p>
      </section>
    </main>
  );
}