"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  LoaderCircle,
  Plus,
  ReceiptText,
  Search,
  Send,
  UserRound,
} from "lucide-react";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

type InvoiceType = "estimate" | "invoice";
type InvoiceStatus = "draft" | "sent" | "approved" | "converted" | "paid" | "void";

type Invoice = {
  id: string;
  company_id: string;
  customer_id: string;
  document_type: InvoiceType;
  status: InvoiceStatus;
  title: string;
  amount_cents: number;
  due_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const statusStyles: Record<InvoiceStatus, string> = {
  approved: "bg-blue-50 text-blue-700",
  converted: "bg-violet-50 text-violet-700",
  draft: "bg-gray-100 text-gray-700",
  paid: "bg-emerald-50 text-emerald-700",
  sent: "bg-orange-50 text-orange-700",
  void: "bg-rose-50 text-rose-700",
};

const statusLabels: Record<InvoiceStatus, string> = {
  approved: "Approved",
  converted: "Converted",
  draft: "Draft",
  paid: "Paid",
  sent: "Sent",
  void: "Void",
};

const typeLabels: Record<InvoiceType, string> = {
  estimate: "Estimate",
  invoice: "Invoice",
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
        return "Invalid invoice field.";
      })
      .join(" ");
  }
  return fallback;
}

function centsFromInput(value: FormDataEntryValue | null) {
  const parsed = Number.parseFloat(String(value ?? "0"));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

function invoicePayload(form: FormData) {
  const dueAt = form.get("due_at");
  return {
    amount_cents: centsFromInput(form.get("amount")),
    customer_id: form.get("customer_id"),
    document_type: form.get("document_type"),
    due_at: dueAt ? new Date(String(dueAt)).toISOString() : null,
    notes: form.get("notes") || null,
    status: form.get("status"),
    title: form.get("title"),
  };
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, {
    currency: "USD",
    style: "currency",
  }).format(cents / 100);
}

function formatDate(value: string | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(value));
}

function dateInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

