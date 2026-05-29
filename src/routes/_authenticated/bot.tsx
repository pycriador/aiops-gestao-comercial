import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MessageSquare, AlertTriangle, CheckCircle2, Users, Activity, Inbox } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bot")({
  component: BotMonitoringPage,
});

function BotMonitoringPage() {
  const { data: messages = [] } = useQuery({
    queryKey: ["bot-messages"],
    queryFn: async () => {
      const { data } = await api
        .from("whatsapp_messages")
        .select("*, consultants(name)")
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
    refetchInterval: 15_000,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["bot-sessions"],
    queryFn: async () => {
      const { data } = await api
        .from("bot_sessions")
        .select("*, consultants(name)")
        .order("updated_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    refetchInterval: 15_000,
  });

  const { data: whatsappInteractions = [] } = useQuery({
    queryKey: ["whatsapp-interactions"],
    queryFn: async () => {
      const { data } = await api
        .from("agency_interactions")
        .select("*, real_estate_agencies(name)")
        .eq("source", "whatsapp")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    refetchInterval: 15_000,
  });

  const totalInbound = messages.filter((m: any) => m.direction === "inbound").length;
  const totalErrors = messages.filter((m: any) => m.status === "error").length;
  const activeSessions = sessions.filter((s: any) => s.status === "active").length;
  const abandonedSessions = sessions.filter((s: any) => s.status === "abandoned").length;

  const topConsultants = Object.entries(
    messages.reduce<Record<string, { name: string; count: number }>>((acc, m: any) => {
      const name = m.consultants?.name;
      if (!name || m.direction !== "inbound") return acc;
      acc[name] = acc[name] || { name, count: 0 };
      acc[name].count++;
      return acc;
    }, {})
  )
    .map(([, v]) => v)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div>
      <PageHeader title="Monitoramento do Bot" description="Acompanhamento em tempo real das interações via WhatsApp." />

      <div className="p-6 lg:p-10 space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Mensagens recebidas" value={totalInbound} icon={<Inbox className="h-5 w-5" />} hint="Últimas 100" />
          <StatCard label="Sessões ativas" value={activeSessions} icon={<Activity className="h-5 w-5" />} tone="info" />
          <StatCard label="Sessões abandonadas" value={abandonedSessions} icon={<Users className="h-5 w-5" />} tone="warning" />
          <StatCard label="Erros" value={totalErrors} icon={<AlertTriangle className="h-5 w-5" />} tone={totalErrors > 0 ? "destructive" : "default"} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />Top consultores ativos</CardTitle></CardHeader>
            <CardContent>
              {topConsultants.length === 0 ? (
                <div className="text-sm text-muted-foreground">Sem dados ainda.</div>
              ) : (
                <div className="space-y-2">
                  {topConsultants.map((c) => (
                    <div key={c.name} className="flex items-center justify-between text-sm">
                      <span>{c.name}</span>
                      <Badge variant="outline">{c.count} msgs</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />Atualizações via WhatsApp ({whatsappInteractions.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-72 overflow-auto">
              {whatsappInteractions.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nenhuma atualização registrada via WhatsApp ainda.</div>
              ) : whatsappInteractions.map((i: any) => (
                <div key={i.id} className="flex items-start justify-between gap-3 text-sm border-b pb-2 last:border-0">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{i.real_estate_agencies?.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{i.feedback ?? i.next_steps ?? "—"}</div>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(i.created_at).toLocaleString("pt-BR")}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4" />Mensagens recentes</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Dir</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Consultor</TableHead>
                  <TableHead>Intent</TableHead>
                  <TableHead>Fluxo</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((m: any) => (
                  <TableRow key={m.id} className={m.status === "error" || m.status === "denied" ? "bg-destructive/5" : ""}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(m.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{m.direction === "inbound" ? "↓" : "↑"}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{m.phone}</TableCell>
                    <TableCell className="text-sm">{m.consultants?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-xs">{m.parsed_intent ?? "—"}</TableCell>
                    <TableCell className="text-xs">{m.flow ?? "—"}</TableCell>
                    <TableCell className="max-w-[280px] truncate text-sm" title={m.message_body}>{m.message_body}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        m.status === "error" || m.status === "denied" ? "border-destructive/40 text-destructive" :
                        m.status === "sent" || m.status === "processed" ? "border-success/40 text-success" : ""
                      }>{m.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {messages.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Nenhuma mensagem ainda. Configure o webhook no provedor.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" />Sessões</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Consultor</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Fluxo</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Atualizada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm">{s.consultants?.name ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{s.phone}</TableCell>
                    <TableCell className="text-xs">{s.current_flow ?? "—"}</TableCell>
                    <TableCell className="text-xs">{s.current_step}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        s.status === "active" ? "border-info/40 text-info" :
                        s.status === "completed" ? "border-success/40 text-success" :
                        "border-warning/40 text-warning"
                      }>{s.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(s.updated_at).toLocaleString("pt-BR")}</TableCell>
                  </TableRow>
                ))}
                {sessions.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Nenhuma sessão ainda.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
