import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient, useQuery } from "@tanstack/react-query";
import { sessionProfileQuery } from "@/lib/session-profile";
import { Activity, CalendarDays, CalendarRange, Radio, Send } from "lucide-react";

import { fetchMessageEvents } from "@/lib/message-events.functions";
import {
  buildDailySeries,
  buildRanking,
  countSince,
  daysAgo,
  startOfMonth,
  startOfToday,
  type PeriodKey,
} from "@/lib/analytics";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/dashboard/stat-card";
import { SellerRanking } from "@/components/dashboard/seller-ranking";
import { VolumeChart } from "@/components/dashboard/volume-chart";
import { cn } from "@/lib/utils";

function windowStart(): string {
  const month = startOfMonth();
  const thirty = daysAgo(30);
  const from = month < thirty ? month : thirty;
  return from.toISOString();
}

const eventsQuery = queryOptions({
  queryKey: ["message-events"],
  queryFn: () => fetchMessageEvents({ data: { since: windowStart() } }),
  staleTime: 15_000,
});

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "LinkedIn Message Tracker — Painel de Vendas" },
      {
        name: "description",
        content:
          "Painel interno com volume de mensagens enviadas no LinkedIn por vendedor, conta e período, em tempo real.",
      },
      { property: "og:title", content: "LinkedIn Message Tracker — Painel de Vendas" },
      {
        property: "og:description",
        content:
          "Painel interno com volume de mensagens enviadas no LinkedIn por vendedor, conta e período, em tempo real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(eventsQuery),
  component: Dashboard,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-10 text-sm text-destructive">
      Não foi possível carregar os dados: {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-10 text-sm">Nada por aqui.</div>,
});

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "Últimos 7 dias" },
  { key: "30d", label: "Últimos 30 dias" },
  { key: "custom", label: "Personalizado" },
];

function Dashboard() {
  const { data: events } = useSuspenseQuery(eventsQuery);
  const session = useQuery(sessionProfileQuery);
  const isAdmin = session.data?.role === "admin";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodKey>("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [live, setLive] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel("message-events-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_events" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["message-events"] });
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { from, to, periodLabel } = useMemo(() => {
    const now = new Date();
    if (period === "today")
      return { from: startOfToday(), to: now, periodLabel: "hoje" };
    if (period === "30d")
      return { from: daysAgo(30), to: now, periodLabel: "nos últimos 30 dias" };
    if (period === "custom" && customFrom && customTo) {
      const f = new Date(`${customFrom}T00:00:00`);
      const t = new Date(`${customTo}T23:59:59`);
      return { from: f, to: t, periodLabel: "no período selecionado" };
    }
    if (period === "custom") return { from: daysAgo(30), to: now, periodLabel: "no período" };
    return { from: daysAgo(7), to: now, periodLabel: "nos últimos 7 dias" };
  }, [period, customFrom, customTo]);

  const totals = useMemo(
    () => ({
      today: countSince(events, startOfToday()),
      week: countSince(events, daysAgo(7)),
      month: countSince(events, startOfMonth()),
    }),
    [events],
  );

  const ranking = useMemo(() => buildRanking(events, from, to), [events, from, to]);
  const series = useMemo(() => buildDailySeries(events, 14), [events]);
  const periodTotal = ranking.reduce((sum, r) => sum + r.period, 0);

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              LinkedIn Message Tracker
            </h1>
            <p className="text-xs text-muted-foreground">
              Painel interno de prospecção · volume de mensagens do time
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                live
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-muted text-muted-foreground",
              )}
            >
              <Radio className="size-3.5" />
              {live ? "Tempo real ativo" : "Conectando…"}
            </span>
            <Link
              to="/minha-extensao"
              className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
            >
              Minha extensão
            </Link>
            <Link
              to="/perfil"
              className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Meu perfil
            </Link>
            {isAdmin && (
              <>
                <Link
                  to="/equipe"
                  className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Equipe
                </Link>
                <Link
                  to="/instalacoes"
                  className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Instalações
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth" });
              }}
              className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Sair
            </button>
          </div>

        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <section className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Hoje"
            value={totals.today}
            hint="Mensagens enviadas pelo time hoje"
            icon={Send}
            highlight
          />
          <StatCard
            label="Últimos 7 dias"
            value={totals.week}
            hint="Somatório da semana corrente"
            icon={CalendarDays}
          />
          <StatCard
            label="Mês atual"
            value={totals.month}
            hint="Desde o dia 1º do mês"
            icon={CalendarRange}
          />
        </section>

        <section className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Período
          </span>
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                period === p.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
          {period === "custom" && (
            <div className="flex flex-wrap items-center gap-2 pl-1">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                aria-label="Data inicial"
              />
              <span className="text-xs text-muted-foreground">até</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                aria-label="Data final"
              />
            </div>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {periodTotal.toLocaleString("pt-BR")} mensagens {periodLabel}
          </span>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border px-6 py-4">
              <h2 className="text-sm font-semibold text-foreground">Ranking por vendedor</h2>
              <p className="text-xs text-muted-foreground">
                Total de mensagens por vendedor, somando todos os perfis do LinkedIn.
              </p>

            </div>
            <SellerRanking rows={ranking} />
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <Activity className="size-4 text-primary" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Volume diário</h2>
                <p className="text-xs text-muted-foreground">
                  Total de mensagens do time nos últimos 14 dias
                </p>
              </div>
            </div>
            <VolumeChart data={series} />
          </div>
        </section>
      </div>

      <footer className="border-t border-border bg-card py-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 text-xs text-muted-foreground">
          <span>LinkedIn Message Tracker · Painel interno</span>
          <Link to="/politica-de-privacidade" className="hover:text-foreground hover:underline">
            Política de Privacidade
          </Link>
        </div>
      </footer>
    </main>
  );
}
