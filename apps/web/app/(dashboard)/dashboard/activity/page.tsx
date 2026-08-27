"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BellRing,
  BriefcaseBusiness,
  FileText,
  LoaderCircle,
  ReceiptText,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";

type AuditLog = {
  id: string;
  actor_user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  context: Record<string, unknown>;
  created_at: string;
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

const activityLabels: Record<string, string> = {
  "customer.address.created": "Service address added",
  "customer.address.deleted": "Service address removed",
  "customer.address.updated": "Service address updated",
  "customer.equipment.created": "Equipment record added",
  "customer.equipment.deleted": "Equipment record removed",
  "customer.equipment.updated": "Equipment record updated",
  "estimate.approved": "Estimate approved",
  "estimate.converted": "Estimate converted",
  "followup.policy_updated": "Automation rule toggled",
  "followup.resolved": "Follow-up resolved",
  "invoice.created": "Invoice created",
  "invoice.created_from_estimate": "Invoice created from estimate",
  "invoice.line_item_created": "Invoice line item added",
  "invoice.line_item_deleted": "Invoice line item removed",
  "invoice.line_item_updated": "Invoice line item updated",
  "invoice.paid": "Invoice marked paid",
  "invoice.sent": "Invoice sent",
  "invoice.updated": "Invoice updated",
  "job.assigned": "Job assigned",
  "job.canceled": "Job canceled",
  "job.completed": "Job completed",
  "job.created": "Job created",
  "job.scheduled": "Job scheduled",
  "job.started": "Job started",
  "job.updated": "Job updated",
};

const resourceIcons = {
  customer: UserRound,
  estimate: FileText,
  followup: BellRing,
  invoice: ReceiptText,
  job: BriefcaseBusiness,
  technician: Wrench,
  automation_policy: ShieldCheck,
} as const;

const resourceLabels: Record<string, string> = {
  automation_policy: "Automation rule",
  customer: "Customer",
  estimate: "Estimate",
  followup: "Follow-up",
  invoice: "Invoice",
  job: "Job",
  technician: "Technician",
};

function activityLabel(action: string) {
  return activityLabels[action] ?? action.replaceAll(".", " ");
}

function activityDescription(log: AuditLog) {
  const title = typeof log.context.title === "string" ? log.context.title : null;
  const status = typeof log.context.status === "string" ? log.context.status.replace("_", " ") : null;
  const customerName = typeof log.context.customer_name === "string" ? log.context.customer_name : null;
  const technicianName = typeof log.context.technician_name === "string" ? log.context.technician_name : null;
  const ruleType = typeof log.context.rule_type === "string" ? log.context.rule_type.replaceAll("_", " ") : null;
  const parts = [
    title ?? customerName ?? technicianName ?? ruleType ?? null,
    status ? `Status: ${status}` : null,
  ];
  return parts.filter(Boolean).join(" · ") || `${resourceLabels[log.resource_type] ?? log.resource_type} activity`;
}

function resourceTone(resourceType: string) {
  switch (resourceType) {
    case "customer":
      return "bg-orange-50 text-orange-600";
    case "job":
      return "bg-blue-50 text-blue-600";
    case "invoice":
      return "bg-emerald-50 text-emerald-600";
    case "estimate":
      return "bg-violet-50 text-violet-600";
    case "followup":
      return "bg-amber-50 text-amber-600";
    case "technician":
      return "bg-cyan-50 text-cyan-600";
    case "automation_policy":
      return "bg-rose-50 text-rose-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function dayKey(value: string) {
  return new Date(value).toDateString();
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function ActivityPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("");

  useEffect(() => {
    async function loadLogs() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/audit-logs?limit=200", { cache: "no-store" });
        const payload = await readApiResponse(response);
        if (!response.ok) {
          setError(String((payload as { error?: unknown }).error ?? "Unable to load activity."));
          return;
        }
        setLogs(payload as AuditLog[]);
      } catch {
        setError("CrewPilot OS could not load the activity timeline.");
      } finally {
        setLoading(false);
      }
    }

    void loadLogs();
  }, []);

  const resourceTypes = useMemo(() => {
    return Array.from(new Set(logs.map((log) => log.resource_type))).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (!filter) return logs;
    return logs.filter((log) => log.resource_type === filter);
  }, [filter, logs]);

  const groupedByDay = useMemo(() => {
    const groups: { day: string; logs: AuditLog[] }[] = [];
    const index = new Map<string, number>();
    for (const log of filteredLogs) {
      const key = dayKey(log.created_at);
      const existing = index.get(key);
      if (existing === undefined) {
        index.set(key, groups.length);
        groups.push({ day: key, logs: [log] });
      } else {
        groups[existing].logs.push(log);
      }
    }
    return groups;
  }, [filteredLogs]);

  const todayCount = useMemo(
    () => logs.filter((log) => dayKey(log.created_at) === new Date().toDateString()).length,
    [logs],
  );

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-orange-600">Platform Core v1</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Activity timeline</h1>
          <p className="mt-1 text-sm text-gray-500">
            Every business-state change in this workspace, newest first, with its audit record.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-panel">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Events shown</p>
            <Activity className="size-5 text-orange-600" />
          </div>
          <p className="mt-3 text-2xl font-semibold">{loading ? "—" : filteredLogs.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-panel">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Events today</p>
            <BriefcaseBusiness className="size-5 text-orange-600" />
          </div>
          <p className="mt-3 text-2xl font-semibold">{loading ? "—" : todayCount}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-panel">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Resource types</p>
            <ShieldCheck className="size-5 text-orange-600" />
          </div>
          <p className="mt-3 text-2xl font-semibold">{loading ? "—" : resourceTypes.length}</p>
        </div>
      </div>

      {error && <p className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}

      <section className="mt-6 overflow-hidden rounded-xl border bg-white shadow-panel">
        <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Workspace audit trail</h2>
            <p className="mt-0.5 text-xs text-gray-500">Tenant-scoped and append-only, accessible via /events and /audit-logs.</p>
          </div>
          {resourceTypes.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setFilter("")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  filter === "" ? "bg-orange-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                All
              </button>
              {resourceTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFilter(type)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                    filter === type ? "bg-orange-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {resourceLabels[type] ?? type.replaceAll("_", " ")}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex h-56 items-center justify-center text-gray-500">
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            Loading activity…
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center px-6 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-orange-50 text-orange-600">
              <Activity className="size-6" />
            </div>
            <h3 className="mt-4 font-semibold">No activity yet</h3>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              Create customers, jobs, estimates, or invoices to start building the timeline.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {groupedByDay.map((group) => {
              const Icon = resourceIcons[group.logs[0].resource_type as keyof typeof resourceIcons] ?? Activity;
              return (
                <div key={group.day} className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-lg bg-gray-100 text-gray-600">
                      <Icon className="size-4" />
                    </span>
                    <p className="text-sm font-semibold text-gray-700">
                      {new Intl.DateTimeFormat(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      }).format(new Date(group.day))}
                    </p>
                    <p className="text-xs text-gray-400">{group.logs.length} events</p>
                  </div>
                  <div className="mt-3 divide-y rounded-xl border">
                    {group.logs.map((log) => {
                      const LogIcon = resourceIcons[log.resource_type as keyof typeof resourceIcons] ?? Activity;
                      return (
                        <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                          <span className={`mt-0.5 grid size-8 flex-none place-items-center rounded-lg ${resourceTone(log.resource_type)}`}>
                            <LogIcon className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold">{activityLabel(log.action)}</p>
                              <p className="text-xs text-gray-400">{formatTime(log.created_at)}</p>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-gray-500">
                              {activityDescription(log)}
                            </p>
                          </div>
                          <span
                            className="grid size-7 flex-none place-items-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500"
                            title="System workspace"
                          >
                            SY
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}