import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CrmSeller } from "@/lib/crm-united.server";
import type { CrmLinkDiagnostics } from "@/lib/crm-link.server";

export type CrmLinkAttemptResult = {
  outcome: "linked" | "already_linked" | "not_found" | "needs_review" | "error";
  message: string;
  candidates: CrmSeller[];
  diagnostics?: CrmLinkDiagnostics;
};

/** Tenta vincular (ou revincular) um perfil ao CRM United pelo e-mail. */
export const retryCrmLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ profileId: z.string().uuid().optional() }).parse(data ?? {}))
  .handler(async ({ data, context }): Promise<CrmLinkAttemptResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { attemptAutoLink } = await import("@/lib/crm-link.server");

    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });

    let query = supabaseAdmin
      .from("profiles")
      .select("id, email, crm_user_id, crm_last_attempt_at");

    query = data.profileId && isAdmin
      ? query.eq("id", data.profileId)
      : query.eq("user_id", context.userId);

    const { data: profile } = await query.maybeSingle();
    if (!profile) throw new Error("Perfil não encontrado.");

    return attemptAutoLink(profile, { force: true });
  });

/** Vínculo manual — somente administradores, com bloqueio de duplicidade. */
export const adminSetCrmLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    profileId: z.string().uuid(),
    crmUserId: z.string().trim().min(1).max(120),
    crmName: z.string().trim().max(200).optional().nullable(),
    crmEmail: z.string().trim().max(200).optional().nullable(),
  }).parse(data))
  .handler(async ({ data, context }): Promise<CrmLinkAttemptResult> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");

    const { crmUserAlreadyLinked, saveCrmLink } = await import("@/lib/crm-link.server");
    const conflict = await crmUserAlreadyLinked(data.crmUserId, data.profileId);
    if (conflict) {
      return {
        outcome: "error",
        message: `Este usuário do CRM já está vinculado a ${conflict.name} (${conflict.email}).`,
        candidates: [],
      };
    }

    const diagnostics = await saveCrmLink(data.profileId, {
      id: data.crmUserId,
      name: data.crmName ?? "",
      email: (data.crmEmail ?? "").trim().toLowerCase(),
      role: null,
      active: null,
    });

    return { outcome: "linked", message: "Vínculo salvo.", candidates: [], diagnostics };
  });

/** Remove o vínculo — somente administradores. */
export const adminUnlinkCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ profileId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true; diagnostics: CrmLinkDiagnostics }> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        crm_user_id: null,
        crm_name: null,
        crm_email: null,
        crm_link_status: "unlinked",
        crm_linked_at: null,
        crm_last_error: null,
      })
      .eq("id", data.profileId)
      .select("id, crm_user_id, crm_link_status")
      .maybeSingle();

    const diagnostics: CrmLinkDiagnostics = {
      matched_crm_user_id: null,
      target_profile_id: data.profileId,
      update_success: !updateError && Boolean(updated) && updated.crm_user_id === null && updated.crm_link_status === "unlinked",
      persisted_crm_user_id: updated?.crm_user_id ?? null,
      error_code: updateError?.code ?? (!updated ? "PROFILE_NOT_FOUND" : null),
    };
    if (updateError) throw new Error(updateError.message);
    if (!diagnostics.update_success) throw new Error("O banco não confirmou a remoção do vínculo com o CRM.");

    return { ok: true, diagnostics };
  });
