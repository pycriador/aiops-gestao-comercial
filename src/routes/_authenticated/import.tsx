import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { NEGOTIATION_STATUSES, BR_STATES, type NegotiationStatus } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/import")({
  component: ImportPage,
});

// header alias map (case + accent insensitive)
const HEADER_MAP: Record<string, string> = {
  imobiliaria: "name",
  imobiliária: "name",
  nome: "name",
  statusdanegociacao: "negotiation_status",
  status: "negotiation_status",
  cidade: "city",
  uf: "state",
  estado: "state",
  contatoprincipal: "main_contact",
  contato: "main_contact",
  cargo: "contact_role",
  diretorregional: "regional_director",
  garantidoratual: "current_guarantor",
  garantidor: "current_guarantor",
  tipodegarantia: "guarantor_type",
  estoquedecontratos: "contract_stock",
  estoque: "contract_stock",
  ofertaatual: "current_offer",
  proximospassos: "next_steps",
  feedback: "feedback",
  consultor: "consultant_name",
  suporteclevel: "c_level_support_needed",
};

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

type Row = {
  raw: Record<string, any>;
  parsed: Record<string, any>;
  errors: string[];
  action: "create" | "update" | "skip";
  existingId?: string;
};

function ImportPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    // existing agencies for dedup
    const { data: existing } = await supabase
      .from("real_estate_agencies")
      .select("id, name, city, state");
    const existingMap = new Map(
      (existing ?? []).map((a) => [`${a.name.toLowerCase()}|${a.city.toLowerCase()}|${a.state}`, a.id])
    );

    const parsed: Row[] = json.map((raw) => {
      const errors: string[] = [];
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(raw)) {
        const mapped = HEADER_MAP[normalize(String(k))];
        if (mapped) out[mapped] = typeof v === "string" ? v.trim() : v;
      }
      // validations
      if (!out.name) errors.push("Nome obrigatório");
      if (!out.city) errors.push("Cidade obrigatória");
      if (!out.state) errors.push("UF obrigatória");
      else {
        const uf = String(out.state).toUpperCase().slice(0, 2);
        if (!BR_STATES.includes(uf as any)) errors.push(`UF inválida: ${out.state}`);
        else out.state = uf;
      }
      if (out.negotiation_status && !NEGOTIATION_STATUSES.includes(out.negotiation_status as NegotiationStatus)) {
        errors.push(`Status desconhecido: ${out.negotiation_status}`);
      }
      if (!out.negotiation_status) out.negotiation_status = "Pipeline de Prospecção";
      if (out.contract_stock !== undefined && out.contract_stock !== "") {
        const n = Number(out.contract_stock);
        out.contract_stock = isNaN(n) ? 0 : n;
      } else out.contract_stock = 0;
      if (typeof out.c_level_support_needed === "string") {
        out.c_level_support_needed = ["sim", "true", "1", "yes"].includes(out.c_level_support_needed.toLowerCase());
      } else out.c_level_support_needed = !!out.c_level_support_needed;

      const key = out.name && out.city && out.state ? `${String(out.name).toLowerCase()}|${String(out.city).toLowerCase()}|${out.state}` : "";
      const existingId = key ? existingMap.get(key) : undefined;

      return {
        raw,
        parsed: out,
        errors,
        action: errors.length ? "skip" : existingId ? "update" : "create",
        existingId,
      };
    });
    setRows(parsed);
    toast.success(`${parsed.length} linhas analisadas`);
  };

  const handleImport = async () => {
    setImporting(true);
    const valid = rows.filter((r) => r.action !== "skip");
    let created = 0, updated = 0, failed = 0;
    const { data: { user } } = await supabase.auth.getUser();
    for (const r of valid) {
      const { consultant_name, ...rest } = r.parsed as any;
      const payload: any = { ...rest, updated_by: user?.id };
      if (r.action === "update" && r.existingId) {
        const { error } = await supabase.from("real_estate_agencies").update(payload).eq("id", r.existingId);
        if (error) failed++; else updated++;
      } else {
        const { error } = await supabase.from("real_estate_agencies").insert({ ...payload, created_by: user?.id });
        if (error) failed++; else created++;
      }
    }
    setImporting(false);
    toast.success(`${created} criadas, ${updated} atualizadas${failed ? `, ${failed} falharam` : ""}`);
    setRows([]);
    setFileName("");
  };

  const stats = {
    create: rows.filter((r) => r.action === "create").length,
    update: rows.filter((r) => r.action === "update").length,
    skip: rows.filter((r) => r.action === "skip").length,
  };

  return (
    <div>
      <PageHeader title="Importação de Planilha" description="Importe XLSX ou CSV com a base de imobiliárias. Duplicados são detectados por nome + cidade + UF." />
      <div className="p-6 lg:p-10 space-y-6">
        <Card>
          <CardContent className="p-6">
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-10 cursor-pointer hover:bg-accent/30 transition-colors">
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground mb-3" />
              <div className="font-medium">{fileName || "Selecionar arquivo XLSX ou CSV"}</div>
              <div className="text-xs text-muted-foreground mt-1">Cabeçalhos esperados: Imobiliária, Status da Negociação, Cidade, UF, Contato, Cargo…</div>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
          </CardContent>
        </Card>

        {rows.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Badge variant="outline" className="text-success border-success/40">{stats.create} novas</Badge>
                <Badge variant="outline" className="text-info border-info/40">{stats.update} atualizações</Badge>
                {stats.skip > 0 && <Badge variant="outline" className="text-destructive border-destructive/40">{stats.skip} com erro</Badge>}
              </div>
              <Button onClick={handleImport} disabled={importing || stats.create + stats.update === 0}>
                <Upload className="h-4 w-4 mr-1" /> {importing ? "Importando…" : `Confirmar importação (${stats.create + stats.update})`}
              </Button>
            </div>

            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Imobiliária</TableHead>
                    <TableHead>Cidade / UF</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Estoque</TableHead>
                    <TableHead>Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 200).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.errors.length ? <AlertCircle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-success" />}</TableCell>
                      <TableCell className="font-medium">{r.parsed.name || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-sm">{r.parsed.city} {r.parsed.state && `· ${r.parsed.state}`}</TableCell>
                      <TableCell className="text-sm">{r.parsed.negotiation_status}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.parsed.contract_stock ?? 0}</TableCell>
                      <TableCell>
                        {r.action === "create" && <Badge className="bg-success/15 text-success border-success/30">Criar</Badge>}
                        {r.action === "update" && <Badge className="bg-info/15 text-info border-info/30">Atualizar</Badge>}
                        {r.action === "skip" && <span className="text-xs text-destructive">{r.errors.join("; ")}</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > 200 && <div className="p-3 text-xs text-muted-foreground text-center">… mostrando 200 de {rows.length}</div>}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
