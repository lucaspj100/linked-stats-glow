// Regras de vínculo entre um perfil do Tracker e um usuário do CRM United.
// Server-only: usa o cliente administrativo e nunca é importado pelo cliente.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { findCrmSellerByEmail, normalizeEmail, type CrmSeller } from "./crm-united.server";

export type CrmLinkOutcome = "linked" | "already_linked" | "not_found" | "needs_review" | "error";

export type CrmLinkResult = {
  outcome: CrmLinkOutcome;
  message: string;
  candidates: CrmSeller[];
  diagnostics?: CrmLinkDiagnostics;
};

export type CrmLinkDiagnostics = {
  matched_crm_user_id: string | null;
  target_profile_id: string;
  update_success: boolean;
  persisted_crm_user_id: string | null;
  error_code: string | null;
};

export class CrmLinkPersistenceError extends Error {
  diagnostics: CrmLinkDiagnostics;

  constructor(message: string, diagnostics: CrmLinkDiagnostics) {
    super(message);
    this.name = "CrmLinkPersistenceError";
    this.diagnostics = diagnostics;
  }
}

const RETRY_INTERVAL_MS = 6 * 60 * 60 * 1000; // evita consultar o CRM a cada render

async function log(
  profileId: string | null,
  email: string,
  outcome: CrmLinkOutcome,
  matches: number,
  message: string,
) {
  // Nunca registramos tokens ou credenciais — apenas e-mail normalizado e resultado.
  await supabaseAdmin.from("crm_link_attempts").insert({
    profile_id: profileId,
    email_normalized: email,
    outcome,
    matches_count: matches,
    message: message.slice(0, 500),
  });
}

/** Verifica se outro perfil do Tracker já usa esse usuário do CRM. */
export async function crmUserAlreadyLinked(crmUserId: string, exceptProfileId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, name, email")
    .eq("crm_user_id", crmUserId)
    .neq("id", exceptProfileId)
    .maybeSingle();
  return data ?? null;
}

/** Grava o vínculo confirmado. */
export async function saveCrmLink(
  profileId: string,
  seller: CrmSeller,
): Promise<CrmLinkDiagnostics> {
  const baseDiagnostics: CrmLinkDiagnostics = {
    matched_crm_user_id: seller.id,
    target_profile_id: profileId,
    update_success: false,
    persisted_crm_user_id: null,
    error_code: null,
  };

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("profiles")
    .update({
      crm_user_id: seller.id,
      crm_name: seller.name || null,
      crm_email: seller.email || null,
      crm_link_status: "linked",
      crm_linked_at: new Date().toISOString(),
      crm_last_attempt_at: new Date().toISOString(),
      crm_last_error: null,
    })
    .eq("id", profileId)
    .select("id, crm_user_id")
    .maybeSingle();

  if (updateError) {
    throw new CrmLinkPersistenceError(updateError.message, {
      ...baseDiagnostics,
      error_code: updateError.code || "CRM_LINK_UPDATE_FAILED",
    });
  }
  if (!updated) {
    throw new CrmLinkPersistenceError("O perfil alvo não foi encontrado para atualização.", {
      ...baseDiagnostics,
      error_code: "PROFILE_NOT_FOUND",
    });
  }

  // Leitura separada: o sucesso só é confirmado a partir do estado persistido.
  const { data: persisted, error: readError } = await supabaseAdmin
    .from("profiles")
    .select("crm_user_id")
    .eq("id", profileId)
    .maybeSingle();

  if (readError) {
    throw new CrmLinkPersistenceError(readError.message, {
      ...baseDiagnostics,
      persisted_crm_user_id: updated.crm_user_id,
      error_code: readError.code || "CRM_LINK_VERIFY_FAILED",
    });
  }

  const diagnostics: CrmLinkDiagnostics = {
    ...baseDiagnostics,
    update_success: persisted?.crm_user_id === seller.id,
    persisted_crm_user_id: persisted?.crm_user_id ?? null,
    error_code: persisted?.crm_user_id === seller.id ? null : "CRM_LINK_PERSISTENCE_MISMATCH",
  };
  if (!diagnostics.update_success) {
    throw new CrmLinkPersistenceError(
      "O banco não confirmou a persistência do vínculo com o CRM.",
      diagnostics,
    );
  }

  return diagnostics;
}

