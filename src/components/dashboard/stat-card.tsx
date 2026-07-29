import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: number;
  hint: string;
  icon: LucideIcon;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "rounded-xl border border-primary/30 bg-primary/5 p-5"
          : "rounded-xl border border-border bg-card p-5"
      }
    >
      <div className="flex items-center justify-between">
        <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <Icon className={highlight ? "size-4 text-primary" : "size-4 text-muted-foreground"} />
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
        {value.toLocaleString("pt-BR")}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
