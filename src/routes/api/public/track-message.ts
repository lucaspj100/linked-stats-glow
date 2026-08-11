import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { sha256Hex } from "@/lib/token-hash";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const bodySchema = z.object({
  installation_id: z.string().uuid(),
  installation_token: z.string().min(32).max(200),
  event_id: z.string().uuid(),
  person_name: z.string().trim().min(1).max(120),
  linkedin_account: z.string().trim().min(1).max(120),
  sent_at: z.string().datetime(),
  url: z.string().max(2000).optional().nullable(),
});

export const Route = createFileRoute("/api/public/track-message")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return json({ ok: false, error: "invalid_payload" }, 400);
        }

        // Janela temporal: evita replay de eventos antigos ou datados no futuro.
        const sentAt = new Date(parsed.sent_at).getTime();
        const now = Date.now();
        if (sentAt < now - 24 * 60 * 60 * 1000 || sentAt > now + 60 * 60 * 1000) {
          return json({ ok: false, error: "sent_at_out_of_range" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: install, error: installError } = await supabaseAdmin
          .from("extension_installations")
          .select("id, token_hash, is_active")
          .eq("id", parsed.installation_id)
          .maybeSingle();

        if (installError) return json({ ok: false, error: "lookup_failed" }, 500);
        if (!install || !install.is_active) return json({ ok: false, error: "unauthorized" }, 401);

        const providedHash = await sha256Hex(parsed.installation_token);
        const expected = install.token_hash as string;
        if (
          providedHash.length !== expected.length ||
          !providedHash.split("").every((c, i) => c === expected[i])
        ) {
          return json({ ok: false, error: "unauthorized" }, 401);
        }

        const { error: insertError } = await supabaseAdmin.from("message_events").insert({
          event_id: parsed.event_id,
          installation_id: install.id,
          person_name: parsed.person_name,
          linkedin_account: parsed.linkedin_account,
          sent_at: parsed.sent_at,
          url: parsed.url ?? null,
        });

        if (insertError) {
          // 23505 = violação de índice único (event_id) => evento duplicado.
          if ((insertError as { code?: string }).code === "23505") {
            return json({ ok: true, duplicate: true });
          }
          return json({ ok: false, error: "insert_failed" }, 500);
        }

        await supabaseAdmin
          .from("extension_installations")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", install.id);

        return json({ ok: true, duplicate: false });
      },
    },
  },
});
