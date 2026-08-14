"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  CircleDollarSign,
  FileText,
  LoaderCircle,
  ReceiptText,
  TrendingUp,
  UsersRound,
} from "lucide-react";

type AnalyticsSummary = {
  paid_revenue_cents: number;
  open_invoice_cents: number;
  open_estimate_cents: number;
  pipeline_cents: number;
  average_paid_ticket_cents: number;
  invoice_collection_rate: number;
  estimate_conversion_rate: number;
  customer_count: number;
  active_customer_count: number;
  job_count: number;
  open_job_count: number;
  completed_job_count: number;
  unscheduled_job_count: number;
  unassigned_job_count: number;
};

const emptySummary: AnalyticsSummary = {
  active_customer_count: 0,
  average_paid_ticket_cents: 0,
  completed_job_count: 0,
  customer_count: 0,
  estimate_conversion_rate: 0,
  invoice_collection_rate: 0,
  job_count: 0,
  open_estimate_cents: 0,
  open_invoice_cents: 0,
  open_job_count: 0,
  paid_revenue_cents: 0,
  pipeline_cents: 0,
  unassigned_job_count: 0,
  unscheduled_job_count: 0,
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

function errorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as { error?: unknown }).error;
  return typeof error === "string" ? error : fallback;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function formatPercent(rate: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
    style: "percent",
  }).format(rate);
}

function percentWidth(rate: number) {
  return `${Math.min(100, Math.max(0, Math.round(rate * 100)))}%`;
}

function MetricCard({
  href,
  icon: Icon,
  label,
  sublabel,
  value,
}: {
  href?: string;
  icon: typeof BarChart3;
  label: string;
  sublabel: string;
  value: string;
}) {
  const content = (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-4">
        <div className="rounded-2xl bg-orange-50 p-3 text-orange-600">
          <Icon className="h-5 w-5" />
        </div>
        {href ? <span className="text-sm font-semibold text-orange-600">Open</span> : null}
      </div>
      <p className="mt-5 text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{sublabel}</p>
    </div>
  );

  if (!href) return content;
  return (
    <Link className="block" href={href}>
      {content}
    </Link>
  );
}

function ConversionCard({
  label,
  rate,
  sublabel,
}: {
  label: string;
  rate: number;
  sublabel: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-4xl font-black tracking-tight text-slate-950">{formatPercent(rate)}</p>
        </div>
        <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
          <TrendingUp className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-6 h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-orange-500" style={{ width: percentWidth(rate) }} />
      </div>
      <p className="mt-3 text-sm text-slate-500">{sublabel}</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadSummary() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/analytics/summary", { cache: "no-store" });
        const payload = await readApiResponse(response);
        if (!response.ok) {
          setError(errorMessage(payload, "CrewPilot OS could not load analytics."));
          return;
        }
        setSummary(payload as AnalyticsSummary);
      } catch {
        setError("CrewPilot OS could not reach the analytics service.");
      } finally {
        setLoading(false);
      }
    }

    void loadSummary();
  }, []);

  const completionRate = useMemo(() => {
    if (!summary.job_count) return 0;
    return summary.completed_job_count / summary.job_count;
  }, [summary.completed_job_count, summary.job_count]);

  const recoveryGapCount = summary.unscheduled_job_count + summary.unassigned_job_count;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-950 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-orange-600">Operating analytics</p>
            <h1 className="mt-3 text-5xl font-black tracking-tight">Analytics</h1>
            <p className="mt-3 max-w-2xl text-lg text-slate-600">
              Track revenue, pipeline, customer health, and workflow gaps from one operational command view.
            </p>
          </div>
          <Link
            className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
            href="/dashboard"
          >
            Back to overview
          </Link>
        </div>

        {error ? (
          <div className="mt-8 flex items-center gap-3 rounded-3xl bg-rose-50 p-5 text-rose-700">
            <AlertTriangle className="h-5 w-5" />
            <p>{error}</p>
          </div>
        ) : null}

        {loading ? (
          <div className="mt-10 flex items-center gap-3 rounded-3xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">
            <LoaderCircle className="h-5 w-5 animate-spin" />
            <span>Loading analytics...</span>
          </div>
        ) : (
          <>
            <section className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                href="/dashboard/invoices"
                icon={CircleDollarSign}
                label="Paid revenue"
                sublabel="Closed invoice revenue"
                value={formatMoney(summary.paid_revenue_cents)}
              />
              <MetricCard
                href="/dashboard/invoices"
                icon={BarChart3}
                label="Pipeline"
                sublabel="Open invoices + estimates"
                value={formatMoney(summary.pipeline_cents)}
              />
              <MetricCard
                href="/dashboard/invoices"
                icon={ReceiptText}
                label="Open invoices"
                sublabel="Collectable revenue"
                value={formatMoney(summary.open_invoice_cents)}
              />
              <MetricCard
                href="/dashboard/invoices"
                icon={FileText}
                label="Open estimates"
                sublabel="Follow-up opportunity"
                value={formatMoney(summary.open_estimate_cents)}
              />
            </section>

            <section className="mt-6 grid gap-5 lg:grid-cols-3">
              <ConversionCard
                label="Invoice collection rate"
                rate={summary.invoice_collection_rate}
                sublabel="Paid invoices divided by open + paid invoices."
              />
              <ConversionCard
                label="Estimate conversion rate"
                rate={summary.estimate_conversion_rate}
                sublabel="Converted estimates divided by active estimate history."
              />
              <ConversionCard
                label="Job completion rate"
                rate={completionRate}
                sublabel="Completed jobs across the current workspace."
              />
            </section>

            <section className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                href="/dashboard/invoices"
                icon={CircleDollarSign}
                label="Average paid ticket"
                sublabel="Average revenue per paid invoice"
                value={formatMoney(summary.average_paid_ticket_cents)}
              />
              <MetricCard
                href="/dashboard/customers"
                icon={UsersRound}
                label="Active customers"
                sublabel={`${summary.customer_count} total customer records`}
                value={String(summary.active_customer_count)}
              />
              <MetricCard
                href="/dashboard/jobs"
                icon={BriefcaseBusiness}
                label="Open jobs"
                sublabel={`${summary.completed_job_count} completed jobs`}
                value={String(summary.open_job_count)}
              />
              <MetricCard
                href="/dashboard/jobs"
                icon={AlertTriangle}
                label="Workflow gaps"
                sublabel={`${summary.unscheduled_job_count} unscheduled · ${summary.unassigned_job_count} unassigned`}
                value={String(recoveryGapCount)}
              />
            </section>
          </>
        )}
      </div>
    </main>
  );
}
