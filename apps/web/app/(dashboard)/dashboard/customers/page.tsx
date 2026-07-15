"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Mail, Phone, Plus, Search, UserRound } from "lucide-react";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: "lead" | "active" | "inactive";
  source: string | null;
  notes: string | null;
  created_at: string;
};

const statusStyles = {
  active: "bg-emerald-50 text-emerald-700",
  inactive: "bg-gray-100 text-gray-600",
  lead: "bg-orange-50 text-orange-700",
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function loadCustomers() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/customers", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Unable to load customers.");
        return;
      }
      setCustomers(payload as Customer[]);
    } catch {
      setError("CrewPilot OS could not load customers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCustomers();
  }, []);

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
    const payload = {
      email: form.get("email") || null,
      name: form.get("name"),
      notes: form.get("notes") || null,
      phone: form.get("phone") || null,
      source: form.get("source") || null,
      status: form.get("status"),
    };

    try {
      const response = await fetch("/api/customers", {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Unable to create customer.");
        return;
      }
      event.currentTarget.reset();
      setCustomers((current) => [result as Customer, ...current]);
    } catch {
      setError("CrewPilot OS could not save this customer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1440px] gap-6 xl:grid-cols-[1fr_420px]">
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
              {filteredCustomers.map((customer) => (
                <article key={customer.id} className="flex flex-col gap-3 px-5 py-4 hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between">
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
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <aside className="rounded-xl border bg-white p-5 shadow-panel xl:sticky xl:top-24 xl:self-start">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-orange-50 text-orange-600">
            <Plus className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">Add customer</h2>
            <p className="text-xs text-gray-500">Create the first CRM records.</p>
          </div>
        </div>

        <form onSubmit={createCustomer} className="mt-5 space-y-4">
          <label className="block text-sm font-medium">
            Customer name
            <input name="name" required minLength={2} className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Marianne Foster" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <label className="block text-sm font-medium">
              Phone
              <input name="phone" className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="(555) 123-4567" />
            </label>
            <label className="block text-sm font-medium">
              Email
              <input name="email" type="email" className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="customer@example.com" />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <label className="block text-sm font-medium">
              Status
              <select name="status" defaultValue="lead" className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100">
                <option value="lead">Lead</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              Source
              <input name="source" className="mt-2 h-10 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Referral, Google, phone call" />
            </label>
          </div>
          <label className="block text-sm font-medium">
            Notes
            <textarea name="notes" rows={4} className="mt-2 w-full rounded-lg border px-3 py-2 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Gate code, preferred technician, equipment notes…" />
          </label>
          <button disabled={saving} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-orange-600 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Save customer
          </button>
        </form>
      </aside>
    </div>
  );
}
