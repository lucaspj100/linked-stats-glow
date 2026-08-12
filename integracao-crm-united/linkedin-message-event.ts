// COPIAR PARA O PROJETO CRM UNITED EM: src/routes/api/public/linkedin-message-event.ts
// Recebe do LinkedIn Message Tracker um evento de mensagem enviada e cria uma
// atividade de LinkedIn (origem `linkedin_tracker`) para o vendedor indicado.
// Nunca recebe conteúdo de mensagem, conversa ou credenciais da extensão.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  event_id: z.string().uuid(),
  crm_user_id: z.string().uuid(),
  sent_at: z.string().datetime(),
  source: z.literal("linkedin_tracker").optional(),
  installation_id: z.string().max(64).nullable().optional(),
  tracker_user_id: z.string().max(64).nullable().optional(),
});

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/linkedin-message-event")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["TRACKER_INTEGRATION_SECRET"];
        if (!secret) return json({ error: "not_configured" }, 503);

        const provided = request.headers.get("x-tracker-secret") ?? "";
        if (!safeEqual(provided, secret)) return json({ error: "unauthorized" }, 401);

        let parsed: z.infer<typeof schema>;
        try {
          parsed = schema.parse(await request.json());
        } catch {
          return json({ error: "invalid_payload" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // O vendedor precisa existir no CRM; nunca casar por nome.
        const { data: seller } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("id", parsed.crm_user_id)
          .maybeSingle();

        if (!seller) return json({ error: "seller_not_found" }, 404);

        const { error } = await supabaseAdmin.from("linkedin_tracker_events").insert({
          vendedor_id: parsed.crm_user_id,
          source: "linkedin_tracker",
          external_event_id: parsed.event_id,
          sent_at: parsed.sent_at,
          installation_id: parsed.installation_id ?? null,
          tracker_user_id: parsed.tracker_user_id ?? null,
        });

        if (error) {
          // 23505 = índice único (source, external_event_id): evento já registrado.
          if ((error as { code?: string }).code === "23505") {
            return json({ ok: true, duplicate: true }, 200);
          }
          return json({ error: "insert_failed" }, 500);
        }

        return json({ ok: true, duplicate: false }, 200);
      },
    },
  },
});
