import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AppRole = "admin" | "seller";

export type Profile = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  crm_user_id: string | null;
  active: boolean;
  created_at: string;
};

export type SessionProfile = { profile: Profile; role: AppRole };

const PROFILE_COLUMNS = "id, user_id, name, email, phone, crm_user_id, active, created_at";

/**
 * Retorna (e cria, se necessário) o perfil do usuário autenticado.
 * O primeiro usuário do sistema recebe o papel `admin`; os demais, `seller`.
 */
export const getMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SessionProfile> => {
    const { userId, claims } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const meta = ((claims as Record<string, unknown>)["user_metadata"] ?? {}) as Record<
      string,
      unknown
    >;
    const email = String((claims as Record<string, unknown>)["email"] ?? "");

    let { data: profile } = await supabaseAdmin
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile) {
      const fallbackName = email.split("@")[0] || "Vendedor";
      const { data: created, error } = await supabaseAdmin
        .from("profiles")
        .insert({
          user_id: userId,
          name: String(meta["full_name"] ?? meta["name"] ?? fallbackName).slice(0, 120),
          email,
          phone: meta["phone"] ? String(meta["phone"]).slice(0, 40) : null,
        })
        .select(PROFILE_COLUMNS)
        .single();
      if (error || !created) throw new Error("Não foi possível criar o perfil.");
      profile = created;
    }

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    let role = (roles?.[0]?.role ?? null) as AppRole | null;
    if (!role) {
      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      role = (count ?? 0) === 0 ? "admin" : "seller";
      await supabaseAdmin.from("user_roles").insert({ user_id: userId, role });
    }

    return { profile: profile as Profile, role };
  });

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional().nullable(),
});

/** Vendedor altera apenas nome e telefone (RLS + trigger bloqueiam o resto). */
export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateSchema.parse(data))
  .handler(async ({ data, context }): Promise<Profile> => {
    const { data: row, error } = await context.supabase
      .from("profiles")
      .update({ name: data.name, phone: data.phone || null })
      .eq("user_id", context.userId)
      .select(PROFILE_COLUMNS)
      .single();
    if (error || !row) throw new Error("Não foi possível atualizar o perfil.");
    return row as Profile;
  });

/** Lista todos os vendedores — apenas administradores (validado no banco pela RLS). */
export const listSellers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Profile[]> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");

    const { data, error } = await context.supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Não foi possível carregar os vendedores.");
    return (data ?? []) as Profile[];
  });

const adminUpdateSchema = z.object({
  profileId: z.string().uuid(),
  active: z.boolean().optional(),
  crmUserId: z.string().trim().max(120).optional().nullable(),
});

/** Administrador ativa/desativa um vendedor e define o vínculo com o CRM United. */
export const adminUpdateSeller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => adminUpdateSchema.parse(data))
  .handler(async ({ data, context }): Promise<Profile> => {
    const patch: { active?: boolean; crm_user_id?: string | null } = {};
    if (data.active !== undefined) patch.active = data.active;
    if (data.crmUserId !== undefined) patch.crm_user_id = data.crmUserId || null;

    const { data: row, error } = await context.supabase
      .from("profiles")
      .update(patch)
      .eq("id", data.profileId)
      .select(PROFILE_COLUMNS)
      .single();
    if (error || !row) throw new Error("Não foi possível atualizar o vendedor.");
    return row as Profile;
  });
