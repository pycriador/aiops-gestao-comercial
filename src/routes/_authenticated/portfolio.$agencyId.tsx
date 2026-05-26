import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, MessageSquarePlus, Building2, Phone, MapPin, User, Shield, Pencil } from "lucide-react";
import { NEGOTIATION_STATUSES, BR_STATES, GUARANTOR_TYPES, daysSince } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/portfolio/$agencyId")({
  component: AgencyDetailPage,
});

function AgencyDetailPage() {
  const { agencyId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: agency, isLoading } = useQuery({
    queryKey: ["agency", agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("real_estate_agencies")
        .select("*, consultants(id, name, phone)")
        .eq("id", agencyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: interactions = [] } = useQuery({
    queryKey: ["interactions", agencyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("agency_interactions")
        .select("*")
        .eq("agency_id", agencyId)
        .order("interaction_date", { ascending: false });
      return data ?? [];
    },
  });

  if (isLoading) return <div className="p-10 text-muted-foreground">Carregando…</div>;
  if (!agency) return <div className="p-10">Imobiliária não encontrada.</div>;

  const d = daysSince(agency.last_interaction_date);

  return (
    <div>
      <PageHeader
        title={agency.name}
        description={`${agency.city} · ${agency.state}`}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="ghost"><Link to="/portfolio"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link></Button>
            <NewInteractionDialog agency={agency} onSaved={() => {
              qc.invalidateQueries({ queryKey: ["agency", agencyId] });
              qc.invalidateQueries({ queryKey: ["interactions", agencyId] });
              qc.invalidateQueries({ queryKey: ["agencies-list"] });
              qc.invalidateQueries({ queryKey: ["agencies-all"] });
            }} />
          </div>
        }
      />

      <div className="p-6 lg:p-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Resumo</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <Info label="Status"><StatusBadge status={agency.negotiation_status} /></Info>
              <Info label="Estoque de contratos">{agency.contract_stock ?? 0}</Info>
              <Info label="Último update">{d === null ? "—" : `${d} dias`}</Info>
              <Info label="Contato principal" icon={<User className="h-3.5 w-3.5" />}>{agency.main_contact || "—"}</Info>
              <Info label="Cargo">{agency.contact_role || "—"}</Info>
              <Info label="Diretor regional">{agency.regional_director || "—"}</Info>
              <Info label="Garantidor atual" icon={<Shield className="h-3.5 w-3.5" />}>{agency.current_guarantor || "—"}</Info>
              <Info label="Tipo de garantia">{agency.guarantor_type || "—"}</Info>
              <Info label="Consultor">{agency.consultants?.name || "—"}</Info>
              <Info label="Suporte C-Level" full>
                {agency.c_level_support_needed ? <span className="text-warning font-medium">Sim · escalonamento ativo</span> : "Não"}
              </Info>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Próximos passos & feedback</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Próximos passos</div>
                <div className="whitespace-pre-wrap">{agency.next_steps || <span className="text-muted-foreground">—</span>}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Oferta atual</div>
                <div>{agency.current_offer || <span className="text-muted-foreground">—</span>}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Feedback</div>
                <div className="whitespace-pre-wrap">{agency.feedback || <span className="text-muted-foreground">—</span>}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-1 h-fit">
          <CardHeader><CardTitle className="text-base">Histórico de interações ({interactions.length})</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {interactions.length === 0 && <div className="text-sm text-muted-foreground">Nenhuma interação registrada.</div>}
            {interactions.map((i: any) => (
              <div key={i.id} className="border-l-2 border-primary/30 pl-3 pb-3">
                <div className="text-xs text-muted-foreground flex items-center justify-between">
                  <span>{new Date(i.interaction_date).toLocaleString("pt-BR")}</span>
                  <span className="uppercase tracking-wider">{i.source}</span>
                </div>
                {i.status_after && (
                  <div className="mt-1.5"><StatusBadge status={i.status_after} /></div>
                )}
                {i.feedback && <div className="text-sm mt-2 whitespace-pre-wrap">{i.feedback}</div>}
                {i.next_steps && <div className="text-xs mt-1 text-muted-foreground"><b>Próximos:</b> {i.next_steps}</div>}
                {i.created_by_name && <div className="text-xs mt-1 text-muted-foreground">por {i.created_by_name}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Info({ label, children, full, icon }: { label: string; children: React.ReactNode; full?: boolean; icon?: React.ReactNode }) {
  return (
    <div className={full ? "col-span-full" : ""}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
      <div className="mt-1 font-medium">{children}</div>
    </div>
  );
}

function NewInteractionDialog({ agency, onSaved }: { agency: any; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    status_after: agency.negotiation_status,
    feedback: "",
    next_steps: "",
    current_offer: agency.current_offer || "",
    contract_stock: agency.contract_stock ?? 0,
    c_level_support_needed: agency.c_level_support_needed ?? false,
    interaction_type: "Reunião",
  });
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("agency_interactions").insert({
        agency_id: agency.id,
        status_before: agency.negotiation_status,
        status_after: form.status_after,
        feedback: form.feedback || null,
        next_steps: form.next_steps || null,
        current_offer: form.current_offer || null,
        contract_stock: form.contract_stock,
        c_level_support_needed: form.c_level_support_needed,
        interaction_type: form.interaction_type,
        source: "web",
        created_by: user?.id,
        created_by_name: user?.email,
      });
      if (error) throw error;
      toast.success("Interação registrada");
      setOpen(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Erro ao registrar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><MessageSquarePlus className="h-4 w-4 mr-1" /> Nova interação</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Registrar interação</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select value={form.interaction_type} onValueChange={(v) => set("interaction_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Reunião", "Ligação", "Email", "WhatsApp", "Visita", "Outro"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Novo status</Label>
              <Select value={form.status_after} onValueChange={(v) => set("status_after", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{NEGOTIATION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Feedback</Label>
            <Textarea rows={3} value={form.feedback} onChange={(e) => set("feedback", e.target.value)} placeholder="O que aconteceu nesta interação?" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Próximos passos</Label>
            <Textarea rows={2} value={form.next_steps} onChange={(e) => set("next_steps", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Oferta atual</Label>
              <Input value={form.current_offer} onChange={(e) => set("current_offer", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Estoque de contratos</Label>
              <Input type="number" min={0} value={form.contract_stock} onChange={(e) => set("contract_stock", parseInt(e.target.value) || 0)} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.c_level_support_needed} onCheckedChange={(v) => set("c_level_support_needed", v)} />
            <Label className="text-sm font-normal">Necessita suporte C-Level</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Salvando…" : "Registrar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
