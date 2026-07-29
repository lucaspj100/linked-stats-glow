import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export type MessageEvent = {
  id: string;
  person_name: string;
  linkedin_account: string;
  sent_at: string;
};

const inputSchema = z.object({ since: z.string() });

export const fetchMessageEvents = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<MessageEvent[]> => {
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );

    const { data: rows, error } = await supabase
      .from("message_events")
      .select("id, person_name, linkedin_account, sent_at")
      .gte("sent_at", data.since)
      .order("sent_at", { ascending: false })
      .limit(20000);

    if (error) throw new Error(error.message);
    return (rows ?? []) as MessageEvent[];
  });
