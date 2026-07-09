import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles, Wrench } from "lucide-react";

import { Logo } from "@/components/logo";

const features = [
  "Tenant-aware company and user foundation",
  "Secure auth with protected dashboard sessions",
  "Built for customers, jobs, scheduling, and service notes",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,#fed7aa,transparent_34%),linear-gradient(180deg,#fff_0%,#f7f8fa_100%)]">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Logo />
        <div className="flex items-center gap-3">
          <Link href="/login" className="rounded-full px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-white/70">
            Sign in
          </Link>
          <Link href="/register" className="rounded-full bg-gray-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-800">
            Create workspace
          </Link>
        </div>
      </nav>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-6 pb-20 pt-10 lg:grid-cols-[1.08fr_0.92fr] lg:pb-28 lg:pt-20">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/80 px-3 py-1 text-sm font-semibold text-orange-700 shadow-sm">
            <Sparkles className="size-4" />
            AI-native operations for the trades
          </div>
          <h1 className="mt-7 max-w-4xl text-5xl font-semibold tracking-tight text-gray-950 sm:text-6xl lg:text-7xl">
            The home-service OS built for serious operators.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-600">
            Forge brings customer intake, jobs, scheduling, team notes, and eventually AI-assisted workflows into one clean command center for HVAC and home-service companies.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/register" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-orange-600 px-6 text-sm font-bold text-white shadow-lg shadow-orange-600/20 hover:bg-orange-700">
              Start the demo flow
              <ArrowRight className="size-4" />
            </Link>
            <Link href="/login" className="inline-flex h-12 items-center justify-center rounded-xl border bg-white px-6 text-sm font-bold text-gray-900 shadow-sm hover:bg-gray-50">
              View sign in
            </Link>
          </div>
          <div className="mt-8 space-y-3">
            {features.map((feature) => (
              <p key={feature} className="flex items-center gap-3 text-sm font-medium text-gray-700">
                <CheckCircle2 className="size-5 text-orange-600" />
                {feature}
              </p>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border bg-white/85 p-4 shadow-2xl shadow-gray-900/10 backdrop-blur">
          <div className="rounded-[1.5rem] bg-gray-950 p-6 text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-semibold text-orange-300">Today&apos;s command center</p>
                <h2 className="mt-1 text-2xl font-semibold">Northstar HVAC</h2>
              </div>
              <div className="rounded-2xl bg-orange-500/15 p-3 text-orange-300">
                <Wrench className="size-6" />
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                ["14", "Open jobs"],
                ["6", "Technicians"],
                ["92%", "On-time"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-2xl bg-white/10 p-4">
                  <p className="text-3xl font-semibold">{value}</p>
                  <p className="mt-1 text-xs text-gray-400">{label}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 space-y-3">
              {[
                ["Emergency AC repair", "Priority dispatch · 12:30 PM"],
                ["Maintenance plan follow-up", "AI draft ready"],
                ["New install estimate", "Needs owner review"],
              ].map(([title, subtitle]) => (
                <div key={title} className="flex items-center justify-between rounded-2xl bg-white/10 p-4">
                  <div>
                    <p className="font-semibold">{title}</p>
                    <p className="mt-1 text-sm text-gray-400">{subtitle}</p>
                  </div>
                  <ShieldCheck className="size-5 text-orange-300" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
