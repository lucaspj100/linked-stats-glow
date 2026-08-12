import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — LinkedIn Message Tracker" },
      { name: "description", content: "Acesso restrito ao painel interno de prospecção do time." },
      { property: "og:title", content: "Entrar — LinkedIn Message Tracker" },
      {
        property: "og:description",
        content: "Acesso restrito ao painel interno de prospecção do time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function friendlyError(error: { message: string; code?: string; status?: number }): string {
  const code = error.code ?? "";
  const msg = error.message.toLowerCase();
  if (code === "email_not_confirmed" || msg.includes("not confirmed"))
    return "E-mail ainda não confirmado. Use o botão abaixo para reenviar a confirmação.";
  if (code === "invalid_credentials" || msg.includes("invalid login"))
    return "E-mail ou senha incorretos.";
  if (code === "user_already_exists" || msg.includes("already registered"))
    return "Já existe uma conta com este e-mail. Faça login (ou reenvie a confirmação).";
  if (code === "over_email_send_rate_limit" || error.status === 429)
    return "Muitas tentativas seguidas. Aguarde cerca de 1 minuto e tente novamente.";
  if (code === "weak_password" || msg.includes("password"))
    return "Senha inválida: use ao menos 8 caracteres.";
  if (msg.includes("missing supabase") || msg.includes("fetch"))
    return "Falha de configuração/conexão com o servidor. Tente novamente em instantes.";
  return error.message;
}

function AuthPage() {
  const navigate = useNavigate();
  const [checkingSession, setCheckingSession] = useState(true);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);

  // Evita a corrida "sessão existe mas a tela de login continua aparecendo".
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) navigate({ to: "/", replace: true });
      else setCheckingSession(false);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const normalizedEmail = email.trim().toLowerCase();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setNotice(null);
    setNeedsConfirmation(false);

    if (mode === "signin") {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      setLoading(false);
      if (error) {
        console.error("[auth] signIn:", error.code ?? error.status, error.message);
        setMessage(friendlyError(error));
        if (
          error.code === "email_not_confirmed" ||
          error.message.toLowerCase().includes("not confirmed")
        ) {
          setNeedsConfirmation(true);
        }
        return;
      }
      if (!data.session) {
        setMessage("Sessão inválida. Tente novamente.");
        return;
      }
      try {
        const { getMyProfile } = await import("@/lib/profiles.functions");
        await getMyProfile({ data: undefined });
      } catch (profileError) {
        console.error("[auth] perfil:", (profileError as Error).message);
      }
      navigate({ to: "/", replace: true });
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { full_name: fullName.trim(), phone: phone.trim() || null },
      },
    });
    setLoading(false);
    if (error) {
      console.error("[auth] signUp:", error.code ?? error.status, error.message);
      setMessage(friendlyError(error));
      if (error.code === "user_already_exists") setNeedsConfirmation(true);
      return;
    }
    // Usuário já existente: o Supabase devolve identities vazio, sem criar outra conta.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setMode("signin");
      setNeedsConfirmation(true);
      setNotice("Este e-mail já tem conta. Faça login ou reenvie a confirmação.");
      return;
    }
    if (!data.session) {
      setNeedsConfirmation(true);
      setNotice("Conta criada. Confirme o e-mail pelo link enviado e volte para entrar.");
      return;
    }
    navigate({ to: "/", replace: true });
  }

  async function resendConfirmation() {
    if (!normalizedEmail) {
      setMessage("Informe o e-mail para reenviar a confirmação.");
      return;
    }
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: normalizedEmail,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) {
      console.error("[auth] resend:", error.code ?? error.status, error.message);
      setMessage(friendlyError(error));
      return;
    }
    setNotice("Novo e-mail de confirmação enviado. Verifique a caixa de entrada e o spam.");
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <p className="text-xs text-muted-foreground">Verificando sessão…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6"
      >
        <div>
          <h1 className="text-lg font-semibold text-foreground">LinkedIn Message Tracker</h1>
          <p className="text-xs text-muted-foreground">
            Painel interno · acesso restrito ao time.
          </p>
        </div>

        {mode === "signup" && (
          <input
            type="text"
            required
            minLength={2}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nome completo"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        )}

        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail corporativo"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <input
          type="password"
          required
          minLength={8}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Senha"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        {mode === "signup" && (
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Telefone (opcional)"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {loading ? "Aguarde…" : mode === "signin" ? "Entrar" : "Criar conta"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setMessage(null);
            setNotice(null);
          }}
          className="w-full text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "Não tem acesso? Criar conta" : "Já tem conta? Entrar"}
        </button>

        {needsConfirmation && (
          <button
            type="button"
            onClick={resendConfirmation}
            disabled={loading}
            className="w-full rounded-lg border border-input px-3 py-2 text-xs font-medium text-foreground disabled:opacity-60"
          >
            Reenviar e-mail de confirmação
          </button>
        )}

        {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
        {message && <p className="text-xs text-destructive">{message}</p>}
      </form>
    </main>
  );
}
