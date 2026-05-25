
# Plataforma de Gestão de Carteira de Imobiliárias

Camada executiva (não-CRM) para acompanhar portabilidade, targets, próximos passos e atualizações via WhatsApp. HubSpot continua como CRM operacional dos consultores.

## Stack
- TanStack Start + React 19 + Tailwind v4 + shadcn
- Lovable Cloud (Supabase) para DB, auth, RLS, storage e endpoint público
- Recharts para gráficos, TanStack Query para data, react-hook-form + zod
- SheetJS (xlsx) para importação client-side

---

## 1. Modelo de dados (migrations)

**enums**
- `app_role`: `admin | manager | consultant`
- `negotiation_status`: Pipeline de Prospecção, Conversas iniciadas, Reunião agendada, Aguardando base, Stand by, Sem interesse, Proposta enviada, Em negociação, Convertida
- `guarantor_type`: Garantia Propria, Concorrente, Seguradora, Outro
- `update_source`: web, whatsapp, import
- `bot_session_status`: active, completed, abandoned
- `message_direction`: inbound, outbound

**Tabelas** (conforme especificação do usuário, com ajustes):
- `real_estate_agencies` — todos os campos pedidos + `consultant_id`, `created_by`, `updated_by` (uuid → auth.users), constraint unique `(lower(name), lower(city), state)` para dedupe
- `agency_interactions` — histórico imutável (sem UPDATE/DELETE via RLS)
- `consultants` — `user_id` (fk auth.users opcional), `phone` indexado
- `whatsapp_messages` — log bruto + parsed_intent
- `bot_sessions` — estado conversacional, `session_data jsonb`
- `user_roles` (separada, padrão Lovable) + função `has_role(uuid, app_role)` security definer
- `hubspot_mappings` — `agency_id`, `hubspot_company_id`, `hubspot_contact_id` (estrutura pronta, sem sync agora)

**Triggers**
- `update_updated_at` em agencies
- Ao inserir em `agency_interactions`: atualizar `last_interaction_date`, incrementar `total_interactions`, propagar `status_after` e `next_steps` para a agency

**RLS**
- admin: tudo
- manager: leitura total, escrita em agencies/interactions
- consultant: só linhas onde `consultant_id` corresponde ao seu `user_id`; pode inserir interações nas suas agencies
- `whatsapp_messages` / `bot_sessions`: apenas service role (servidor)

---

## 2. Autenticação
- Email/senha + Google (via broker Lovable)
- Página `/login`, layout `_authenticated`, gate Supabase no child (padrão TanStack)
- Bootstrap: primeiro usuário = admin; tela de gerenciamento de usuários/roles para admin

---

## 3. Rotas e telas

```
/                         redireciona para /dashboard
/login
/_authenticated/
  dashboard               Dashboard Executivo
  portfolio               Gestão de Carteira (tabela + filtros laterais)
  portfolio/$agencyId     Detalhe da imobiliária
  portfolio/new           Cadastro manual
  import                  Importação XLSX/CSV (admin)
  consultants             Gestão de consultores (admin/gestor)
  settings/hubspot        Configuração HubSpot (estrutura)
  settings/users          Roles (admin)
/api/public/whatsapp/webhook   server route (HMAC verify)
```

### Dashboard Executivo
Cards: total imobiliárias, estoque total contratos, por status, com concorrente, com garantia própria, sem atualização há >15 dias, precisam de apoio C-Level.
Gráficos (Recharts): pizza status, barras estoque por regional, pizza tipo garantidor, barras pipeline por UF.
Tabela priorizada: score = estoque×peso + status_peso + flag C-Level + dias_sem_atualização. Top 20 com próximos passos pendentes.

### Gestão de Carteira
Tabela com sticky header, filtros laterais (consultor, status, UF, cidade, tipo garantidor, garantidor, C-Level). Badges de status, alerta visual para >15 dias sem atualização, destaque para C-Level. Busca textual.

