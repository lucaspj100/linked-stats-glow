import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { sessionProfileQuery } from "@/lib/session-profile";
import { updateMyProfile } from "@/lib/profiles.functions";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Meu perfil — LinkedIn Message Tracker" },
      {
        name: "description",
        content: "Dados cadastrais do vendedor: nome, e-mail, telefone e status da conta.",
      },
      { property: "og:title", content: "Meu perfil — LinkedIn Message Tracker" },
      {
        property: "og:description",
        content: "Dados cadastrais do vendedor no painel de prospecção.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-10 text-sm text-destructive">
      {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-10 text-sm">Nada por aqui.</div>,
});

function ProfilePage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(sessionProfileQuery);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.profile) {
      setName(data.profile.name);
      setPhone(data.profile.phone ?? "");
    }
  }, [data?.profile]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      await updateMyProfile({ data: { name, phone } });
      await queryClient.invalidateQueries({ queryKey: ["session-profile"] });
      setStatus("Perfil atualizado.");
    } catch {
      setStatus("Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-6 py-5">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Meu perfil</h1>
          <Link
            to="/"
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Voltar ao painel
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <form
            onSubmit={onSubmit}
            className="space-y-4 rounded-xl border border-border bg-card p-6"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Nome completo
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Telefone
                </span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  E-mail
                </span>
                <input
                  value={data.profile.email}
                  readOnly
                  className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-muted-foreground"
                />
              </label>
              <div className="space-y-1.5 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status da conta
                </span>
                <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground">
                  {data.profile.active ? "Ativa" : "Inativa"} ·{" "}
                  {data.role === "admin" ? "Administrador" : "Vendedor"}
                  {data.profile.crm_user_id
                    ? ` · CRM ${data.profile.crm_user_id}`
                    : " · sem vínculo com o CRM"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {saving ? "Salvando…" : "Salvar alterações"}
              </button>
              {status && <span className="text-xs text-muted-foreground">{status}</span>}
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
