import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sha256Hex } from "@/lib/token-hash";

export type Installation = {
  id: string;
  label: string;
  device_name: string | null;
  person_name: string;
  linkedin_account: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  seller_user_id: string | null;
};

const SELECT_COLUMNS =
  "id, label, device_name, person_name, linkedin_account, is_active, last_used_at, created_at, seller_user_id";

/** Lista todas as instalações visíveis ao usuário (RLS: próprias ou todas, se admin). */
export const listInstallations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Installation[]> => {
    const { data, error } = await context.supabase
      .from("extension_installations")
      .select(SELECT_COLUMNS)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Não foi possível carregar as instalações.");
    return (data ?? []) as Installation[];
  });

/** Lista apenas as instalações do vendedor autenticado. */
export const listMyInstallations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Installation[]> => {
    const { data, error } = await context.supabase
      .from("extension_installations")
      .select(SELECT_COLUMNS)
      .eq("seller_user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Não foi possível carregar suas instalações.");
    return (data ?? []) as Installation[];
  });

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const createSchema = z.object({
  label: z.string().trim().min(1).max(80),
  personName: z.string().trim().min(1).max(120),
});

export const createInstallation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data, context }) => {
    const token = generateToken();

    const { data: row, error } = await context.supabase
      .from("extension_installations")
      .insert({
        label: data.label,
        device_name: data.label,
        person_name: data.personName,
        // Coluna mantida por compatibilidade: a contagem é por vendedor.
        linkedin_account: "Geral",
        token_hash: await sha256Hex(token),
        token_secret: token,
        seller_user_id: context.userId,
      })
      .select("id")
      .single();

    if (error || !row) throw new Error("Não foi possível criar a instalação.");
    // O token em texto claro também fica disponível em "Minha extensão".
    return { installationId: row.id as string, token };
  });

const myCreateSchema = z.object({
  deviceName: z.string().trim().max(80).optional(),
});

/** Cria uma instalação para o próprio vendedor autenticado. */
export const createMyInstallation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => myCreateSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("name")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (profileError || !profile) throw new Error("Perfil não encontrado.");

    const { count } = await context.supabase
      .from("extension_installations")
      .select("id", { count: "exact", head: true })
      .eq("seller_user_id", context.userId);

    const deviceName = data.deviceName?.trim() || `Computador ${(count ?? 0) + 1}`;
    const token = generateToken();

    const { data: row, error } = await context.supabase
      .from("extension_installations")
      .insert({
        label: deviceName,
        device_name: deviceName,
        person_name: profile.name as string,
        linkedin_account: "Geral",
        token_hash: await sha256Hex(token),
        token_secret: token,
        seller_user_id: context.userId,
      })
      .select("id")
      .single();

    if (error || !row) throw new Error("Não foi possível criar a instalação.");
    return { installationId: row.id as string, token, deviceName };
  });

const idSchema = z.object({ id: z.string().uuid() });

/** Revela o token de uma instalação — apenas para o dono ou para um admin. */
export const revealInstallationToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ token: string | null }> => {
    // A RLS garante que só o dono (ou admin) enxerga a linha.
    const { data: visible, error } = await context.supabase
      .from("extension_installations")
      .select("id")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !visible) throw new Error("Instalação não encontrada.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("extension_installations")
      .select("token_secret")
      .eq("id", data.id)
      .maybeSingle();

    return { token: (row?.token_secret as string | null) ?? null };
  });

const renameSchema = z.object({
  id: z.string().uuid(),
  deviceName: z.string().trim().min(1).max(80),
});

export const renameInstallation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => renameSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("extension_installations")
      .update({ device_name: data.deviceName, label: data.deviceName })
      .eq("id", data.id);
    if (error) throw new Error("Não foi possível renomear a instalação.");
    return { ok: true };
  });

const toggleSchema = z.object({ id: z.string().uuid(), isActive: z.boolean() });

export const setInstallationActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => toggleSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("extension_installations")
      .update({ is_active: data.isActive })
      .eq("id", data.id);
    if (error) throw new Error("Não foi possível atualizar a instalação.");
    return { ok: true };
  });
