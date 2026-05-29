import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { api } from "@/lib/api/client";
import { getUserDisplayName } from "@/lib/api/auth";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { mapAuthErrorMessage } from "@/lib/backend-health";

export const Route = createFileRoute("/_authenticated/settings/profile")({
  component: ProfileSettingsPage,
});

type ProfileForm = {
  display_name: string;
  email: string;
  password: string;
  password_confirm: string;
};

function ProfileSettingsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { user, displayName, loading, refreshUser } = useCurrentUser();
  const [formInitialized, setFormInitialized] = useState(false);
  const [form, setForm] = useState<ProfileForm>({
    display_name: "",
    email: "",
    password: "",
    password_confirm: "",
  });

  useEffect(() => {
    if (!user) {
      setFormInitialized(false);
      return;
    }
    if (formInitialized) return;
    setForm({
      display_name: getUserDisplayName(user),
      email: user.email,
      password: "",
      password_confirm: "",
    });
    setFormInitialized(true);
  }, [user, formInitialized]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      if (form.password && form.password.length < 8) {
        throw new Error("A nova senha deve ter no mínimo 8 caracteres");
      }
      if (form.password && form.password !== form.password_confirm) {
        throw new Error("As senhas não coincidem");
      }

      const payload: { display_name: string; email: string; password?: string } = {
        display_name: form.display_name.trim(),
        email: form.email.trim().toLowerCase(),
      };
      if (form.password) {
        payload.password = form.password;
      }

      const { data, error } = await api.auth.updateProfile(payload);
      if (error) throw error;
      return data;
    },
    onSuccess: async (updatedUser) => {
      toast.success("Perfil atualizado");
      if (updatedUser) {
        setForm({
          display_name: getUserDisplayName(updatedUser),
          email: updatedUser.email,
          password: "",
          password_confirm: "",
        });
      }
      await refreshUser();
      await queryClient.invalidateQueries();
      await router.invalidate();
    },
    onError: (e: Error) => toast.error(mapAuthErrorMessage(e.message)),
  });

  if (loading && !user) {
    return (
      <div className="p-10 flex justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Carregando perfil…
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Meu perfil"
        description="Atualize seu nome, email e senha de acesso à plataforma."
      />

      <div className="p-6 lg:p-10 max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle>Dados da conta</CardTitle>
            <CardDescription>
              Você está conectado como <strong>{displayName || user?.email}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="display_name">Nome</Label>
              <Input
                id="display_name"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                placeholder="Seu nome"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="seu@email.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Nova senha</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Deixe em branco para manter a atual"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password_confirm">Confirmar nova senha</Label>
              <Input
                id="password_confirm"
                type="password"
                value={form.password_confirm}
                onChange={(e) => setForm({ ...form, password_confirm: e.target.value })}
                placeholder="Repita a nova senha"
                autoComplete="new-password"
              />
            </div>
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={saveProfile.isPending}
              onClick={() => saveProfile.mutate()}
            >
              {saveProfile.isPending ? "Salvando…" : "Salvar alterações"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
