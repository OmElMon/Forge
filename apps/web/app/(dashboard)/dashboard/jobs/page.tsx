"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Plus,
  Search,
  UserRound,
  Wrench,
} from "lucide-react";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

type Technician = {
  id: string;
  name: string;
  status: "available" | "on_job" | "off_today";
  skills: string[];
};

type JobStatus = "new" | "scheduled" | "in_progress" | "completed" | "canceled";

type Job = {
  id: string;
  company_id: string;
  customer_id: string;
  technician_id: string | null;
  title: string;
  status: JobStatus;
  scheduled_start: string | null;
  technician_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
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

const workflowActions: Record<JobStatus, { label: string; status: JobStatus; tone?: "primary" | "danger" }[]> = {
  canceled: [{ label: "Reopen", status: "new" }],
  completed: [{ label: "Reopen", status: "in_progress" }],
  in_progress: [
    { label: "Complete job", status: "completed", tone: "primary" },
    { label: "Move back", status: "scheduled" },
  ],
  new: [
    { label: "Mark scheduled", status: "scheduled", tone: "primary" },
    { label: "Cancel", status: "canceled", tone: "danger" },
  ],
  scheduled: [
    { label: "Start job", status: "in_progress", tone: "primary" },
    { label: "Complete", status: "completed" },
    { label: "Cancel", status: "canceled", tone: "danger" },
  ],
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
  if (typeof error === "string") return error;
  if (Array.isArray(error)) {
    return error
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) return String((item as { msg: unknown }).msg);
        return "Invalid job field.";
      })
      .join(" ");
  }
  return fallback;
}

function jobPayload(form: FormData) {
  const scheduledStart = form.get("scheduled_start");
  const technicianId = form.get("technician_id");
  return {
    customer_id: form.get("customer_id"),
    notes: form.get("notes") || null,
    scheduled_start: scheduledStart ? new Date(String(scheduledStart)).toISOString() : null,
    status: form.get("status"),
    technician_id: technicianId ? String(technicianId) : null,
    technician_name: form.get("technician_name") || null,
    title: form.get("title"),
  };
}

