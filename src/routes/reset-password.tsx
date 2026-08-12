import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Redefinir senha — LinkedIn Message Tracker" },
      { name: "description", content: "Redefina a senha da sua conta do LinkedIn Message Tracker." },
      { property: "og:title", content: "Redefinir senha — LinkedIn Message Tracker" },
      { property: "og:description", content: "Redefina a senha da sua conta do LinkedIn Message Tracker." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function establishRecoverySession() {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash") ?? url.searchParams.get("token");
      const recoveryType = url.searchParams.get("type") ?? hash.get("type");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      try {
        if (recoveryType && recoveryType !== "recovery") {
          throw new Error("Este link não é um link de redefinição de senha.");
        }
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
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });
          if (error) throw error;
        }

        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) throw new Error("O link expirou ou já foi utilizado. Solicite outro link.");
        if (!cancelled) setReady(true);
      } catch (error) {
        console.error("[auth] recovery callback:", (error as Error).message);
        if (!cancelled) setMessage((error as Error).message);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    void establishRecoverySession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function updatePassword(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (password.length < 8) {
      setMessage("Use uma senha com pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      console.error("[auth] updateUser password:", error.code ?? error.status, error.message);
      setMessage(error.message);
      return;
    }
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <form onSubmit={updatePassword} className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Redefinir senha</h1>
          <p className="text-xs text-muted-foreground">Escolha uma nova senha para sua conta.</p>
        </div>

        {checking && <p className="text-xs text-muted-foreground">Validando link…</p>}
        {ready && (
          <>
            <Input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Nova senha"
            />
            <Input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirmar nova senha"
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Salvando…" : "Salvar nova senha"}
            </Button>
          </>
        )}

        {message && <p className="text-xs text-destructive">{message}</p>}
        {!checking && !ready && (
          <Button type="button" variant="outline" className="w-full" onClick={() => navigate({ to: "/auth", replace: true })}>
            Solicitar outro link
          </Button>
        )}
      </form>
    </main>
  );
}