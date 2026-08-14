"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Mail,
  Phone,
  Plus,
  Search,
  UserRound,
  Wrench,
} from "lucide-react";

type TechnicianStatus = "available" | "on_job" | "off_today";

type Technician = {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: TechnicianStatus;
  skills: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
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

type WorkloadTone = "danger" | "healthy" | "warning";

const statusStyles: Record<TechnicianStatus, string> = {
  available: "bg-emerald-50 text-emerald-700",
  off_today: "bg-gray-100 text-gray-700",
  on_job: "bg-blue-50 text-blue-700",
};

const statusLabels: Record<TechnicianStatus, string> = {
  available: "Available",
  off_today: "Off today",
  on_job: "On job",
};

const jobStatusStyles: Record<JobStatus, string> = {
  canceled: "bg-rose-50 text-rose-700",
  completed: "bg-emerald-50 text-emerald-700",
  in_progress: "bg-blue-50 text-blue-700",
  new: "bg-orange-50 text-orange-700",
  scheduled: "bg-violet-50 text-violet-700",
};

const jobStatusLabels: Record<JobStatus, string> = {
  canceled: "Canceled",
  completed: "Completed",
  in_progress: "In progress",
  new: "New",
  scheduled: "Scheduled",
};

const openJobStatuses = new Set<JobStatus>(["new", "scheduled", "in_progress"]);

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
        return "Invalid technician field.";
      })
      .join(" ");
  }
  return fallback;
}