### Detalhe da Imobiliária
Header com nome/cidade/status. Tabs: Visão geral, Histórico de interações (timeline), Próximos passos, HubSpot. Botão "Registrar interação" abre drawer (formulário equivalente ao fluxo WhatsApp).

### Cadastro Manual / Importação
- Form com zod, campos obrigatórios marcados
- Importação: parse client-side com xlsx, mapeamento de colunas, validação, detecção de duplicatas por (name+city+UF), preview com diff (criar/atualizar/erro), confirmação envia em batch via server fn

---

## 4. WhatsApp bot (estrutura)

**Server route**: `POST /api/public/whatsapp/webhook` — verifica HMAC (`WHATSAPP_WEBHOOK_SECRET`), persiste em `whatsapp_messages`, despacha para máquina de estados.

**Máquina de estados** (`bot_sessions.current_step`):
```
idle → menu → choose_agency → ask_status → ask_feedback →
ask_next_step → ask_c_level → ask_offer → ask_stock → confirm → done
```
- Intents top-level: "atualizar X", "cadastrar nova", "ver pendências", "atualizar próximos passos"
- Imobiliária não encontrada → oferece cadastro (sub-fluxo reduzido)
- Resposta incompleta → repergunta
- Ao confirmar: insere `agency_interactions` com `source='whatsapp'`, `created_by` = consultor identificado pelo phone

**Envio de mensagens**: helper `sendWhatsApp()` em arquivo `.server.ts`. Provedor configurável via secret (placeholder, sem provedor concreto até o usuário definir — Twilio/Z-API/UAZAPI). Documentar onde plugar.

**Cron de prospecção** (mensagem periódica "quais imobiliárias quer atualizar?"): server route `/api/public/cron/whatsapp-nudge` protegida por secret, agendável depois.

---

## 5. Importação da planilha base
Script de seed opcional + UI. Mapeamento dos campos da planilha já analisada (datas "07/05" → ano corrente, normalização de status como "Não tem iteresse" → "Sem interesse", "Reunião agendada" etc.). Garantidor "Garantia propria" / "Credaluga" / "Seguradoras" etc. já cobertos pelo enum guarantor_type.

---

## 6. UX/UI
Estética executiva, neutra, cards arredondados, tipografia limpa. Tokens semânticos em `src/styles.css` (oklch). Sidebar colapsável com seções Dashboard / Carteira / Importação / Configurações. Sem cara de planilha — tabela usa shadcn DataTable com densidade confortável, status como badges coloridos sutis, alertas em accent.

Antes de codar a UI vou propor 2-3 direções visuais via `design--create_directions` para você escolher.

---

## 7. Permissões resumidas

| Ação | Admin | Gestor | Consultor |
|---|---|---|---|
| Ver dashboard | ✓ | ✓ | filtrado |
| Ver toda carteira | ✓ | ✓ | só dele |
| Editar agency | ✓ | ✓ | só dele |
| Importar | ✓ | — | — |
| Gerenciar usuários/roles | ✓ | — | — |
| Configurar HubSpot | ✓ | — | — |

---

## 8. Fora de escopo nesta entrega
- Sync real bidirecional com HubSpot (só estrutura de mapping + UI de config)
- Provedor concreto de WhatsApp (estrutura pronta, secret a definir)
- Cron real agendado (endpoint pronto)

## 9. Ordem de implementação
1. Habilitar Lovable Cloud + migrations completas + RLS + triggers
2. Auth + roles + layout `_authenticated`
3. Direções de design → escolha
4. Dashboard + Carteira + Detalhe + Cadastro
5. Importação XLSX
6. Webhook WhatsApp + máquina de estados + helper de envio
7. Configuração HubSpot (UI + tabela)
8. Polish, alertas visuais, ranking executivo

Pronto para implementar? Confirme e eu sigo (vou pedir provedor de WhatsApp e perguntar sobre direção visual no caminho).
