"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  BriefcaseBusiness,
  CalendarClock,
  ClipboardList,
  Inbox,
  LoaderCircle,
  Megaphone,
  Pencil,
  PhoneCall,
  Plus,
  Save,
  Search,
  UserRound,
  Wrench,
} from "lucide-react";

type IntakeKind = "lead" | "call";
type IntakeStatus = "new" | "contacted" | "closed" | "converted";

type IntakeRecord = {
  id: string;
  company_id: string;
  kind: IntakeKind;
  status: IntakeStatus;
  name: string | null;
  phone: string | null;
  source: string | null;
  notes: string | null;
  customer_id: string | null;
  created_at: string;
  updated_at: string;
};

type Customer = {
  id: string;
  name: string;
};

type Technician = {
  id: string;
  name: string;
  status: "available" | "on_job" | "off_today";
};

type Job = {
  id: string;
  customer_id: string;
  title: string;
  status: string;
};

const statusLabels: Record<IntakeStatus, string> = {
  contacted: "Contacted",
  closed: "Closed",
  converted: "Converted",
  new: "New",
};

const statusStyles: Record<IntakeStatus, string> = {
  contacted: "bg-blue-50 text-blue-700",
  closed: "bg-gray-100 text-gray-600",
  converted: "bg-emerald-50 text-emerald-700",
  new: "bg-orange-50 text-orange-700",
};

const kindLabels: Record<IntakeKind, string> = {
  call: "Call",
  lead: "Lead",
};

const kindStyles: Record<IntakeKind, string> = {
  call: "bg-violet-50 text-violet-700",
  lead: "bg-amber-50 text-amber-700",
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
        return "Invalid intake field.";
      })
      .join(" ");
  }
  return fallback;
}

function intakePayload(form: FormData) {
  return {
    kind: form.get("kind") || "lead",
    name: form.get("name") || null,
    notes: form.get("notes") || null,
    phone: form.get("phone") || null,
    source: form.get("source") || null,
    status: form.get("status") || "new",
  };
}

