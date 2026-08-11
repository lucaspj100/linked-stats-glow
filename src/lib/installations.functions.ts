import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sha256Hex } from "@/lib/token-hash";

export type Installation = {
  id: string;
  label: string;
  person_name: string;
  linkedin_account: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
};

export const listInstallations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Installation[]> => {
    const { data, error } = await context.supabase
      .from("extension_installations")
      .select("id, label, person_name, linkedin_account, is_active, last_used_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Não foi possível carregar as instalações.");
    return (data ?? []) as Installation[];
  });

const createSchema = z.object({
  label: z.string().trim().min(1).max(80),
  personName: z.string().trim().min(1).max(120),
});

export const createInstallation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data, context }) => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

    const { data: row, error } = await context.supabase
      .from("extension_installations")
      .insert({
        label: data.label,
        person_name: data.personName,
        // Coluna mantida por compatibilidade: a contagem é por vendedor.
        linkedin_account: "Geral",
        token_hash: await sha256Hex(token),
      })
      .select("id")
      .single();


    if (error || !row) throw new Error("Não foi possível criar a instalação.");
    // O token em texto claro é retornado UMA única vez.
    return { installationId: row.id as string, token };
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
