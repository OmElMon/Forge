"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleDollarSign,
  FileText,
  LoaderCircle,
  Plus,
  ReceiptText,
  Search,
  Send,
  Trash2,
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

type InvoiceLineItem = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_amount_cents: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type InvoiceWorkflowAction = "approve" | "convert-to-invoice" | "mark-paid" | "send";

type RevenueAction = {
  label: string;
  tone?: "default" | "primary" | "danger";
  kind: "patch" | "workflow";
  workflow?: InvoiceWorkflowAction;
  status?: InvoiceStatus;
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

function revenueActionsFor(invoice: Invoice): RevenueAction[] {
  if (invoice.status === "void") {
    return [{ kind: "patch", label: "Reopen as draft", status: "draft" }];
  }

  if (invoice.document_type === "estimate") {
    if (invoice.status === "draft") {
      return [
        { kind: "workflow", label: "Send estimate", tone: "primary", workflow: "send" },
        { kind: "patch", label: "Void estimate", status: "void", tone: "danger" },
      ];
    }

    if (invoice.status === "sent") {
      return [
        { kind: "workflow", label: "Approve estimate", tone: "primary", workflow: "approve" },
        { kind: "patch", label: "Void estimate", status: "void", tone: "danger" },
      ];
    }

    if (invoice.status === "approved") {
      return [
        {
          kind: "workflow",
          label: "Convert to invoice",
          tone: "primary",
          workflow: "convert-to-invoice",
        },
      ];
    }

    if (invoice.status === "converted") {
      return [{ kind: "patch", label: "Reopen as draft", status: "draft" }];
    }
  }

  if (invoice.document_type === "invoice") {
    if (invoice.status === "draft") {
      return [
        { kind: "workflow", label: "Send invoice", tone: "primary", workflow: "send" },
        { kind: "patch", label: "Void invoice", status: "void", tone: "danger" },
      ];
    }

    if (invoice.status === "sent") {
      return [
        { kind: "workflow", label: "Mark paid", tone: "primary", workflow: "mark-paid" },
        { kind: "patch", label: "Void invoice", status: "void", tone: "danger" },
      ];
    }

    if (invoice.status === "approved") {
      return [
        { kind: "workflow", label: "Mark paid", tone: "primary", workflow: "mark-paid" },
        { kind: "patch", label: "Void invoice", status: "void", tone: "danger" },
      ];
    }

    if (invoice.status === "paid") {
      return [{ kind: "patch", label: "Reopen as sent", status: "sent" }];
    }
  }

  return [];
}

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

function lineItemPayload(form: FormData, sortOrder = 0) {
  return {
    description: form.get("description"),
    quantity: Math.max(1, Number.parseInt(String(form.get("quantity") ?? "1"), 10) || 1),
    sort_order: sortOrder,
    unit_amount_cents: centsFromInput(form.get("unit_amount")),
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
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [lineItemsInvoiceId, setLineItemsInvoiceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [lineSaving, setLineSaving] = useState(false);
  const [lineUpdatingId, setLineUpdatingId] = useState<string | null>(null);
  const [workflowUpdatingId, setWorkflowUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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

  async function loadLineItems(invoiceId: string) {
    setLineItemsInvoiceId(invoiceId);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/line-items`, { cache: "no-store" });
      const payload = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(payload, "Unable to load line items."));
        return;
      }
      setLineItems(payload as InvoiceLineItem[]);
    } catch {
      setError("CrewPilot OS could not load invoice line items.");
    }
  }

  useEffect(() => {
    if (!selectedInvoice) {
      setLineItems([]);
      setLineItemsInvoiceId(null);
      return;
    }
    void loadLineItems(selectedInvoice.id);
  }, [selectedInvoice?.id]);

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
    setNotice("");
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
      setNotice(`${typeLabels[invoice.document_type]} created as ${statusLabels[invoice.status].toLowerCase()}.`);
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
    setNotice("");
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
      setNotice(`${typeLabels[updated.document_type]} updated.`);
    } catch {
      setError("CrewPilot OS could not update this invoice.");
    } finally {
      setUpdating(false);
    }
  }

  async function runRevenueWorkflow(invoice: Invoice, action: RevenueAction) {
    setWorkflowUpdatingId(invoice.id);
    setError("");
    setNotice("");
    try {
      if (action.kind === "workflow" && action.workflow) {
        const response = await fetch(`/api/invoices/${invoice.id}/${action.workflow}`, {
          body: "{}",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const result = await readApiResponse(response);
        if (!response.ok) {
          setError(errorMessage(result, `Unable to update workflow. Status ${response.status}.`));
          return;
        }

        if (action.workflow === "convert-to-invoice") {
          const converted = result as { source_estimate: Invoice; invoice: Invoice };
          setInvoices((current) => [
            converted.invoice,
            ...current.map((item) =>
              item.id === converted.source_estimate.id ? converted.source_estimate : item,
            ),
          ]);
          setSelectedId(converted.invoice.id);
          setNotice(
            `${typeLabels[converted.source_estimate.document_type]} converted — draft invoice created with line items copied.`,
          );
          return;
        }

        const updated = result as Invoice;
        setInvoices((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setSelectedId(updated.id);
        setNotice(`${typeLabels[updated.document_type]} moved to ${statusLabels[updated.status].toLowerCase()}.`);
        return;
      }

      if (action.kind === "patch" && action.status) {
        const response = await fetch(`/api/invoices/${invoice.id}`, {
          body: JSON.stringify({ status: action.status }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        });
        const result = await readApiResponse(response);
        if (!response.ok) {
          setError(errorMessage(result, `Unable to update workflow. Status ${response.status}.`));
          return;
        }
        const updated = result as Invoice;
        setInvoices((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setSelectedId(updated.id);
        setNotice(`${typeLabels[updated.document_type]} moved to ${statusLabels[updated.status].toLowerCase()}.`);
        return;
      }

      setError("This workflow action is not configured.");
    } catch {
      setError("CrewPilot OS could not update this workflow.");
    } finally {
      setWorkflowUpdatingId(null);
    }
  }

  function syncInvoiceTotal(invoiceId: string, nextLineItems: InvoiceLineItem[]) {
    const nextTotal = nextLineItems.reduce(
      (total, item) => total + item.quantity * item.unit_amount_cents,
      0,
    );
    setInvoices((current) =>
      current.map((invoice) =>
        invoice.id === invoiceId ? { ...invoice, amount_cents: nextTotal } : invoice,
      ),
    );
  }

  async function createLineItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInvoice) return;

    setLineSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/invoices/${selectedInvoice.id}/line-items`, {
        body: JSON.stringify(lineItemPayload(form, lineItems.length + 1)),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(result, `Unable to add line item. Status ${response.status}.`));
        return;
      }
      const created = result as InvoiceLineItem;
      event.currentTarget.reset();
      const nextLineItems = [...lineItems, created].sort((a, b) => a.sort_order - b.sort_order);
      setLineItems(nextLineItems);
      syncInvoiceTotal(selectedInvoice.id, nextLineItems);
    } catch {
      setError("CrewPilot OS could not add this line item.");
    } finally {
      setLineSaving(false);
    }
  }

  async function updateLineItem(event: FormEvent<HTMLFormElement>, lineItem: InvoiceLineItem) {
    event.preventDefault();
    if (!selectedInvoice) return;

    setLineUpdatingId(lineItem.id);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/invoices/${selectedInvoice.id}/line-items/${lineItem.id}`, {
        body: JSON.stringify(lineItemPayload(form, lineItem.sort_order)),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(result, `Unable to update line item. Status ${response.status}.`));
        return;
      }
      const updated = result as InvoiceLineItem;
      const nextLineItems = lineItems
        .map((item) => (item.id === updated.id ? updated : item))
        .sort((a, b) => a.sort_order - b.sort_order);
      setLineItems(nextLineItems);
      syncInvoiceTotal(selectedInvoice.id, nextLineItems);
    } catch {
      setError("CrewPilot OS could not update this line item.");
    } finally {
      setLineUpdatingId(null);
    }
  }

  async function deleteLineItem(lineItem: InvoiceLineItem) {
    if (!selectedInvoice) return;

    setLineUpdatingId(lineItem.id);
    setError("");
    try {
      const response = await fetch(`/api/invoices/${selectedInvoice.id}/line-items/${lineItem.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const result = await readApiResponse(response);
        setError(errorMessage(result, `Unable to delete line item. Status ${response.status}.`));
        return;
      }
      const nextLineItems = lineItems.filter((item) => item.id !== lineItem.id);
      setLineItems(nextLineItems);
      syncInvoiceTotal(selectedInvoice.id, nextLineItems);
    } catch {
      setError("CrewPilot OS could not delete this line item.");
    } finally {
      setLineUpdatingId(null);
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
        {notice && <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</p>}

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

            <div className="mt-5 border-t pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Line items</h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Labor, materials, and fees that make up the total.
                  </p>
                </div>
                <p className="text-xs font-semibold text-gray-600">
                  {lineItemsInvoiceId === selectedInvoice.id ? lineItems.length : "…"} rows
                </p>
              </div>

              {lineItemsInvoiceId !== selectedInvoice.id ? (
                <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
                  Loading line items…
                </div>
              ) : lineItems.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed p-3 text-sm text-gray-500">
                  No line items yet. Add labor or materials below.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {lineItems.map((lineItem) => (
                    <form
                      key={lineItem.id}
                      onSubmit={(event) => updateLineItem(event, lineItem)}
                      className="rounded-lg border p-3"
                    >
                      <label className="block text-xs font-medium text-gray-500">
                        Description
                        <input name="description" required minLength={2} defaultValue={lineItem.description} className="mt-1 h-9 w-full rounded-lg border px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
                      </label>
                      <div className="mt-3 grid gap-3 sm:grid-cols-[90px_1fr]">
                        <label className="block text-xs font-medium text-gray-500">
                          Qty
                          <input name="quantity" type="number" min="1" required defaultValue={lineItem.quantity} className="mt-1 h-9 w-full rounded-lg border px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
                        </label>
                        <label className="block text-xs font-medium text-gray-500">
                          Unit amount
                          <input name="unit_amount" type="number" min="0" step="0.01" required defaultValue={(lineItem.unit_amount_cents / 100).toFixed(2)} className="mt-1 h-9 w-full rounded-lg border px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
                        </label>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">
                          {formatMoney(lineItem.quantity * lineItem.unit_amount_cents)}
                        </p>
                        <div className="flex gap-2">
                          <button disabled={lineUpdatingId === lineItem.id} className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-60">
                            {lineUpdatingId === lineItem.id ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            disabled={lineUpdatingId === lineItem.id}
                            onClick={() => deleteLineItem(lineItem)}
                            className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </form>
                  ))}
                </div>
              )}

              <form onSubmit={createLineItem} className="mt-4 rounded-lg bg-gray-50 p-3">
                <h4 className="text-sm font-semibold">Add line item</h4>
                <label className="mt-3 block text-xs font-medium text-gray-500">
                  Description
                  <input name="description" required minLength={2} className="mt-1 h-9 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Diagnostic labor" />
                </label>
                <div className="mt-3 grid gap-3 sm:grid-cols-[90px_1fr]">
                  <label className="block text-xs font-medium text-gray-500">
                    Qty
                    <input name="quantity" type="number" min="1" required defaultValue="1" className="mt-1 h-9 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
                  </label>
                  <label className="block text-xs font-medium text-gray-500">
                    Unit amount
                    <input name="unit_amount" type="number" min="0" step="0.01" required className="mt-1 h-9 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="189.00" />
                  </label>
                </div>
                <button disabled={lineSaving} className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-orange-600 text-xs font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {lineSaving ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                  Add item
                </button>
              </form>
            </div>

            <RevenueActions
              disabled={workflowUpdatingId === selectedInvoice.id}
              invoice={selectedInvoice}
              onRun={(action) => runRevenueWorkflow(selectedInvoice, action)}
            />

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

function RevenueActions({
  disabled,
  invoice,
  onRun,
}: {
  disabled: boolean;
  invoice: Invoice;
  onRun: (action: RevenueAction) => void;
}) {
  const actions = revenueActionsFor(invoice);
  if (actions.length === 0) return null;

  return (
    <div className="mt-5 border-t pt-5">
      <div>
        <h3 className="font-semibold">Workflow actions</h3>
        <p className="mt-0.5 text-xs text-gray-500">Move this record through the money pipeline.</p>
      </div>
      <div className="mt-3 grid gap-2">
        {actions.map((action) => {
          const style =
            action.tone === "primary"
              ? "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"
              : action.tone === "danger"
                ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50";

          return (
            <button
              key={action.label}
              type="button"
              disabled={disabled}
              onClick={() => onRun(action)}
              className={`flex h-10 w-full items-center justify-center rounded-lg border text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${style}`}
            >
              {disabled ? "Updating…" : action.label}
            </button>
          );
        })}
      </div>
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
