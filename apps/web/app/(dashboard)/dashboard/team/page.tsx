"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Ban, CheckCircle2, CircleDashed, Link2, LoaderCircle, MailX, Plus, RotateCcw, Search, Send, UserPlus, UsersRound } from "lucide-react";

type InviteStatus = "accepted" | "canceled" | "expired" | "pending";

type Invite = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: InviteStatus;
  invited_by: string | null;
  expires_at: string;
  created_at: string;
  accept_link: string | null;
};

type Membership = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  joined_at: string;
};

const roleOptions = ["owner", "admin", "dispatcher", "technician", "office_staff"];

const roleLabels: Record<string, string> = {
  admin: "Admin",
  dispatcher: "Dispatcher",
  office_staff: "Office staff",
  owner: "Owner",
  technician: "Technician",
};

const statusStyles: Record<InviteStatus, string> = {
  accepted: "bg-emerald-50 text-emerald-700",
  canceled: "bg-gray-100 text-gray-600",
  expired: "bg-rose-50 text-rose-700",
  pending: "bg-blue-50 text-blue-700",
};

const statusLabels: Record<InviteStatus, string> = {
  accepted: "Accepted",
  canceled: "Canceled",
  expired: "Expired",
  pending: "Pending",
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
  return fallback;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function TeamPage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function loadTeam() {
    setLoading(true);
    setError("");
    try {
      const [invitesResponse, membersResponse] = await Promise.all([
        fetch("/api/invites", { cache: "no-store" }),
        fetch("/api/memberships", { cache: "no-store" }),
      ]);
      const invitesPayload = await readApiResponse(invitesResponse);
      const membersPayload = await readApiResponse(membersResponse);
      if (!invitesResponse.ok) {
        setError(errorMessage(invitesPayload, "Unable to load invites."));
        return;
      }
      if (!membersResponse.ok) {
        setError(errorMessage(membersPayload, "Unable to load members."));
        return;
      }
      setInvites(invitesPayload as Invite[]);
      setMembers(membersPayload as Membership[]);
    } catch {
      setError("CrewPilot OS could not load your team.");
    } finally {
      setLoading(false);
    }
  }

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/invites", {
        body: JSON.stringify({
          email: form.get("email"),
          full_name: form.get("full_name"),
          role: form.get("role"),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(result, "Unable to send this invite."));
        return;
      }
      const invite = result as Invite;
      event.currentTarget.reset();
      setInvites((current) => [invite, ...current]);
    } catch {
      setError("CrewPilot OS could not send this invite.");
    } finally {
      setSaving(false);
    }
  }

  async function runInviteAction(id: string, action: "cancel" | "resend") {
    setBusyId(id);
    setError("");
    try {
      const response = await fetch(`/api/invites/${id}/${action}`, {
        method: "POST",
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        setError(errorMessage(result, `Unable to ${action} this invite.`));
        return;
      }
      const updated = result as Invite;
      setInvites((current) => current.map((invite) => (invite.id === id ? updated : invite)));
    } catch {
      setError("CrewPilot OS could not update this invite.");
    } finally {
      setBusyId(null);
    }
  }

  async function copyInviteLink(invite: Invite) {
    if (!invite.accept_link) return;
    try {
      await navigator.clipboard.writeText(invite.accept_link);
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError("Could not copy the invite link.");
    }
  }

  useEffect(() => {
    void loadTeam();
  }, []);

  const normalized = query.trim().toLowerCase();
  const visibleInvites = normalized
    ? invites.filter((invite) =>
        [invite.email, invite.full_name, invite.role, invite.status]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalized)),
      )
    : invites;

  return (
    <div className="mx-auto max-w-[1280px]">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-orange-600">Workspace access</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Team</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage who can sign in to this workspace and what they can do.
          </p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 w-full rounded-lg border bg-white pl-9 pr-3 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            placeholder="Search team…"
          />
        </div>
      </div>

      {error && <p className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}

      <section className="mt-6 overflow-hidden rounded-xl border bg-white shadow-panel">
        <div className="flex flex-col justify-between gap-2 border-b px-5 py-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold">Current members</h2>
            <p className="mt-0.5 text-xs text-gray-500">{members.length} people can sign in</p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            <CheckCircle2 className="size-3.5" /> Membership is scoped to this workspace
          </span>
        </div>
        {loading ? (
          <div className="flex h-40 items-center justify-center text-gray-500">
            <LoaderCircle className="mr-2 size-4 animate-spin" />Loading members…
          </div>
        ) : members.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center px-6 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-orange-50 text-orange-600">
              <UsersRound className="size-6" />
            </div>
            <h3 className="mt-4 font-semibold">No members yet</h3>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              Invite your first teammate to get them into the workspace.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {members.map((member) => (
              <div key={member.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{member.full_name}</h3>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600">
                      {roleLabels[member.role] ?? member.role}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{member.email}</p>
                </div>
                <p className="text-xs text-gray-400">Joined {formatDate(member.joined_at)}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border bg-white shadow-panel">
        <div className="flex flex-col justify-between gap-2 border-b px-5 py-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold">Invited</h2>
            <p className="mt-0.5 text-xs text-gray-500">Pending, expired, or previously sent invites</p>
          </div>
          <button
            type="button"
            onClick={() => {
              const form = document.querySelector<HTMLFormElement>("form[name='invite']");
              form?.scrollIntoView({ behavior: "smooth", block: "center" });
              form?.querySelector<HTMLInputElement>("input[name='email']")?.focus();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-700"
          >
            <UserPlus className="size-3.5" /> Invite someone
          </button>
        </div>
        {loading ? (
          <div className="flex h-40 items-center justify-center text-gray-500">
            <LoaderCircle className="mr-2 size-4 animate-spin" />Loading invites…
          </div>
        ) : visibleInvites.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center px-6 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-blue-50 text-blue-600">
              <Send className="size-6" />
            </div>
            <h3 className="mt-4 font-semibold">No pending invites</h3>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              Invite a teammate and they will receive an email link to join this workspace.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {visibleInvites.map((invite) => (
              <div key={invite.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{invite.full_name}</h3>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[invite.status]}`}>
                      {statusLabels[invite.status]}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600">
                      {roleLabels[invite.role] ?? invite.role}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {invite.email}
                    {invite.invited_by ? ` · invited by ${invite.invited_by}` : ""}
                    {" · "}expires {formatDate(invite.expires_at)}
                  </p>
                </div>
                {invite.status === "pending" || invite.status === "expired" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {invite.accept_link && (
                      <button
                        type="button"
                        onClick={() => copyInviteLink(invite)}
                        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <Link2 className="size-3.5" />
                        {copiedId === invite.id ? "Copied" : "Copy link"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => runInviteAction(invite.id, "resend")}
                      disabled={busyId === invite.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busyId === invite.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />} Resend
                    </button>
                    <button
                      type="button"
                      onClick={() => runInviteAction(invite.id, "cancel")}
                      disabled={busyId === invite.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busyId === invite.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />} Cancel
                    </button>
                  </div>
                ) : invite.status === "canceled" ? (
                  <p className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                    <MailX className="size-3.5" /> No longer active
                  </p>
                ) : (
                  <p className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                    <CircleDashed className="size-3.5" /> Joined the workspace
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border bg-white p-5 shadow-panel">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-orange-50 text-orange-600">
            <UserPlus className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">Invite a teammate</h2>
            <p className="text-xs text-gray-500">
              They get a single-use link by email. Office staff and technicians can&apos;t be invited as owners or admins.
            </p>
          </div>
        </div>
        <form name="invite" onSubmit={createInvite} className="mt-5 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Full name
              <input name="full_name" required minLength={2} className="mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Jordan Reyes" />
            </label>
            <label className="block text-sm font-medium">
              Work email
              <input name="email" type="email" required className="mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="jordan@acme.com" />
            </label>
          </div>
          <label className="block text-sm font-medium">
            Role
            <select name="role" defaultValue="office_staff" className="mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100">
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </label>
          {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          <button disabled={saving} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-950 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}Send invite
          </button>
        </form>
      </section>
    </div>
  );
}