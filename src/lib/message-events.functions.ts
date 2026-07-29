import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MessageEvent = {
  id: string;
  person_name: string;
  linkedin_account: string;
  sent_at: string;
};

const inputSchema = z.object({ since: z.string().datetime() });

export const fetchMessageEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }): Promise<MessageEvent[]> => {
    const { data: rows, error } = await context.supabase
      .from("message_events")
      .select("id, person_name, linkedin_account, sent_at")
      .gte("sent_at", data.since)
      .order("sent_at", { ascending: false })
      .limit(20000);

    if (error) throw new Error("Não foi possível carregar os eventos.");
    return (rows ?? []) as MessageEvent[];
  });
