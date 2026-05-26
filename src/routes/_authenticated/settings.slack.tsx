import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, CheckCircle2, AlertTriangle, Activity, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SLACK_URLS } from "@/lib/slack/constants";
import { getSlackDiagnostics, testSlackCommandsEndpoint } from "@/lib/slack/diagnostics.functions";

export const Route = createFileRoute("/_authenticated/settings/slack")({
  component: SlackSettingsPage,
});

const URLS = SLACK_URLS;

const MANIFEST = {
  display_information: {
    name: "Loft Carteira",
    description: "Operação da carteira de imobiliárias direto no Slack.",
    background_color: "#0a0a0a",
  },
  features: {
    bot_user: { display_name: "Loft Carteira", always_online: true },
    slash_commands: [
      { command: "/carteira", url: URLS.commands, description: "Menu principal da carteira", should_escape: false },
      { command: "/pendencias", url: URLS.commands, description: "Lista pendências da sua carteira", should_escape: false },
      { command: "/atualizar", url: URLS.commands, description: "Atualiza uma imobiliária", should_escape: false },
      { command: "/nova-imobiliaria", url: URLS.commands, description: "Cadastra uma nova imobiliária", should_escape: false },
    ],
  },
  oauth_config: {
    scopes: {
      bot: ["chat:write", "commands", "im:write", "users:read", "users:read.email"],
    },
  },
  settings: {
    event_subscriptions: { request_url: URLS.events, bot_events: ["app_mention"] },
    interactivity: { is_enabled: true, request_url: URLS.interactions },
    org_deploy_enabled: false,
    socket_mode_enabled: false,
    token_rotation_enabled: false,
  },
};

