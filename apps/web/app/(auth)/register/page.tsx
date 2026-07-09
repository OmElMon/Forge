"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";

import { Logo } from "@/components/logo";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password.length < 12) {
      setError("Use at least 12 characters for your password.");
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/register", {
        body: JSON.stringify({
          company_name: form.get("company_name"),
          email: form.get("email"),
          full_name: form.get("full_name"),
          password,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to create your workspace.");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Forge could not reach the authentication service.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fa] px-6 py-10">
      <div className="w-full max-w-lg rounded-2xl border bg-white p-7 shadow-panel sm:p-10">
        <Logo />
        <p className="mt-10 text-sm font-semibold text-orange-600">Create your workspace</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Bring your operation into Forge</h1>
        <p className="mt-2 text-sm text-gray-500">Your first account becomes the company owner.</p>
        <form onSubmit={submit} className="mt-8 grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium sm:col-span-2">Company name<input name="company_name" required minLength={2} className="mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Atlas Heating & Cooling" /></label>
          <label className="block text-sm font-medium">Your name<input name="full_name" required minLength={2} autoComplete="name" className="mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Moe Owner" /></label>
          <label className="block text-sm font-medium">Work email<input name="email" required type="email" autoComplete="email" className="mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="you@company.com" /></label>
          <label className="block text-sm font-medium sm:col-span-2">Password<input name="password" required type="password" minLength={12} autoComplete="new-password" className="mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="At least 12 characters" /></label>
          {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 sm:col-span-2">{error}</p>}
          <button disabled={submitting} className="flex h-11 items-center justify-center gap-2 rounded-lg bg-orange-600 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2">
            {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <>Create workspace <ArrowRight className="size-4" /></>}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-gray-500">Already using Forge? <Link href="/login" className="font-semibold text-orange-600 hover:text-orange-700">Sign in</Link></p>
      </div>
    </main>
  );
}
