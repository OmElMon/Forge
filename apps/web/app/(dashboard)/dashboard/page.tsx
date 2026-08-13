"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarPlus,
  CircleDollarSign,
  Clock3,
  FileText,
  LoaderCircle,
  Plus,
  ReceiptText,
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
  technician_id: string | null;
  title: string;
  status: JobStatus;
  scheduled_start: string | null;
  technician_name: string | null;
};

type Technician = {
  id: string;
  name: string;
  status: "available" | "on_job" | "off_today";
};

type InvoiceType = "estimate" | "invoice";
type InvoiceStatus = "draft" | "sent" | "approved" | "converted" | "paid" | "void";

type Invoice = {
  id: string;
  customer_id: string;
  document_type: InvoiceType;
  status: InvoiceStatus;
  title: string;
  amount_cents: number;
  due_at: string | null;
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

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function isPastDue(value: string | null, now: Date) {
  if (!value) return false;
  const dueDate = new Date(value);
  return dueDate < new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export default function DashboardPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError("");
      try {
        const [customersResponse, jobsResponse, invoicesResponse, techniciansResponse] = await Promise.all([
          fetch("/api/customers", { cache: "no-store" }),
          fetch("/api/jobs", { cache: "no-store" }),
          fetch("/api/invoices", { cache: "no-store" }),
          fetch("/api/technicians", { cache: "no-store" }),
        ]);
        const customersPayload = await readApiResponse(customersResponse);
        const jobsPayload = await readApiResponse(jobsResponse);
        const invoicesPayload = await readApiResponse(invoicesResponse);
        const techniciansPayload = await readApiResponse(techniciansResponse);
        if (!customersResponse.ok || !jobsResponse.ok || !invoicesResponse.ok || !techniciansResponse.ok) {
          setError("CrewPilot OS could not load the latest operations data.");
          return;
        }
        setCustomers(customersPayload as Customer[]);
        setJobs(jobsPayload as Job[]);
        setInvoices(invoicesPayload as Invoice[]);
        setTechnicians(techniciansPayload as Technician[]);
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
  const unscheduledJobs = openJobs.filter((job) => !job.scheduled_start);
  const unassignedJobs = openJobs.filter((job) => !job.technician_id && !job.technician_name);
  const activeTechnicians = technicians.filter((technician) => technician.status !== "off_today").length;
  const availableTechnicians = technicians.filter((technician) => technician.status === "available").length;
  const openInvoices = invoices.filter(
    (invoice) => invoice.document_type === "invoice" && !["paid", "void"].includes(invoice.status),
  );
  const openEstimates = invoices.filter(
    (invoice) => invoice.document_type === "estimate" && !["converted", "void"].includes(invoice.status),
  );
  const paidRevenueCents = invoices
    .filter((invoice) => invoice.document_type === "invoice" && invoice.status === "paid")
    .reduce((total, invoice) => total + invoice.amount_cents, 0);
  const openInvoiceCents = openInvoices.reduce((total, invoice) => total + invoice.amount_cents, 0);
  const openEstimateCents = openEstimates.reduce((total, invoice) => total + invoice.amount_cents, 0);
  const revenueAtRiskCents = openInvoiceCents + openEstimateCents;
  const overdueInvoices = openInvoices.filter((invoice) => isPastDue(invoice.due_at, today));
  const approvalQueue = openEstimates.filter(
    (invoice) => invoice.document_type === "estimate" && ["sent", "approved"].includes(invoice.status),
  );
  const attentionItems = [
    {
      action: "Review estimates",
      body: `${formatMoney(openEstimateCents)} in quoted work needs follow-up or conversion.`,
      count: approvalQueue.length,
      href: "/dashboard/invoices",
      icon: FileText,
      label: "Estimates awaiting decision",
      tone: "orange",
    },
    {
      action: "Collect payment",
      body: `${formatMoney(openInvoiceCents)} is still open across unpaid invoices.`,
      count: openInvoices.length,
      href: "/dashboard/invoices",
      icon: ReceiptText,
      label: "Open invoices",
      tone: "rose",
    },
    {
      action: "Schedule jobs",
      body: "Jobs without a scheduled time are harder to dispatch and invoice.",
      count: unscheduledJobs.length,
      href: "/dashboard/jobs",
      icon: Clock3,
      label: "Jobs missing schedule",
      tone: "amber",
    },
    {
      action: "Assign techs",
      body: "Unassigned jobs can slip when the day gets busy.",
      count: unassignedJobs.length,
      href: "/dashboard/jobs",
      icon: BriefcaseBusiness,
      label: "Jobs needing assignment",
      tone: "blue",
    },
  ];
  const highestPriorityItems = attentionItems.filter((item) => item.count > 0);

  const metrics = [
    { label: "Paid revenue", value: formatMoney(paidRevenueCents), note: "Collected invoices" },
    { label: "Open invoices", value: formatMoney(openInvoiceCents), note: "Awaiting payment" },
    { label: "Revenue at risk", value: formatMoney(revenueAtRiskCents), note: "Open estimates + invoices" },
    { label: "Open jobs", value: openJobs.length.toLocaleString(), note: `${todayJobs.length} today · ${unscheduledJobs.length} unscheduled` },
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
            Your owner command center for jobs, dispatch, estimates, invoices, and revenue recovery.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/schedule" className="flex h-10 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-medium shadow-sm hover:bg-gray-50">
            <CalendarPlus className="size-4" /> Schedule
          </Link>
          <Link href="/dashboard/jobs" className="flex h-10 items-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-orange-700">
            <Plus className="size-4" /> New job
          </Link>
          <Link href="/dashboard/invoices" className="flex h-10 items-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-medium text-white shadow-sm hover:bg-gray-800">
            <CircleDollarSign className="size-4" /> New invoice
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
              <div className="h-full rounded-full bg-orange-500" style={{ width: `${technicians.length === 0 ? 0 : Math.round((activeTechnicians / technicians.length) * 100)}%` }} />
            </div>
            <div className="mt-3 flex justify-between text-xs text-gray-400">
              <span>{availableTechnicians} available</span>
              <span>{unassignedJobs.length} jobs unassigned</span>
            </div>
          </article>
          <article className="rounded-xl border bg-white p-5 shadow-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Revenue recovery queue</h2>
                <p className="mt-1 text-xs text-gray-500">
                  The work most likely to leak money or momentum.
                </p>
              </div>
              <span className="grid size-9 place-items-center rounded-lg bg-orange-50 text-orange-600">
                <AlertTriangle className="size-4" />
              </span>
            </div>
            <div className="mt-4 rounded-xl bg-orange-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">At-risk revenue</p>
              <p className="mt-1 text-2xl font-semibold text-gray-950">{loading ? "—" : formatMoney(revenueAtRiskCents)}</p>
              <p className="mt-1 text-xs text-orange-800">
                {openEstimates.length} open estimates · {openInvoices.length} open invoices · {overdueInvoices.length} overdue
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="flex h-32 items-center justify-center text-sm text-gray-500">
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                  Building attention queue…
                </div>
              ) : highestPriorityItems.length === 0 ? (
                <div className="rounded-xl border border-dashed p-4 text-sm text-gray-500">
                  Clean board. No open revenue or scheduling issues need attention right now.
                </div>
              ) : (
                highestPriorityItems.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="flex gap-3 rounded-xl border p-3 transition hover:border-orange-200 hover:bg-orange-50/50"
                  >
                    <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${
                      item.tone === "rose"
                        ? "bg-rose-50 text-rose-600"
                        : item.tone === "amber"
                          ? "bg-amber-50 text-amber-600"
                          : item.tone === "blue"
                            ? "bg-blue-50 text-blue-600"
                            : "bg-orange-50 text-orange-600"
                    }`}>
                      <item.icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{item.label}</span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                          {item.count}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-gray-500">{item.body}</span>
                      <span className="mt-2 block text-xs font-semibold text-orange-600">{item.action} →</span>
                    </span>
                  </Link>
                ))
              )}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
