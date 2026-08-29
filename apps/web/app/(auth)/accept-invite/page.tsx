"use client";

import { type FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Building2, Eye, EyeOff, LoaderCircle, ShieldCheck, UserRound } from "lucide-react";

import { Logo } from "@/components/logo";

type InvitePreview = {
  email: string;
  full_name: string;
  company_name: string;
  role: string;
};

const roleLabels: Record<string, string> = {
  admin: "Admin",
  dispatcher: "Dispatcher",
  office_staff: "Office staff",
  owner: "Owner",
  technician: "Technician",
};

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlToken = searchParams.get("token") ?? "";

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(Boolean(urlToken));
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!urlToken) {
      setInvalid(true);
      setLoadingPreview(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/invites/preview?token=${encodeURIComponent(urlToken)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as InvitePreview | { error?: string } | null;
        if (cancelled) return;
        if (!response.ok || !payload || typeof (payload as { company_name?: unknown }).company_name !== "string") {
          setInvalid(true);
          return;
        }
        setPreview(payload as InvitePreview);
      })
      .catch(() => {
        if (!cancelled) setInvalid(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [urlToken]);

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
      const response = await fetch("/api/auth/invites/accept", {
        body: JSON.stringify({ token, password }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to accept this invite.");
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

  if (loadingPreview) {
    return (
      <div className="mt-8 flex h-40 items-center justify-center text-gray-500">
        <LoaderCircle className="mr-2 size-4 animate-spin" /> Checking your invite…
      </div>
    );
  }

  return (
    <div className="mt-8">
      {invalid ? (
        <div className="rounded-xl border border-rose-100 bg-rose-50 p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-rose-600 text-white">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold text-rose-900">This invite isn&apos;t valid</h2>
              <p className="mt-0.5 text-sm text-rose-800">
                The invite link is invalid, expired, or has already been used.
              </p>
            </div>
          </div>
        </div>
      ) : preview ? (
        <>
          <div className="rounded-xl border bg-gray-50 p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-orange-100 text-orange-700">
                <Building2 className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold">{preview.company_name}</p>
                <p className="text-xs text-gray-500">CrewPilot OS workspace</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-white text-gray-700">
                <UserRound className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold">{preview.full_name}</p>
                <p className="text-xs text-gray-500">{preview.email}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-gray-600">
              You&apos;ll join as <span className="font-semibold">{roleLabels[preview.role] ?? preview.role}</span>. Set a
              password below to accept the invite and sign in.
            </p>
          </div>
          <form onSubmit={submit} className="mt-5 space-y-5">
            <label className="block text-sm font-medium">
              Password
              <div className="relative mt-2">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={12}
                  className="h-11 w-full rounded-lg border px-3 pr-11 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  placeholder="At least 12 characters"
                />
                <button
                  type="button"
                  aria-label="Toggle password visibility"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>
            <label className="block text-sm font-medium">
              Confirm password
              <input
                name="confirm"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={12}
                className="mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                placeholder="Repeat your password"
              />
            </label>
            {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
            <button disabled={submitting} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-900 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <>Accept invite <ArrowRight className="size-4" /></>}
            </button>
          </form>
        </>
      ) : (
        <p className="mt-8 text-sm text-gray-500">
          Need a link? Ask the workspace owner to resend your invite.
        </p>
      )}
      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account? <Link href="/login" className="font-semibold text-orange-600 hover:text-orange-700">Sign in</Link>
      </p>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-2">
      <section className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <Logo />
          <div className="mt-14">
            <p className="text-sm font-semibold text-orange-600">Team invite</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">You&apos;ve been invited</h1>
            <p className="mt-2 text-sm text-gray-500">Accept the invite to join the workspace and get started.</p>
          </div>
          <Suspense>
            <AcceptInviteForm />
          </Suspense>
        </div>
      </section>
      <section className="relative hidden overflow-hidden bg-gray-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_75%_25%,#f97316_0,transparent_30%),radial-gradient(circle_at_20%_80%,#7c2d12_0,transparent_28%)]" />
        <p className="relative text-sm font-medium text-orange-400">WORKING TOGETHER</p>
        <div className="relative max-w-xl">
          <blockquote className="text-3xl font-medium leading-tight tracking-tight">
            “Every desk, every truck, and every job runs from one workspace.”
          </blockquote>
          <p className="mt-5 text-sm text-gray-400">
            Invite links are single-use, expire automatically, and only grant access to the invited workspace.
          </p>
        </div>
        <p className="relative text-xs text-gray-600">© 2026 CrewPilot OS</p>
      </section>
    </main>
  );
}