import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PUBLISHED_ORIGIN = "https://linked-stats-glow.lovable.app";

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
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
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
          error.message.toLowerCase().includes("not confirmed") ||
          error.code === "invalid_credentials" ||
          error.message.toLowerCase().includes("invalid login")
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
        await supabase.auth.signOut();
        setMessage("O acesso foi autenticado, mas não foi possível preparar o perfil. Tente novamente.");
        return;
      }
      navigate({ to: "/", replace: true });
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: `${PUBLISHED_ORIGIN}/auth/callback`,
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
      setNotice(
        "Este e-mail já tem conta. A senha informada agora não substituiu a senha existente. Reenvie a confirmação ou use “Esqueci minha senha”.",
      );
      return;
    }
    if (!data.session) {
      setNeedsConfirmation(true);
      setNotice("Conta criada. Confirme o e-mail pelo link enviado e volte para entrar.");
      return;
    }
    try {
      const { getMyProfile } = await import("@/lib/profiles.functions");
      await getMyProfile({ data: undefined });
    } catch (profileError) {
      console.error("[auth] perfil após cadastro:", (profileError as Error).message);
      await supabase.auth.signOut();
      setMessage("A conta foi criada, mas não foi possível preparar o perfil. Tente entrar novamente.");
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
      options: { emailRedirectTo: `${PUBLISHED_ORIGIN}/auth/callback` },
    });
    setLoading(false);
    if (error) {
      console.error("[auth] resend:", error.code ?? error.status, error.message);
      setMessage(friendlyError(error));
      return;
    }
    setNotice("Novo e-mail de confirmação enviado. Verifique a caixa de entrada e o spam.");
  }

  async function requestPasswordReset(e: React.FormEvent) {
    e.preventDefault();
    if (!normalizedEmail) {
      setMessage("Informe o e-mail da conta.");
      return;
    }
    setLoading(true);
    setMessage(null);
    setNotice(null);
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${PUBLISHED_ORIGIN}/reset-password`,
    });
    setLoading(false);
    if (error) {
      console.error("[auth] resetPasswordForEmail:", error.code ?? error.status, error.message);
      setMessage(friendlyError(error));
      return;
    }
    setNotice(
      "Se a conta existir, enviaremos um link para redefinir a senha. Verifique a caixa de entrada e o spam.",
    );
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
        onSubmit={mode === "forgot" ? requestPasswordReset : onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6"
      >
        <div>
          <h1 className="text-lg font-semibold text-foreground">LinkedIn Message Tracker</h1>
          <p className="text-xs text-muted-foreground">
            Painel interno · acesso restrito ao time.
          </p>
        </div>

        {mode === "signup" && (
          <Input
            type="text"
            required
            minLength={2}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nome completo"
          />
        )}

        <Input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail corporativo"
        />
        {mode !== "forgot" && (
          <Input
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha"
          />
        )}
        {mode === "signup" && (
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Telefone (opcional)"
          />
        )}

        <Button
          type="submit"
          disabled={loading}
          className="w-full"
        >
          {loading
            ? "Aguarde…"
            : mode === "signin"
              ? "Entrar"
              : mode === "signup"
                ? "Criar conta"
                : "Enviar link de redefinição"}
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setMessage(null);
            setNotice(null);
          }}
          className="w-full text-xs"
        >
          {mode === "signup" ? "Já tem conta? Entrar" : "Não tem acesso? Criar conta"}
        </Button>

        {mode !== "signup" && (
          <Button
            type="button"
            variant="link"
            onClick={() => {
              setMode(mode === "forgot" ? "signin" : "forgot");
              setMessage(null);
              setNotice(null);
              setNeedsConfirmation(false);
            }}
            className="w-full text-xs"
          >
            {mode === "forgot" ? "Voltar ao login" : "Esqueci minha senha"}
          </Button>
        )}

        {needsConfirmation && (
          <Button
            type="button"
            variant="outline"
            onClick={resendConfirmation}
            disabled={loading}
            className="w-full text-xs"
          >
            Reenviar e-mail de confirmação
          </Button>
        )}

        {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
        {message && <p className="text-xs text-destructive">{message}</p>}
      </form>
    </main>
  );
}
