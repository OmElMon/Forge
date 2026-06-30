"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { Logo } from "@/components/logo";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("Authentication is ready; secure browser session wiring is the next slice.");
  }

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-2">
      <section className="flex items-center justify-center px-6 py-10"><div className="w-full max-w-md"><Logo /><div className="mt-14"><p className="text-sm font-semibold text-orange-600">Welcome back</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Sign in to Forge</h1><p className="mt-2 text-sm text-gray-500">Run your entire service operation from one place.</p></div><form onSubmit={submit} className="mt-8 space-y-5"><label className="block text-sm font-medium">Email address<input name="email" type="email" autoComplete="email" required className="mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="you@company.com" /></label><label className="block text-sm font-medium">Password<div className="relative mt-2"><input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required className="h-11 w-full rounded-lg border px-3 pr-11 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="••••••••••••" /><button type="button" aria-label="Toggle password visibility" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></label>{error && <p className="rounded-lg bg-orange-50 p-3 text-xs text-orange-800">{error}</p>}<button className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-900 text-sm font-semibold text-white hover:bg-gray-800">Sign in <ArrowRight className="size-4" /></button></form><p className="mt-8 text-center text-xs text-gray-400">Protected by enterprise-grade security</p></div></section>
      <section className="relative hidden overflow-hidden bg-gray-950 p-12 text-white lg:flex lg:flex-col lg:justify-between"><div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_75%_25%,#f97316_0,transparent_30%),radial-gradient(circle_at_20%_80%,#7c2d12_0,transparent_28%)]" /><p className="relative text-sm font-medium text-orange-400">BUILT FOR THE TRADES</p><div className="relative max-w-xl"><blockquote className="text-3xl font-medium leading-tight tracking-tight">“Your team should spend their day serving customers—not wrestling with software.”</blockquote><p className="mt-5 text-sm text-gray-400">Forge brings the office, field, and customer experience together.</p></div><p className="relative text-xs text-gray-600">© 2026 Forge</p></section>
    </main>
  );
}
