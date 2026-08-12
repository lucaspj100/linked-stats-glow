// Integração server-only com o CRM United.
// Nenhuma credencial do CRM chega ao navegador: o segredo compartilhado vive
// apenas em variáveis de ambiente e é usado somente aqui.

export type CrmSeller = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  active: boolean | null;
};

export type CrmLookupResult =
  | { ok: true; matches: CrmSeller[] }
  | { ok: false; error: string };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Consulta o CRM United por e-mail e devolve apenas dados mínimos do vendedor. */
export async function findCrmSellerByEmail(rawEmail: string): Promise<CrmLookupResult> {
  const email = normalizeEmail(rawEmail);
  if (!email || !email.includes("@")) {
    return { ok: false, error: "E-mail inválido." };
  }

  const baseUrl = process.env["CRM_UNITED_API_URL"];
  const secret = process.env["CRM_UNITED_API_SECRET"];

  if (!baseUrl || !secret) {
    return {
      ok: false,
      error: "Integração com o CRM United não configurada (URL ou segredo ausente).",
    };
  }

  const url = `${baseUrl.replace(/\/+$/, "")}/api/public/find-seller-by-email`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tracker-secret": secret,
      },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: "CRM United recusou a autenticação da integração." };
    }
    if (!response.ok) {
      return { ok: false, error: `CRM United indisponível (HTTP ${response.status}).` };
    }

    const payload = (await response.json()) as { matches?: unknown };
    const list = Array.isArray(payload.matches) ? payload.matches : [];

    const matches: CrmSeller[] = list
      .map((item) => {
        const row = (item ?? {}) as Record<string, unknown>;
        const id = row["id"] == null ? "" : String(row["id"]);
        const mail = row["email"] == null ? "" : String(row["email"]);
        if (!id) return null;
        return {
          id,
          name: row["name"] == null ? "" : String(row["name"]),
          email: normalizeEmail(mail),
          role: row["role"] == null ? null : String(row["role"]),
          active: typeof row["active"] === "boolean" ? (row["active"] as boolean) : null,
        } satisfies CrmSeller;
      })
      .filter((m): m is CrmSeller => m !== null && m.email === email && m.active !== false);

    return { ok: true, matches };
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    return { ok: false, error: `Falha ao contatar o CRM United: ${message}` };
  }
}
