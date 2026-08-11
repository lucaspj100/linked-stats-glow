import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Copy, Plus } from "lucide-react";

import {
  createInstallation,
  listInstallations,
  setInstallationActive,
} from "@/lib/installations.functions";

const installationsQuery = queryOptions({
  queryKey: ["installations"],
  queryFn: () => listInstallations(),
});

export const Route = createFileRoute("/_authenticated/instalacoes")({
  head: () => ({
    meta: [
      { title: "Instalações da extensão — LinkedIn Message Tracker" },
      {
        name: "description",
        content:
          "Cadastre instalações da extensão do Chrome e gere tokens individuais para registrar mensagens com segurança.",
      },
      { property: "og:title", content: "Instalações da extensão — LinkedIn Message Tracker" },
      {
        property: "og:description",
        content: "Gerencie tokens de instalação da extensão do LinkedIn Message Tracker.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(installationsQuery),
  component: InstallationsPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-10 text-sm text-destructive">
      Não foi possível carregar as instalações: {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-10 text-sm">Nada por aqui.</div>,
});

function InstallationsPage() {
  const { data: installations } = useSuspenseQuery(installationsQuery);
  const queryClient = useQueryClient();
  const create = useServerFn(createInstallation);
  const toggle = useServerFn(setInstallationActive);

  const [label, setLabel] = useState("");
  const [personName, setPersonName] = useState("");
  const [linkedinAccount, setLinkedinAccount] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ installationId: string; token: string } | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = await create({ data: { label, personName, linkedinAccount } });
      setCreated(result);
      setLabel("");
      setPersonName("");
      setLinkedinAccount("");
      await queryClient.invalidateQueries({ queryKey: ["installations"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar instalação.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar ao painel
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight">Instalações da extensão</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada instalação da extensão tem um identificador e um token próprios. O token aparece uma
          única vez, no momento da criação.
        </p>

        <form
          onSubmit={handleCreate}
          className="mt-8 rounded-xl border bg-card p-6 shadow-sm"
        >
          <h2 className="text-sm font-medium">Nova instalação</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Identificação</span>
              <input
                required
                maxLength={80}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Notebook da Isabella"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Vendedor</span>
              <input
                required
                maxLength={120}
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                placeholder="Isabella"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Conta do LinkedIn</span>
              <input
                required
                maxLength={120}
                value={linkedinAccount}
                onChange={(e) => setLinkedinAccount(e.target.value)}
                placeholder="LinkedIn Isabella"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {pending ? "Criando…" : "Criar instalação"}
          </button>
        </form>

        {created ? (
          <div className="mt-6 rounded-xl border border-primary/40 bg-primary/5 p-6">
            <h2 className="text-sm font-medium">Credenciais geradas — copie agora</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground">installation_id</dt>
                <dd className="break-all font-mono">{created.installationId}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">installation_token</dt>
                <dd className="break-all font-mono">{created.token}</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() =>
                navigator.clipboard.writeText(
                  `installation_id: ${created.installationId}\ninstallation_token: ${created.token}`,
                )
              }
              className="mt-4 inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"
            >
              <Copy className="h-4 w-4" aria-hidden /> Copiar credenciais
            </button>
          </div>
        ) : null}

        <div className="mt-8 overflow-hidden rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Instalação</th>
                <th className="px-4 py-3 font-medium">Vendedor</th>
                <th className="px-4 py-3 font-medium">Conta</th>
                <th className="px-4 py-3 font-medium">Último uso</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {installations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    Nenhuma instalação cadastrada.
                  </td>
                </tr>
              ) : (
                installations.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.label}</div>
                      <div className="font-mono text-xs text-muted-foreground">{item.id}</div>
                    </td>
                    <td className="px-4 py-3">{item.person_name}</td>
                    <td className="px-4 py-3">{item.linkedin_account}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {item.last_used_at
                        ? new Date(item.last_used_at).toLocaleString("pt-BR")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={async () => {
                          await toggle({ data: { id: item.id, isActive: !item.is_active } });
                          await queryClient.invalidateQueries({ queryKey: ["installations"] });
                        }}
                        className={
                          item.is_active
                            ? "rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                            : "rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {item.is_active ? "Ativa" : "Inativa"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