function formatSchedule(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function dateTimeInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export default function JobsPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [workflowUpdatingId, setWorkflowUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedJob = jobs.find((job) => job.id === selectedId) ?? jobs[0] ?? null;

  const customerById = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers],
  );
  const technicianById = useMemo(
    () => new Map(technicians.map((technician) => [technician.id, technician])),
    [technicians],
  );

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [customersResponse, jobsResponse, techniciansResponse] = await Promise.all([
        fetch("/api/customers", { cache: "no-store" }),
        fetch("/api/jobs", { cache: "no-store" }),
        fetch("/api/technicians", { cache: "no-store" }),
      ]);
      const customersPayload = await readApiResponse(customersResponse);
      const jobsPayload = await readApiResponse(jobsResponse);
      const techniciansPayload = await readApiResponse(techniciansResponse);
      if (!customersResponse.ok) {
        setError(errorMessage(customersPayload, "Unable to load customers."));
        return;
      }
      if (!jobsResponse.ok) {
        setError(errorMessage(jobsPayload, "Unable to load jobs."));
        return;
      }
      if (!techniciansResponse.ok) {
        setError(errorMessage(techniciansPayload, "Unable to load technicians."));
        return;
      }
      const loadedJobs = jobsPayload as Job[];
      setCustomers(customersPayload as Customer[]);
      setTechnicians(techniciansPayload as Technician[]);
      setJobs(loadedJobs);
      setSelectedId((current) => current ?? loadedJobs[0]?.id ?? null);
    } catch {
      setError("CrewPilot OS could not load jobs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredJobs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return jobs;
    return jobs.filter((job) => {
      const customer = customerById.get(job.customer_id);
      const technician = job.technician_id ? technicianById.get(job.technician_id) : null;
      return [job.title, job.status, technician?.name, job.technician_name, customer?.name]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized));
    });
  }, [customerById, jobs, query, technicianById]);

  const jobCounts = useMemo(() => {
    return jobs.reduce(
      (counts, job) => {
        counts[job.status] += 1;
        return counts;
      },
      { canceled: 0, completed: 0, in_progress: 0, new: 0, scheduled: 0 } as Record<JobStatus, number>,
    );
  }, [jobs]);

  async function createJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/jobs", {
        body: JSON.stringify(jobPayload(form)),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(result, `Unable to create job. Status ${response.status}.`));
        return;
      }
      const job = result as Job;
      event.currentTarget.reset();
      setJobs((current) => [job, ...current]);
      setSelectedId(job.id);
    } catch {
      setError("CrewPilot OS could not save this job.");
    } finally {
      setSaving(false);
    }
  }

  async function updateJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedJob) return;

    setUpdating(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(`/api/jobs/${selectedJob.id}`, {
        body: JSON.stringify(jobPayload(form)),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(result, `Unable to update job. Status ${response.status}.`));
        return;
      }
      const updated = result as Job;
      setJobs((current) => current.map((job) => (job.id === updated.id ? updated : job)));
      setSelectedId(updated.id);
    } catch {
      setError("CrewPilot OS could not update this job.");
    } finally {
      setUpdating(false);
    }
  }

  async function updateJobStatus(job: Job, status: JobStatus) {
    setWorkflowUpdatingId(job.id);
    setError("");

    try {
      const response = await fetch(`/api/jobs/${job.id}`, {
        body: JSON.stringify({ status }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(result, `Unable to move job. Status ${response.status}.`));
        return;
      }
      const updated = result as Job;
      setJobs((current) => current.map((currentJob) => (currentJob.id === updated.id ? updated : currentJob)));
      setSelectedId(updated.id);
    } catch {
      setError("CrewPilot OS could not move this job.");
    } finally {
      setWorkflowUpdatingId(null);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1440px] gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-orange-600">Operations Core v1</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Jobs</h1>
            <p className="mt-1 text-sm text-gray-500">
              Turn customers into scheduled service work your team can track.
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 w-full rounded-lg border bg-white pl-9 pr-3 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              placeholder="Search jobs…"
            />
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <MetricCard icon={BriefcaseBusiness} label="Open jobs" value={jobCounts.new + jobCounts.scheduled + jobCounts.in_progress} />
          <MetricCard icon={Clock3} label="Scheduled" value={jobCounts.scheduled} />
          <MetricCard icon={CheckCircle2} label="Completed" value={jobCounts.completed} />
        </div>

        {error && <p className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}

        <div className="mt-6 overflow-hidden rounded-xl border bg-white shadow-panel">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="font-semibold">Job board</h2>
              <p className="mt-0.5 text-xs text-gray-500">{jobs.length} total jobs</p>
            </div>
          </div>

          {loading ? (
            <div className="flex h-56 items-center justify-center text-gray-500">
              <LoaderCircle className="mr-2 size-4 animate-spin" />
              Loading jobs…
            </div>
          ) : customers.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center px-6 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-orange-50 text-orange-600">
                <UserRound className="size-6" />
              </div>
              <h3 className="mt-4 font-semibold">Add a customer first</h3>
              <p className="mt-1 max-w-sm text-sm text-gray-500">
                Jobs need to be connected to customer records before they can be scheduled.
              </p>
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center px-6 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-orange-50 text-orange-600">
                <BriefcaseBusiness className="size-6" />
              </div>
              <h3 className="mt-4 font-semibold">No jobs yet</h3>
              <p className="mt-1 max-w-sm text-sm text-gray-500">
                Create your first job to connect CRM records to real service work.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredJobs.map((job) => {
                const isSelected = job.id === selectedJob?.id;
                const customer = customerById.get(job.customer_id);
                const technician = job.technician_id ? technicianById.get(job.technician_id) : null;
                return (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => setSelectedId(job.id)}
                    className={`flex w-full flex-col gap-3 px-5 py-4 text-left transition hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between ${isSelected ? "bg-orange-50/60" : ""}`}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{job.title}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[job.status]}`}>
                          {statusLabels[job.status]}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1"><UserRound className="size-3.5" />{customer?.name ?? "Unknown customer"}</span>
                        <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" />{formatSchedule(job.scheduled_start)}</span>
                        {(technician?.name || job.technician_name) && <span className="inline-flex items-center gap-1"><Wrench className="size-3.5" />{technician?.name ?? job.technician_name}</span>}
                      </div>
                      {job.notes && <p className="mt-2 max-w-2xl text-sm text-gray-500">{job.notes}</p>}
                    </div>
                    <p className="text-xs text-gray-400">{new Date(job.created_at).toLocaleDateString()}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
        {selectedJob && (
          <section className="rounded-xl border bg-white p-5 shadow-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Job detail</p>
                <h2 className="mt-1 text-xl font-semibold">{selectedJob.title}</h2>
                <p className="mt-1 text-xs text-gray-500">
                  {customerById.get(selectedJob.customer_id)?.name ?? "Unknown customer"}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[selectedJob.status]}`}>
                {statusLabels[selectedJob.status]}
              </span>
            </div>

            <div className="mt-5 grid gap-3 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
              <p className="inline-flex items-center gap-2">
                <CalendarClock className="size-4 text-gray-400" />
                {formatSchedule(selectedJob.scheduled_start)}
              </p>
              <p className="inline-flex items-center gap-2">
                <Wrench className="size-4 text-gray-400" />
                {(selectedJob.technician_id ? technicianById.get(selectedJob.technician_id)?.name : null) || selectedJob.technician_name || "No technician assigned yet"}
              </p>
              <p>{selectedJob.notes || "No job notes yet."}</p>
            </div>

            <div className="mt-5 border-t pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Workflow actions</h3>
                  <p className="mt-0.5 text-xs text-gray-500">Move this job through the service lifecycle.</p>
                </div>
              </div>
              <WorkflowActions
                currentStatus={selectedJob.status}
                disabled={workflowUpdatingId === selectedJob.id}
                onMove={(status) => updateJobStatus(selectedJob, status)}
              />
            </div>

            <form key={selectedJob.id} onSubmit={updateJob} className="mt-5 space-y-4 border-t pt-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Edit job</h3>
                <p className="text-xs text-gray-500">Changes save to operations</p>
              </div>
              <JobFields customers={customers} technicians={technicians} job={selectedJob} />
              <button disabled={updating} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-950 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60">
                {updating ? <LoaderCircle className="size-4 animate-spin" /> : null}
                Save changes
              </button>
            </form>
          </section>
        )}

        <section className="rounded-xl border bg-white p-5 shadow-panel">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-lg bg-orange-50 text-orange-600">
              <Plus className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">Create job</h2>
              <p className="text-xs text-gray-500">Link work to a customer.</p>
            </div>
          </div>

          <form onSubmit={createJob} className="mt-5 space-y-4">
            <JobFields customers={customers} technicians={technicians} />
            <button disabled={saving || customers.length === 0} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-orange-600 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Save job
            </button>
          </form>
        </section>
      </aside>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof BriefcaseBusiness; label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-panel">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{label}</p>
        <Icon className="size-5 text-orange-600" />
      </div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function WorkflowActions({
  currentStatus,
  disabled,
  onMove,
}: {
  currentStatus: JobStatus;
  disabled: boolean;
  onMove: (status: JobStatus) => void;
}) {
  const actions = workflowActions[currentStatus];
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {actions.map((action) => (
        <button
          key={`${currentStatus}-${action.status}`}
          type="button"
          disabled={disabled}
          onClick={() => onMove(action.status)}
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
            action.tone === "primary"
              ? "bg-orange-600 text-white hover:bg-orange-700"
              : action.tone === "danger"
                ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          {disabled ? "Saving…" : action.label}
        </button>
      ))}
    </div>
  );
}

