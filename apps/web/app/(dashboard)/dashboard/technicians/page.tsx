"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, Plus, Search, UserRound, Wrench } from "lucide-react";

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

export default function TechniciansPage() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedTechnician = technicians.find((technician) => technician.id === selectedId) ?? technicians[0] ?? null;

  async function loadTechnicians() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/technicians", { cache: "no-store" });
      const payload = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(payload, "Unable to load technicians."));
        return;
      }
      const loaded = payload as Technician[];
      setTechnicians(loaded);
      setSelectedId((current) => current ?? loaded[0]?.id ?? null);
    } catch {
      setError("CrewPilot OS could not load technicians.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTechnicians();
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
                return (
                  <button key={technician.id} type="button" onClick={() => setSelectedId(technician.id)} className={`flex w-full flex-col gap-3 px-5 py-4 text-left transition hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between ${selected ? "bg-orange-50/60" : ""}`}>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{technician.name}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[technician.status]}`}>{statusLabels[technician.status]}</span>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">{[technician.phone, technician.email].filter(Boolean).join(" · ") || "No contact info yet"}</p>
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
            <div className="mt-4 rounded-lg bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</p>
              <p className="mt-2 text-sm text-gray-600">{selectedTechnician.notes || "No notes yet."}</p>
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
