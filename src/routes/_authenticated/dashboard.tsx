import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Briefcase, Target, AlertTriangle, ArrowRight, CalendarClock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { NEGOTIATION_STATUSES, daysSince } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data: agencies = [], isLoading } = useQuery({
    queryKey: ["agencies-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("real_estate_agencies")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const total = agencies.length;
  const converted = agencies.filter((a) => a.negotiation_status === "Convertida").length;
  const inNegotiation = agencies.filter((a) =>
    ["Em negociação", "Proposta enviada", "Reunião agendada"].includes(a.negotiation_status as string)
  ).length;
  const cLevel = agencies.filter((a) => a.c_level_support_needed).length;
  const stale = agencies.filter((a) => {
    const d = daysSince(a.last_interaction_date);
    return d === null || d > 14;
  }).length;
  const stockTotal = agencies.reduce((acc, a) => acc + (a.contract_stock ?? 0), 0);
  const convertedStock = agencies
    .filter((a) => a.negotiation_status === "Convertida")
    .reduce((acc, a) => acc + (a.contract_stock ?? 0), 0);

  const statusData = NEGOTIATION_STATUSES.map((s) => ({
    name: s,
    value: agencies.filter((a) => a.negotiation_status === s).length,
  })).filter((d) => d.value > 0);

  const stateData = Object.entries(
    agencies.reduce<Record<string, number>>((acc, a) => {
      const k = a.state ?? "—";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {})
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const stalest = [...agencies]
    .filter((a) => !["Convertida", "Sem interesse"].includes(a.negotiation_status as string))
    .sort((a, b) => {
      const da = a.last_interaction_date ? new Date(a.last_interaction_date).getTime() : 0;
      const db = b.last_interaction_date ? new Date(b.last_interaction_date).getTime() : 0;
      return da - db;
    })
    .slice(0, 6);

  const CHART_COLORS = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard Executivo"
        description="Visão consolidada de carteira, conversão e próximos passos."
        actions={
          <Button asChild>
            <Link to="/portfolio">
              Ver carteira <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        }
      />

      <div className="p-6 lg:p-10 space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Carteira total" value={total} icon={<Building2 className="h-5 w-5" />} hint={`${stockTotal} contratos sob negociação`} />
          <StatCard label="Em negociação" value={inNegotiation} icon={<Briefcase className="h-5 w-5" />} tone="info" />
          <StatCard label="Convertidas" value={converted} icon={<Target className="h-5 w-5" />} tone="success" hint={`${convertedStock} contratos convertidos`} />
          <StatCard label="Suporte C-Level" value={cLevel} icon={<AlertTriangle className="h-5 w-5" />} tone="warning" hint={`${stale} sem update há 14+ dias`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Funil por Status</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              {isLoading ? (
                <div className="text-sm text-muted-foreground">Carregando…</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusData} margin={{ left: -10, bottom: 40 }}>
                    <XAxis dataKey="name" angle={-25} textAnchor="end" interval={0} fontSize={11} stroke="var(--muted-foreground)" />
                    <YAxis allowDecimals={false} fontSize={11} stroke="var(--muted-foreground)" />
                    <Tooltip cursor={{ fill: "var(--accent)" }} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {statusData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top UFs</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stateData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50}>
                    {stateData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Sem update há mais tempo</CardTitle>
            <Button asChild variant="ghost" size="sm"><Link to="/portfolio">Ver todas</Link></Button>
          </CardHeader>
          <CardContent>
            {stalest.length === 0 ? (
              <div className="text-sm text-muted-foreground">Nenhuma imobiliária pendente.</div>
            ) : (
              <div className="divide-y">
                {stalest.map((a) => {
                  const d = daysSince(a.last_interaction_date);
                  return (
                    <Link
                      key={a.id}
                      to="/portfolio/$agencyId"
                      params={{ agencyId: a.id }}
                      className="flex items-center justify-between py-3 hover:bg-accent/40 -mx-2 px-2 rounded-md transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{a.name}</div>
                        <div className="text-xs text-muted-foreground">{a.city} · {a.state} · {a.contract_stock ?? 0} contratos</div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <StatusBadge status={a.negotiation_status as string} />
                        <span className={`text-xs ${d === null || d > 30 ? "text-destructive" : "text-muted-foreground"}`}>
                          {d === null ? "Sem registro" : `${d}d`}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
