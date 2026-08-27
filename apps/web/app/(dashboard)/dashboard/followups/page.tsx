"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MessageSquareWarning,
  PhoneCall,
  ReceiptText,
  UserRound,
  Wrench,
} from "lucide-react";

async function readApiResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
}

type FollowupStatus = "open" | "resolved";

type FollowupTask = {
  id: string;
  customer_id: string | null;
  job_id: string | null;
  invoice_id: string | null;
  rule_type: string;
  title: string;
  notes: string | null;
  status: FollowupStatus;
  due_at: string | null;
  delivered_at: string | null;
  resolved_at: string | null;
  created_at: string;
};

type FollowupPolicy = {
  rule_type: string;
  title: string;
  due_days: number;
  description: string;
  enabled: boolean;
};

type Customer = { id: string; name: string };
type Job = { id: string; title: string; status: string };
type InvoiceReference = { id: string; title: string };

const statusLabels: Record<FollowupStatus, string> = {
  open: "Open",
  resolved: "Resolved",
};

function formatDate(value: string | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function isOverdue(dueAt: string | null) {
  if (!dueAt) return false;
  return new Date(dueAt).getTime() < Date.now();
}

function ruleStyles(ruleType: string) {
  if (ruleType.includes("estimate")) return "bg-violet-50 text-violet-700";
  if (ruleType.includes("invoice")) return "bg-emerald-50 text-emerald-700";
  if (ruleType.includes("job")) return "bg-blue-50 text-blue-700";
  return "bg-orange-50 text-orange-700";
}

function ruleShortLabel(ruleType: string) {
  return ruleType
    .replaceAll("_", " ")
    .split(" ")
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function FollowupsPage() {
  const [tasks, setTasks] = useState<FollowupTask[]>([]);
  const [rules, setRules] = useState<FollowupPolicy[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [invoices, setInvoices] = useState<InvoiceReference[]>([]);
  const [filter, setFilter] = useState<"" | FollowupStatus>("");
  const [loading, setLoading] = useState(true);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [togglingRule, setTogglingRule] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [rulesError, setRulesError] = useState("");
  const [notice, setNotice] = useState("");

  const customerById = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers],
  );
  const jobById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  const invoiceById = useMemo(
    () => new Map(invoices.map((invoice) => [invoice.id, invoice])),
    [invoices],
  );

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [tasksResponse, customersResponse, jobsResponse, invoicesResponse] = await Promise.all([
        fetch("/api/followups", { cache: "no-store" }),
        fetch("/api/customers", { cache: "no-store" }),
        fetch("/api/jobs", { cache: "no-store" }),
        fetch("/api/invoices", { cache: "no-store" }),
      ]);
      const tasksPayload = await readApiResponse(tasksResponse);
      const customersPayload = await readApiResponse(customersResponse);
      const jobsPayload = await readApiResponse(jobsResponse);
      const invoicesPayload = await readApiResponse(invoicesResponse);
      if (!tasksResponse.ok) {
        setError(String((tasksPayload as { error?: unknown }).error ?? "Unable to load follow-ups."));
        return;
      }
      if (!customersResponse.ok || !jobsResponse.ok || !invoicesResponse.ok) {
        setError("Follow-ups loaded, but supporting records could not be reached.");
        return;
      }
      setTasks(tasksPayload as FollowupTask[]);
      setCustomers(customersPayload as Customer[]);
      setJobs(jobsPayload as Job[]);
      setInvoices(invoicesPayload as InvoiceReference[]);
    } catch {
      setError("CrewPilot OS could not load follow-ups.");
    } finally {
      setLoading(false);
    }
  }

  async function loadRules() {
    setRulesLoading(true);
    setRulesError("");
    try {
      const response = await fetch("/api/followups/rules", { cache: "no-store" });
      const payload = await readApiResponse(response);
      if (!response.ok) {
        setRulesError(String((payload as { error?: unknown }).error ?? "Unable to load automation rules."));
        return;
      }
      setRules(payload as FollowupPolicy[]);
    } catch {
      setRulesError("CrewPilot OS could not load automation rules.");
    } finally {
      setRulesLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    void loadRules();
  }, []);

  const filteredTasks = useMemo(() => {
    if (!filter) return tasks;
    return tasks.filter((task) => task.status === filter);
  }, [filter, tasks]);

  const openCount = useMemo(() => tasks.filter((task) => task.status === "open").length, [tasks]);
  const dueTodayCount = useMemo(() => {
    const today = new Date().toDateString();
    return tasks.filter(
      (task) => task.status === "open" && task.due_at && new Date(task.due_at).toDateString() === today,
    ).length;
  }, [tasks]);
  const overdueCount = useMemo(
    () => tasks.filter((task) => task.status === "open" && isOverdue(task.due_at)).length,
    [tasks],
  );

  async function resolveTask(task: FollowupTask) {
    setResolvingId(task.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/followups/${task.id}/resolve`, {
        body: "{}",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await readApiResponse(response);
      if (!response.ok) {
        setError(String((payload as { error?: unknown }).error ?? "Unable to resolve this follow-up."));
        return;
      }
      const resolved = payload as FollowupTask;
      setTasks((current) => current.map((item) => (item.id === resolved.id ? resolved : item)));
      setNotice("Follow-up resolved. Great work staying on top of outreach.");
    } catch {
      setError("CrewPilot OS could not resolve this follow-up.");
    } finally {
      setResolvingId(null);
    }
  }

  async function toggleRule(rule: FollowupPolicy) {
    setTogglingRule(rule.rule_type);
    setRulesError("");
    setNotice("");
    try {
      const response = await fetch(`/api/followups/rules/${rule.rule_type}`, {
        body: JSON.stringify({ enabled: !rule.enabled }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = await readApiResponse(response);
      if (!response.ok) {
        setRulesError(String((payload as { error?: unknown }).error ?? "Unable to update this rule."));
        return;
      }
      const updated = payload as FollowupPolicy;
      setRules((current) => current.map((item) => (item.rule_type === updated.rule_type ? updated : item)));
      setNotice(
        updated.enabled
          ? `${updated.title} is now active for this workspace.`
          : `${updated.title} paused for this workspace.`,
      );
    } catch {
      setRulesError("CrewPilot OS could not update this rule.");
    } finally {
      setTogglingRule(null);
    }
  }

  const contextText = useCallback(
    (task: FollowupTask) => {
      const parts: string[] = [];
      const customer = task.customer_id ? customerById.get(task.customer_id) : null;
      const job = task.job_id ? jobById.get(task.job_id) : null;
      const invoice = task.invoice_id ? invoiceById.get(task.invoice_id) : null;
      if (customer) parts.push(customer.name);
      if (job) parts.push(job.title);
      if (invoice) parts.push(invoice.title);
      return parts.join(" · ") || "Linked record";
    },
    [customerById, invoiceById, jobById],
  );

  return (
    <div className="mx-auto grid max-w-[1440px] gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-orange-600">Automation Core v1</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Follow-ups</h1>
            <p className="mt-1 text-sm text-gray-500">
              The AI automation layer turns loose records into a guided outreach queue.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-white p-4 shadow-panel">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Open follow-ups</p>
              <BellRing className="size-5 text-orange-600" />
            </div>
            <p className="mt-3 text-2xl font-semibold">{openCount}</p>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-panel">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Due today</p>
              <Clock3 className="size-5 text-orange-600" />
            </div>
            <p className="mt-3 text-2xl font-semibold">{dueTodayCount}</p>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-panel">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Overdue</p>
              <MessageSquareWarning className="size-5 text-rose-600" />
            </div>
            <p className="mt-3 text-2xl font-semibold">{overdueCount}</p>
          </div>
        </div>

        {error && <p className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
        {notice && <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</p>}

        <div className="mt-6 overflow-hidden rounded-xl border bg-white shadow-panel">
          <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Outreach queue</h2>
              <p className="mt-0.5 text-xs text-gray-500">{tasks.length} tasks in this workspace</p>
            </div>
            <div className="flex rounded-lg border bg-gray-50 p-1 text-sm font-medium">
              {(
                [
                  ["", `All (${tasks.length})`],
                  ["open", `Open (${openCount})`],
                  ["resolved", `Resolved (${tasks.length - openCount})`],
                ] as ["" | FollowupStatus, string][]
              ).map(([value, label]) => (
                <button
                  key={value || "all"}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`rounded-md px-3 py-1.5 transition ${
                    filter === value ? "bg-white text-orange-700 shadow-sm" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex h-56 items-center justify-center text-gray-500">
              <LoaderCircle className="mr-2 size-4 animate-spin" />
              Running the automation pass…
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center px-6 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-orange-50 text-orange-600">
                <Bell className="size-6" />
              </div>
              <h3 className="mt-4 font-semibold">Queue is clear</h3>
              <p className="mt-1 max-w-sm text-sm text-gray-500">
                {filter
                  ? `No ${filter} follow-ups right now.`
                  : "Automation rules look for estimates, invoices, and jobs that need a nudge."}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredTasks.map((task) => {
                const overdue = task.status === "open" && isOverdue(task.due_at);
                return (
                  <div key={task.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{task.title}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${ruleStyles(task.rule_type)}`}>
                          {ruleShortLabel(task.rule_type)}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            task.status === "resolved"
                              ? "bg-emerald-50 text-emerald-700"
                              : overdue
                                ? "bg-rose-50 text-rose-700"
                                : "bg-orange-50 text-orange-700"
                          }`}
                        >
                          {task.status === "resolved" ? statusLabels.resolved : overdue ? "Overdue" : "Open"}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="size-3.5" />
                          {contextText(task)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="size-3.5" />
                          {formatDate(task.due_at)}
                        </span>
                        {task.delivered_at && (
                          <span className="inline-flex items-center gap-1">
                            <PhoneCall className="size-3.5" />
                            Delivered
                          </span>
                        )}
                      </div>
                      {task.notes && <p className="mt-2 max-w-2xl text-sm text-gray-500">{task.notes}</p>}
                    </div>
                    {task.status === "open" && (
                      <button
                        type="button"
                        disabled={resolvingId === task.id}
                        onClick={() => resolveTask(task)}
                        className="flex h-9 w-full flex-none items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                      >
                        <Check className="size-4" />
                        {resolvingId === task.id ? "Resolving…" : "Mark resolved"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
        <section className="rounded-xl border bg-white p-5 shadow-panel">
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-violet-50 text-violet-700">
              <BellRing className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">Automation rules</h2>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                Enabling a rule scans company records and creates follow-up tasks when something needs a nudge.
              </p>
            </div>
          </div>

          {rulesError && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{rulesError}</p>}

          {rulesLoading ? (
            <div className="mt-5 flex items-center justify-center py-8 text-gray-500">
              <LoaderCircle className="mr-2 size-4 animate-spin" />
              Loading rules…
            </div>
          ) : (
            <div className="mt-5 divide-y">
              {rules.map((rule) => (
                <div key={rule.rule_type} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold">{rule.title}</h3>
                      <span className="text-xs text-gray-400">+{rule.due_days}d</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-gray-500">{rule.description}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={rule.enabled}
                    disabled={togglingRule === rule.rule_type}
                    onClick={() => toggleRule(rule)}
                    className={`relative h-6 w-11 flex-none rounded-full transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      rule.enabled ? "bg-emerald-500" : "bg-gray-200"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
                        rule.enabled ? "left-[22px]" : "left-0.5"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 flex items-center gap-1.5 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            <ReceiptText className="size-3.5" />
            Opening Follow-ups also runs the automation pass, so the queue stays current without a background worker.
          </p>
        </section>

        <section className="rounded-xl border bg-white p-5 shadow-panel">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">Why follow-ups matter</h2>
              <p className="text-xs text-gray-500">Estimates and invoices don&apos;t close themselves.</p>
            </div>
          </div>
          <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-gray-600">
            <Wrench className="mt-0.5 size-4 flex-none text-gray-400" />
            Jobs about to end, open estimates, and unpaid invoices all surface here as structured tasks.
          </p>
          <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-gray-600">
            <PhoneCall className="mt-0.5 size-4 flex-none text-gray-400" />
            Mark one resolved and the audit trail records it for the activity timeline.
          </p>
        </section>
      </aside>
    </div>
  );
}