import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth_/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Confirmando acesso — LinkedIn Message Tracker" },
      {
        name: "description",
        content: "Confirmação de e-mail e criação de sessão no painel interno de prospecção.",
      },
      { property: "og:title", content: "Confirmando acesso — LinkedIn Message Tracker" },
      {
        property: "og:description",
        content: "Confirmação de e-mail e criação de sessão no painel interno de prospecção.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthCallback,
});

/**
 * Rota pública que finaliza o link de confirmação de e-mail.
 * Cobre os três formatos que o Supabase pode devolver:
 *  - PKCE: ?code=...            -> exchangeCodeForSession
 *  - OTP:  ?token_hash=&type=   -> verifyOtp
 *  - implícito: #access_token=  -> setSession
 */
function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const url = new URL(window.location.href);
      const params = url.searchParams;
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

      const errorDescription =
        params.get("error_description") ?? hash.get("error_description") ?? null;
      const errorCode = params.get("error_code") ?? hash.get("error_code") ?? null;

      try {
        if (errorDescription || errorCode) {
          throw new Error(
            errorCode === "otp_expired"
              ? "O link de confirmação expirou. Peça um novo e-mail de confirmação na tela de login."
              : (errorDescription ?? "Não foi possível confirmar o e-mail."),
          );
        }

        const code = params.get("code");
        const tokenHash = params.get("token_hash") ?? params.get("token");
        const type = (params.get("type") ?? "signup") as
          | "signup"
          | "magiclink"
          | "recovery"
          | "invite"
          | "email_change";
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
          if (error) throw error;
        }

        // Sessão precisa existir de fato antes de tocar em rota protegida.
        const { data, error: userError } = await supabase.auth.getUser();
        if (userError || !data.user) {
          throw new Error(
            "E-mail confirmado, mas a sessão não foi criada neste navegador. Entre com e-mail e senha.",
          );
        }

        // Garante profile + role antes de liberar a rota protegida.
        const { getMyProfile } = await import("@/lib/profiles.functions");
        await getMyProfile({ data: undefined });

        if (!cancelled) navigate({ to: "/", replace: true });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm space-y-3 rounded-xl border border-border bg-card p-6 text-center">
        <h1 className="text-base font-semibold text-foreground">
          {error ? "Não foi possível confirmar" : "Confirmando seu acesso…"}
        </h1>
        {error ? (
          <>
            <p className="text-xs text-destructive">{error}</p>
            <button
              onClick={() => navigate({ to: "/auth", replace: true })}
              className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Ir para o login
            </button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Validando o link de confirmação e criando sua sessão.
          </p>
        )}
      </div>
    </main>
  );
}
