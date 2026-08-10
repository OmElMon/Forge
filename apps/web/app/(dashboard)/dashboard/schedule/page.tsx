"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  LoaderCircle,
  Route,
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

type TechnicianStatus = "available" | "on_job" | "off_today";

type Technician = {
  id: string;
  name: string;
  status: TechnicianStatus;
  skills: string[];
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
  notes: string | null;
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

const technicianStatusStyles: Record<TechnicianStatus, string> = {
  available: "bg-emerald-50 text-emerald-700",
  off_today: "bg-gray-100 text-gray-700",
  on_job: "bg-blue-50 text-blue-700",
};

const technicianStatusLabels: Record<TechnicianStatus, string> = {
  available: "Available",
  off_today: "Off today",
  on_job: "On job",
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

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function dateKey(value: string | null) {
  if (!value) return "unscheduled";
  return new Date(value).toISOString().slice(0, 10);
}

function formatTime(value: string | null) {
  if (!value) return "Unscheduled";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDay(value: string) {
  if (value === "unscheduled") return "Unscheduled work";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
  }).format(new Date(`${value}T12:00:00`));
}

export default function SchedulePage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [workflowUpdatingId, setWorkflowUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

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
      setCustomers(customersPayload as Customer[]);
      setJobs(jobsPayload as Job[]);
      setTechnicians(techniciansPayload as Technician[]);
    } catch {
      setError("CrewPilot OS could not load the schedule.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

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
      const nextJobs = jobs.map((currentJob) => (currentJob.id === updated.id ? updated : currentJob));
      setJobs(nextJobs);
      await syncTechnicianAvailability(job, status, nextJobs);
    } catch {
      setError("CrewPilot OS could not move this job.");
    } finally {
      setWorkflowUpdatingId(null);
    }
  }

  async function syncTechnicianAvailability(job: Job, nextStatus: JobStatus, nextJobs: Job[]) {
    if (!job.technician_id) return;

    const technician = technicianById.get(job.technician_id);
    if (!technician) return;

    let nextTechnicianStatus: TechnicianStatus | null = null;
    if (nextStatus === "in_progress") {
      nextTechnicianStatus = "on_job";
    } else if (technician.status === "on_job") {
      const hasOtherInProgressJob = nextJobs.some(
        (candidate) =>
          candidate.id !== job.id &&
          candidate.technician_id === technician.id &&
          candidate.status === "in_progress",
      );
      nextTechnicianStatus = hasOtherInProgressJob ? null : "available";
    }

    if (!nextTechnicianStatus || nextTechnicianStatus === technician.status) return;

    try {
      const response = await fetch(`/api/technicians/${technician.id}`, {
        body: JSON.stringify({ status: nextTechnicianStatus }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(result, "Job moved, but technician availability could not be updated."));
        return;
      }
      const updatedTechnician = result as Technician;
      setTechnicians((current) =>
        current.map((currentTechnician) =>
          currentTechnician.id === updatedTechnician.id ? updatedTechnician : currentTechnician,
        ),
      );
    } catch {
      setError("Job moved, but CrewPilot OS could not update technician availability.");
    }
  }

  const scheduledJobs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return jobs
      .filter((job) => job.status !== "canceled")
      .filter((job) => {
        if (!normalized) return true;
        const customer = customerById.get(job.customer_id);
        const technician = job.technician_id ? technicianById.get(job.technician_id) : null;
        return [job.title, technician?.name, job.technician_name, customer?.name, job.status, technician?.status, ...(technician?.skills ?? [])]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalized));
      })
      .sort((a, b) => {
        if (!a.scheduled_start && !b.scheduled_start) return a.title.localeCompare(b.title);
        if (!a.scheduled_start) return 1;
        if (!b.scheduled_start) return -1;
        return new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime();
      });
  }, [customerById, jobs, query, technicianById]);

  const today = startOfToday();
  const todayKey = today.toISOString().slice(0, 10);
  const todaysJobs = scheduledJobs.filter((job) => dateKey(job.scheduled_start) === todayKey);
  const unscheduledJobs = scheduledJobs.filter((job) => !job.scheduled_start);
  const assignedJobs = scheduledJobs.filter((job) => Boolean(job.technician_id || job.technician_name)).length;
  const unassignedJobs = scheduledJobs.filter((job) => !job.technician_id && !job.technician_name);
  const availableTechnicians = technicians.filter((technician) => technician.status === "available").length;
  const activeTechnicians = technicians.filter((technician) => technician.status !== "off_today").length;

  const groupedJobs = useMemo(() => {
    return scheduledJobs.reduce((groups, job) => {
      const key = dateKey(job.scheduled_start);
      const bucket = groups.get(key) ?? [];
      bucket.push(job);
      groups.set(key, bucket);
      return groups;
    }, new Map<string, Job[]>());
  }, [scheduledJobs]);

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-orange-600">Dispatch Core v1</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Schedule</h1>
          <p className="mt-1 text-sm text-gray-500">
            See scheduled, assigned, and unscheduled work across the operation.
          </p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 w-full rounded-lg border bg-white pl-9 pr-3 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            placeholder="Search schedule…"
          />
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <MetricCard icon={CalendarDays} label="Today" value={todaysJobs.length} />
        <MetricCard icon={BriefcaseBusiness} label="Total work" value={scheduledJobs.length} />
        <MetricCard icon={Wrench} label="Assigned" value={assignedJobs} />
        <MetricCard icon={Clock3} label="Unscheduled" value={unscheduledJobs.length} />
      </div>

      {error && <p className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-xl border bg-white shadow-panel">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="font-semibold">Dispatch timeline</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {scheduledJobs.length} active job{scheduledJobs.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex h-72 items-center justify-center text-gray-500">
              <LoaderCircle className="mr-2 size-4 animate-spin" />
              Loading schedule…
            </div>
          ) : scheduledJobs.length === 0 ? (
            <div className="flex h-72 flex-col items-center justify-center px-6 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-orange-50 text-orange-600">
                <CalendarDays className="size-6" />
              </div>
              <h3 className="mt-4 font-semibold">No scheduled work yet</h3>
              <p className="mt-1 max-w-sm text-sm text-gray-500">
                Create jobs and add scheduled times to start building a dispatch board.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {[...groupedJobs.entries()].map(([day, dayJobs]) => (
                <div key={day}>
                  <div className="bg-gray-50 px-5 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {formatDay(day)}
                    </p>
                  </div>
                  <div className="divide-y">
                    {dayJobs.map((job) => {
                      const customer = customerById.get(job.customer_id);
                      const technician = job.technician_id ? technicianById.get(job.technician_id) : null;
                      const technicianName = technician?.name ?? job.technician_name;
                      return (
                        <div key={job.id} className="grid gap-3 px-5 py-4 hover:bg-gray-50 sm:grid-cols-[90px_1fr_auto] sm:items-center">
                          <p className="text-sm font-semibold text-gray-500">{formatTime(job.scheduled_start)}</p>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold">{job.title}</p>
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[job.status]}`}>
                                {job.status.replace("_", " ")}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                              <span className="inline-flex items-center gap-1"><UserRound className="size-3.5" />{customer?.name ?? "Unknown customer"}</span>
                              <span className="inline-flex items-center gap-1"><Wrench className="size-3.5" />{technicianName || "Unassigned"}</span>
                              {technician && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${technicianStatusStyles[technician.status]}`}>{technicianStatusLabels[technician.status]}</span>}
                            </div>
                            {technician?.skills.length ? (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {technician.skills.slice(0, 3).map((skill) => (
                                  <span key={skill} className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-600">{skill}</span>
                                ))}
                              </div>
                            ) : null}
                            {job.notes && <p className="mt-2 text-sm text-gray-500">{job.notes}</p>}
                          </div>
                          <div className="flex flex-col gap-2 sm:items-end">
                            <WorkflowActions
                              currentStatus={job.status}
                              disabled={workflowUpdatingId === job.id}
                              onMove={(status) => updateJobStatus(job, status)}
                            />
                            <a href="/dashboard/jobs" className="text-xs font-semibold text-orange-600 hover:text-orange-700">
                              Edit job
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <section className="rounded-xl border bg-white p-5 shadow-panel">
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-lg bg-orange-50 text-orange-600">
                <Route className="size-5" />
              </span>
              <div>
                <h2 className="font-semibold">Dispatch health</h2>
                <p className="text-xs text-gray-500">Fast read on schedule readiness.</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              <HealthRow label="Jobs scheduled today" value={todaysJobs.length} />
              <HealthRow label="Jobs with technician" value={assignedJobs} />
              <HealthRow label="Jobs needing technician" value={unassignedJobs.length} warning={unassignedJobs.length > 0} />
              <HealthRow label="Available technicians" value={availableTechnicians} />
              <HealthRow label="Active technicians" value={activeTechnicians} />
              <HealthRow label="Jobs needing schedule" value={unscheduledJobs.length} warning={unscheduledJobs.length > 0} />
            </div>
          </section>

          <section className="rounded-xl border bg-white p-5 shadow-panel">
            <h2 className="font-semibold">Unscheduled queue</h2>
            <p className="mt-1 text-xs text-gray-500">Work that still needs a time slot.</p>
            {unscheduledJobs.length === 0 ? (
              <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
                No unscheduled jobs. Dispatch is clean.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {unscheduledJobs.slice(0, 5).map((job) => (
                  <div key={job.id} className="rounded-lg border p-3">
                    <p className="text-sm font-semibold">{job.title}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {customerById.get(job.customer_id)?.name ?? "Unknown customer"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border bg-white p-5 shadow-panel">
            <h2 className="font-semibold">Team availability</h2>
            <p className="mt-1 text-xs text-gray-500">Real technician records used by dispatch.</p>
            {technicians.length === 0 ? (
              <p className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
                Add technicians to start assigning work from the schedule.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {technicians.slice(0, 6).map((technician) => (
                  <div key={technician.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{technician.name}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${technicianStatusStyles[technician.status]}`}>{technicianStatusLabels[technician.status]}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{technician.skills.slice(0, 3).join(", ") || "No skills tagged yet"}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: number }) {
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

function HealthRow({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-sm text-gray-600">{label}</p>
      <span className={`text-sm font-semibold ${warning ? "text-orange-700" : "text-gray-900"}`}>{value}</span>
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
    <div className="flex flex-wrap gap-2 sm:justify-end">
      {actions.slice(0, 2).map((action) => (
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
