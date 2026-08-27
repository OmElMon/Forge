"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BriefcaseBusiness,
  CalendarClock,
  CircleDollarSign,
  FileText,
  LoaderCircle,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
  Wrench,
} from "lucide-react";

type CustomerStatus = "lead" | "active" | "inactive";
type PreferredContact = "" | "phone" | "email" | "sms";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: CustomerStatus;
  source: string | null;
  preferred_contact: PreferredContact;
  sms_opt_in: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type JobStatus = "new" | "scheduled" | "in_progress" | "completed" | "canceled";

type Job = {
  id: string;
  customer_id: string;
  title: string;
  status: JobStatus;
  scheduled_start: string | null;
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
  created_at: string;
};

type AuditLog = {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  context: Record<string, unknown>;
  created_at: string;
};

type ServiceAddress = {
  id: string;
  label: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  notes: string | null;
};

type Equipment = {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  installed_at: string | null;
  notes: string | null;
};

type CustomerDetail = Customer & {
  lifetime_value_cents: number;
  paid_invoice_count: number;
  open_job_count: number;
  open_estimate_count: number;
  open_estimate_cents: number;
  open_invoice_count: number;
  open_invoice_cents: number;
  service_addresses: ServiceAddress[];
  equipment: Equipment[];
};

const statusStyles: Record<CustomerStatus, string> = {
  active: "bg-emerald-50 text-emerald-700",
  inactive: "bg-gray-100 text-gray-600",
  lead: "bg-orange-50 text-orange-700",
};

const jobStatusLabels: Record<JobStatus, string> = {
  canceled: "Canceled",
  completed: "Completed",
  in_progress: "In progress",
  new: "New",
  scheduled: "Scheduled",
};

const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  approved: "Approved",
  converted: "Converted",
  draft: "Draft",
  paid: "Paid",
  sent: "Sent",
  void: "Void",
};

const invoiceStatusStyles: Record<InvoiceStatus, string> = {
  approved: "bg-blue-50 text-blue-700",
  converted: "bg-violet-50 text-violet-700",
  draft: "bg-gray-100 text-gray-700",
  paid: "bg-emerald-50 text-emerald-700",
  sent: "bg-orange-50 text-orange-700",
  void: "bg-rose-50 text-rose-700",
};

const activityLabels: Record<string, string> = {
  "estimate.approved": "Estimate approved",
  "estimate.converted": "Estimate converted",
  "invoice.created": "Invoice created",
  "invoice.created_from_estimate": "Invoice created from estimate",
  "invoice.line_item_created": "Invoice line item added",
  "invoice.line_item_deleted": "Invoice line item removed",
  "invoice.line_item_updated": "Invoice line item updated",
  "invoice.paid": "Invoice paid",
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
        return "Invalid customer field.";
      })
      .join(" ");
  }
  return fallback;
}

