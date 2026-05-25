import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/consultants")({
  component: ConsultantsPage,
});

function ConsultantsPage() {
  const qc = useQueryClient();
  const { data: consultants = [] } = useQuery({
    queryKey: ["consultants"],
    queryFn: async () => {
      const { data } = await supabase.from("consultants").select("*").order("name");
      return data ?? [];
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", regional: "" });

  const save = async () => {
    if (!form.name) return toast.error("Nome obrigatório");
    const { error } = await supabase.from("consultants").insert(form);
    if (error) return toast.error(error.message);
    toast.success("Consultor adicionado");
    setForm({ name: "", email: "", phone: "", regional: "" });
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["consultants"] });
  };

  return (
    <div>
      <PageHeader
        title="Consultores"
        description={`${consultants.length} consultores cadastrados`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Novo</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo consultor</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Telefone (WhatsApp)</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+5511999999999" /></div>
                <div className="space-y-1.5"><Label>Regional</Label><Input value={form.regional} onChange={(e) => setForm({ ...form, regional: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={save}>Salvar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="p-6 lg:p-10">
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Nome</TableHead><TableHead>Email</TableHead><TableHead>WhatsApp</TableHead><TableHead>Regional</TableHead><TableHead>Status</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {consultants.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-sm">{c.email || "—"}</TableCell>
                  <TableCell className="text-sm">{c.phone || "—"}</TableCell>
                  <TableCell className="text-sm">{c.regional || "—"}</TableCell>
                  <TableCell className="text-sm">{c.active ? "Ativo" : "Inativo"}</TableCell>
                </TableRow>
              ))}
              {consultants.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Nenhum consultor cadastrado.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
