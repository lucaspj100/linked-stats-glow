import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { listSellers, adminUpdateSeller, type Profile } from "@/lib/profiles.functions";
import {
  retryCrmLink,
  adminSetCrmLink,
  adminUnlinkCrm,
  type CrmLinkAttemptResult,
} from "@/lib/crm-link.functions";
import { fetchMessageEvents } from "@/lib/message-events.functions";
import { sessionProfileQuery } from "@/lib/session-profile";
import { countSince, startOfMonth, startOfToday } from "@/lib/analytics";

const CRM_STATUS: Record<string, { dot: string; label: string; className: string }> = {
  linked: { dot: "🟢", label: "Vinculado", className: "text-primary" },
  unlinked: { dot: "⚪", label: "Não vinculado", className: "text-muted-foreground" },
  needs_review: { dot: "🟡", label: "Requer revisão", className: "text-foreground" },
  error: { dot: "🔴", label: "Erro de integração", className: "text-destructive" },
};


export const Route = createFileRoute("/_authenticated/equipe")({
  head: () => ({
    meta: [
      { title: "Equipe de vendedores — LinkedIn Message Tracker" },
      {
        name: "description",
        content:
          "Área administrativa com todos os vendedores cadastrados, status, vínculo com o CRM e volume de mensagens.",
      },
      { property: "og:title", content: "Equipe de vendedores — LinkedIn Message Tracker" },
      {
        property: "og:description",
        content: "Gestão de vendedores, status e vínculo com o CRM United.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-10 text-sm text-destructive">
      {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-10 text-sm">Nada por aqui.</div>,
});

function TeamPage() {
  const queryClient = useQueryClient();
  const session = useQuery(sessionProfileQuery);
  const isAdmin = session.data?.role === "admin";

  const sellers = useQuery({
    queryKey: ["sellers"],
    queryFn: () => listSellers({ data: undefined }),
    enabled: isAdmin,
  });

  const events = useQuery({
    queryKey: ["team-events"],
    queryFn: () =>
      fetchMessageEvents({ data: { since: startOfMonth().toISOString() } }),
    enabled: isAdmin,
  });

  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [crmBusy, setCrmBusy] = useState<string | null>(null);
  const [crmFeedback, setCrmFeedback] = useState<string | null>(null);
  const [ambiguous, setAmbiguous] = useState<
    { seller: Profile; result: CrmLinkAttemptResult } | null
  >(null);


  const counts = useMemo(() => {
    const map = new Map<string, { today: number; month: number }>();
    for (const e of events.data ?? []) {
      const entry = map.get(e.person_name) ?? { today: 0, month: 0 };
      entry.month++;
      if (new Date(e.sent_at).getTime() >= startOfToday().getTime()) entry.today++;
      map.set(e.person_name, entry);
    }
    return map;
  }, [events.data]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (sellers.data ?? []).filter(
      (s) =>
        !term ||
        s.name.toLowerCase().includes(term) ||
        s.email.toLowerCase().includes(term),
    );
  }, [sellers.data, search]);

  // Sempre derivado dos dados atuais da query, nunca de uma cópia antiga da linha.
  const detail = useMemo(
    () => (sellers.data ?? []).find((s) => s.id === detailId) ?? null,
    [sellers.data, detailId],
  );

  async function mutate(profileId: string, patch: { active?: boolean; crmUserId?: string | null }) {
    await adminUpdateSeller({ data: { profileId, ...patch } });
    await refreshSellers();
  }

  /** Recarrega a lista direto do banco (refetch, não apenas invalidação). */
  async function refreshSellers() {
    await queryClient.refetchQueries({ queryKey: ["sellers"], type: "active" });
    await queryClient.invalidateQueries({ queryKey: ["session-profile"] });
  }

  /** Vínculo automático pelo e-mail; casos ambíguos abrem a lista de candidatos. */
  async function tryLink(seller: Profile) {
    setCrmBusy(seller.id);
    setCrmFeedback(null);
    try {
      const result: CrmLinkAttemptResult = await retryCrmLink({
        data: { profileId: seller.id },
      });
      if (result.outcome === "error" || result.diagnostics?.update_success === false) {
        throw new Error(result.message);
      }
      if (result.outcome === "needs_review" && result.candidates.length > 0) {
        setAmbiguous({ seller, result });
      }
      setCrmFeedback(
        result.outcome === "not_found"
          ? "Nenhum vendedor do CRM United encontrado com este e-mail."
          : result.message,
      );
    } catch (error) {
      setCrmFeedback((error as Error).message);
    } finally {
      setCrmBusy(null);
      await refreshSellers();
    }
  }

  /** Opção secundária: administrador informa o ID do CRM manualmente. */
  async function manualLink(seller: Profile) {
    const value = window.prompt("ID do vendedor no CRM United", seller.crm_user_id ?? "");
    if (value === null) return;
    const crmUserId = value.trim();
    if (!crmUserId) return;
    const result = await adminSetCrmLink({ data: { profileId: seller.id, crmUserId } });
    if (result.outcome !== "linked" || result.diagnostics?.update_success !== true) {
      throw new Error(result.message);
    }
    setCrmFeedback(result.message);
    await refreshSellers();
  }

  async function unlink(seller: Profile) {
    await adminUnlinkCrm({ data: { profileId: seller.id } });
    setCrmFeedback("Vínculo removido.");
    await refreshSellers();
  }

  async function chooseCandidate(seller: Profile, candidateId: string, name: string, email: string) {
    const result = await adminSetCrmLink({
      data: { profileId: seller.id, crmUserId: candidateId, crmName: name, crmEmail: email },
    });
    if (result.outcome !== "linked" || result.diagnostics?.update_success !== true) {
      throw new Error(result.message);
    }
    setCrmFeedback(result.message);
    setAmbiguous(null);
    await refreshSellers();
  }


  if (session.isLoading) {
    return <div className="p-10 text-sm text-muted-foreground">Carregando…</div>;
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-lg font-semibold text-foreground">Acesso restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta área é exclusiva para administradores.
        </p>
        <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">
          Voltar ao painel
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Equipe / Vendedores
            </h1>
            <p className="text-xs text-muted-foreground">
              Cadastro, status e vínculo com o CRM United
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por nome ou e-mail"
              className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
            <Link
              to="/"
              className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Painel
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {crmFeedback && (
          <div
            role="status"
            className="mb-4 flex items-start justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground"
          >
            <span>{crmFeedback}</span>
            <button
              type="button"
              onClick={() => setCrmFeedback(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Fechar
            </button>
          </div>
        )}

        <CrmSyncCard />

        {ambiguous && (
          <div className="mb-4 rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">
              Requer revisão · {ambiguous.seller.name}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Mais de um vendedor do CRM United corresponde a {ambiguous.seller.email}. Escolha o
              correto.
            </p>
            <ul className="mt-3 space-y-2">
              {ambiguous.result.candidates.map((candidate) => (
                <li
                  key={candidate.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2"
                >
                  <div>
                    <p className="text-sm text-foreground">{candidate.name || "Sem nome"}</p>
                    <p className="text-xs text-muted-foreground">{candidate.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void chooseCandidate(
                        ambiguous.seller,
                        candidate.id,
                        candidate.name,
                        candidate.email,
                      )
                    }
                    className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Vincular
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setAmbiguous(null)}
              className="mt-3 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        )}


        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Nome</th>
                <th className="px-4 py-3 font-semibold">E-mail</th>
                <th className="px-4 py-3 font-semibold">Telefone</th>
                <th className="px-4 py-3 font-semibold">Cadastro</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">CRM</th>
                <th className="px-4 py-3 text-right font-semibold">Hoje</th>
                <th className="px-4 py-3 text-right font-semibold">Mês</th>
                <th className="px-4 py-3 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const c = counts.get(s.name) ?? { today: 0, month: 0 };
                return (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">{s.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          s.active
                            ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                            : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {s.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const st = CRM_STATUS[s.crm_link_status] ?? CRM_STATUS["unlinked"]!;
                        return (
                          <div className="flex flex-col">
                            <span className={`text-xs font-medium ${st.className}`}>
                              {st.dot} {st.label}
                            </span>
                            {s.crm_user_id && (
                              <span className="text-xs text-foreground">
                                {s.crm_name || s.crm_email || "Vendedor do CRM"}
                              </span>
                            )}
                            {s.crm_link_status === "error" && s.crm_last_error && (
                              <span className="text-[11px] text-muted-foreground">
                                {s.crm_last_error}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.today}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.month}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={crmBusy === s.id}
                          onClick={() => void tryLink(s)}
                          className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          {crmBusy === s.id
                            ? "Consultando…"
                            : s.crm_user_id
                              ? "Revincular ao CRM"
                              : "Vincular ao CRM"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void manualLink(s)}
                          className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          Vínculo manual
                        </button>
                        {s.crm_user_id && (
                          <button
                            type="button"
                            onClick={() => void unlink(s)}
                            className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            Desvincular
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => void mutate(s.id, { active: !s.active })}
                          className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {s.active ? "Desativar" : "Ativar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailId(s.id)}
                          className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          Detalhes
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                    {sellers.isLoading ? "Carregando…" : "Nenhum vendedor encontrado."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {detail && (
          <div className="mt-6 rounded-xl border border-border bg-card p-6">
            <div className="flex items-start justify-between">
              <h2 className="text-sm font-semibold text-foreground">Detalhes · {detail.name}</h2>
              <button
                type="button"
                onClick={() => setDetailId(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Fechar
              </button>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-muted-foreground">E-mail</dt>
                <dd className="text-foreground">{detail.email}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Telefone</dt>
                <dd className="text-foreground">{detail.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">CRM United</dt>
                <dd className="text-foreground">
                  {detail.crm_user_id
                    ? detail.crm_name || detail.crm_email || "Vendedor do CRM"
                    : "Não vinculado"}
                </dd>
                {detail.crm_user_id && (
                  <dd className="text-xs text-muted-foreground">
                    {detail.crm_email ?? "—"} · ID {detail.crm_user_id}
                  </dd>
                )}
              </div>

              <div>
                <dt className="text-xs uppercase text-muted-foreground">Mensagens no mês</dt>
                <dd className="text-foreground">{counts.get(detail.name)?.month ?? 0}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </main>
  );
}