function customerPayload(form: FormData) {
  return {
    email: form.get("email") || null,
    name: form.get("name"),
    notes: form.get("notes") || null,
    phone: form.get("phone") || null,
    preferred_contact: form.get("preferred_contact") || null,
    sms_opt_in: form.get("sms_opt_in") === "on",
    source: form.get("source") || null,
    status: form.get("status"),
  };
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function activityLabel(action: string) {
  return activityLabels[action] ?? action.replaceAll(".", " ");
}

function activityDescription(log: AuditLog) {
  const title = typeof log.context.title === "string" ? log.context.title : null;
  const status = typeof log.context.status === "string" ? log.context.status.replace("_", " ") : null;
  const amountCents = typeof log.context.amount_cents === "number" ? log.context.amount_cents : null;
  const parts = [title, status ? `Status: ${status}` : null, amountCents ? formatMoney(amountCents) : null];
  return parts.filter(Boolean).join(" · ") || `${log.resource_type} activity`;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [activityLogs, setActivityLogs] = useState<AuditLog[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [addressSaving, setAddressSaving] = useState(false);
  const [equipmentSaving, setEquipmentSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedCustomer = customers.find((customer) => customer.id === selectedId) ?? customers[0] ?? null;
  const selectedCustomerJobs = selectedCustomer
    ? jobs.filter((job) => job.customer_id === selectedCustomer.id).slice(0, 3)
    : [];
  const selectedCustomerInvoices = selectedCustomer
    ? invoices.filter((invoice) => invoice.customer_id === selectedCustomer.id)
    : [];
  const recentCustomerInvoices = selectedCustomerInvoices.slice(0, 3);
  const selectedPaidCents = selectedCustomerInvoices
    .filter((invoice) => invoice.document_type === "invoice" && invoice.status === "paid")
    .reduce((total, invoice) => total + invoice.amount_cents, 0);
  const selectedUnpaidCents = selectedCustomerInvoices
    .filter((invoice) => invoice.document_type === "invoice" && !["paid", "void"].includes(invoice.status))
    .reduce((total, invoice) => total + invoice.amount_cents, 0);
  const selectedOpenEstimateCents = selectedCustomerInvoices
    .filter((invoice) => invoice.document_type === "estimate" && !["converted", "void"].includes(invoice.status))
    .reduce((total, invoice) => total + invoice.amount_cents, 0);
  const selectedCustomerActivity = selectedCustomer
    ? activityLogs
        .filter((log) => log.context.customer_id === selectedCustomer.id)
        .slice(0, 5)
    : [];

  // Profile metrics prefer the backend CustomerDetail; fall back to the local
  // list data while the detail is loading.
  const lifetimeValueCents = customerDetail?.lifetime_value_cents ?? selectedPaidCents;
  const paidInvoiceCount = customerDetail?.paid_invoice_count ?? 0;
  const openJobCount = customerDetail?.open_job_count ?? selectedCustomerJobs.length;
  const openEstimateCents = customerDetail?.open_estimate_cents ?? selectedOpenEstimateCents;
  const openInvoiceCents = customerDetail?.open_invoice_cents ?? selectedUnpaidCents;

  async function loadCustomers() {
    setLoading(true);
    setError("");
    try {
      const [activityResponse, customersResponse, jobsResponse, invoicesResponse] = await Promise.all([
        fetch("/api/audit-logs?limit=100", { cache: "no-store" }),
        fetch("/api/customers", { cache: "no-store" }),
        fetch("/api/jobs", { cache: "no-store" }),
        fetch("/api/invoices", { cache: "no-store" }),
      ]);
      const activityPayload = await readApiResponse(activityResponse);
      const customersPayload = await readApiResponse(customersResponse);
      const jobsPayload = await readApiResponse(jobsResponse);
      const invoicesPayload = await readApiResponse(invoicesResponse);
      if (!activityResponse.ok) {
        setError(errorMessage(activityPayload, "Unable to load activity."));
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
      if (!invoicesResponse.ok) {
        setError(errorMessage(invoicesPayload, "Unable to load invoices."));
        return;
      }
      const loaded = customersPayload as Customer[];
      setActivityLogs(activityPayload as AuditLog[]);
      setCustomers(loaded);
      setJobs(jobsPayload as Job[]);
      setInvoices(invoicesPayload as Invoice[]);
      setSelectedId((current) => current ?? loaded[0]?.id ?? null);
    } catch {
      setError("CrewPilot OS could not load customers.");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(customerId: string | null) {
    if (!customerId) {
      setCustomerDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/customers/${customerId}`, { cache: "no-store" });
      const payload = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(payload, "Unable to load customer profile."));
        return;
      }
      setCustomerDetail(payload as CustomerDetail);
    } catch {
      setError("CrewPilot OS could not load this customer profile.");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void loadCustomers();
  }, []);

  useEffect(() => {
    void loadDetail(selectedId);
  }, [selectedId]);

  const filteredCustomers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return customers;
    return customers.filter((customer) =>
      [customer.name, customer.email, customer.phone, customer.source]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized)),
    );
  }, [customers, query]);

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/customers", {
        body: JSON.stringify(customerPayload(form)),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(result, `Unable to create customer. Status ${response.status}.`));
        return;
      }
      const customer = result as Customer;
      event.currentTarget.reset();
      setCustomers((current) => [customer, ...current]);
      setSelectedId(customer.id);
    } catch {
      setError("CrewPilot OS could not save this customer.");
    } finally {
      setSaving(false);
    }
  }

  async function updateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCustomer) return;

    setUpdating(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(`/api/customers/${selectedCustomer.id}`, {
        body: JSON.stringify(customerPayload(form)),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(result, `Unable to update customer. Status ${response.status}.`));
        return;
      }
      const updated = result as Customer;
      setCustomers((current) => current.map((customer) => (customer.id === updated.id ? updated : customer)));
      setSelectedId(updated.id);
    } catch {
      setError("CrewPilot OS could not update this customer.");
    } finally {
      setUpdating(false);
    }
  }

  async function addAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCustomer) return;

    setAddressSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(`/api/customers/${selectedCustomer.id}/addresses`, {
        body: JSON.stringify({
          address_line1: form.get("address_line1"),
          address_line2: form.get("address_line2") || null,
          city: form.get("city"),
          label: form.get("label") || "Home",
          notes: form.get("notes") || null,
          postal_code: form.get("postal_code"),
          state: form.get("state"),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(result, "Unable to save this address."));
        return;
      }
      event.currentTarget.reset();
      await loadDetail(selectedCustomer.id);
    } catch {
      setError("CrewPilot OS could not save this address.");
    } finally {
      setAddressSaving(false);
    }
  }

  async function removeAddress(addressId: string) {
    if (!selectedCustomer) return;

    setError("");
    try {
      const response = await fetch(`/api/customers/${selectedCustomer.id}/addresses/${addressId}`, {
        method: "DELETE",
      });
      if (response.status !== 204) {
        const payload = await readApiResponse(response);
        setError(errorMessage(payload, "Unable to remove this address."));
        return;
      }
      await loadDetail(selectedCustomer.id);
    } catch {
      setError("CrewPilot OS could not remove this address.");
    }
  }

  async function addEquipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCustomer) return;

    setEquipmentSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(`/api/customers/${selectedCustomer.id}/equipment`, {
        body: JSON.stringify({
          installed_at: form.get("installed_at") || null,
          manufacturer: form.get("manufacturer") || null,
          model: form.get("model") || null,
          name: form.get("name"),
          notes: form.get("notes") || null,
          serial_number: form.get("serial_number") || null,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(result, "Unable to save this equipment."));
        return;
      }
      event.currentTarget.reset();
      await loadDetail(selectedCustomer.id);
    } catch {
      setError("CrewPilot OS could not save this equipment.");
    } finally {
      setEquipmentSaving(false);
    }
  }

  async function removeEquipment(equipmentId: string) {
    if (!selectedCustomer) return;

    setError("");
    try {
      const response = await fetch(`/api/customers/${selectedCustomer.id}/equipment/${equipmentId}`, {
        method: "DELETE",
      });
      if (response.status !== 204) {
        const payload = await readApiResponse(response);
        setError(errorMessage(payload, "Unable to remove this equipment."));
        return;
      }
      await loadDetail(selectedCustomer.id);
    } catch {
      setError("CrewPilot OS could not remove this equipment.");
    }
  }

  return (
    <div className="mx-auto grid max-w-[1440px] gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-orange-600">CRM Core v1</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Customers</h1>
            <p className="mt-1 text-sm text-gray-500">
              Track leads and active customers before connecting properties and jobs.
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 w-full rounded-lg border bg-white pl-9 pr-3 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              placeholder="Search customers…"
            />
          </div>
        </div>

        {error && <p className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}

        <div className="mt-6 overflow-hidden rounded-xl border bg-white shadow-panel">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="font-semibold">Customer list</h2>
              <p className="mt-0.5 text-xs text-gray-500">{customers.length} total records</p>
            </div>
          </div>

          {loading ? (
            <div className="flex h-56 items-center justify-center text-gray-500">
              <LoaderCircle className="mr-2 size-4 animate-spin" />
              Loading customers…
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center px-6 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-orange-50 text-orange-600">
                <UserRound className="size-6" />
              </div>
              <h3 className="mt-4 font-semibold">No customers yet</h3>
              <p className="mt-1 max-w-sm text-sm text-gray-500">
                Add your first customer to start turning CrewPilot OS into a real CRM.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredCustomers.map((customer) => {
                const isSelected = customer.id === selectedCustomer?.id;
                return (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => setSelectedId(customer.id)}
                    className={`flex w-full flex-col gap-3 px-5 py-4 text-left transition hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between ${isSelected ? "bg-orange-50/60" : ""}`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{customer.name}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${statusStyles[customer.status]}`}>
                          {customer.status}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        {customer.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3.5" />{customer.phone}</span>}
                        {customer.email && <span className="inline-flex items-center gap-1"><Mail className="size-3.5" />{customer.email}</span>}
                        {customer.source && <span>Source: {customer.source}</span>}
                      </div>
                      {customer.notes && <p className="mt-2 max-w-2xl text-sm text-gray-500">{customer.notes}</p>}
                    </div>
                    <p className="text-xs text-gray-400">{new Date(customer.created_at).toLocaleDateString()}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
        {selectedCustomer && (
          <section className="rounded-xl border bg-white p-5 shadow-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Customer profile</p>
                <h2 className="mt-1 text-xl font-semibold">{selectedCustomer.name}</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Updated {new Date(selectedCustomer.updated_at).toLocaleDateString()}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${statusStyles[selectedCustomer.status]}`}>
                {selectedCustomer.status}
              </span>
            </div>

            <div className="mt-5 grid gap-3 text-sm text-gray-600">
              <p className="inline-flex items-center gap-2">
                <Phone className="size-4 text-gray-400" />
                {selectedCustomer.phone || "No phone on file"}
              </p>
              <p className="inline-flex items-center gap-2">
                <Mail className="size-4 text-gray-400" />
                {selectedCustomer.email || "No email on file"}
              </p>
              <p className="inline-flex items-center gap-2">
                <MapPin className="size-4 text-gray-400" />
                {selectedCustomer.source ? `Source: ${selectedCustomer.source}` : "No lead source yet"}
              </p>
              <p className="inline-flex items-center gap-2">
                <Activity className="size-4 text-gray-400" />
                {selectedCustomer.sms_opt_in
                  ? `SMS reminders on · prefers ${selectedCustomer.preferred_contact || "no preference"}`
                  : "SMS reminders off"}
              </p>
            </div>

            <div className="mt-5 rounded-lg bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</p>
              <p className="mt-2 text-sm text-gray-600">{selectedCustomer.notes || "No notes yet."}</p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-lg border p-4">
                <BriefcaseBusiness className="size-5 text-orange-600" />
                <p className="mt-3 text-sm font-semibold">Open jobs</p>
                <p className="mt-1 text-xs text-gray-500">
                  {detailLoading ? "Loading…" : `${openJobCount} open job${openJobCount === 1 ? "" : "s"} right now.`}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <CircleDollarSign className="size-5 text-orange-600" />
                <p className="mt-3 text-sm font-semibold">Customer value</p>
                <p className="mt-1 text-xs text-gray-500">
                  {detailLoading ? "Loading…" : `${formatMoney(lifetimeValueCents)} lifetime · ${paidInvoiceCount} paid invoice${paidInvoiceCount === 1 ? "" : "s"}.`}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <MoneyStat label="Lifetime value" value={detailLoading ? "—" : formatMoney(lifetimeValueCents)} />
              <MoneyStat label="Open estimates" value={detailLoading ? "—" : formatMoney(openEstimateCents)} />
              <MoneyStat label="Open invoices" value={detailLoading ? "—" : formatMoney(openInvoiceCents)} />
            </div>

            {/* Service addresses */}
            <div className="mt-5 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="inline-flex items-center gap-2 text-sm font-semibold">
                  <MapPin className="size-4 text-orange-600" />
                  Service addresses
                </p>
                <span className="text-xs text-gray-400">
                  {detailLoading ? "…" : `${(customerDetail?.service_addresses ?? []).length} saved`}
                </span>
              </div>
              {(customerDetail?.service_addresses ?? []).length === 0 ? (
                <p className="mt-2 text-xs text-gray-500">No service addresses on file yet.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {customerDetail!.service_addresses.map((address) => (
                    <div key={address.id} className="rounded-lg bg-gray-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold capitalize">{address.label}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {address.address_line1}
                            {address.address_line2 ? `, ${address.address_line2}` : ""}, {address.city},{" "}
                            {address.state} {address.postal_code}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Remove ${address.label} address`}
                          onClick={() => void removeAddress(address.id)}
                          className="rounded-lg border bg-white p-1.5 text-gray-400 transition hover:text-rose-600"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={addAddress} className="mt-4 grid gap-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr]">
                  <input name="label" placeholder="Label (Home, Office…)" className="h-10 rounded-lg border px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
                  <input name="address_line1" required placeholder="Street address" className="h-10 rounded-lg border px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
                  <input name="address_line2" placeholder="Unit / suite (optional)" className="h-10 rounded-lg border px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <input name="city" required placeholder="City" className="h-10 rounded-lg border px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
                  <input name="state" required placeholder="ST" className="h-10 rounded-lg border px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
                  <input name="postal_code" required placeholder="Postal code" className="h-10 rounded-lg border px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
                  <button disabled={addressSaving} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60">
                    {addressSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
                    Add address
                  </button>
                </div>
              </form>
            </div>

            {/* Equipment */}
            <div className="mt-5 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="inline-flex items-center gap-2 text-sm font-semibold">
                  <Wrench className="size-4 text-orange-600" />
                  Equipment
                </p>
                <span className="text-xs text-gray-400">
                  {detailLoading ? "…" : `${(customerDetail?.equipment ?? []).length} units`}
                </span>
              </div>
              {(customerDetail?.equipment ?? []).length === 0 ? (
                <p className="mt-2 text-xs text-gray-500">No equipment on file yet.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {customerDetail!.equipment.map((unit) => (
                    <div key={unit.id} className="rounded-lg bg-gray-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{unit.name}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {[unit.manufacturer, unit.model].filter(Boolean).join(" · ") || "No model on file"}
                            {unit.serial_number ? ` · S/N ${unit.serial_number}` : ""}
                            {unit.installed_at ? ` · installed ${new Date(unit.installed_at).toLocaleDateString()}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Remove ${unit.name}`}
                          onClick={() => void removeEquipment(unit.id)}
                          className="rounded-lg border bg-white p-1.5 text-gray-400 transition hover:text-rose-600"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={addEquipment} className="mt-4 grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input name="name" required placeholder="Equipment name" className="h-10 rounded-lg border px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
                  <input name="manufacturer" placeholder="Manufacturer (optional)" className="h-10 rounded-lg border px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <input name="model" placeholder="Model (optional)" className="h-10 rounded-lg border px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
                  <input name="serial_number" placeholder="Serial number (optional)" className="h-10 rounded-lg border px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
                  <input name="installed_at" type="date" className="h-10 rounded-lg border px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
                </div>
                <button disabled={equipmentSaving} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60">
                  {equipmentSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  Add equipment
                </button>
              </form>
            </div>

            <div className="mt-5 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Recent jobs</p>
                <a href="/dashboard/jobs" className="text-xs font-semibold text-orange-600 hover:text-orange-700">Open jobs</a>
              </div>
              {selectedCustomerJobs.length === 0 ? (
                <p className="mt-2 text-xs text-gray-500">No jobs linked to this customer yet.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {selectedCustomerJobs.map((job) => (
                    <div key={job.id} className="rounded-lg bg-gray-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">{job.title}</p>
                        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-gray-600">
                          {jobStatusLabels[job.status]}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {job.scheduled_start ? new Date(job.scheduled_start).toLocaleString() : "Not scheduled"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Recent estimates & invoices</p>
                <a href="/dashboard/invoices" className="text-xs font-semibold text-orange-600 hover:text-orange-700">Open invoices</a>
              </div>
              {recentCustomerInvoices.length === 0 ? (
                <p className="mt-2 text-xs text-gray-500">No estimates or invoices linked to this customer yet.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {recentCustomerInvoices.map((invoice) => (
                    <div key={invoice.id} className="rounded-lg bg-gray-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{invoice.title}</p>
                          <p className="mt-1 text-xs capitalize text-gray-500">
                            {invoice.document_type} · {formatMoney(invoice.amount_cents)}
                          </p>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${invoiceStatusStyles[invoice.status]}`}>
                          {invoiceStatusLabels[invoice.status]}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {invoice.due_at ? `Due ${new Date(invoice.due_at).toLocaleDateString()}` : `Created ${new Date(invoice.created_at).toLocaleDateString()}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="inline-flex items-center gap-2 text-sm font-semibold">
                  <Activity className="size-4 text-orange-600" />
                  Activity timeline
                </p>
                <span className="text-xs text-gray-400">Last 5</span>
              </div>
              {selectedCustomerActivity.length === 0 ? (
                <p className="mt-2 text-xs text-gray-500">No tracked workflow activity for this customer yet.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {selectedCustomerActivity.map((log) => (
                    <div key={log.id} className="rounded-lg bg-gray-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">{activityLabel(log.action)}</p>
                        <span className="text-[11px] text-gray-400">
                          {new Date(log.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="mt-1 text-xs capitalize text-gray-500">{activityDescription(log)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form key={selectedCustomer.id} onSubmit={updateCustomer} className="mt-5 space-y-4 border-t pt-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Edit customer</h3>
                <p className="text-xs text-gray-500">Changes save to CRM</p>
              </div>
              <CustomerFields customer={selectedCustomer} />
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
              <h2 className="font-semibold">Add customer</h2>
              <p className="text-xs text-gray-500">Create another CRM record.</p>
            </div>
          </div>

          <form onSubmit={createCustomer} className="mt-5 space-y-4">
            <CustomerFields />
            <button disabled={saving} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-orange-600 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Save customer
            </button>
          </form>
        </section>
      </aside>
    </div>
  );
}

function MoneyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <FileText className="size-4 text-orange-600" />
      <p className="mt-2 text-xs text-gray-500">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function CustomerFields({ customer }: { customer?: Customer }) {
  return (
    <>
      <label className="block text-sm font-medium">
        Customer name
        <input name="name" required minLength={2} defaultValue={customer?.name ?? ""} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Marianne Foster" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <label className="block text-sm font-medium">
          Phone
          <input name="phone" defaultValue={customer?.phone ?? ""} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="(555) 123-4567" />
        </label>
        <label className="block text-sm font-medium">
          Email
          <input name="email" type="email" defaultValue={customer?.email ?? ""} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="customer@example.com" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <label className="block text-sm font-medium">
          Status
          <select name="status" defaultValue={customer?.status ?? "lead"} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100">
            <option value="lead">Lead</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Source
          <input name="source" defaultValue={customer?.source ?? ""} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Referral, Google, phone call" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <label className="block text-sm font-medium">
          Preferred contact
          <select name="preferred_contact" defaultValue={customer?.preferred_contact ?? ""} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100">
            <option value="">No preference</option>
            <option value="phone">Phone</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          SMS reminders
          <span className="mt-2 flex h-10 items-center gap-2 rounded-lg border px-3 text-sm text-gray-600">
            <input name="sms_opt_in" type="checkbox" defaultChecked={customer?.sms_opt_in ?? false} className="size-4 accent-orange-600" />
            Allow SMS follow-up reminders
          </span>
        </label>
      </div>
      <label className="block text-sm font-medium">
        Notes
        <textarea name="notes" rows={4} defaultValue={customer?.notes ?? ""} className="mt-2 w-full rounded-lg border px-3 py-2 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Gate code, preferred technician, equipment notes…" />
      </label>
    </>
  );
}