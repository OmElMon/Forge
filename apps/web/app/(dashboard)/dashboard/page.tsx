import { ArrowDownRight, ArrowUpRight, CalendarPlus, Clock3, PhoneMissed, Plus, UsersRound } from "lucide-react";

const metrics = [
  { label: "Revenue this month", value: "$48,290", change: "+12.4%", positive: true, note: "vs. last month" },
  { label: "Jobs completed", value: "184", change: "+8.2%", positive: true, note: "vs. last month" },
  { label: "Average ticket", value: "$426", change: "+3.1%", positive: true, note: "vs. last month" },
  { label: "Open estimates", value: "$19,840", change: "-2.3%", positive: false, note: "needs attention" },
];

const jobs = [
  { time: "8:00 AM", title: "AC not cooling", customer: "Marianne Foster", tech: "JR", status: "In progress", color: "bg-blue-50 text-blue-700" },
  { time: "10:30 AM", title: "Seasonal maintenance", customer: "Caleb Morgan", tech: "DS", status: "Scheduled", color: "bg-violet-50 text-violet-700" },
  { time: "1:00 PM", title: "Furnace replacement", customer: "Liam Bennett", tech: "AK", status: "Scheduled", color: "bg-violet-50 text-violet-700" },
  { time: "3:30 PM", title: "Thermostat installation", customer: "Sarah Chen", tech: "JR", status: "Unassigned", color: "bg-orange-50 text-orange-700" },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm font-medium text-orange-600">Monday, June 30</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Good morning, Moe</h1><p className="mt-1 text-sm text-gray-500">Here’s what’s happening across your business today.</p></div>
        <div className="flex gap-2"><button className="flex h-10 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-medium shadow-sm hover:bg-gray-50"><CalendarPlus className="size-4" /> Schedule</button><button className="flex h-10 items-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-orange-700"><Plus className="size-4" /> New job</button></div>
      </div>

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => <article key={metric.label} className="rounded-xl border bg-white p-5 shadow-panel"><p className="text-sm font-medium text-gray-500">{metric.label}</p><div className="mt-3 flex items-end justify-between gap-2"><p className="text-2xl font-semibold tracking-tight">{metric.value}</p><span className={`flex items-center text-xs font-semibold ${metric.positive ? "text-emerald-600" : "text-rose-600"}`}>{metric.positive ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}{metric.change}</span></div><p className="mt-1 text-xs text-gray-400">{metric.note}</p></article>)}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <article className="overflow-hidden rounded-xl border bg-white shadow-panel">
          <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold">Today’s schedule</h2><p className="mt-0.5 text-xs text-gray-500">4 jobs · 3 technicians</p></div><a className="text-sm font-medium text-orange-600" href="#">View dispatch board</a></div>
          <div className="divide-y">{jobs.map((job) => <div key={`${job.time}-${job.title}`} className="grid grid-cols-[76px_1fr_auto] items-center gap-3 px-5 py-4 hover:bg-gray-50"><p className="text-xs font-semibold text-gray-500">{job.time}</p><div><p className="text-sm font-semibold">{job.title}</p><p className="mt-0.5 text-xs text-gray-500">{job.customer}</p></div><div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-gray-100 text-[11px] font-semibold">{job.tech}</span><span className={`hidden rounded-full px-2.5 py-1 text-[11px] font-semibold sm:block ${job.color}`}>{job.status}</span></div></div>)}</div>
        </article>

        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-1">
          <article className="rounded-xl border bg-gray-900 p-5 text-white shadow-panel"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-gray-300">Team availability</p><p className="mt-2 text-3xl font-semibold">5 <span className="text-base font-normal text-gray-400">of 7 available</span></p></div><span className="grid size-10 place-items-center rounded-lg bg-white/10"><UsersRound className="size-5 text-orange-400" /></span></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[71%] rounded-full bg-orange-500" /></div><div className="mt-3 flex justify-between text-xs text-gray-400"><span>1 on a job</span><span>1 off today</span></div></article>
          <article className="rounded-xl border bg-white p-5 shadow-panel"><h2 className="font-semibold">Needs attention</h2><div className="mt-4 space-y-4"><div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600"><PhoneMissed className="size-4" /></span><div><p className="text-sm font-semibold">3 missed calls</p><p className="text-xs text-gray-500">Last call 18 minutes ago</p></div></div><div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600"><Clock3 className="size-4" /></span><div><p className="text-sm font-semibold">5 estimates awaiting follow-up</p><p className="text-xs text-gray-500">Worth $12,460</p></div></div></div></article>
        </div>
      </section>
    </div>
  );
}