function SlackSettingsPage() {
  const [copied, setCopied] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const fetchDiagnostics = useServerFn(getSlackDiagnostics);
  const testCommands = useServerFn(testSlackCommandsEndpoint);

  const { data: events = [] } = useQuery({
    queryKey: ["slack-events-recent"],
    queryFn: async () => {
      const { data } = await supabase
        .from("slack_events")
        .select("event_type, status, created_at, slack_user_id")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
    refetchInterval: 10_000,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["slack-sessions-recent"],
    queryFn: async () => {
      const { data } = await supabase
        .from("slack_sessions")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
    refetchInterval: 10_000,
  });

  const { data: diagnostics } = useQuery({
    queryKey: ["slack-diagnostics"],
    queryFn: () => fetchDiagnostics(),
    refetchInterval: 10_000,
  });

  const testMutation = useMutation({
    mutationFn: () => testCommands(),
    onSuccess: (res) => {
      toast.success(`/commands respondeu HTTP ${res.status} em ${res.durationMs}ms`);
      queryClient.invalidateQueries({ queryKey: ["slack-diagnostics"] });
      queryClient.invalidateQueries({ queryKey: ["slack-events-recent"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Falha ao testar /commands"),
  });

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    toast.success(`${label} copiado`);
    setTimeout(() => setCopied(null), 1500);
  };

  const hasEvents = events.length > 0;
  const last = diagnostics?.lastCommand;
  const payload = (last?.payload ?? {}) as any;
  const response = (last?.response ?? {}) as any;
  const hmac = payload?.hmac ?? {};

  return (
    <div>
      <PageHeader
        title="Slack Bot · Setup"
        description="Conecte o canal Slack como assistente operacional da carteira. Siga a sequência abaixo uma vez."
      />

      <div className="p-6 lg:p-10 space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Status
            </CardTitle>
            <div className="flex gap-2">
              {hasEvents ? (
                <Badge className="border-success/40 text-success" variant="outline">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> recebendo eventos
                </Badge>
              ) : (
                <Badge className="border-warning/40 text-warning" variant="outline">
                  <AlertTriangle className="h-3 w-3 mr-1" /> aguardando primeiro evento
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {hasEvents
              ? `Último evento: ${new Date(events[0].created_at).toLocaleString("pt-BR")} (${events[0].event_type}).`
              : "Nenhum evento recebido ainda. Finalize o passo 3 abaixo e dispare `/carteira` no Slack."}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">Diagnóstico /commands</CardTitle>
            <Button size="sm" variant="secondary" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
              <RefreshCw className={`h-3 w-3 mr-1 ${testMutation.isPending ? "animate-spin" : ""}`} />
              Testar endpoint /commands
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {diagnostics?.environment !== "production" && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                <div className="font-medium">Endpoint público de produção ainda não está ativo.</div>
                <div className="mt-1 text-xs">
                  O Slack não consegue chamar a URL de preview/dev porque ela redireciona para autenticação. Publique o app e use exatamente a URL de produção abaixo no manifest.
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
              <div className="font-medium">Última requisição recebida</div>
              <div className="text-xs text-muted-foreground">Timestamp: {last ? new Date(last.created_at).toLocaleString("pt-BR") : "—"}</div>
              <div className="text-xs text-muted-foreground">Command: {payload?.command ?? last?.event_type ?? "—"}</div>
              <div className="text-xs text-muted-foreground">user_id: {payload?.user_id ?? last?.slack_user_id ?? "—"}</div>
              <div className="text-xs text-muted-foreground">team_id: {payload?.team_id ?? last?.slack_team_id ?? "—"}</div>
              <div className="text-xs text-muted-foreground">response_url presente: {payload?.response_url_present ? "sim" : "não"}</div>
              <div className="text-xs text-muted-foreground">ACK: {response?.ack?.status ?? "—"} {response?.ack?.durationMs !== undefined ? `· ${response.ack.durationMs}ms · ${response.ack.mode}` : ""}</div>
              <div className="text-xs text-muted-foreground">Ambiente atual: <Badge variant="outline" className="text-[10px]">{diagnostics?.environment ?? "—"}</Badge></div>
            </div>

            <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
              <div className="font-medium">Validação HMAC</div>
              <div className="text-xs text-muted-foreground">x-slack-signature presente: {hmac?.hasSignature ? "sim" : "não"}</div>
              <div className="text-xs text-muted-foreground">x-slack-request-timestamp presente: {hmac?.hasTimestamp ? "sim" : "não"}</div>
              <div className="text-xs text-muted-foreground">timestamp drift: {hmac?.timestampDriftSeconds ?? "—"}s</div>
              <div className="text-xs text-muted-foreground">assinatura calculada: {hmac?.calculatedSignaturePrefix ?? "—"}…</div>
              <div className="text-xs text-muted-foreground">assinatura recebida: {hmac?.receivedSignaturePrefix ?? "—"}…</div>
              <Badge className={hmac?.valid ? "border-success/40 text-success" : "border-destructive/40 text-destructive"} variant="outline">
                {hmac?.valid ? "valid" : "invalid"}{hmac?.reason ? ` · ${hmac.reason}` : ""}
              </Badge>
            </div>

            <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
              <div className="font-medium">Secrets carregados</div>
              <div className="text-xs text-muted-foreground">SLACK_BOT_TOKEN presente: {diagnostics?.secrets.hasBotToken ? "sim" : "não"}</div>
              <div className="text-xs text-muted-foreground">SLACK_SIGNING_SECRET presente: {diagnostics?.secrets.hasSigningSecret ? "sim" : "não"}</div>
              <div className="text-xs text-muted-foreground">SLACK_CRON_SECRET presente: {diagnostics?.secrets.hasCronSecret ? "sim" : "não"}</div>
              <div className="text-xs text-muted-foreground">Signing Secret termina em: {diagnostics?.secrets.signingSecretLast4 ? `••••${diagnostics.secrets.signingSecretLast4}` : "—"}</div>
            </div>

            <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
              <div className="font-medium">URL pública do manifest</div>
              <code className="block text-xs bg-background/70 border border-border rounded px-2 py-1 break-all">{diagnostics?.expectedCommandsUrl ?? URLS.commands}</code>
              <Badge className={diagnostics?.manifestUrlMatchesProduction ? "border-success/40 text-success" : "border-destructive/40 text-destructive"} variant="outline">
                {diagnostics?.manifestUrlMatchesProduction ? "URL de produção correta" : "URL divergente"}
              </Badge>
              <div className="text-xs text-muted-foreground">Health: <code>{URLS.health}</code></div>
              <div className="text-xs text-muted-foreground">URL atual da tela: <code>{diagnostics?.currentCommandsUrl ?? "—"}</code></div>
            </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Passo 1 · Criar o Slack App</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                Acesse <a className="text-primary underline inline-flex items-center gap-1" href="https://api.slack.com/apps?new_app=1" target="_blank" rel="noreferrer">api.slack.com/apps <ExternalLink className="h-3 w-3" /></a> e clique <b>Create New App → From a manifest</b>.
              </li>
              <li>Selecione o workspace.</li>
              <li>Cole o manifest JSON abaixo, revise e crie o app.</li>
            </ol>
            <div className="relative">
              <pre className="bg-muted/40 border border-border rounded-lg p-4 text-xs overflow-auto max-h-80">{JSON.stringify(MANIFEST, null, 2)}</pre>
              <Button size="sm" variant="secondary" className="absolute top-2 right-2" onClick={() => copy("Manifest", JSON.stringify(MANIFEST, null, 2))}>
                <Copy className="h-3 w-3 mr-1" /> {copied === "Manifest" ? "✓" : "Copiar manifest"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Passo 2 · Instalar no workspace e copiar credenciais</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ol className="list-decimal pl-5 space-y-2">
              <li>Em <b>Install App</b>, clique <b>Install to Workspace</b> e autorize.</li>
              <li>Em <b>OAuth & Permissions</b>, copie o <b>Bot User OAuth Token</b> (começa com <code>xoxb-</code>).</li>
              <li>Em <b>Basic Information → App Credentials</b>, copie o <b>Signing Secret</b>.</li>
              <li>Volte aqui e nos avise — vamos pedir esses dois valores como secrets.</li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Passo 3 · URLs do app (já no manifest)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(URLS).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-sm">
                <code className="text-xs uppercase tracking-wider text-muted-foreground w-24">{k}</code>
                <code className="flex-1 bg-muted/40 border border-border rounded px-2 py-1 text-xs truncate">{v}</code>
                <Button size="sm" variant="ghost" onClick={() => copy(k, v)}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-2">URLs estáveis (sobrevivem a renomeio do projeto). Já estão no manifest acima.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Passo 4 · Mapeamento de consultores</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>O bot identifica cada consultor pelo <b>e-mail Slack</b> e busca pelo mesmo e-mail na tabela de Consultores. Garanta que o e-mail cadastrado em <i>Consultores</i> seja o mesmo do Slack de cada pessoa.</p>
            <p className="text-muted-foreground text-xs">Após o primeiro uso, o <code>slack_user_id</code> fica em cache automaticamente.</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Eventos recentes</CardTitle></CardHeader>
            <CardContent className="space-y-1 max-h-72 overflow-auto">
              {events.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nenhum evento ainda.</div>
              ) : events.map((e: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs border-b border-border/40 pb-1">
                  <code>{e.event_type}</code>
                  <span className="text-muted-foreground">{new Date(e.created_at).toLocaleTimeString("pt-BR")}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Sessões ativas</CardTitle></CardHeader>
            <CardContent className="space-y-1 max-h-72 overflow-auto">
              {sessions.length === 0 ? (
                <div className="text-sm text-muted-foreground">Sem sessões ainda.</div>
              ) : sessions.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between text-xs border-b border-border/40 pb-1">
                  <span><code>{s.current_flow}</code> · {s.current_step}</span>
                  <Badge variant="outline" className="text-[10px]">{s.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
