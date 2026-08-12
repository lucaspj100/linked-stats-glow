import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CrmSyncSummary = {
  synced: number;
  pending: number;
  unlinked: number;
  failed: number;
  last_error: string | null;
  last_synced_at: string | null;
};

export type CrmSyncRunResult = {
  processed: number;
  synced: number;
  unlinked: number;
  failed: number;
};

async function assertAdmin(context: { supabase: { rpc: Function }; userId: string }) {
  const { data: isAdmin } = await (context.supabase as any).rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Apenas administradores podem acessar a integração com o CRM.");
}

/** Resumo da fila de sincronização com o CRM (somente admin). */
export const getCrmSyncSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CrmSyncSummary> => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows } = await supabaseAdmin
      .from("message_events")
      .select("crm_sync_status, crm_synced_at, crm_last_error")
      .order("sent_at", { ascending: false })
      .limit(20000);

    const summary: CrmSyncSummary = {
      synced: 0,
      pending: 0,
      unlinked: 0,
      failed: 0,
      last_error: null,
      last_synced_at: null,
    };

    for (const row of rows ?? []) {
      const status = row.crm_sync_status;
      if (status === "synced") {
        summary.synced += 1;
        if (!summary.last_synced_at && row.crm_synced_at) summary.last_synced_at = row.crm_synced_at;
      } else if (status === "unlinked") {
        summary.unlinked += 1;
      } else if (status === "failed") {
        summary.failed += 1;
        if (!summary.last_error && row.crm_last_error) summary.last_error = row.crm_last_error;
      } else {
        summary.pending += 1;
      }
    }

    return summary;
  });

/**
 * Reprocessa eventos pendentes/falhos. A idempotência é garantida pelo
 * `event_id`, então reprocessar nunca duplica atividades no CRM.
 */
export const reprocessCrmSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ limit: z.number().int().min(1).max(500).optional() }).parse(data ?? {}))
  .handler(async ({ data, context }): Promise<CrmSyncRunResult> => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { processPendingEvents } = await import("@/lib/crm-activity.server");

    // Reprocesso manual ignora o backoff e zera o contador de tentativas.
    await supabaseAdmin
      .from("message_events")
      .update({ crm_sync_attempts: 0, crm_next_attempt_at: new Date().toISOString() })
      .neq("crm_sync_status", "synced");

    return processPendingEvents(data.limit ?? 200, { force: true });
  });
