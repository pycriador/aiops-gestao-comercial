import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { iam, iamHasPermission, type IamRole, type IamUser } from "@/lib/api/iam";
import { requireIamPermission } from "@/lib/route-guards";
import { api } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DATA_SCOPE_LABELS, PERMISSION_LABELS } from "@/lib/constants/permissions";
import { Loader2, Pencil, Plus, Shield, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/users")({
  beforeLoad: () => requireIamPermission("users.manage"),
  component: UsersSettingsPage,
});

type UserForm = {
  email: string;
  display_name: string;
  password: string;
  role: string;
  consultant_id: string;
};

type RoleForm = {
  slug: string;
  name: string;
  description: string;
  data_scope: "all" | "own";
  permissions: string[];
};

const emptyUserForm: UserForm = {
  email: "",
  display_name: "",
  password: "",
  role: "consultant",
  consultant_id: "",
};

function UsersSettingsPage() {
  const qc = useQueryClient();
  const { user: currentUser, hasPermission } = useCurrentUser();
  const canManageRoles = hasPermission("roles.manage");

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ["iam-users"],
    queryFn: async () => {
      const { data, error } = await iam.listUsers();
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: roles = [], isLoading: loadingRoles } = useQuery({
    queryKey: ["iam-roles"],
    queryFn: async () => {
      const { data, error } = await iam.listRoles();
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: catalog = {} } = useQuery({
    queryKey: ["iam-permission-catalog"],
    queryFn: async () => {
      const { data, error } = await iam.permissionCatalog();
      if (error) throw error;
      return data?.catalog ?? PERMISSION_LABELS;
    },
  });

  const { data: consultants = [] } = useQuery({
    queryKey: ["consultants-options"],
    queryFn: async () => {
      const { data } = await api.from("consultants").select("id, name, user_id, email").order("name");
      return (data ?? []) as Array<{ id: string; name: string; user_id: string | null; email: string | null }>;
    },
  });

  const permissionKeys = useMemo(() => Object.keys(catalog), [catalog]);

  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<IamUser | null>(null);
  const [editingRole, setEditingRole] = useState<IamRole | null>(null);
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm);
  const [roleForm, setRoleForm] = useState<RoleForm>({
    slug: "",
    name: "",
    description: "",
    data_scope: "own",
    permissions: [],
  });
  const [deleteUserTarget, setDeleteUserTarget] = useState<IamUser | null>(null);
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<IamRole | null>(null);

  const invalidateUsers = () => qc.invalidateQueries({ queryKey: ["iam-users"] });
  const invalidateRoles = () => qc.invalidateQueries({ queryKey: ["iam-roles"] });

  const saveUser = useMutation({
    mutationFn: async () => {
      const payload = {
        email: userForm.email.trim(),
        display_name: userForm.display_name.trim(),
        role: userForm.role,
        consultant_id: userForm.consultant_id || null,
        ...(userForm.password ? { password: userForm.password } : {}),
      };
      if (editingUser) {
        const { error } = await iam.updateUser(editingUser.id, payload);
        if (error) throw error;
      } else {
        if (!userForm.password || userForm.password.length < 8) {
          throw new Error("Senha obrigatória (mínimo 8 caracteres)");
        }
        const { error } = await iam.createUser({ ...payload, password: userForm.password });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingUser ? "Usuário atualizado" : "Usuário criado");
      setUserDialogOpen(false);
      setEditingUser(null);
      setUserForm(emptyUserForm);
      invalidateUsers();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveRole = useMutation({
    mutationFn: async () => {
      if (editingRole) {
        const { error } = await iam.updateRole(editingRole.slug, {
          name: roleForm.name,
          description: roleForm.description,
          data_scope: roleForm.data_scope,
          permissions: roleForm.permissions,
        });
        if (error) throw error;
      } else {
        const { error } = await iam.createRole({
          slug: roleForm.slug.trim().toLowerCase(),
          name: roleForm.name.trim(),
          description: roleForm.description.trim(),
          data_scope: roleForm.data_scope,
          permissions: roleForm.permissions,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingRole ? "Papel atualizado" : "Papel criado");
      setRoleDialogOpen(false);
      setEditingRole(null);
      invalidateRoles();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await iam.deleteUser(id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Usuário excluído");
      setDeleteUserTarget(null);
      invalidateUsers();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteRole = useMutation({
    mutationFn: async (slug: string) => {
      const { error } = await iam.deleteRole(slug);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Papel excluído");
      setDeleteRoleTarget(null);
      invalidateRoles();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreateUser = () => {
    setEditingUser(null);
    setUserForm(emptyUserForm);
    setUserDialogOpen(true);
  };

  const openEditUser = (u: IamUser) => {
    setEditingUser(u);
    setUserForm({
      email: u.email,
      display_name: u.display_name,
      password: "",
      role: u.primary_role || "consultant",
      consultant_id: u.consultant_id || "",
    });
    setUserDialogOpen(true);
  };

  const openCreateRole = () => {
    setEditingRole(null);
    setRoleForm({ slug: "", name: "", description: "", data_scope: "own", permissions: [] });
    setRoleDialogOpen(true);
  };

  const openEditRole = (role: IamRole) => {
    setEditingRole(role);
    setRoleForm({
      slug: role.slug,
      name: role.name,
      description: role.description || "",
      data_scope: role.data_scope,
      permissions: role.permissions.includes("*")
        ? permissionKeys
        : [...role.permissions],
    });
    setRoleDialogOpen(true);
  };

  const togglePermission = (key: string, checked: boolean) => {
    setRoleForm((prev) => ({
      ...prev,
      permissions: checked
        ? [...prev.permissions, key]
        : prev.permissions.filter((p) => p !== key),
    }));
  };

  const userFormFields = (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Nome</Label>
        <Input
          value={userForm.display_name}
          onChange={(e) => setUserForm({ ...userForm, display_name: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input
          type="email"
          value={userForm.email}
          onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>{editingUser ? "Nova senha (opcional)" : "Senha"}</Label>
        <Input
          type="password"
          value={userForm.password}
          onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
          placeholder={editingUser ? "Deixe em branco para manter" : "Mínimo 8 caracteres"}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Papel</Label>
        <Select value={userForm.role} onValueChange={(role) => setUserForm({ ...userForm, role })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.slug} value={r.slug}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Vincular consultor (opcional)</Label>
        <Select
          value={userForm.consultant_id || "__none__"}
          onValueChange={(v) => setUserForm({ ...userForm, consultant_id: v === "__none__" ? "" : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Nenhum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Nenhum / criar automaticamente</SelectItem>
            {consultants
              .filter((c) => !c.user_id || c.user_id === editingUser?.id)
              .map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Consultores só veem imobiliárias vinculadas ao perfil de consultor associado.
        </p>
      </div>
    </div>
  );

  const roleFormFields = (
    <div className="space-y-4">
      {!editingRole && (
        <div className="space-y-1.5">
          <Label>Identificador (slug)</Label>
          <Input
            value={roleForm.slug}
            onChange={(e) => setRoleForm({ ...roleForm, slug: e.target.value.toLowerCase() })}
            placeholder="ex: supervisor"
          />
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Nome do papel</Label>
        <Input value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Descrição</Label>
        <Input
          value={roleForm.description}
          onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Escopo de dados</Label>
        <Select
          value={roleForm.data_scope}
          onValueChange={(v: "all" | "own") => setRoleForm({ ...roleForm, data_scope: v })}
          disabled={editingRole?.slug === "admin"}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{DATA_SCOPE_LABELS.all}</SelectItem>
            <SelectItem value="own">{DATA_SCOPE_LABELS.own}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Permissões</Label>
        <div className="grid gap-2 max-h-64 overflow-y-auto rounded-lg border p-3">
          {permissionKeys.map((key) => (
            <label key={key} className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={roleForm.permissions.includes(key)}
                disabled={editingRole?.slug === "admin"}
                onCheckedChange={(checked) => togglePermission(key, checked === true)}
              />
              <span>
                <span className="font-medium">{catalog[key] || PERMISSION_LABELS[key] || key}</span>
                <span className="block text-xs text-muted-foreground font-mono">{key}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Usuários e Permissões"
        description="Gerencie contas, senhas, papéis e o que cada perfil pode fazer na plataforma."
      />

      <div className="p-6 lg:p-10">
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" /> Usuários
            </TabsTrigger>
            {canManageRoles && (
              <TabsTrigger value="roles" className="gap-2">
                <Shield className="h-4 w-4" /> Papéis e permissões
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="users" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Button onClick={openCreateUser}>
                <Plus className="h-4 w-4 mr-1" /> Novo usuário
              </Button>
            </div>
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>Consultor vinculado</TableHead>
                    <TableHead>Escopo</TableHead>
                    <TableHead className="w-24 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingUsers ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                        Carregando usuários…
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.display_name}</TableCell>
                        <TableCell className="text-sm">{u.email}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{roles.find((r) => r.slug === u.primary_role)?.name || u.primary_role}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{u.consultant_name || "—"}</TableCell>
                        <TableCell className="text-sm">{DATA_SCOPE_LABELS[u.data_scope] || u.data_scope}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditUser(u)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={u.id === currentUser?.id}
                              onClick={() => setDeleteUserTarget(u)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {canManageRoles && (
            <TabsContent value="roles" className="mt-4 space-y-4">
              <div className="flex justify-end">
                <Button onClick={openCreateRole}>
                  <Plus className="h-4 w-4 mr-1" /> Novo papel
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {loadingRoles ? (
                  <Card className="p-8 col-span-full text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                    Carregando papéis…
                  </Card>
                ) : (
                  roles.map((role) => (
                    <Card key={role.slug}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <CardTitle className="text-lg">{role.name}</CardTitle>
                            <CardDescription>{role.description || role.slug}</CardDescription>
                          </div>
                          {role.is_system && <Badge variant="outline">Sistema</Badge>}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Escopo: {DATA_SCOPE_LABELS[role.data_scope]}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {(role.permissions.includes("*") ? permissionKeys : role.permissions).slice(0, 4).map((p) => (
                            <Badge key={p} variant="secondary" className="text-[10px]">
                              {PERMISSION_LABELS[p] || p}
                            </Badge>
                          ))}
                          {(role.permissions.includes("*") ? permissionKeys.length : role.permissions.length) > 4 && (
                            <Badge variant="secondary" className="text-[10px]">
                              +{(role.permissions.includes("*") ? permissionKeys.length : role.permissions.length) - 4}
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button variant="outline" size="sm" className="flex-1" onClick={() => openEditRole(role)}>
                            <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                          </Button>
                          {!role.is_system && (
                            <Button variant="outline" size="sm" onClick={() => setDeleteRoleTarget(role)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>

      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? "Editar usuário" : "Novo usuário"}</DialogTitle>
          </DialogHeader>
          {userFormFields}
          <DialogFooter>
            <Button onClick={() => saveUser.mutate()} disabled={saveUser.isPending}>
              {saveUser.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? `Editar papel: ${editingRole.name}` : "Novo papel"}</DialogTitle>
          </DialogHeader>
          {roleFormFields}
          <DialogFooter>
            <Button onClick={() => saveRole.mutate()} disabled={saveRole.isPending}>
              {saveRole.isPending ? "Salvando…" : "Salvar papel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteUserTarget} onOpenChange={(o) => !o && setDeleteUserTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              A conta <strong>{deleteUserTarget?.email}</strong> será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteUserTarget && deleteUser.mutate(deleteUserTarget.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteRoleTarget} onOpenChange={(o) => !o && setDeleteRoleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir papel?</AlertDialogTitle>
            <AlertDialogDescription>
              O papel <strong>{deleteRoleTarget?.name}</strong> será removido se não estiver em uso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteRoleTarget && deleteRole.mutate(deleteRoleTarget.slug)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
