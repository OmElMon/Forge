import {
  CheckCircle2,
  Cloud,
  Database,
  GitBranch,
  Server,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

const productionStack = [
  {
    body: "Hosts the FastAPI backend and runs Alembic migrations during deploy.",
    icon: Server,
    label: "API runtime",
    status: "Render",
  },
  {
    body: "Primary production Postgres database. Keep DATABASE_URL pointed here.",
    icon: Database,
    label: "Database",
    status: "Supabase",
  },
  {
    body: "Frontend host for the Next.js dashboard. Watch credits if auto-deploy stays on.",
    icon: Cloud,
    label: "Web frontend",
    status: "Netlify",
  },
  {
    body: "Main branch is the source of truth for deploys and recruiter review.",
    icon: GitBranch,
    label: "Source control",
    status: "GitHub main",
  },
];

const stabilityChecks = [
  "Render API deploy is live before testing Netlify UI changes.",
  "Supabase project is unpaused and DATABASE_URL uses the encoded pooler URL.",
  "Netlify API_INTERNAL_URL points to the Render /api/v1 backend.",
  "CORS_ORIGINS includes the deployed frontend URL exactly.",
  "Alembic migrations run cleanly on every backend deploy.",
  "Demo data is only seeded intentionally, never accidentally in production.",
];

const nextMilestones = [
  {
    label: "Stabilize deploy flow",
    text: "Treat Render + Supabase as the backend source of truth and keep Netlify for frontend presentation.",
  },
  {
    label: "Tighten workflow UX",
    text: "Keep turning jobs, schedule, customers, and invoices into guided operating workflows.",
  },
  {
    label: "Add analytics confidence",
    text: "Show revenue, conversion, overdue work, capacity, and follow-up opportunities from real records.",
  },
  {
    label: "Prepare AI automation layer",
    text: "Add narrow assistive workflows once the core CRM data model feels dependable.",
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-6 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-wide text-orange-600">Operations</p>
        <div className="mt-3 max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-gray-950">Project stability center</h1>
          <p className="mt-3 text-gray-600">
            CrewPilot OS is in the workflow MVP stage. This page keeps the production assumptions,
            deploy checks, and next milestones visible so the project stays consistent while it grows.
          </p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        {productionStack.map((item) => (
          <div key={item.label} className="rounded-xl border bg-white p-4 shadow-panel">
            <div className="flex items-center justify-between gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-orange-50 text-orange-600">
                <item.icon className="size-5" />
              </span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                {item.status}
              </span>
            </div>
            <h2 className="mt-4 font-semibold">{item.label}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">{item.body}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border bg-white p-5 shadow-panel">
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-blue-50 text-blue-700">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">Deploy sanity checklist</h2>
              <p className="mt-1 text-sm text-gray-500">
                Run through these whenever Render, Supabase, or Netlify starts acting spicy.
              </p>
            </div>
          </div>

          <div className="mt-5 divide-y rounded-xl border">
            {stabilityChecks.map((check) => (
              <div key={check} className="flex gap-3 p-4">
                <CheckCircle2 className="mt-0.5 size-5 flex-none text-emerald-600" />
                <p className="text-sm text-gray-700">{check}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-panel">
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-amber-50 text-amber-700">
              <TriangleAlert className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">Credit control note</h2>
              <p className="mt-1 text-sm leading-6 text-gray-500">
                Netlify credit emails are usage warnings, not product failures. If credits become annoying,
                pause frontend auto-deploys and only trigger Netlify when the UI needs a public refresh.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl bg-gray-950 p-4 text-sm leading-6 text-gray-200">
            <p className="font-semibold text-white">Current best operating rule</p>
            <p className="mt-2">
              Build and verify locally, push to GitHub, let Render handle backend deploys, and keep Netlify
              focused on frontend presentation instead of using it as the whole application platform.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-panel">
        <h2 className="font-semibold">Next milestones</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {nextMilestones.map((milestone, index) => (
            <div key={milestone.label} className="rounded-xl border bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
                Stage {index + 1}
              </p>
              <h3 className="mt-2 font-semibold">{milestone.label}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-500">{milestone.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