function splitSkills(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function technicianPayload(form: FormData) {
  return {
    email: form.get("email") || null,
    name: form.get("name"),
    notes: form.get("notes") || null,
    phone: form.get("phone") || null,
    skills: splitSkills(form.get("skills")),
    status: form.get("status"),
  };
}

function formatSchedule(value: string | null) {
  if (!value) return "Unscheduled";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function technicianJobMatch(job: Job, technician: Technician) {
  return job.technician_id === technician.id || (!job.technician_id && job.technician_name === technician.name);
}

function workloadTone(openJobCount: number, status: TechnicianStatus): WorkloadTone {
  if (status === "off_today" && openJobCount > 0) return "warning";
  if (openJobCount >= 4) return "danger";
  if (openJobCount >= 2) return "warning";
  return "healthy";
}

function workloadLabel(openJobCount: number, status: TechnicianStatus) {
  if (status === "off_today" && openJobCount > 0) return "Coverage risk";
  if (openJobCount >= 4) return "Overloaded";
  if (openJobCount >= 2) return "Busy";
  if (openJobCount === 1) return "Assigned";
  return "Clear";
}

const workloadStyles: Record<WorkloadTone, string> = {
  danger: "bg-rose-50 text-rose-700",
  healthy: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
};

export default function TechniciansPage() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedTechnician = technicians.find((technician) => technician.id === selectedId) ?? technicians[0] ?? null;

  const customerById = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers],
  );

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [techniciansResponse, customersResponse, jobsResponse] = await Promise.all([
        fetch("/api/technicians", { cache: "no-store" }),
        fetch("/api/customers", { cache: "no-store" }),
        fetch("/api/jobs", { cache: "no-store" }),
      ]);
      const techniciansPayload = await readApiResponse(techniciansResponse);
      const customersPayload = await readApiResponse(customersResponse);
      const jobsPayload = await readApiResponse(jobsResponse);
      if (!techniciansResponse.ok) {
        setError(errorMessage(techniciansPayload, "Unable to load technicians."));
        return;
      }
      if (!customersResponse.ok) {
        setError(errorMessage(customersPayload, "Unable to load customers."));
        return;
      }
      if (!jobsResponse.ok) {
        setError(errorMessage(jobsPayload, "Unable to load jobs."));
        return;
      }
      const loaded = techniciansPayload as Technician[];
      setTechnicians(loaded);
      setCustomers(customersPayload as Customer[]);
      setJobs(jobsPayload as Job[]);
      setSelectedId((current) => current ?? loaded[0]?.id ?? null);
    } catch {
      setError("CrewPilot OS could not load technicians.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredTechnicians = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return technicians;
    return technicians.filter((technician) =>
      [technician.name, technician.email, technician.phone, technician.status, ...technician.skills]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized)),
    );
  }, [query, technicians]);

  const counts = useMemo(() => {
    return technicians.reduce(
      (total, technician) => {
        total[technician.status] += 1;
        return total;
      },
      { available: 0, off_today: 0, on_job: 0 } as Record<TechnicianStatus, number>,
    );
  }, [technicians]);

  const workloadByTechnicianId = useMemo(() => {
    return new Map(
      technicians.map((technician) => {
        const assignedJobs = jobs.filter((job) => technicianJobMatch(job, technician));
        const openJobs = assignedJobs.filter((job) => openJobStatuses.has(job.status));
        const nextJob =
          openJobs
            .filter((job) => Boolean(job.scheduled_start))
            .sort((a, b) => new Date(a.scheduled_start!).getTime() - new Date(b.scheduled_start!).getTime())[0] ??
          openJobs[0] ??
          null;
        return [
          technician.id,
          {
            assignedJobs,
            nextJob,
            openJobs,
            tone: workloadTone(openJobs.length, technician.status),
          },
        ];
      }),
    );
  }, [jobs, technicians]);

  const workloadCounts = useMemo(() => {
    return technicians.reduce(
      (totals, technician) => {
        const workload = workloadByTechnicianId.get(technician.id);
        const openCount = workload?.openJobs.length ?? 0;
        if (openCount === 0 && technician.status === "available") totals.clear += 1;
        if (openCount >= 2) totals.busy += 1;
        if (technician.status === "off_today" && openCount > 0) totals.coverageRisks += 1;
        return totals;
      },
      { busy: 0, clear: 0, coverageRisks: 0 },
    );
  }, [technicians, workloadByTechnicianId]);

  const selectedJobs = useMemo(() => {
    if (!selectedTechnician) return [];
    return jobs
      .filter((job) => technicianJobMatch(job, selectedTechnician))
      .sort((a, b) => {
        if (!a.scheduled_start && !b.scheduled_start) return a.title.localeCompare(b.title);
        if (!a.scheduled_start) return 1;
        if (!b.scheduled_start) return -1;
        return new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime();
      });
  }, [jobs, selectedTechnician]);

  const openSelectedJobs = selectedJobs.filter((job) => !["completed", "canceled"].includes(job.status));
  const completedSelectedJobs = selectedJobs.filter((job) => job.status === "completed");
  const nextSelectedJob = openSelectedJobs.find((job) => Boolean(job.scheduled_start)) ?? openSelectedJobs[0] ?? null;
  const selectedWorkload = selectedTechnician ? workloadByTechnicianId.get(selectedTechnician.id) : null;

  async function createTechnician(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/technicians", {
        body: JSON.stringify(technicianPayload(form)),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(result, `Unable to create technician. Status ${response.status}.`));
        return;
      }
      const technician = result as Technician;
      event.currentTarget.reset();
      setTechnicians((current) => [...current, technician].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedId(technician.id);
    } catch {
      setError("CrewPilot OS could not save this technician.");
    } finally {
      setSaving(false);
    }
  }

  async function updateTechnician(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTechnician) return;
    setUpdating(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(`/api/technicians/${selectedTechnician.id}`, {
        body: JSON.stringify(technicianPayload(form)),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(result, `Unable to update technician. Status ${response.status}.`));
        return;
      }
      const updated = result as Technician;
      setTechnicians((current) => current.map((technician) => (technician.id === updated.id ? updated : technician)));
      setSelectedId(updated.id);
    } catch {
      setError("CrewPilot OS could not update this technician.");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1440px] gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-orange-600">Team Core v1</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Technicians</h1>
            <p className="mt-1 text-sm text-gray-500">Manage field-team availability, skills, and assignment readiness.</p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-lg border bg-white pl-9 pr-3 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Search technicians…" />
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <MetricCard icon={CheckCircle2} label="Available" value={counts.available} />
          <MetricCard icon={Wrench} label="On job" value={counts.on_job} />
          <MetricCard icon={UserRound} label="Off today" value={counts.off_today} />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <MetricCard icon={Clock3} label="Clear capacity" value={workloadCounts.clear} />
          <MetricCard icon={BriefcaseBusiness} label="Busy techs" value={workloadCounts.busy} />
          <MetricCard icon={CalendarClock} label="Coverage risks" value={workloadCounts.coverageRisks} />
        </div>

        {error && <p className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}

        <div className="mt-6 overflow-hidden rounded-xl border bg-white shadow-panel">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="font-semibold">Team roster</h2>
              <p className="mt-0.5 text-xs text-gray-500">{technicians.length} total technicians</p>
            </div>
          </div>
          {loading ? (
            <div className="flex h-56 items-center justify-center text-gray-500"><LoaderCircle className="mr-2 size-4 animate-spin" />Loading technicians…</div>
          ) : filteredTechnicians.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center px-6 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-orange-50 text-orange-600"><Wrench className="size-6" /></div>
              <h3 className="mt-4 font-semibold">No technicians yet</h3>
              <p className="mt-1 max-w-sm text-sm text-gray-500">Add your first team member to start assigning jobs to real people.</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredTechnicians.map((technician) => {
                const selected = technician.id === selectedTechnician?.id;
                const workload = workloadByTechnicianId.get(technician.id);
                const openJobCount = workload?.openJobs.length ?? 0;
                const nextJob = workload?.nextJob ?? null;
                const tone = workload?.tone ?? "healthy";
                return (
                  <button key={technician.id} type="button" onClick={() => setSelectedId(technician.id)} className={`flex w-full flex-col gap-3 px-5 py-4 text-left transition hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between ${selected ? "bg-orange-50/60" : ""}`}>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{technician.name}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[technician.status]}`}>{statusLabels[technician.status]}</span>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${workloadStyles[tone]}`}>
                          {workloadLabel(openJobCount, technician.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">{[technician.phone, technician.email].filter(Boolean).join(" · ") || "No contact info yet"}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {openJobCount} open job{openJobCount === 1 ? "" : "s"}
                        {nextJob ? ` · Next: ${nextJob.title} (${formatSchedule(nextJob.scheduled_start)})` : " · No upcoming assignment"}
                      </p>
                      {technician.skills.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {technician.skills.map((skill) => <span key={skill} className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600">{skill}</span>)}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">Updated {new Date(technician.updated_at).toLocaleDateString()}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
        {selectedTechnician && (
          <section className="rounded-xl border bg-white p-5 shadow-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Technician profile</p>
                <h2 className="mt-1 text-xl font-semibold">{selectedTechnician.name}</h2>
                <p className="mt-1 text-xs text-gray-500">{selectedTechnician.email || selectedTechnician.phone || "No contact info yet"}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[selectedTechnician.status]}`}>{statusLabels[selectedTechnician.status]}</span>
            </div>
            <div className="mt-5 rounded-lg bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Skills</p>
              <p className="mt-2 text-sm text-gray-600">{selectedTechnician.skills.join(", ") || "No skills tagged yet."}</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              <MiniMetric icon={BriefcaseBusiness} label="Open jobs" value={openSelectedJobs.length} />
              <MiniMetric icon={CheckCircle2} label="Completed" value={completedSelectedJobs.length} />
              <MiniMetric icon={Clock3} label="Total assigned" value={selectedJobs.length} />
            </div>
            {selectedWorkload && (
              <div className={`mt-4 rounded-lg p-4 ${workloadStyles[selectedWorkload.tone]}`}>
                <p className="text-xs font-semibold uppercase tracking-wide">Workload signal</p>
                <p className="mt-2 font-semibold">
                  {workloadLabel(selectedWorkload.openJobs.length, selectedTechnician.status)}
                </p>
                <p className="mt-1 text-xs leading-5">
                  {selectedWorkload.openJobs.length === 0
                    ? "No active assignments. This technician has room for new work."
                    : `${selectedWorkload.openJobs.length} active assignment${selectedWorkload.openJobs.length === 1 ? "" : "s"} tied to this technician.`}
                </p>
              </div>
            )}
            {nextSelectedJob && (
              <div className="mt-4 rounded-lg border border-orange-100 bg-orange-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Next assignment</p>
                <p className="mt-2 font-semibold text-gray-950">{nextSelectedJob.title}</p>
                <p className="mt-1 text-xs text-gray-600">
                  {formatSchedule(nextSelectedJob.scheduled_start)} · {customerById.get(nextSelectedJob.customer_id)?.name ?? "Unknown customer"}
                </p>
              </div>
            )}
            <div className="mt-4 rounded-lg bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</p>
              <p className="mt-2 text-sm text-gray-600">{selectedTechnician.notes || "No notes yet."}</p>
            </div>
            <div className="mt-5 border-t pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Assigned work</h3>
                  <p className="mt-0.5 text-xs text-gray-500">Jobs currently tied to this technician.</p>
                </div>
                <a href="/dashboard/jobs" className="text-xs font-semibold text-orange-600 hover:text-orange-700">Open jobs</a>
              </div>
              {selectedJobs.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed p-4 text-sm text-gray-500">
                  No assigned work yet. Assign this technician from the Jobs board.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {selectedJobs.slice(0, 5).map((job) => {
                    const customer = customerById.get(job.customer_id);
                    return (
                      <div key={job.id} className="rounded-lg border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold">{job.title}</p>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${jobStatusStyles[job.status]}`}>{jobStatusLabels[job.status]}</span>
                        </div>
                        <div className="mt-2 space-y-1 text-xs text-gray-500">
                          <p className="inline-flex items-center gap-1.5"><CalendarClock className="size-3.5" />{formatSchedule(job.scheduled_start)}</p>
                          <p className="flex items-center gap-1.5"><UserRound className="size-3.5" />{customer?.name ?? "Unknown customer"}</p>
                          {customer?.phone && <p className="flex items-center gap-1.5"><Phone className="size-3.5" />{customer.phone}</p>}
                          {customer?.email && <p className="flex items-center gap-1.5"><Mail className="size-3.5" />{customer.email}</p>}
                        </div>
                      </div>
                    );
                  })}
                  {selectedJobs.length > 5 && <p className="text-xs text-gray-500">Showing 5 of {selectedJobs.length} assigned jobs.</p>}
                </div>
              )}
            </div>
            <form key={selectedTechnician.id} onSubmit={updateTechnician} className="mt-5 space-y-4 border-t pt-5">
              <div className="flex items-center justify-between"><h3 className="font-semibold">Edit technician</h3><p className="text-xs text-gray-500">Updates team roster</p></div>
              <TechnicianFields technician={selectedTechnician} />
              <button disabled={updating} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-950 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60">{updating ? <LoaderCircle className="size-4 animate-spin" /> : null}Save changes</button>
            </form>
          </section>
        )}

        <section className="rounded-xl border bg-white p-5 shadow-panel">
          <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-lg bg-orange-50 text-orange-600"><Plus className="size-5" /></span><div><h2 className="font-semibold">Add technician</h2><p className="text-xs text-gray-500">Create a field team record.</p></div></div>
          <form onSubmit={createTechnician} className="mt-5 space-y-4">
            <TechnicianFields />
            <button disabled={saving} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-orange-600 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60">{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}Save technician</button>
          </form>
        </section>
      </aside>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof Wrench; label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-panel">
      <div className="flex items-center justify-between"><p className="text-sm text-gray-500">{label}</p><Icon className="size-5 text-orange-600" /></div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function MiniMetric({ icon: Icon, label, value }: { icon: typeof Wrench; label: string; value: number }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500">{label}</p>
        <Icon className="size-4 text-orange-600" />
      </div>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

function TechnicianFields({ technician }: { technician?: Technician }) {
  return (
    <>
      <label className="block text-sm font-medium">Name<input name="name" required minLength={2} defaultValue={technician?.name ?? ""} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Jordan Reyes" /></label>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <label className="block text-sm font-medium">Phone<input name="phone" defaultValue={technician?.phone ?? ""} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="555-123-4567" /></label>
        <label className="block text-sm font-medium">Email<input name="email" type="email" defaultValue={technician?.email ?? ""} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="tech@example.com" /></label>
      </div>
      <label className="block text-sm font-medium">Status<select name="status" defaultValue={technician?.status ?? "available"} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"><option value="available">Available</option><option value="on_job">On job</option><option value="off_today">Off today</option></select></label>
      <label className="block text-sm font-medium">Skills<input name="skills" defaultValue={technician?.skills.join(", ") ?? ""} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Diagnostics, installs, maintenance" /></label>
      <label className="block text-sm font-medium">Notes<textarea name="notes" rows={4} defaultValue={technician?.notes ?? ""} className="mt-2 w-full rounded-lg border px-3 py-2 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Availability, strengths, territory notes…" /></label>
    </>
  );
}
