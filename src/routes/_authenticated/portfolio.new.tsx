import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { NEGOTIATION_STATUSES, BR_STATES, GUARANTOR_TYPES } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/portfolio/new")({
  component: NewAgencyPage,
});

function NewAgencyPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    city: "",
    state: "SP",
    negotiation_status: "Pipeline de Prospecção",
    main_contact: "",
    contact_role: "",
    regional_director: "",
    current_guarantor: "",
    guarantor_type: "" as string,
    contract_stock: 0,
    current_offer: "",
    next_steps: "",
    feedback: "",
    consultant_id: "" as string,
    c_level_support_needed: false,
  });

  const { data: consultants = [] } = useQuery({
    queryKey: ["consultants-active"],
    queryFn: async () => {
      const { data } = await api.from("consultants").select("id, name").eq("active", true).order("name");
      return data ?? [];
    },
  });

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.city || !form.state) {
      toast.error("Nome, cidade e UF são obrigatórios");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await api.auth.getUser();
      const payload: any = {
        ...form,
        guarantor_type: form.guarantor_type || null,
        consultant_id: form.consultant_id || null,
        created_by: user?.id,
        updated_by: user?.id,
      };
      const { data, error } = await api.from("real_estate_agencies").insert(payload).select("id").single();
      if (error) throw error;
      toast.success("Imobiliária criada");
      navigate({ to: "/portfolio/$agencyId", params: { agencyId: data.id } });
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Nova Imobiliária" description="Cadastro manual de uma nova conta na carteira." />
      <form onSubmit={handleSubmit} className="p-6 lg:p-10 max-w-4xl space-y-6">
        <Card>
          <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nome *"><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Status">
              <Select value={form.negotiation_status} onValueChange={(v) => set("negotiation_status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{NEGOTIATION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Cidade *"><Input value={form.city} onChange={(e) => set("city", e.target.value)} /></Field>
            <Field label="UF *">
              <Select value={form.state} onValueChange={(v) => set("state", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{BR_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Contato principal"><Input value={form.main_contact} onChange={(e) => set("main_contact", e.target.value)} /></Field>
            <Field label="Cargo"><Input value={form.contact_role} onChange={(e) => set("contact_role", e.target.value)} /></Field>
            <Field label="Diretor regional"><Input value={form.regional_director} onChange={(e) => set("regional_director", e.target.value)} /></Field>
            <Field label="Consultor responsável">
              <Select value={form.consultant_id || "none"} onValueChange={(v) => set("consultant_id", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sem consultor —</SelectItem>
                  {consultants.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Garantidor atual"><Input value={form.current_guarantor} onChange={(e) => set("current_guarantor", e.target.value)} /></Field>
            <Field label="Tipo de garantia">
              <Select value={form.guarantor_type || "none"} onValueChange={(v) => set("guarantor_type", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Não informado —</SelectItem>
                  {GUARANTOR_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Estoque de contratos"><Input type="number" min={0} value={form.contract_stock} onChange={(e) => set("contract_stock", parseInt(e.target.value) || 0)} /></Field>
            <Field label="Oferta atual"><Input value={form.current_offer} onChange={(e) => set("current_offer", e.target.value)} /></Field>
            <Field label="Próximos passos" full><Textarea rows={2} value={form.next_steps} onChange={(e) => set("next_steps", e.target.value)} /></Field>
            <Field label="Feedback / Observações" full><Textarea rows={3} value={form.feedback} onChange={(e) => set("feedback", e.target.value)} /></Field>
            <Field label="Suporte C-Level necessário" full>
              <div className="flex items-center gap-3">
                <Switch checked={form.c_level_support_needed} onCheckedChange={(v) => set("c_level_support_needed", v)} />
                <span className="text-sm text-muted-foreground">Marcar para escalonar diretoria</span>
              </div>
            </Field>
          </CardContent>
        </Card>
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" onClick={() => navigate({ to: "/portfolio" })}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Criar imobiliária"}</Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2 space-y-1.5" : "space-y-1.5"}>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
