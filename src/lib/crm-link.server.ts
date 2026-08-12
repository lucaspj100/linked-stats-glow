// Regras de vínculo entre um perfil do Tracker e um usuário do CRM United.
// Server-only: usa o cliente administrativo e nunca é importado pelo cliente.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { findCrmSellerByEmail, normalizeEmail, type CrmSeller } from "./crm-united.server";

export type CrmLinkOutcome = "linked" | "already_linked" | "not_found" | "needs_review" | "error";

export type CrmLinkResult = {
  outcome: CrmLinkOutcome;
  message: string;
  candidates: CrmSeller[];
};

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
export async function saveCrmLink(profileId: string, seller: CrmSeller) {
  await supabaseAdmin
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
    .eq("id", profileId);
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

    await saveCrmLink(profile.id, seller);
    await log(profile.id, email, "linked", 1, `Vinculado a ${seller.id}.`);
    return { outcome: "linked", message: `Vinculado a ${seller.name || seller.email}.`, candidates: pool };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado na integração.";
    console.error("[CRM United] falha ao vincular perfil", profile.id, message);
    return { outcome: "error", message, candidates: [] };
  }
}
