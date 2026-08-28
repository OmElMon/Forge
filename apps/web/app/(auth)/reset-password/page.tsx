"use client";

import { type FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CircleCheck, Eye, EyeOff, LoaderCircle } from "lucide-react";

import { Logo } from "@/components/logo";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlToken = searchParams.get("token") ?? "";

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    const token = urlToken || String(form.get("token") ?? "");

    if (password !== confirm) {
      setError("Passwords do not match.");
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        body: JSON.stringify({ token, password }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to reset your password.");
        return;
      }
      setSuccess(true);
    } catch {
      setError("CrewPilot OS could not reach the authentication service.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="mt-8 space-y-5">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-emerald-600 text-white">
              <CircleCheck className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold text-emerald-900">Password updated</h2>
              <p className="mt-0.5 text-sm text-emerald-800">
                You’re signed out everywhere else. Sign in with your new password to continue.
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.replace("/login")}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-900 text-sm font-semibold text-white hover:bg-gray-800"
        >
          Sign in <ArrowRight className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      {!urlToken && (
        <label className="block text-sm font-medium">
          Reset code
          <input name="token" required minLength={20} autoComplete="one-time-code" className="mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Paste the code from your email" />
        </label>
      )}
      <label className="block text-sm font-medium">
        New password
        <div className="relative mt-2">
          <input name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={12} className="h-11 w-full rounded-lg border px-3 pr-11 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="At least 12 characters" />
          <button type="button" aria-label="Toggle password visibility" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </label>
      <label className="block text-sm font-medium">
        Confirm new password
        <input name="confirm" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={12} className="mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Repeat your new password" />
      </label>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <button disabled={submitting} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-900 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60">
        {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <>Set new password <ArrowRight className="size-4" /></>}
      </button>
      <p className="text-center text-sm text-gray-500">
        Changed your mind? <Link href="/login" className="font-semibold text-orange-600 hover:text-orange-700">Sign in</Link>
      </p>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-2">
      <section className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <Logo />
          <div className="mt-14">
            <p className="text-sm font-semibold text-orange-600">Account recovery</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Choose a new password</h1>
            <p className="mt-2 text-sm text-gray-500">
              Use the one-time code from your email to set a new password.
            </p>
          </div>
          <Suspense>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </section>
      <section className="relative hidden overflow-hidden bg-gray-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_75%_25%,#f97316_0,transparent_30%),radial-gradient(circle_at_20%_80%,#7c2d12_0,transparent_28%)]" />
        <p className="relative text-sm font-medium text-orange-400">SECURE ACCESS</p>
        <div className="relative max-w-xl">
          <blockquote className="text-3xl font-medium leading-tight tracking-tight">“One code, one use, one password reset.”</blockquote>
          <p className="mt-5 text-sm text-gray-400">Reset codes expire automatically and stop working after a single use.</p>
        </div>
        <p className="relative text-xs text-gray-600">© 2026 CrewPilot OS</p>
      </section>
    </main>
  );
}