"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  CalendarPlus,
  Clock3,
  LoaderCircle,
  PhoneMissed,
  Plus,
  UsersRound,
} from "lucide-react";

type Customer = {
  id: string;
  name: string;
};

type JobStatus = "new" | "scheduled" | "in_progress" | "completed" | "canceled";

type Job = {
  id: string;
  customer_id: string;
  title: string;
  status: JobStatus;
  scheduled_start: string | null;
  technician_name: string | null;
};

const statusStyles: Record<JobStatus, string> = {
  canceled: "bg-rose-50 text-rose-700",
  completed: "bg-emerald-50 text-emerald-700",
  in_progress: "bg-blue-50 text-blue-700",
  new: "bg-orange-50 text-orange-700",
  scheduled: "bg-violet-50 text-violet-700",
};

const statusLabels: Record<JobStatus, string> = {
  canceled: "Canceled",
  completed: "Completed",
  in_progress: "In progress",
  new: "New",
  scheduled: "Scheduled",
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

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatTime(value: string | null) {
  if (!value) return "TBD";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function DashboardPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError("");
      try {
        const [customersResponse, jobsResponse] = await Promise.all([
          fetch("/api/customers", { cache: "no-store" }),
          fetch("/api/jobs", { cache: "no-store" }),
        ]);
        const customersPayload = await readApiResponse(customersResponse);
        const jobsPayload = await readApiResponse(jobsResponse);
        if (!customersResponse.ok || !jobsResponse.ok) {
          setError("CrewPilot OS could not load the latest operations data.");
          return;
        }
        setCustomers(customersPayload as Customer[]);
        setJobs(jobsPayload as Job[]);
      } catch {
        setError("CrewPilot OS could not reach the operations service.");
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, []);

  const customerById = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers],
  );

  const today = new Date();
  const todayJobs = jobs
    .filter((job) => job.scheduled_start && dateKey(new Date(job.scheduled_start)) === dateKey(today))
    .sort((a, b) => new Date(a.scheduled_start!).getTime() - new Date(b.scheduled_start!).getTime());
  const openJobs = jobs.filter((job) => !["completed", "canceled"].includes(job.status));
  const completedJobs = jobs.filter((job) => job.status === "completed");
  const unassignedJobs = openJobs.filter((job) => !job.technician_name);
  const activeTechnicians = new Set(openJobs.map((job) => job.technician_name).filter(Boolean)).size;

  const metrics = [
    { label: "Customers", value: customers.length, note: "CRM records" },
    { label: "Open jobs", value: openJobs.length, note: "Need progress" },
    { label: "Scheduled today", value: todayJobs.length, note: "Dispatch focus" },
    { label: "Completed jobs", value: completedJobs.length, note: "All time" },
  ];

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-orange-600">
            {new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(today)}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Good morning, Moe</h1>
          <p className="mt-1 text-sm text-gray-500">
            Here’s what’s happening across your business today.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/schedule" className="flex h-10 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-medium shadow-sm hover:bg-gray-50">
            <CalendarPlus className="size-4" /> Schedule
          </Link>
          <Link href="/dashboard/jobs" className="flex h-10 items-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-orange-700">
            <Plus className="size-4" /> New job
          </Link>
        </div>
      </div>

      {error && <p className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <article key={metric.label} className="rounded-xl border bg-white p-5 shadow-panel">
            <p className="text-sm font-medium text-gray-500">{metric.label}</p>
            <div className="mt-3 flex items-end justify-between gap-2">
              <p className="text-2xl font-semibold tracking-tight">{loading ? "—" : metric.value}</p>
              {loading && <LoaderCircle className="size-4 animate-spin text-gray-400" />}
            </div>
            <p className="mt-1 text-xs text-gray-400">{metric.note}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <article className="overflow-hidden rounded-xl border bg-white shadow-panel">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="font-semibold">Today’s schedule</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {loading ? "Loading…" : `${todayJobs.length} jobs · ${activeTechnicians} technicians`}
              </p>
            </div>
            <Link className="text-sm font-medium text-orange-600" href="/dashboard/schedule">View dispatch board</Link>
          </div>
          {loading ? (
            <div className="flex h-56 items-center justify-center text-gray-500">
              <LoaderCircle className="mr-2 size-4 animate-spin" />
              Loading schedule…
            </div>
          ) : todayJobs.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center px-6 text-center">
              <BriefcaseBusiness className="size-10 text-orange-600" />
              <h3 className="mt-3 font-semibold">Nothing scheduled today</h3>
              <p className="mt-1 text-sm text-gray-500">Create or schedule a job to populate today’s board.</p>
            </div>
          ) : (
            <div className="divide-y">
              {todayJobs.map((job) => (
                <div key={job.id} className="grid grid-cols-[76px_1fr_auto] items-center gap-3 px-5 py-4 hover:bg-gray-50">
                  <p className="text-xs font-semibold text-gray-500">{formatTime(job.scheduled_start)}</p>
                  <div>
                    <p className="text-sm font-semibold">{job.title}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {customerById.get(job.customer_id)?.name ?? "Unknown customer"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="grid size-8 place-items-center rounded-full bg-gray-100 text-[11px] font-semibold">
                      {job.technician_name?.slice(0, 2).toUpperCase() ?? "—"}
                    </span>
                    <span className={`hidden rounded-full px-2.5 py-1 text-[11px] font-semibold sm:block ${statusStyles[job.status]}`}>
                      {statusLabels[job.status]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-1">
          <article className="rounded-xl border bg-gray-900 p-5 text-white shadow-panel">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-300">Team activity</p>
                <p className="mt-2 text-3xl font-semibold">
                  {activeTechnicians} <span className="text-base font-normal text-gray-400">active techs</span>
                </p>
              </div>
              <span className="grid size-10 place-items-center rounded-lg bg-white/10">
                <UsersRound className="size-5 text-orange-400" />
              </span>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.min(activeTechnicians * 20, 100)}%` }} />
            </div>
            <div className="mt-3 flex justify-between text-xs text-gray-400">
              <span>{openJobs.length} open jobs</span>
              <span>{unassignedJobs.length} unassigned</span>
            </div>
          </article>
          <article className="rounded-xl border bg-white p-5 shadow-panel">
            <h2 className="font-semibold">Needs attention</h2>
            <div className="mt-4 space-y-4">
              <div className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600">
                  <PhoneMissed className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Missed calls placeholder</p>
                  <p className="text-xs text-gray-500">Phone integration comes later.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600">
                  <Clock3 className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{unassignedJobs.length} jobs need assignment</p>
                  <p className="text-xs text-gray-500">Assign a technician from the Jobs page.</p>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
