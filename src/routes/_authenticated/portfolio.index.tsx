import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, AlertTriangle } from "lucide-react";
import { NEGOTIATION_STATUSES, BR_STATES, daysSince } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/portfolio/")({
  component: PortfolioListPage,
});

function PortfolioListPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [state, setState] = useState<string>("all");

  const { data: agencies = [], isLoading } = useQuery({
    queryKey: ["agencies-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("real_estate_agencies")
        .select("*, consultants(name)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    return agencies.filter((a: any) => {
      if (status !== "all" && a.negotiation_status !== status) return false;
      if (state !== "all" && a.state !== state) return false;
      if (q) {
        const s = q.toLowerCase();
        if (
          !a.name?.toLowerCase().includes(s) &&
          !a.city?.toLowerCase().includes(s) &&
          !a.main_contact?.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [agencies, q, status, state]);

  return (
    <div>
      <PageHeader
        title="Carteira de Imobiliárias"
        description={`${filtered.length} de ${agencies.length} imobiliárias`}
        actions={
          <Button asChild>
            <Link to="/portfolio/new"><Plus className="h-4 w-4 mr-1" /> Nova</Link>
          </Button>
        }
      />
      <div className="p-6 lg:p-10 space-y-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por nome, cidade, contato…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {NEGOTIATION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={state} onValueChange={setState}>
            <SelectTrigger className="w-[120px]"><SelectValue placeholder="UF" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas UF</SelectItem>
              {BR_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Imobiliária</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Localização</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead className="text-right">Estoque</TableHead>
                <TableHead>Consultor</TableHead>
                <TableHead className="text-right">Último update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">Carregando…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">Nenhuma imobiliária encontrada.</TableCell></TableRow>
              ) : filtered.map((a: any) => {
                const d = daysSince(a.last_interaction_date);
                return (
                  <TableRow key={a.id} className="cursor-pointer">
                    <TableCell>
                      <Link to="/portfolio/$agencyId" params={{ agencyId: a.id }} className="font-medium hover:underline flex items-center gap-2">
                        {a.name}
                        {a.c_level_support_needed && <AlertTriangle className="h-3.5 w-3.5 text-warning" />}
                      </Link>
                    </TableCell>
                    <TableCell><StatusBadge status={a.negotiation_status} /></TableCell>
                    <TableCell className="text-sm">{a.city} · {a.state}</TableCell>
                    <TableCell className="text-sm">{a.main_contact || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.contract_stock ?? 0}</TableCell>
                    <TableCell className="text-sm">{a.consultants?.name || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className={`text-right text-xs ${d !== null && d > 14 ? "text-destructive" : "text-muted-foreground"}`}>
                      {d === null ? "Sem registro" : `${d}d`}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
