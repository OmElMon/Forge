"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  ContactRound,
  Gauge,
  LogOut,
  Menu,
  Search,
  Settings,
  UsersRound,
  Wrench,
} from "lucide-react";
import { Logo } from "@/components/logo";
import type { Principal } from "@/lib/auth";

const nav = [
  { label: "Overview", icon: Gauge, href: "/dashboard" },
  { label: "Customers", icon: ContactRound, href: "/dashboard/customers" },
  { label: "Jobs", icon: BriefcaseBusiness, href: "/dashboard/jobs" },
  { label: "Schedule", icon: CalendarDays, href: "/dashboard/schedule" },
  { label: "Technicians", icon: Wrench, href: "/dashboard/technicians" },
  { label: "Invoices", icon: CircleDollarSign, href: "/dashboard/invoices" },
  { label: "Analytics", icon: BarChart3, href: "/dashboard/analytics" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((session: Principal | null) => setPrincipal(session))
      .catch(() => setPrincipal(null));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  const companyName = principal?.company_name ?? "Your company";
  const fullName = principal?.full_name ?? "CrewPilot OS user";
  const initials = fullName
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const companyInitials = companyName
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const role = principal?.role.replace("_", " ") ?? "Member";

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-white px-4 py-5 lg:block">
        <div className="px-2"><Logo /></div>
        <div className="mt-7 rounded-xl border bg-gray-50 p-3">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-lg bg-orange-100 text-sm font-bold text-orange-700">{companyInitials}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{companyName}</p>
              <p className="text-xs capitalize text-gray-500">{role} workspace</p>
            </div>
            <ChevronDown className="size-4 text-gray-400" />
          </div>
        </div>
        <nav className="mt-6 space-y-1">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <item.icon className="size-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute inset-x-4 bottom-5 border-t pt-4">
          <a href="#" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100">
            <Settings className="size-[18px]" /> Settings
          </a>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-white/95 px-4 backdrop-blur sm:px-7">
          <div className="flex items-center gap-3 lg:hidden"><button aria-label="Open menu"><Menu className="size-5" /></button><Logo compact /></div>
          <div className="relative hidden w-full max-w-md lg:block">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input className="h-10 w-full rounded-lg border bg-gray-50 pl-9 pr-3 text-sm outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100" placeholder="Search customers, jobs, invoices…" />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button className="relative grid size-9 place-items-center rounded-full text-gray-500 hover:bg-gray-100"><Bell className="size-[18px]" /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-orange-500" /></button>
            <div className="h-7 w-px bg-gray-200" />
            <div className="flex items-center gap-2">
              <div className="grid size-9 place-items-center rounded-full bg-gray-900 text-xs font-semibold text-white">{initials}</div>
              <div className="hidden text-sm sm:block"><p className="font-medium leading-4">{fullName}</p><p className="text-xs capitalize text-gray-500">{role}</p></div>
            </div>
            <button onClick={logout} title="Sign out" aria-label="Sign out" className="grid size-9 place-items-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"><LogOut className="size-4" /></button>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-7 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
