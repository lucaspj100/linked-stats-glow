// COPIAR PARA O PROJETO CRM UNITED EM: src/routes/api/public/find-seller-by-email.ts
// Endpoint seguro consumido pelo LinkedIn Message Tracker para localizar um
// vendedor pelo e-mail. Protegido por segredo compartilhado; devolve apenas
// dados mínimos (id, nome, e-mail, papel).
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({ email: z.string().trim().email().max(200) });

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

export const Route = createFileRoute("/api/public/find-seller-by-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["TRACKER_INTEGRATION_SECRET"];
        if (!secret) return json({ error: "not_configured" }, 503);

        const provided = request.headers.get("x-tracker-secret") ?? "";
        if (!safeEqual(provided, secret)) return json({ error: "unauthorized" }, 401);

        let parsed: { email: string };
        try {
          parsed = schema.parse(await request.json());
        } catch {
          return json({ error: "invalid_payload" }, 400);
        }

        const email = parsed.email.trim().toLowerCase();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: profiles, error } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, email")
          .ilike("email", email)
          .limit(5);

        if (error) return json({ error: "lookup_failed" }, 500);

        const rows = (profiles ?? []).filter(
          (p) => (p.email ?? "").trim().toLowerCase() === email,
        );

        if (rows.length === 0) return json({ matches: [] }, 200);

        const { data: roles } = await supabaseAdmin
          .from("user_roles")
          .select("user_id, role")
          .in(
            "user_id",
            rows.map((r) => r.id),
          );

        const matches = rows.map((r) => ({
          id: r.id,
          name: r.full_name ?? "",
          email: (r.email ?? "").trim().toLowerCase(),
          role: roles?.find((x) => x.user_id === r.id)?.role ?? null,
          active: true,
        }));

        return json({ matches }, 200);
      },
    },
  },
});
