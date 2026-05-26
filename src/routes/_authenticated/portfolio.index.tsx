import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, AlertTriangle, LayoutGrid, List, GripVertical } from "lucide-react";
import { NEGOTIATION_STATUSES, BR_STATES, STATUS_TONE, daysSince, type NegotiationStatus } from "@/lib/constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

        <Tabs defaultValue="kanban" className="space-y-4">
          <TabsList>
            <TabsTrigger value="kanban"><LayoutGrid className="h-4 w-4 mr-1.5" /> Kanban</TabsTrigger>
            <TabsTrigger value="table"><List className="h-4 w-4 mr-1.5" /> Tabela</TabsTrigger>
          </TabsList>

          <TabsContent value="kanban">
            <KanbanBoard agencies={filtered} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="table">
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
          </TabsContent>

          <TabsContent value="kanban">
            <KanbanBoard agencies={filtered} isLoading={isLoading} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

const TONE_BORDER: Record<string, string> = {
  neutral: "border-l-muted-foreground/40",
  info: "border-l-info",
  warning: "border-l-warning",
  success: "border-l-success",
  destructive: "border-l-destructive",
};

function KanbanBoard({ agencies, isLoading }: { agencies: any[]; isLoading: boolean }) {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    NEGOTIATION_STATUSES.forEach((s) => (map[s] = []));
    agencies.forEach((a) => {
      const key = a.negotiation_status as string;
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return map;
  }, [agencies]);

  const moveMutation = useMutation({
    mutationFn: async ({ agency, toStatus }: { agency: any; toStatus: NegotiationStatus }) => {
      const fromStatus = agency.negotiation_status;
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      const userName = userData.user?.email ?? null;

      const { error: upErr } = await supabase
        .from("real_estate_agencies")
        .update({ negotiation_status: toStatus, updated_by: userId })
        .eq("id", agency.id);
      if (upErr) throw upErr;

      // Log interaction for history (trigger will sync agency timestamps)
      const { error: intErr } = await supabase.from("agency_interactions").insert({
        agency_id: agency.id,
        interaction_type: "status_change",
        status_before: fromStatus,
        status_after: toStatus,
        feedback: `Status alterado de "${fromStatus}" para "${toStatus}" (kanban).`,
        source: "web",
        created_by: userId,
        created_by_name: userName,
      });
      if (intErr) throw intErr;
    },
    onMutate: async ({ agency, toStatus }) => {
      await qc.cancelQueries({ queryKey: ["agencies-list"] });
      const prev = qc.getQueryData<any[]>(["agencies-list"]);
      qc.setQueryData<any[]>(["agencies-list"], (old) =>
        (old ?? []).map((a) => (a.id === agency.id ? { ...a, negotiation_status: toStatus } : a))
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["agencies-list"], ctx.prev);
      toast.error("Não foi possível mover a imobiliária.");
    },
    onSuccess: (_d, v) => {
      toast.success(`Movida para "${v.toStatus}".`);
      qc.invalidateQueries({ queryKey: ["agencies-list"] });
    },
  });

  const activeAgency = activeId ? agencies.find((a) => a.id === activeId) : null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const agency = agencies.find((a) => a.id === e.active.id);
    const toStatus = String(e.over.id) as NegotiationStatus;
    if (!agency || agency.negotiation_status === toStatus) return;
    if (!NEGOTIATION_STATUSES.includes(toStatus)) return;
    moveMutation.mutate({ agency, toStatus });
  };

  if (isLoading) {
    return <Card className="p-10 text-center text-muted-foreground">Carregando…</Card>;
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
        {NEGOTIATION_STATUSES.map((s) => (
          <KanbanColumn key={s} status={s} items={grouped[s] ?? []} />
        ))}
      </div>
      <DragOverlay>
        {activeAgency ? <AgencyCard agency={activeAgency} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({ status, items }: { status: NegotiationStatus; items: any[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const tone = STATUS_TONE[status];
  const total = items.reduce((acc, a) => acc + (a.contract_stock ?? 0), 0);
  return (
    <div className="w-[280px] shrink-0 flex flex-col">
      <div className="flex items-center justify-between px-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusBadge status={status} />
          <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
        </div>
        {total > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">{total} contratos</span>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 min-h-[400px] rounded-lg border border-dashed p-2 space-y-2 transition-colors bg-muted/30",
          isOver && "bg-accent/40 border-accent-foreground/30"
        )}
      >
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-6">Solte aqui</div>
        ) : (
          items.map((a) => <DraggableAgencyCard key={a.id} agency={a} tone={tone} />)
        )}
      </div>
    </div>
  );
}

function DraggableAgencyCard({ agency, tone }: { agency: any; tone: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: agency.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      style={{ opacity: isDragging ? 0.3 : 1 }}
    >
      <AgencyCard agency={agency} tone={tone} dragHandle={listeners} />
    </div>
  );
}

function AgencyCard({
  agency,
  tone = "neutral",
  dragging,
  dragHandle,
}: {
  agency: any;
  tone?: string;
  dragging?: boolean;
  dragHandle?: any;
}) {
  const d = daysSince(agency.last_interaction_date);
  const stale = d !== null && d > 14;
  return (
    <Card
      className={cn(
        "p-3 border-l-4 bg-card transition-shadow",
        TONE_BORDER[tone] ?? TONE_BORDER.neutral,
        dragging ? "shadow-lg rotate-1" : "hover:shadow-sm"
      )}
    >
      <div className="flex items-start gap-2">
        <button
          {...(dragHandle ?? {})}
          className="mt-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          aria-label="Arrastar"
          onClick={(e) => e.preventDefault()}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link
              to="/portfolio/$agencyId"
              params={{ agencyId: agency.id }}
              className="font-medium text-sm leading-tight hover:underline truncate"
              onClick={(e) => dragging && e.preventDefault()}
            >
              {agency.name}
            </Link>
            {agency.c_level_support_needed && (
              <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {agency.city} · {agency.state}
          </div>
          {agency.main_contact && (
            <div className="text-xs text-muted-foreground truncate mt-0.5">{agency.main_contact}</div>
          )}
          <div className="flex items-center justify-between mt-2 text-[11px]">
            <span className="text-muted-foreground truncate">
              {agency.consultants?.name ?? "Sem consultor"}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {agency.contract_stock > 0 && (
                <span className="tabular-nums font-medium">{agency.contract_stock}</span>
              )}
              <span className={cn("tabular-nums", stale ? "text-destructive" : "text-muted-foreground")}>
                {d === null ? "—" : `${d}d`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
