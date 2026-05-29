import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

import { API_BASE_URL, IS_LOCAL_BACKEND } from "@/lib/api/config";
import { mapAuthErrorMessage } from "@/lib/backend-health";
import { useBackendStatus } from "@/hooks/use-backend-status";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { status: backendStatus } = useBackendStatus(IS_LOCAL_BACKEND);

  useEffect(() => {
    api.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const handleAuth = async (mode: "signin" | "signup") => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      toast.error("Informe email e senha.");
      return;
    }
    if (IS_LOCAL_BACKEND && backendStatus === "offline") {
      toast.error("Backend indisponível. Inicie o servidor Flask antes de entrar.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await api.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (error) throw error;
        toast.success("Bem-vindo de volta");
        navigate({ to: "/dashboard" });
      } else {
        const { error } = await api.auth.signUp({
          email: trimmedEmail,
          password,
        });
        if (error) throw error;
        toast.success("Conta criada com sucesso.");
        navigate({ to: "/dashboard" });
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Falha na autenticação";
      toast.error(mapAuthErrorMessage(message));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>, mode: "signin" | "signup") => {
    event.preventDefault();
    if (!loading) void handleAuth(mode);
  };

  const backendBlocked = IS_LOCAL_BACKEND && backendStatus === "offline";
  const submitDisabled = loading || backendBlocked || (IS_LOCAL_BACKEND && backendStatus === "checking");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-accent/20 px-4">
      <Card className="w-full max-w-md shadow-xl border-border/60">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-background border border-border flex items-center justify-center p-2.5">
            <Logo />
          </div>
          <div>
            <CardTitle className="text-2xl">Loft · Gestão de Carteira</CardTitle>
            <CardDescription>Acesso restrito · Targets & Portabilidade</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {IS_LOCAL_BACKEND && backendStatus === "offline" && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Backend indisponível</AlertTitle>
              <AlertDescription>
                Não foi possível conectar a{" "}
                <span className="font-mono text-xs">{API_BASE_URL}</span>. Inicie o servidor com{" "}
                <span className="font-mono text-xs">cd backend && python run.py</span> e tente novamente.
              </AlertDescription>
            </Alert>
          )}

          {IS_LOCAL_BACKEND && backendStatus === "checking" && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertTitle>Verificando backend…</AlertTitle>
              <AlertDescription>Conectando a {API_BASE_URL}</AlertDescription>
            </Alert>
          )}

          {IS_LOCAL_BACKEND && backendStatus === "online" && (
            <Alert className="border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Backend conectado</AlertTitle>
              <AlertDescription>API local respondendo em {API_BASE_URL}</AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>
            {(["signin", "signup"] as const).map((mode) => (
              <TabsContent key={mode} value={mode}>
                <form onSubmit={(event) => handleSubmit(event, mode)} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor={`${mode}-email`}>Email</Label>
                    <Input
                      id={`${mode}-email`}
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="voce@empresa.com"
                      disabled={submitDisabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${mode}-password`}>Senha</Label>
                    <Input
                      id={`${mode}-password`}
                      type="password"
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      disabled={submitDisabled}
                    />
                  </div>
                  <Button type="submit" disabled={submitDisabled} className="w-full">
                    {loading ? "Entrando…" : mode === "signin" ? "Entrar" : "Criar conta"}
                  </Button>
                </form>
              </TabsContent>
            ))}
          </Tabs>

          <p className="text-xs text-center text-muted-foreground">
            Autenticação local — use email e senha cadastrados no backend.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
