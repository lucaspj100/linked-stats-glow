import { Trophy } from "lucide-react";
import type { SellerRow } from "@/lib/analytics";

export function SellerRanking({ rows }: { rows: SellerRow[] }) {
  const max = rows[0]?.period ?? 0;

  if (rows.length === 0) {
    return (
      <p className="px-6 py-10 text-center text-sm text-muted-foreground">
        Nenhuma mensagem registrada neste período.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border">
      <div className="grid grid-cols-[2rem_1fr_4rem_5rem_5rem] items-center gap-3 px-6 py-3 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>#</span>
        <span>Vendedor</span>
        <span className="text-right">Hoje</span>
        <span className="text-right">7d</span>
        <span className="text-right">Período</span>
      </div>

      {rows.map((row, i) => (
        <div
          key={row.person_name}
          className="grid grid-cols-[2rem_1fr_4rem_5rem_5rem] items-center gap-3 px-6 py-3.5"
        >
          <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
            {i === 0 ? <Trophy className="size-3.5 text-primary" /> : i + 1}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">
              {row.person_name}
            </span>
            <span className="mt-1.5 block h-1 w-full max-w-56 overflow-hidden rounded-full bg-secondary">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${max ? (row.period / max) * 100 : 0}%` }}
              />
            </span>
          </span>
          <span className="text-right text-sm tabular-nums text-foreground">{row.today}</span>
          <span className="text-right text-sm tabular-nums text-foreground">{row.last7}</span>
          <span className="text-right text-sm font-semibold tabular-nums text-foreground">
            {row.period}
          </span>
        </div>
      ))}
    </div>
  );
}
