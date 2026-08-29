"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Globe2,
  LoaderCircle,
  MapPin,
  Save,
  ShieldAlert,
  ShieldCheck,
  UsersRound,
  Wrench,
} from "lucide-react";

type CompanyRead = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  service_area: string | null;
  default_trade: string | null;
  notification_prefs: Record<string, boolean>;
  status: "active" | "suspended";
  billing_status: string;
  created_at: string;
  updated_at: string;
};

type AdminOverview = {
  company: CompanyRead;
  member_count: number;
  open_invites: number;
  audit_total: number;
};

const timezoneOptions = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Berlin",
  "Australia/Sydney",
  "UTC",
];

const notificationOptions = [
  {
    key: "followup_reminders",
    label: "Follow-up reminders",
    description: "Remind the team when estimates, invoices, and completed jobs need attention.",
  },
  {
    key: "invoice_reminders",
    label: "Payment reminders",
    description: "Chase invoices that have been sent but are still unpaid.",
  },
  {
    key: "new_work_notices",
    label: "New work notices",
    description: "Notify the team when intake leads and new jobs arrive.",
  },
  {
    key: "daily_summary",
    label: "Daily summary",
    description: "Send a morning summary of what needs attention today.",
  },
];

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
  return fallback;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<CompanyRead | null>(null);
  const [admin, setAdmin] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [serviceArea, setServiceArea] = useState("");
  const [defaultTrade, setDefaultTrade] = useState("");
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const profileResponse = await fetch("/api/companies/me", { cache: "no-store" });
        const profilePayload = await readApiResponse(profileResponse);
        if (!profileResponse.ok) {
          setError(errorMessage(profilePayload, "Unable to load workspace settings."));
          return;
        }
        const company = profilePayload as CompanyRead;
        if (cancelled) return;
        setProfile(company);
        setName(company.name);
        setTimezone(company.timezone);
        setServiceArea(company.service_area ?? "");
        setDefaultTrade(company.default_trade ?? "");
        setPrefs(company.notification_prefs);

        const adminResponse = await fetch("/api/admin/company", { cache: "no-store" });
        if (adminResponse.ok) {
          const adminPayload = await readApiResponse(adminResponse);
          if (!cancelled) setAdmin(adminPayload as AdminOverview);
        }
      } catch {
        if (!cancelled) setError("CrewPilot OS could not load workspace settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/companies/me", {
        body: JSON.stringify({
          name,
          timezone,
          service_area: serviceArea || null,
          default_trade: defaultTrade || null,
          notification_prefs: prefs,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(result, "Unable to save workspace settings."));
        return;
      }
      const updated = result as CompanyRead;
      setProfile(updated);
      setPrefs(updated.notification_prefs);
      setSaved(true);
      setAdmin((current) => (current ? { ...current, company: updated } : current));
    } catch {
      setError("CrewPilot OS could not save workspace settings.");
    } finally {
      setSaving(false);
    }
  }

  const togglePref = (key: string) => {
    setPrefs((current) => ({ ...current, [key]: !(current[key] ?? true) }));
  };

  async function changeStatus(next: "active" | "suspended") {
    if (next === "suspended" && !window.confirm("Suspend this workspace? Members will be locked out until an owner reactivates it.")) {
      return;
    }
    setSuspending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/company/status", {
        body: JSON.stringify({ status: next }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(result, "Unable to update workspace status."));
        return;
      }
      const updated = result as CompanyRead;
      setProfile(updated);
      setAdmin((current) => (current ? { ...current, company: updated } : current));
    } catch {
      setError("CrewPilot OS could not update workspace status.");
    } finally {
      setSuspending(false);
    }
  }

  const timezoneList = timezoneOptions.includes(timezone) ? timezoneOptions : [timezone, ...timezoneOptions];
  const isOwner = admin !== null;
  const suspended = profile?.status === "suspended";

  return (
    <div className="mx-auto max-w-[1080px]">
      <div>
        <p className="text-sm font-medium text-orange-600">Workspace</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Company profile, service details, and notification preferences for this workspace.
        </p>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
      {saved && (
        <p className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">
          <CheckCircle2 className="size-4" /> Workspace settings saved.
        </p>
      )}

      {loading ? (
        <div className="mt-8 flex h-48 items-center justify-center text-gray-500">
          <LoaderCircle className="mr-2 size-4 animate-spin" />Loading settings…
        </div>
      ) : (
        <form onSubmit={saveSettings} className="mt-6 space-y-6">
          <section className="overflow-hidden rounded-xl border bg-white shadow-panel">
            <div className="flex items-center gap-3 border-b px-5 py-4">
              <span className="grid size-9 place-items-center rounded-lg bg-orange-50 text-orange-600">
                <Building2 className="size-5" />
              </span>
              <div>
                <h2 className="font-semibold">Company profile</h2>
                <p className="text-xs text-gray-500">How your business appears across the app.</p>
              </div>
            </div>
            <div className="grid gap-5 p-5 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Company name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  minLength={2}
                  maxLength={160}
                  className="mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />
              </label>
              <label className="block text-sm font-medium">
                <span className="flex items-center gap-1.5"><Globe2 className="size-3.5 text-gray-400" /> Timezone</span>
                <select
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  className="mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                >
                  {timezoneList.map((zone) => (
                    <option key={zone} value={zone}>{zone}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                <span className="flex items-center gap-1.5"><MapPin className="size-3.5 text-gray-400" /> Service area</span>
                <input
                  value={serviceArea}
                  onChange={(event) => setServiceArea(event.target.value)}
                  maxLength={160}
                  className="mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  placeholder="Nashville + Franklin"
                />
              </label>
              <label className="block text-sm font-medium">
                <span className="flex items-center gap-1.5"><Wrench className="size-3.5 text-gray-400" /> Default trade</span>
                <input
                  value={defaultTrade}
                  onChange={(event) => setDefaultTrade(event.target.value)}
                  maxLength={80}
                  className="mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  placeholder="hvac"
                />
              </label>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border bg-white shadow-panel">
            <div className="flex items-center gap-3 border-b px-5 py-4">
              <span className="grid size-9 place-items-center rounded-lg bg-blue-50 text-blue-700">
                <ShieldCheck className="size-5" />
              </span>
              <div>
                <h2 className="font-semibold">Notifications</h2>
                <p className="text-xs text-gray-500">
                  Choose what the workspace surfaces. Delivery is wired once a messaging provider is activated.
                </p>
              </div>
            </div>
            <div className="divide-y">
              {notificationOptions.map((option) => {
                const enabled = prefs[option.key] ?? true;
                return (
                  <label key={option.key} className="flex cursor-pointer items-start gap-4 px-5 py-4">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => togglePref(option.key)}
                      className="mt-1 size-4 accent-orange-600"
                    />
                    <span>
                      <span className="block text-sm font-semibold">{option.label}</span>
                      <span className="mt-0.5 block text-xs text-gray-500">{option.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          <div className="flex items-center justify-end gap-3">
            {saved && (
              <span className="mr-auto flex items-center gap-1.5 text-sm text-emerald-700">
                <CheckCircle2 className="size-4" /> Saved
              </span>
            )}
            <button
              disabled={saving}
              className="flex h-11 items-center justify-center gap-2 rounded-lg bg-gray-950 px-5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </form>
      )}

      {admin && (
        <section className="mt-8 overflow-hidden rounded-xl border bg-white shadow-panel">
          <div className="flex flex-col justify-between gap-2 border-b px-5 py-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-rose-50 text-rose-600">
                {suspended ? <ShieldAlert className="size-5" /> : <ShieldCheck className="size-5" />}
              </span>
              <div>
                <h2 className="font-semibold">Workspace &amp; billing</h2>
                <p className="text-xs text-gray-500">Owner-only controls for this workspace.</p>
              </div>
            </div>
            <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${suspended ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
              {suspended ? "Suspended" : "Active"}
            </span>
          </div>

          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <div className="rounded-xl border bg-gray-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <UsersRound className="size-4 text-gray-400" /> Members
              </div>
              <p className="mt-2 text-2xl font-semibold">{admin.member_count}</p>
              <p className="text-xs text-gray-500">{admin.open_invites} invite{admin.open_invites === 1 ? "" : "s"} outstanding</p>
            </div>
            <div className="rounded-xl border bg-gray-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <CircleDollarSign className="size-4 text-gray-400" /> Plan
              </div>
              <p className="mt-2 text-2xl font-semibold capitalize">{admin.company.billing_status}</p>
              <p className="text-xs text-gray-500">Billing arrives with the payments provider</p>
            </div>
            <div className="rounded-xl border bg-gray-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <ShieldCheck className="size-4 text-gray-400" /> Audit trail
              </div>
              <p className="mt-2 text-2xl font-semibold">{admin.audit_total}</p>
              <p className="text-xs text-gray-500">business actions on record</p>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 border-t px-5 py-4 sm:flex-row sm:items-center">
            <p className="text-sm text-gray-500">
              {suspended
                ? "Members are locked out until you reactivate this workspace."
                : "Suspending locks out every member except owners, so you can always reactivate."}
            </p>
            <button
              type="button"
              disabled={suspending}
              onClick={() => changeStatus(suspended ? "active" : "suspended")}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
                suspended ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border bg-white text-rose-700 hover:bg-rose-50"
              }`}
            >
              {suspending ? <LoaderCircle className="size-4 animate-spin" /> : suspended ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />}
              {suspending ? "Working…" : suspended ? "Reactivate workspace" : "Suspend workspace"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}