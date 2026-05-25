import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/users")({
  component: UsersPage,
});

function UsersPage() {
  const qc = useQueryClient();
  const { data: roles = [] } = useQuery({
    queryKey: ["user-roles"],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("*").order("created_at");
      return data ?? [];
    },
  });

  const setRole = async (id: string, role: string) => {
    const { error } = await supabase.from("user_roles").update({ role: role as any }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Papel atualizado");
    qc.invalidateQueries({ queryKey: ["user-roles"] });
  };

  return (
    <div>
      <PageHeader title="Usuários e Permissões" description="Gerencie os papéis dos usuários da plataforma." />
      <div className="p-6 lg:p-10">
        <Card className="overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>Usuário</TableHead><TableHead>Papel</TableHead></TableRow></TableHeader>
            <TableBody>
              {roles.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.user_id}</TableCell>
                  <TableCell>
                    <Select value={r.role} onValueChange={(v) => setRole(r.id, v)}>
                      <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="manager">Gestor</SelectItem>
                        <SelectItem value="consultant">Consultor</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
