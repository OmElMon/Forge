"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
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

import type { Principal } from "@/lib/auth";

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

type FollowupTask = {
  id: string;
  title: string;
  status: "open" | "resolved";
  due_at: string | null;
};

type AttentionCategory =
  | "estimate_follow_up"
  | "invoice_collection"
  | "job_scheduling"
  | "job_assignment"
  | "job_invoicing";

type AttentionItem = {
  category: AttentionCategory;
  priority: "urgent" | "high" | "medium";
  title: string;
  description: string;
  action_label: string;
  action_href: string;
  source_type: "invoice" | "job";
  source_id: string;
  customer_id: string;
  customer_name: string;
  amount_cents: number;
  due_at: string | null;
  created_at: string;
};

type AttentionSummary = {
  revenue_at_risk_cents: number;
  open_estimate_cents: number;
  open_invoice_cents: number;
  overdue_invoice_count: number;
  unscheduled_job_count: number;
  unassigned_job_count: number;
  completed_uninvoiced_job_count: number;
  items: AttentionItem[];
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

const attentionIconByCategory: Record<AttentionCategory, typeof FileText> = {
  estimate_follow_up: FileText,
  invoice_collection: ReceiptText,
  job_assignment: BriefcaseBusiness,
  job_invoicing: CircleDollarSign,
  job_scheduling: Clock3,
};

const attentionToneByCategory: Record<AttentionCategory, string> = {
  estimate_follow_up: "bg-orange-50 text-orange-600",
  invoice_collection: "bg-rose-50 text-rose-600",
  job_assignment: "bg-blue-50 text-blue-600",
  job_invoicing: "bg-emerald-50 text-emerald-600",
  job_scheduling: "bg-amber-50 text-amber-600",
};

const emptyAttentionSummary: AttentionSummary = {
  completed_uninvoiced_job_count: 0,
  items: [],
  open_estimate_cents: 0,
  open_invoice_cents: 0,
  overdue_invoice_count: 0,
  revenue_at_risk_cents: 0,
  unassigned_job_count: 0,
  unscheduled_job_count: 0,
};

export default function DashboardPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [attentionSummary, setAttentionSummary] = useState<AttentionSummary>(emptyAttentionSummary);
  const [followups, setFollowups] = useState<FollowupTask[]>([]);
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError("");
      try {
        const [
          customersResponse,
          jobsResponse,
          invoicesResponse,
          techniciansResponse,
          attentionResponse,
          followupsResponse,
        ] = await Promise.all([
          fetch("/api/customers", { cache: "no-store" }),
          fetch("/api/jobs", { cache: "no-store" }),
          fetch("/api/invoices", { cache: "no-store" }),
          fetch("/api/technicians", { cache: "no-store" }),
          fetch("/api/attention?limit=6", { cache: "no-store" }),
          fetch("/api/followups", { cache: "no-store" }),
        ]);
        const customersPayload = await readApiResponse(customersResponse);
        const jobsPayload = await readApiResponse(jobsResponse);
        const invoicesPayload = await readApiResponse(invoicesResponse);
        const techniciansPayload = await readApiResponse(techniciansResponse);
        const attentionPayload = await readApiResponse(attentionResponse);
        const followupsPayload = await readApiResponse(followupsResponse);
        if (
          !customersResponse.ok ||
          !jobsResponse.ok ||
          !invoicesResponse.ok ||
          !techniciansResponse.ok ||
          !attentionResponse.ok ||
          !followupsResponse.ok
        ) {
          setError("CrewPilot OS could not load the latest operations data.");
          return;
        }
        setCustomers(customersPayload as Customer[]);
        setJobs(jobsPayload as Job[]);
        setInvoices(invoicesPayload as Invoice[]);
        setTechnicians(techniciansPayload as Technician[]);
        setAttentionSummary(attentionPayload as AttentionSummary);
        setFollowups(followupsPayload as FollowupTask[]);
      } catch {
        setError("CrewPilot OS could not reach the operations service.");
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, []);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((session: Principal | null) => setPrincipal(session))
      .catch(() => setPrincipal(null));
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
  const unassignedJobs = openJobs.filter((job) => !job.technician_id && !job.technician_name);
  const activeTechnicians = technicians.filter((technician) => technician.status !== "off_today").length;
  const availableTechnicians = technicians.filter((technician) => technician.status === "available").length;
  const ownerName = principal?.full_name.trim().split(/\s+/)[0] || "there";
  const openFollowups = followups.filter((followup) => followup.status === "open");
  const followupsDueToday = openFollowups.filter(
    (followup) =>
      followup.due_at && dateKey(new Date(followup.due_at)) === dateKey(today),
  );
  const followupsOverdue = openFollowups.filter(
    (followup) => followup.due_at && new Date(followup.due_at).getTime() < today.getTime(),
  );
  const paidRevenueCents = invoices
    .filter((invoice) => invoice.document_type === "invoice" && invoice.status === "paid")
    .reduce((total, invoice) => total + invoice.amount_cents, 0);

  const metrics = [
    { label: "Paid revenue", value: formatMoney(paidRevenueCents), note: "Collected invoices" },
    { label: "Open invoices", value: formatMoney(attentionSummary.open_invoice_cents), note: "Awaiting payment" },
    { label: "Revenue at risk", value: formatMoney(attentionSummary.revenue_at_risk_cents), note: "Open estimates + invoices" },
    {
      label: "Open jobs",
      value: openJobs.length.toLocaleString(),
      note: `${todayJobs.length} today · ${attentionSummary.unscheduled_job_count} unscheduled`,
    },
  ];

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-orange-600">
            {new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(today)}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Good morning, {ownerName}
          </h1>
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
                <h2 className="font-semibold">Outreach queue</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Follow-up tasks raised by the automation layer.
                </p>
              </div>
              <span className="grid size-9 place-items-center rounded-lg bg-violet-50 text-violet-700">
                <BellRing className="size-4" />
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-violet-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Open</p>
                <p className="mt-1 text-2xl font-semibold text-gray-950">
                  {loading ? "—" : openFollowups.length}
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Due today</p>
                <p className="mt-1 text-2xl font-semibold text-gray-950">
                  {loading ? "—" : followupsDueToday.length}
                </p>
              </div>
              <div className="rounded-xl bg-rose-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Overdue</p>
                <p className="mt-1 text-2xl font-semibold text-gray-950">
                  {loading ? "—" : followupsOverdue.length}
                </p>
              </div>
            </div>
            {!loading && openFollowups.length > 0 ? (
              <Link
                href="/dashboard/followups"
                className="mt-4 flex items-center justify-between rounded-xl border border-violet-100 bg-violet-50/50 px-4 py-3 transition hover:border-violet-200 hover:bg-violet-50"
              >
                <span className="text-sm font-semibold text-violet-800">
                  {openFollowups.length} follow-up{openFollowups.length === 1 ? "" : "s"} in the queue
                </span>
                <span className="text-sm font-semibold text-violet-700">Review →</span>
              </Link>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed p-4 text-sm text-gray-500">
                Clean outreach queue. No follow-ups need a nudge right now.
              </div>
            )}
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
              <p className="mt-1 text-2xl font-semibold text-gray-950">
                {loading ? "—" : formatMoney(attentionSummary.revenue_at_risk_cents)}
              </p>
              <p className="mt-1 text-xs text-orange-800">
                {formatMoney(attentionSummary.open_estimate_cents)} estimates ·{" "}
                {formatMoney(attentionSummary.open_invoice_cents)} invoices ·{" "}
                {attentionSummary.overdue_invoice_count} overdue
              </p>
            </div>
            {!loading && attentionSummary.completed_uninvoiced_job_count > 0 ? (
              <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-800">
                {attentionSummary.completed_uninvoiced_job_count} completed job
                {attentionSummary.completed_uninvoiced_job_count === 1 ? "" : "s"} ready to invoice.
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="flex h-32 items-center justify-center text-sm text-gray-500">
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                  Building attention queue…
                </div>
              ) : attentionSummary.items.length === 0 ? (
                <div className="rounded-xl border border-dashed p-4 text-sm text-gray-500">
                  Clean board. No open revenue or scheduling issues need attention right now.
                </div>
              ) : (
                attentionSummary.items.map((item) => {
                  const Icon = attentionIconByCategory[item.category];
                  return (
                    <Link
                      key={`${item.source_type}-${item.source_id}-${item.category}`}
                      href={item.action_href}
                      className="flex gap-3 rounded-xl border p-3 transition hover:border-orange-200 hover:bg-orange-50/50"
                    >
                      <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${attentionToneByCategory[item.category]}`}>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold">{item.title}</span>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold capitalize text-gray-700">
                            {item.priority}
                          </span>
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-gray-500">
                          {item.description}
                        </span>
                        <span className="mt-2 flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-orange-600">{item.action_label} →</span>
                          {item.amount_cents > 0 ? (
                            <span className="font-semibold text-gray-500">{formatMoney(item.amount_cents)}</span>
                          ) : null}
                        </span>
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
