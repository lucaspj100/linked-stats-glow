// Sincronização server-only de eventos de mensagem do Tracker com o CRM United.
// Nunca envia conteúdo de mensagem, token de instalação ou credenciais:
// apenas event_id, crm_user_id, sent_at e metadados técnicos de auditoria.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const CRM_SOURCE = "linkedin_tracker";

/** Backoff progressivo: imediato → 2min → 10min → 1h → 6h → 24h (limite). */
const BACKOFF_MINUTES = [2, 10, 60, 360, 1440];
export const MAX_ATTEMPTS = 8;

export type SyncOutcome = "synced" | "unlinked" | "failed" | "not_configured";

export type SyncResult = { outcome: SyncOutcome; message: string };

function nextAttemptAt(attempts: number): string {
  const idx = Math.min(attempts, BACKOFF_MINUTES.length) - 1;
  const minutes = BACKOFF_MINUTES[Math.max(idx, 0)] ?? 1440;
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

type CrmPostResult = { ok: true; duplicate: boolean } | { ok: false; error: string };

async function postActivity(payload: {
  event_id: string;
  crm_user_id: string;
  sent_at: string;
  installation_id: string | null;
  tracker_user_id: string | null;
}): Promise<CrmPostResult> {
  const baseUrl = process.env["CRM_UNITED_API_URL"];
  const secret = process.env["CRM_UNITED_API_SECRET"];
  if (!baseUrl || !secret) {
    return { ok: false, error: "Integração com o CRM United não configurada." };
  }

  const url = `${baseUrl.replace(/\/+$/, "")}/api/public/linkedin-message-event`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tracker-secret": secret },
      body: JSON.stringify({ ...payload, source: CRM_SOURCE }),
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: "CRM United recusou a autenticação da integração." };
    }
    if (!response.ok) {
      return { ok: false, error: `CRM United indisponível (HTTP ${response.status}).` };
    }

    const body = (await response.json().catch(() => ({}))) as { duplicate?: boolean };
    return { ok: true, duplicate: body.duplicate === true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    return { ok: false, error: `Falha ao contatar o CRM United: ${message}` };
  }
}

type EventRow = {
  id: string;
  event_id: string | null;
  sent_at: string;
  installation_id: string | null;
  crm_sync_attempts: number;
};

/** Descobre o crm_user_id do vendedor dono da instalação que gerou o evento. */
async function resolveCrmUser(installationId: string | null) {
  if (!installationId) return { crmUserId: null, trackerUserId: null };

  const { data: install } = await supabaseAdmin
    .from("extension_installations")
    .select("seller_user_id")
    .eq("id", installationId)
    .maybeSingle();

  const trackerUserId = install?.seller_user_id ?? null;
  if (!trackerUserId) return { crmUserId: null, trackerUserId: null };

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("crm_user_id")
    .eq("user_id", trackerUserId)
    .maybeSingle();

  return { crmUserId: profile?.crm_user_id ?? null, trackerUserId };
}

/** Sincroniza um evento já persistido. Nunca lança: falhas ficam pendentes. */
export async function syncMessageEvent(row: EventRow): Promise<SyncResult> {
  const attempts = (row.crm_sync_attempts ?? 0) + 1;

  const markPending = async (status: SyncOutcome, error: string) => {
    await supabaseAdmin
      .from("message_events")
      .update({
        crm_sync_status: status === "unlinked" ? "unlinked" : "failed",
        crm_sync_attempts: attempts,
        crm_last_error: error.slice(0, 500),
        crm_next_attempt_at: nextAttemptAt(attempts),
      })
      .eq("id", row.id);
  };

  try {
    const { crmUserId, trackerUserId } = await resolveCrmUser(row.installation_id);

    if (!crmUserId) {
      // Sem vínculo: o evento continua contabilizado localmente e fica aguardando.
      await markPending("unlinked", "Vendedor ainda não vinculado ao CRM United.");
      return { outcome: "unlinked", message: "Vendedor sem vínculo no CRM." };
    }

    const result = await postActivity({
      event_id: row.event_id ?? row.id,
      crm_user_id: crmUserId,
      sent_at: row.sent_at,
      installation_id: row.installation_id,
      tracker_user_id: trackerUserId,
    });

    if (!result.ok) {
      await markPending("failed", result.error);
      return { outcome: "failed", message: result.error };
    }

    await supabaseAdmin
      .from("message_events")
      .update({
        crm_sync_status: "synced",
        crm_synced_at: new Date().toISOString(),
        crm_sync_attempts: attempts,
        crm_last_error: null,
        crm_user_id: crmUserId,
      })
      .eq("id", row.id);

    return { outcome: "synced", message: result.duplicate ? "Já existia no CRM." : "Sincronizado." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    await markPending("failed", message);
    return { outcome: "failed", message };
  }
}

/** Reprocessa eventos pendentes/falhos respeitando backoff e limite de tentativas. */
export async function processPendingEvents(
  limit = 50,
  options: { force?: boolean } = {},
): Promise<{ processed: number; synced: number; unlinked: number; failed: number }> {
  let query = supabaseAdmin
    .from("message_events")
    .select("id, event_id, sent_at, installation_id, crm_sync_attempts")
    .neq("crm_sync_status", "synced")
    .lt("crm_sync_attempts", MAX_ATTEMPTS)
    .order("sent_at", { ascending: true })
    .limit(limit);

  if (!options.force) {
    query = query.lte("crm_next_attempt_at", new Date().toISOString());
  }

  const { data: rows } = await query;
  const stats = { processed: 0, synced: 0, unlinked: 0, failed: 0 };

  for (const row of rows ?? []) {
    const result = await syncMessageEvent(row as EventRow);
    stats.processed += 1;
    if (result.outcome === "synced") stats.synced += 1;
    else if (result.outcome === "unlinked") stats.unlinked += 1;
    else stats.failed += 1;
  }

  return stats;
}
