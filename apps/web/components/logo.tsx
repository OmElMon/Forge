import { Flame } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 font-semibold tracking-tight text-ink">
      <span className="grid size-9 place-items-center rounded-xl bg-ink text-white shadow-sm">
        <Flame className="size-5 text-orange-400" strokeWidth={2.3} />
      </span>
      {!compact && <span className="text-xl">CrewPilot OS</span>}
    </div>
  );
}