function centsFromInput(value: FormDataEntryValue | null) {
  const parsed = Number.parseFloat(String(value ?? "0"));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

export default function IntakePage() {
  const [records, setRecords] = useState<IntakeRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [jobCreatingId, setJobCreatingId] = useState<string | null>(null);
  const [jobCreated, setJobCreated] = useState<Job | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | IntakeStatus>("");
  const [kindFilter, setKindFilter] = useState<"" | IntakeKind>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRecord = records.find((record) => record.id === selectedId) ?? records[0] ?? null;

  const customerById = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers],
  );

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [intakeResponse, customersResponse, techniciansResponse] = await Promise.all([
        fetch("/api/intake", { cache: "no-store" }),
        fetch("/api/customers", { cache: "no-store" }),
        fetch("/api/technicians", { cache: "no-store" }),
      ]);
      const intakePayloadData = await readApiResponse(intakeResponse);
      const customersPayload = await readApiResponse(customersResponse);
      const techniciansPayload = await readApiResponse(techniciansResponse);
      if (!intakeResponse.ok) {
        setError(errorMessage(intakePayloadData, "Unable to load intake records."));
        return;
      }
      if (!customersResponse.ok || !techniciansResponse.ok) {
        setError("Intake records loaded, but supporting records could not be reached.");
        return;
      }
      const loaded = intakePayloadData as IntakeRecord[];
      setCustomers(customersPayload as Customer[]);
      setTechnicians(techniciansPayload as Technician[]);
      setRecords(loaded);
      setSelectedId((current) => current ?? loaded[0]?.id ?? null);
    } catch {
      setError("CrewPilot OS could not load intake records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredRecords = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return records.filter((record) => {
      if (statusFilter && record.status !== statusFilter) return false;
      if (kindFilter && record.kind !== kindFilter) return false;
      if (!normalized) return true;
      return [record.name, record.phone, record.source, kindLabels[record.kind], statusLabels[record.status]]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized));
    });
  }, [kindFilter, query, records, statusFilter]);

  const needsResponseCount = useMemo(
    () => records.filter((record) => record.status === "new" || record.status === "contacted").length,
    [records],
  );
  const convertedCount = useMemo(
    () => records.filter((record) => record.status === "converted").length,
    [records],
  );
  const closedCount = useMemo(() => records.filter((record) => record.status === "closed").length, [records]);

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/intake", {
        body: JSON.stringify(intakePayload(form)),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(result, `Unable to create intake record. Status ${response.status}.`));
        return;
      }
      const record = result as IntakeRecord;
      event.currentTarget.reset();
      setRecords((current) => [record, ...current]);
      setSelectedId(record.id);
      setNotice(record.name ? `Intake record saved for ${record.name}.` : "Intake record saved.");
    } catch {
      setError("CrewPilot OS could not save this intake record.");
    } finally {
      setSaving(false);
    }
  }

  async function updateRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRecord) return;

    setUpdating(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(`/api/intake/${selectedRecord.id}`, {
        body: JSON.stringify(intakePayload(form)),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(result, `Unable to update intake record. Status ${response.status}.`));
        return;
      }
      const updated = result as IntakeRecord;
      setRecords((current) => current.map((record) => (record.id === updated.id ? updated : record)));
      setSelectedId(updated.id);
      setEditing(false);
      setNotice("Intake record updated.");
    } catch {
      setError("CrewPilot OS could not update this intake record.");
    } finally {
      setUpdating(false);
    }
  }

  async function convertRecord(record: IntakeRecord) {
    setConvertingId(record.id);
    setError("");
    setNotice("");
    setJobCreated(null);

    try {
      const response = await fetch(`/api/intake/${record.id}/convert`, {
        body: "{}",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(result, `Unable to convert. Status ${response.status}.`));
        return;
      }
      const customer = result as Customer;
      const converted: IntakeRecord = { ...record, customer_id: customer.id, status: "converted" };
      setCustomers((current) =>
        current.some((existing) => existing.id === customer.id) ? current : [customer, ...current],
      );
      setRecords((current) => current.map((item) => (item.id === record.id ? converted : item)));
      setSelectedId(record.id);
      setEditing(false);
      setJobCreated(null);
      setNotice(`${customer.name} is now a customer. Create a job to start the handoff.`);
    } catch {
      setError("CrewPilot OS could not convert this intake record.");
    } finally {
      setConvertingId(null);
    }
  }

  async function createHandoffJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRecord || !selectedRecord.customer_id) return;

    setJobCreatingId(selectedRecord.id);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const scheduledStart = form.get("scheduled_start");
    const technicianId = form.get("technician_id");

    try {
      const response = await fetch("/api/jobs", {
        body: JSON.stringify({
          amount_cents: centsFromInput(form.get("amount")),
          customer_id: selectedRecord.customer_id,
          notes: form.get("notes") || null,
          scheduled_start: scheduledStart ? new Date(String(scheduledStart)).toISOString() : null,
          status: "new",
          technician_id: technicianId ? String(technicianId) : null,
          title: form.get("title"),
        }),
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
      setJobCreated(job);
      setNotice("Job created. Schedule and assign it from the Jobs board.");
    } catch {
      setError("CrewPilot OS could not create this job.");
    } finally {
      setJobCreatingId(null);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1440px] gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-orange-600">Lead Capture Core v1</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Intake</h1>
            <p className="mt-1 text-sm text-gray-500">
              Presale touchpoints wait here until they become CRM customers and jobs.
            </p>
          </div>
          <div className="flex w-full gap-2 sm:max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-10 w-full rounded-lg border bg-white pl-9 pr-3 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                placeholder="Search intake…"
              />
            </div>
            <select
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value as "" | IntakeKind)}
              className="h-10 rounded-lg border bg-white px-3 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            >
              <option value="">All kinds</option>
              <option value="lead">Leads</option>
              <option value="call">Calls</option>
            </select>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <MetricCard icon={Megaphone} label="Need a response" value={needsResponseCount} tone="text-orange-600" />
          <MetricCard icon={ArrowRightLeft} label="Converted to customer" value={convertedCount} tone="text-emerald-600" />
          <MetricCard icon={ClipboardList} label="Closed" value={closedCount} tone="text-gray-600" />
        </div>

        {error && <p className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
        {notice && <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</p>}

        <div className="mt-6 overflow-hidden rounded-xl border bg-white shadow-panel">
          <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Intake records</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {filteredRecords.length} of {records.length} records
              </p>
            </div>
            <div className="flex rounded-lg border bg-gray-50 p-1 text-sm font-medium">
              {(
                [
                  ["", "All"],
                  ["new", "New"],
                  ["contacted", "Contacted"],
                  ["converted", "Converted"],
                  ["closed", "Closed"],
                ] as ["" | IntakeStatus, string][]
              ).map(([value, label]) => (
                <button
                  key={value || "all"}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={`rounded-md px-3 py-1.5 transition ${
                    statusFilter === value
                      ? "bg-white text-orange-700 shadow-sm"
                      : "text-gray-500 hover:text-gray-800"
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
              Loading intake records…
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center px-6 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-orange-50 text-orange-600">
                <Inbox className="size-6" />
              </div>
              <h3 className="mt-4 font-semibold">No intake records yet</h3>
              <p className="mt-1 max-w-sm text-sm text-gray-500">
                Capture a web lead or missed call, then convert it into a customer to start the job handoff.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredRecords.map((record) => {
                const isSelected = record.id === selectedRecord?.id;
                return (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(record.id);
                      setEditing(false);
                      setJobCreated(null);
                    }}
                    className={`flex w-full flex-col gap-3 px-5 py-4 text-left transition hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between ${isSelected ? "bg-orange-50/60" : ""}`}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{record.name || "Unnamed lead"}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${kindStyles[record.kind]}`}>
                          {kindLabels[record.kind]}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${statusStyles[record.status]}`}>
                          {statusLabels[record.status]}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        {record.phone ? (
                          <span className="inline-flex items-center gap-1">
                            <PhoneCall className="size-3.5" />
                            {record.phone}
                          </span>
                        ) : null}
                        {record.source ? <span>Source: {record.source}</span> : null}
                        {record.customer_id && (
                          <span className="inline-flex items-center gap-1">
                            <UserRound className="size-3.5" />
                            {customerById.get(record.customer_id)?.name ?? "Linked customer"}
                          </span>
                        )}
                      </div>
                      {record.notes && <p className="mt-2 max-w-2xl text-sm text-gray-500">{record.notes}</p>}
                    </div>
                    <p className="text-xs text-gray-400">{new Date(record.created_at).toLocaleDateString()}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
        {selectedRecord && (
          <section className="rounded-xl border bg-white p-5 shadow-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Intake record</p>
                <h2 className="mt-1 text-xl font-semibold">{selectedRecord.name || "Unnamed lead"}</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Captured {new Date(selectedRecord.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${statusStyles[selectedRecord.status]}`}>
                  {statusLabels[selectedRecord.status]}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${kindStyles[selectedRecord.kind]}`}>
                  {kindLabels[selectedRecord.kind]}
                </span>
              </div>
            </div>

            <div className="mt-5 grid gap-3 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
              <p className="inline-flex items-center gap-2">
                <PhoneCall className="size-4 text-gray-400" />
                {selectedRecord.phone || "No phone on file"}
              </p>
              <p className="inline-flex items-center gap-2">
                <Megaphone className="size-4 text-gray-400" />
                {selectedRecord.source ? `Source: ${selectedRecord.source}` : "No lead source yet"}
              </p>
              <p className="inline-flex items-center gap-2">
                <UserRound className="size-4 text-gray-400" />
                {selectedRecord.customer_id
                  ? customerById.get(selectedRecord.customer_id)?.name ?? "Linked customer"
                  : "Not converted to a customer yet"}
              </p>
              <p>{selectedRecord.notes || "No notes yet."}</p>
            </div>

            {!["converted", "closed"].includes(selectedRecord.status) && (
              <button
                type="button"
                disabled={convertingId === selectedRecord.id}
                onClick={() => convertRecord(selectedRecord)}
                className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ArrowRightLeft className="size-4" />
                {convertingId === selectedRecord.id ? "Converting…" : "Convert to customer"}
              </button>
            )}

            {selectedRecord.status === "converted" && (
              <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                  <UserRound className="size-4" />
                  {customerById.get(selectedRecord.customer_id ?? "")?.name ?? "Converted"} · customer record
                </p>
                <a
                  href="/dashboard/customers"
                  className="mt-2 block text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  Open Customers →
                </a>
              </div>
            )}

            {selectedRecord.status === "converted" && selectedRecord.customer_id && (
              <div className="mt-5 border-t pt-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Job handoff</h3>
                    <p className="mt-0.5 text-xs text-gray-500">Turn the new customer into scheduled work.</p>
                  </div>
                  <BriefcaseBusiness className="size-5 text-orange-600" />
                </div>

                {jobCreated ? (
                  <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <p className="flex items-center gap-2 text-sm font-semibold text-blue-800">
                      <Wrench className="size-4" />
                      {jobCreated.title}
                    </p>
                    <p className="mt-1 text-xs text-blue-700">
                      Job created in {customerById.get(selectedRecord.customer_id)?.name ?? "the new customer"}&apos;s
                      workspace. Schedule and assign it on the Jobs board.
                    </p>
                    <a
                      href="/dashboard/jobs"
                      className="mt-3 block text-xs font-semibold text-blue-700 hover:text-blue-800"
                    >
                      Open Jobs board →
                    </a>
                  </div>
                ) : (
                  <form key={`handoff-${selectedRecord.id}`} onSubmit={createHandoffJob} className="mt-4 space-y-4">
                    <label className="block text-sm font-medium">
                      Job title
                      <input
                        name="title"
                        required
                        minLength={2}
                        defaultValue={`${selectedRecord.name || "New customer"} service request`}
                        className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                      />
                    </label>
                    <div className="grid gap-4">
                      <label className="block text-sm font-medium">
                        Scheduled time
                        <input
                          name="scheduled_start"
                          type="datetime-local"
                          className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                        />
                      </label>
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                        <label className="block text-sm font-medium">
                          Job amount
                          <input
                            name="amount"
                            type="number"
                            min="0"
                            step="0.01"
                            className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                            placeholder="426.00"
                          />
                        </label>
                        <label className="block text-sm font-medium">
                          Technician
                          <select name="technician_id" className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100">
                            <option value="">Unassigned</option>
                            {technicians.map((technician) => (
                              <option key={technician.id} value={technician.id}>
                                {technician.name} · {technician.status.replace("_", " ")}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="block text-sm font-medium">
                        Notes
                        <textarea
                          name="notes"
                          rows={3}
                          defaultValue={selectedRecord.notes ?? ""}
                          className="mt-2 w-full rounded-lg border px-3 py-2 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                          placeholder="Issue details, intake context, arrival instructions…"
                        />
                      </label>
                    </div>
                    <button
                      disabled={jobCreatingId === selectedRecord.id}
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gray-950 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {jobCreatingId === selectedRecord.id ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
                      Create job
                    </button>
                  </form>
                )}
              </div>
            )}

            <form key={selectedRecord.id} onSubmit={updateRecord} className="mt-5 space-y-4 border-t pt-5">
              {editing ? (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Edit intake record</h3>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="text-xs font-semibold text-gray-500 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                  <IntakeFields record={selectedRecord} />
                  <button disabled={updating} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-950 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60">
                    {updating ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                    Save changes
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Record details</h3>
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600 hover:text-orange-700"
                    >
                      <Pencil className="size-3.5" /> Edit
                    </button>
                  </div>
                  <p className="flex items-center gap-2 text-sm text-gray-600">
                    <CalendarClock className="size-4 text-gray-400" />
                    Updated {new Date(selectedRecord.updated_at).toLocaleDateString()}
                  </p>
                  <p className="flex items-center gap-2 text-sm text-gray-600">
                    <ClipboardList className="size-4 text-gray-400" />
                    Status: {statusLabels[selectedRecord.status]}
                  </p>
                </>
              )}
            </form>
          </section>
        )}

        <section className="rounded-xl border bg-white p-5 shadow-panel">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-lg bg-orange-50 text-orange-600">
              <Plus className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">Log an intake</h2>
              <p className="text-xs text-gray-500">Capture a new lead or received call.</p>
            </div>
          </div>

          <form onSubmit={createRecord} className="mt-5 space-y-4">
            <IntakeFields />
            <button disabled={saving} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-orange-600 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Save intake record
            </button>
          </form>
        </section>
      </aside>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  tone,
  value,
}: {
  icon: typeof Megaphone;
  label: string;
  tone: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-panel">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{label}</p>
        <Icon className={`size-5 ${tone}`} />
      </div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function IntakeFields({ record }: { record?: IntakeRecord }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <label className="block text-sm font-medium">
          Kind
          <select name="kind" defaultValue={record?.kind ?? "lead"} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100">
            <option value="lead">Web lead</option>
            <option value="call">Phone call</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Status
          <select name="status" defaultValue={record?.status ?? "new"} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100">
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="closed">Closed</option>
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium">
        Name
        <input name="name" defaultValue={record?.name ?? ""} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Marianne Foster" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <label className="block text-sm font-medium">
          Phone
          <input name="phone" defaultValue={record?.phone ?? ""} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="(555) 123-4567" />
        </label>
        <label className="block text-sm font-medium">
          Source
          <input name="source" defaultValue={record?.source ?? ""} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Web form, missed call, referral" />
        </label>
      </div>
      <label className="block text-sm font-medium">
        Notes
        <textarea name="notes" rows={4} defaultValue={record?.notes ?? ""} className="mt-2 w-full rounded-lg border px-3 py-2 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="What are they asking for? Follow-up context…" />
      </label>
    </>
  );
}