function JobFields({ customers, technicians, job }: { customers: Customer[]; technicians: Technician[]; job?: Job }) {
  return (
    <>
      <label className="block text-sm font-medium">
        Job title
        <input name="title" required minLength={2} defaultValue={job?.title ?? ""} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="AC not cooling" />
      </label>
      <label className="block text-sm font-medium">
        Customer
        <select name="customer_id" required defaultValue={job?.customer_id ?? customers[0]?.id ?? ""} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100">
          {customers.length === 0 ? <option value="">Add a customer first</option> : null}
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>{customer.name}</option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <label className="block text-sm font-medium">
          Status
          <select name="status" defaultValue={job?.status ?? "new"} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100">
            <option value="new">New</option>
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="canceled">Canceled</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Scheduled time
          <input name="scheduled_start" type="datetime-local" defaultValue={dateTimeInputValue(job?.scheduled_start ?? null)} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
        </label>
      </div>
      <label className="block text-sm font-medium">
        Technician
        <select name="technician_id" defaultValue={job?.technician_id ?? ""} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100">
          <option value="">Unassigned</option>
          {technicians.map((technician) => (
            <option key={technician.id} value={technician.id}>
              {technician.name} · {technician.status.replace("_", " ")}
            </option>
          ))}
        </select>
        {job?.technician_name && !job.technician_id ? (
          <input name="technician_name" type="hidden" defaultValue={job.technician_name} />
        ) : null}
      </label>
      <label className="block text-sm font-medium">
        Notes
        <textarea name="notes" rows={4} defaultValue={job?.notes ?? ""} className="mt-2 w-full rounded-lg border px-3 py-2 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Issue details, equipment notes, arrival instructions…" />
      </label>
    </>
  );
}