export default function InvoicesPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedId) ?? invoices[0] ?? null;

  const customerById = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers],
  );

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [customersResponse, invoicesResponse] = await Promise.all([
        fetch("/api/customers", { cache: "no-store" }),
        fetch("/api/invoices", { cache: "no-store" }),
      ]);
      const customersPayload = await readApiResponse(customersResponse);
      const invoicesPayload = await readApiResponse(invoicesResponse);
      if (!customersResponse.ok) {
        setError(errorMessage(customersPayload, "Unable to load customers."));
        return;
      }
      if (!invoicesResponse.ok) {
        setError(errorMessage(invoicesPayload, "Unable to load invoices."));
        return;
      }
      const loadedInvoices = invoicesPayload as Invoice[];
      setCustomers(customersPayload as Customer[]);
      setInvoices(loadedInvoices);
      setSelectedId((current) => current ?? loadedInvoices[0]?.id ?? null);
    } catch {
      setError("CrewPilot OS could not load invoices.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredInvoices = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return invoices;
    return invoices.filter((invoice) => {
      const customer = customerById.get(invoice.customer_id);
      return [invoice.title, invoice.status, invoice.document_type, customer?.name]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized));
    });
  }, [customerById, invoices, query]);

  const metrics = useMemo(() => {
    return invoices.reduce(
      (totals, invoice) => {
        if (invoice.document_type === "estimate" && invoice.status !== "converted" && invoice.status !== "void") {
          totals.openEstimateCents += invoice.amount_cents;
          totals.openEstimates += 1;
        }
        if (invoice.document_type === "invoice" && invoice.status !== "paid" && invoice.status !== "void") {
          totals.openInvoiceCents += invoice.amount_cents;
        }
        if (invoice.document_type === "invoice" && invoice.status === "paid") {
          totals.paidCents += invoice.amount_cents;
        }
        return totals;
      },
      { openEstimateCents: 0, openEstimates: 0, openInvoiceCents: 0, paidCents: 0 },
    );
  }, [invoices]);

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/invoices", {
        body: JSON.stringify(invoicePayload(form)),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(result, `Unable to create invoice. Status ${response.status}.`));
        return;
      }
      const invoice = result as Invoice;
      event.currentTarget.reset();
      setInvoices((current) => [invoice, ...current]);
      setSelectedId(invoice.id);
    } catch {
      setError("CrewPilot OS could not save this invoice.");
    } finally {
      setSaving(false);
    }
  }

  async function updateInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInvoice) return;

    setUpdating(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(`/api/invoices/${selectedInvoice.id}`, {
        body: JSON.stringify(invoicePayload(form)),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(result, `Unable to update invoice. Status ${response.status}.`));
        return;
      }
      const updated = result as Invoice;
      setInvoices((current) => current.map((invoice) => (invoice.id === updated.id ? updated : invoice)));
      setSelectedId(updated.id);
    } catch {
      setError("CrewPilot OS could not update this invoice.");
    } finally {
      setUpdating(false);
    }
  }

  async function convertEstimate() {
    if (!selectedInvoice) return;
    setUpdating(true);
    setError("");
    try {
      const response = await fetch(`/api/invoices/${selectedInvoice.id}`, {
        body: JSON.stringify({
          document_type: "invoice",
          status: "sent",
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(result, `Unable to convert estimate. Status ${response.status}.`));
        return;
      }
      const updated = result as Invoice;
      setInvoices((current) => current.map((invoice) => (invoice.id === updated.id ? updated : invoice)));
      setSelectedId(updated.id);
    } catch {
      setError("CrewPilot OS could not convert this estimate.");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1440px] gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-orange-600">Revenue Core v1</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Estimates & invoices</h1>
            <p className="mt-1 text-sm text-gray-500">
              Track quoted work, open invoices, and paid revenue from one workflow.
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 w-full rounded-lg border bg-white pl-9 pr-3 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              placeholder="Search money records…"
            />
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <MetricCard icon={FileText} label="Open estimates" value={formatMoney(metrics.openEstimateCents)} sub={`${metrics.openEstimates} active`} />
          <MetricCard icon={ReceiptText} label="Open invoices" value={formatMoney(metrics.openInvoiceCents)} sub="awaiting payment" />
          <MetricCard icon={CheckCircle2} label="Paid revenue" value={formatMoney(metrics.paidCents)} sub="collected" />
        </div>

        {error && <p className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}

        <div className="mt-6 overflow-hidden rounded-xl border bg-white shadow-panel">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="font-semibold">Money pipeline</h2>
              <p className="mt-0.5 text-xs text-gray-500">{invoices.length} total records</p>
            </div>
          </div>

          {loading ? (
            <div className="flex h-56 items-center justify-center text-gray-500">
              <LoaderCircle className="mr-2 size-4 animate-spin" />
              Loading invoices…
            </div>
          ) : customers.length === 0 ? (
            <EmptyState icon={UserRound} title="Add a customer first" body="Estimates and invoices need to be attached to a customer record." />
          ) : filteredInvoices.length === 0 ? (
            <EmptyState icon={CircleDollarSign} title="No money records yet" body="Create an estimate or invoice to start tracking revenue." />
          ) : (
            <div className="divide-y">
              {filteredInvoices.map((invoice) => {
                const isSelected = invoice.id === selectedInvoice?.id;
                const customer = customerById.get(invoice.customer_id);
                return (
                  <button
                    key={invoice.id}
                    type="button"
                    onClick={() => setSelectedId(invoice.id)}
                    className={`flex w-full flex-col gap-3 px-5 py-4 text-left transition hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between ${isSelected ? "bg-orange-50/60" : ""}`}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{invoice.title}</h3>
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700">
                          {typeLabels[invoice.document_type]}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[invoice.status]}`}>
                          {statusLabels[invoice.status]}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1"><UserRound className="size-3.5" />{customer?.name ?? "Unknown customer"}</span>
                        <span className="inline-flex items-center gap-1"><CircleDollarSign className="size-3.5" />{formatMoney(invoice.amount_cents)}</span>
                        <span>{formatDate(invoice.due_at)}</span>
                      </div>
                      {invoice.notes && <p className="mt-2 max-w-2xl text-sm text-gray-500">{invoice.notes}</p>}
                    </div>
                    <p className="text-xs text-gray-400">{new Date(invoice.created_at).toLocaleDateString()}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
        {selectedInvoice && (
          <section className="rounded-xl border bg-white p-5 shadow-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
                  {typeLabels[selectedInvoice.document_type]} detail
                </p>
                <h2 className="mt-1 text-xl font-semibold">{selectedInvoice.title}</h2>
                <p className="mt-1 text-xs text-gray-500">
                  {customerById.get(selectedInvoice.customer_id)?.name ?? "Unknown customer"}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[selectedInvoice.status]}`}>
                {statusLabels[selectedInvoice.status]}
              </span>
            </div>

            <div className="mt-5 grid gap-3 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
              <p className="text-2xl font-semibold text-gray-950">{formatMoney(selectedInvoice.amount_cents)}</p>
              <p>Due: {formatDate(selectedInvoice.due_at)}</p>
              <p>{selectedInvoice.notes || "No invoice notes yet."}</p>
            </div>

            {selectedInvoice.document_type === "estimate" && (
              <button
                disabled={updating}
                onClick={convertEstimate}
                className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-orange-200 bg-orange-50 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ArrowRightLeft className="size-4" />
                Convert estimate to invoice
              </button>
            )}

            <form key={selectedInvoice.id} onSubmit={updateInvoice} className="mt-5 space-y-4 border-t pt-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Edit record</h3>
                <p className="text-xs text-gray-500">Updates revenue data</p>
              </div>
              <InvoiceFields customers={customers} invoice={selectedInvoice} />
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
              <h2 className="font-semibold">Create estimate/invoice</h2>
              <p className="text-xs text-gray-500">Start tracking revenue.</p>
            </div>
          </div>

          <form onSubmit={createInvoice} className="mt-5 space-y-4">
            <InvoiceFields customers={customers} />
            <button disabled={saving || customers.length === 0} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-orange-600 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
              Save record
            </button>
          </form>
        </section>
      </aside>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub }: { icon: typeof CircleDollarSign; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-panel">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{label}</p>
        <Icon className="size-5 text-orange-600" />
      </div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{sub}</p>
    </div>
  );
}

function EmptyState({ icon: Icon, title, body }: { icon: typeof CircleDollarSign; title: string; body: string }) {
  return (
    <div className="flex h-56 flex-col items-center justify-center px-6 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-orange-50 text-orange-600">
        <Icon className="size-6" />
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-gray-500">{body}</p>
    </div>
  );
}

function InvoiceFields({ customers, invoice }: { customers: Customer[]; invoice?: Invoice }) {
  return (
    <>
      <label className="block text-sm font-medium">
        Title
        <input name="title" required minLength={2} defaultValue={invoice?.title ?? ""} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Furnace replacement estimate" />
      </label>
      <label className="block text-sm font-medium">
        Customer
        <select name="customer_id" required defaultValue={invoice?.customer_id ?? customers[0]?.id ?? ""} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100">
          {customers.length === 0 ? <option value="">Add a customer first</option> : null}
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>{customer.name}</option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <label className="block text-sm font-medium">
          Type
          <select name="document_type" defaultValue={invoice?.document_type ?? "estimate"} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100">
            <option value="estimate">Estimate</option>
            <option value="invoice">Invoice</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Status
          <select name="status" defaultValue={invoice?.status ?? "draft"} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100">
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="approved">Approved</option>
            <option value="converted">Converted</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <label className="block text-sm font-medium">
          Amount
          <input name="amount" type="number" min="0" step="0.01" required defaultValue={invoice ? (invoice.amount_cents / 100).toFixed(2) : ""} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="426.00" />
        </label>
        <label className="block text-sm font-medium">
          Due date
          <input name="due_at" type="date" defaultValue={dateInputValue(invoice?.due_at ?? null)} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
        </label>
      </div>
      <label className="block text-sm font-medium">
        Notes
        <textarea name="notes" rows={4} defaultValue={invoice?.notes ?? ""} className="mt-2 w-full rounded-lg border px-3 py-2 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Scope, payment notes, materials, approval context…" />
      </label>
    </>
  );
}
