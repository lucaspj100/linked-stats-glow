import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Eye, EyeOff, Plus, Power } from "lucide-react";

import {
  createMyInstallation,
  listMyInstallations,
  renameInstallation,
  revealInstallationToken,
  setInstallationActive,
  type Installation,
} from "@/lib/installations.functions";
import { sessionProfileQuery } from "@/lib/session-profile";
import { formatDateTime, installationStatus } from "@/lib/installation-status";

export const Route = createFileRoute("/_authenticated/minha-extensao")({
  head: () => ({
    meta: [
      { title: "Minha extensão — LinkedIn Message Tracker" },
      {
        name: "description",
        content:
          "Veja, crie e copie as credenciais da sua extensão do Chrome: installation ID, token e status de atividade.",
      },
      { property: "og:title", content: "Minha extensão — LinkedIn Message Tracker" },
      {
        property: "og:description",
        content: "Credenciais da extensão do Chrome do vendedor no LinkedIn Message Tracker.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyExtensionPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-10 text-sm text-destructive">
      {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-10 text-sm">Nada por aqui.</div>,
});

function MyExtensionPage() {
  const queryClient = useQueryClient();
  const session = useQuery(sessionProfileQuery);
  const create = useServerFn(createMyInstallation);
  const reveal = useServerFn(revealInstallationToken);
  const rename = useServerFn(renameInstallation);
  const toggle = useServerFn(setInstallationActive);

  const installations = useQuery({
    queryKey: ["my-installations"],
    queryFn: () => listMyInstallations({ data: undefined }),
  });

  const [deviceName, setDeviceName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState("");

  const sellerName = session.data?.profile.name ?? "";
  const rows = installations.data ?? [];
  const activeCount = rows.filter((i) => i.is_active).length;

  async function refresh() {
    await queryClient.refetchQueries({ queryKey: ["my-installations"] });
  }

  function copy(text: string, tag: string) {
    navigator.clipboard.writeText(text);
    setCopied(tag);
    setTimeout(() => setCopied(""), 1800);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = await create({ data: { deviceName: deviceName || undefined } });
      setTokens((prev) => ({ ...prev, [result.installationId]: result.token }));
      setDeviceName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar instalação.");
    } finally {
      setPending(false);
    }
  }

  async function handleReveal(id: string) {
    if (tokens[id]) {
      setTokens((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    const { token } = await reveal({ data: { id } });
    if (token) setTokens((prev) => ({ ...prev, [id]: token }));
    else setError("Token indisponível para esta instalação. Crie uma nova instalação.");
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-6 py-5">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Minha extensão</h1>
            <p className="text-xs text-muted-foreground">
              Credenciais para configurar a extensão do Chrome
            </p>
          </div>
          <Link
            to="/"
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Voltar ao painel
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Vendedor
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">{sellerName || "—"}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {activeCount} instalação(ões) ativa(s) de {rows.length}
            </p>
          </div>
        </section>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {installations.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : rows.length === 0 ? (
          <section className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma extensão configurada ainda.</p>
          </section>
        ) : (
          <ul className="space-y-4">
            {rows.map((item) => (
              <InstallationCard
                key={item.id}
                item={item}
                sellerName={sellerName}
                token={tokens[item.id] ?? null}
                copiedTag={copied}
                onCopy={copy}
                onReveal={() => handleReveal(item.id)}
                onRename={async (name) => {
                  await rename({ data: { id: item.id, deviceName: name } });
                  await refresh();
                }}
                onToggle={async () => {
                  await toggle({ data: { id: item.id, isActive: !item.is_active } });
                  await refresh();
                }}
              />
            ))}
          </ul>
        )}

        <form onSubmit={handleCreate} className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-medium text-foreground">Criar minha instalação</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Cada computador precisa de uma instalação própria, com ID e token exclusivos.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Nome do dispositivo (opcional)
              </span>
              <input
                value={deviceName}
                maxLength={80}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Notebook trabalho"
                className="w-64 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              <Plus className="size-4" aria-hidden />
              {pending ? "Criando…" : "Criar minha instalação"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function InstallationCard({
  item,
  sellerName,
  token,
  copiedTag,
  onCopy,
  onReveal,
  onRename,
  onToggle,
}: {
  item: Installation;
  sellerName: string;
  token: string | null;
  copiedTag: string;
  onCopy: (text: string, tag: string) => void;
  onReveal: () => void;
  onRename: (name: string) => Promise<void>;
  onToggle: () => Promise<void>;
}) {
  const status = installationStatus(item);
  const [name, setName] = useState(item.device_name ?? item.label);
  const config = `Nome do vendedor: ${item.person_name || sellerName}\nInstallation ID: ${item.id}\nInstallation Token: ${token ?? "(clique em Mostrar token)"}`;

  return (
    <li className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const trimmed = name.trim();
              if (trimmed && trimmed !== (item.device_name ?? item.label)) void onRename(trimmed);
            }}
            className="rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-foreground hover:border-input focus:border-primary focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
            {status.icon} {status.label}
          </span>
          <button
            type="button"
            onClick={() => void onToggle()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <Power className="size-3.5" aria-hidden />
            {item.is_active ? "Desativar" : "Reativar"}
          </button>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Installation ID
          </dt>
          <dd className="mt-1 break-all font-mono text-xs text-foreground">{item.id}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Installation Token
          </dt>
          <dd className="mt-1 break-all font-mono text-xs text-foreground">
            {token ?? "••••••••••••••••"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Criado em
          </dt>
          <dd className="mt-1 text-xs text-muted-foreground">{formatDateTime(item.created_at)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Última atividade
          </dt>
          <dd className="mt-1 text-xs text-muted-foreground">
            {formatDateTime(item.last_used_at)}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <ActionButton
          onClick={() => onCopy(item.id, `id-${item.id}`)}
          active={copiedTag === `id-${item.id}`}
          icon={<Copy className="size-3.5" aria-hidden />}
          label="Copiar Installation ID"
        />
        <ActionButton
          onClick={onReveal}
          icon={token ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
          label={token ? "Ocultar token" : "Mostrar token"}
        />
        <ActionButton
          onClick={async () => {
            if (!token) await onReveal();
            onCopy(token ?? "", `token-${item.id}`);
          }}
          active={copiedTag === `token-${item.id}`}
          disabled={!token}
          icon={<Copy className="size-3.5" aria-hidden />}
          label="Copiar token"
        />
        <ActionButton
          onClick={() => onCopy(config, `cfg-${item.id}`)}
          active={copiedTag === `cfg-${item.id}`}
          disabled={!token}
          icon={<Copy className="size-3.5" aria-hidden />}
          label="Copiar configuração"
        />
      </div>
    </li>
  );
}

function ActionButton({
  onClick,
  icon,
  label,
  active,
  disabled,
}: {
  onClick: () => void | Promise<void>;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void onClick()}
      className={
        active
          ? "inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary"
          : "inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
      }
    >
      {icon}
      {active ? "Copiado!" : label}
    </button>
  );
}