/**
 * Tenta vincular automaticamente pelo e-mail.
 * Nunca lança: falhas de integração não podem quebrar cadastro nem login.
 */
export async function attemptAutoLink(
  profile: { id: string; email: string; crm_user_id: string | null; crm_last_attempt_at?: string | null },
  options: { force?: boolean } = {},
): Promise<CrmLinkResult> {
  if (profile.crm_user_id) {
    return { outcome: "already_linked", message: "Perfil já vinculado ao CRM United.", candidates: [] };
  }

  if (!options.force && profile.crm_last_attempt_at) {
    const last = new Date(profile.crm_last_attempt_at).getTime();
    if (Number.isFinite(last) && Date.now() - last < RETRY_INTERVAL_MS) {
      return { outcome: "not_found", message: "Tentativa recente; aguardando novo intervalo.", candidates: [] };
    }
  }

  const email = normalizeEmail(profile.email ?? "");
  const now = new Date().toISOString();

  try {
    const result = await findCrmSellerByEmail(email);

    if (!result.ok) {
      await supabaseAdmin
        .from("profiles")
        .update({ crm_link_status: "error", crm_last_attempt_at: now, crm_last_error: result.error })
        .eq("id", profile.id);
      await log(profile.id, email, "error", 0, result.error);
      return { outcome: "error", message: result.error, candidates: [] };
    }

    const matches = result.matches;

    if (matches.length === 0) {
      await supabaseAdmin
        .from("profiles")
        .update({ crm_link_status: "unlinked", crm_last_attempt_at: now, crm_last_error: null })
        .eq("id", profile.id);
      await log(profile.id, email, "not_found", 0, "Nenhum vendedor encontrado.");
      return {
        outcome: "not_found",
        message: "Nenhum vendedor do CRM United encontrado com este e-mail.",
        candidates: [],
      };
    }

    // Preferimos correspondências marcadas como vendedor no CRM.
    const sellers = matches.filter((m) => (m.role ?? "").toLowerCase() === "vendedor");
    const pool = sellers.length > 0 ? sellers : matches;

    if (pool.length > 1) {
      await supabaseAdmin
        .from("profiles")
        .update({ crm_link_status: "needs_review", crm_last_attempt_at: now, crm_last_error: null })
        .eq("id", profile.id);
      await log(profile.id, email, "needs_review", pool.length, "Múltiplas correspondências.");
      return {
        outcome: "needs_review",
        message: "Mais de um vendedor do CRM United corresponde a este e-mail.",
        candidates: pool,
      };
    }

    const seller = pool[0]!;
    const conflict = await crmUserAlreadyLinked(seller.id, profile.id);
    if (conflict) {
      const message = `Este usuário do CRM já está vinculado a ${conflict.name} (${conflict.email}).`;
      await supabaseAdmin
        .from("profiles")
        .update({ crm_link_status: "error", crm_last_attempt_at: now, crm_last_error: message })
        .eq("id", profile.id);
      await log(profile.id, email, "error", 1, message);
      return { outcome: "error", message, candidates: pool };
    }

    const diagnostics = await saveCrmLink(profile.id, seller);
    await log(profile.id, email, "linked", 1, `Vinculado a ${seller.id}.`);
    return {
      outcome: "linked",
      message: `Vinculado a ${seller.name || seller.email}.`,
      candidates: pool,
      diagnostics,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado na integração.";
    console.error("[CRM United] falha ao vincular perfil", profile.id, message);
    const diagnostics = error instanceof CrmLinkPersistenceError
      ? error.diagnostics
      : {
          matched_crm_user_id: null,
          target_profile_id: profile.id,
          update_success: false,
          persisted_crm_user_id: null,
          error_code: "CRM_LINK_UNEXPECTED_ERROR",
        };
    await supabaseAdmin
      .from("profiles")
      .update({ crm_link_status: "error", crm_last_attempt_at: now, crm_last_error: message })
      .eq("id", profile.id);
    await log(profile.id, email, "error", 0, message);
    return { outcome: "error", message, candidates: [], diagnostics };
  }
}
