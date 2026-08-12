export type InstallationStatus = {
  icon: string;
  label: string;
  tone: "active" | "idle" | "never" | "off";
};

const IDLE_MS = 3 * 24 * 60 * 60 * 1000;

export function installationStatus(input: {
  is_active: boolean;
  last_used_at: string | null;
}): InstallationStatus {
  if (!input.is_active) return { icon: "🔴", label: "Desativada", tone: "off" };
  if (!input.last_used_at) return { icon: "⚪", label: "Nunca utilizada", tone: "never" };
  const age = Date.now() - new Date(input.last_used_at).getTime();
  if (age > IDLE_MS) return { icon: "🟡", label: "Sem atividade recente", tone: "idle" };
  return { icon: "🟢", label: "Ativa", tone: "active" };
}

export function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString("pt-BR") : "—";
}
