import { useState } from "react";
import { ChevronRight, Trophy } from "lucide-react";
import type { SellerRow } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export function SellerRanking({ rows }: { rows: SellerRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
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
      <div className="grid grid-cols-[2rem_1fr_5rem_6rem] items-center gap-3 px-6 py-3 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>#</span>
        <span>Vendedor</span>
        <span className="text-right">Hoje</span>
        <span className="text-right">Últimos 7d</span>
      </div>

      {rows.map((row, i) => {
        const isOpen = open === row.person_name;
        return (
          <div key={row.person_name}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : row.person_name)}
              className="grid w-full grid-cols-[2rem_1fr_5rem_6rem] items-center gap-3 px-6 py-3.5 text-left transition-colors hover:bg-accent"
              aria-expanded={isOpen}
            >
              <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                <ChevronRight
                  className={cn(
                    "size-3.5 shrink-0 transition-transform",
                    isOpen && "rotate-90 text-primary",
                  )}
                />
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
              <span className="text-right text-sm font-semibold tabular-nums text-foreground">
                {row.last7}
              </span>
            </button>

            {isOpen && (
              <div className="border-t border-border bg-muted/40 px-6 py-3">
                <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Contas do LinkedIn — {row.person_name}
                </p>
                <ul className="space-y-1.5">
                  {row.accounts.map((a) => (
                    <li
                      key={a.linkedin_account}
                      className="flex items-center justify-between gap-4 text-sm"
                    >
                      <span className="truncate text-muted-foreground">{a.linkedin_account}</span>
                      <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
                        {a.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
