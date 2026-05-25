/**
 * Bot engine — stateful flows for WhatsApp consultant updates.
 *
 * Pure server logic, uses supabaseAdmin (bypasses RLS — caller is verified
 * as a registered consultant via phone match).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { identifyIntent, type Intent } from "./intents";
import { normalizePhone } from "./provider";
import { NEGOTIATION_STATUSES, GUARANTOR_TYPES, BR_STATES, type NegotiationStatus } from "@/lib/constants";

type Consultant = {
  id: string;
  name: string;
  user_id: string | null;
};

type Session = {
  id: string;
  consultant_id: string;
  phone: string;
  current_flow: string | null;
  current_step: string;
  agency_id: string | null;
  session_data: Record<string, any>;
  status: string;
};

export interface BotContext {
  consultant: Consultant;
  session: Session;
  message: string;
}

export interface BotReply {
  text: string;
  /** Mark this session as completed after sending reply. */
  done?: boolean;
}

const MENU_TEXT =
  `📋 *Menu*\n` +
  `Digite uma opção ou comando:\n\n` +
  `1️⃣ Pendências da minha carteira\n` +
  `2️⃣ Atualizar uma imobiliária\n` +
  `3️⃣ Cadastrar nova imobiliária\n\n` +
  `Comandos: *menu*, *voltar*, *cancelar*, *ajuda*`;

const HELP_TEXT =
  `ℹ️ *Ajuda*\n` +
  `Comandos globais que funcionam a qualquer momento:\n` +
  `• *menu* — abre o menu principal\n` +
  `• *pendências* — lista o que precisa de update\n` +
  `• *nova* — cadastrar nova imobiliária\n` +
  `• *atualizar* — atualizar uma imobiliária da sua carteira\n` +
  `• *voltar* — voltar uma etapa\n` +
  `• *cancelar* — cancela o fluxo atual`;

// ---------- helpers ----------

async function findConsultantByPhone(phone: string): Promise<Consultant | null> {
  const normalized = normalizePhone(phone);
  // try a few common variants (with/without country code 55)
  const candidates = Array.from(new Set([
    normalized,
    `55${normalized}`,
    normalized.replace(/^55/, ""),
  ]));
  const { data } = await supabaseAdmin
    .from("consultants")
    .select("id, name, user_id, phone, active")
    .eq("active", true);
  if (!data) return null;
  const match = data.find((c: any) => candidates.includes(normalizePhone(c.phone ?? "")));
  return match ? { id: match.id, name: match.name, user_id: match.user_id } : null;
}

async function getOrCreateSession(consultant: Consultant, phone: string): Promise<Session> {
  const { data: active } = await supabaseAdmin
    .from("bot_sessions")
    .select("*")
    .eq("phone", phone)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active) return active as Session;

  const { data: created, error } = await supabaseAdmin
    .from("bot_sessions")
    .insert({
      consultant_id: consultant.id,
      phone,
      current_flow: null,
      current_step: "idle",
      session_data: {},
      status: "active",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return created as Session;
}

async function updateSession(id: string, patch: Partial<Session>) {
  const payload: any = { ...patch, last_message_at: new Date().toISOString(), expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() };
  await supabaseAdmin.from("bot_sessions").update(payload).eq("id", id);
}

async function closeSession(id: string, status: "completed" | "abandoned") {
  await supabaseAdmin.from("bot_sessions").update({ status, current_step: "done" }).eq("id", id);
}

function numberedList<T>(items: T[], render: (t: T, i: number) => string): string {
  return items.map((t, i) => `${i + 1}. ${render(t, i)}`).join("\n");
}

function parseChoice(message: string, max: number): number | null {
  const n = parseInt(message.trim(), 10);
  if (isNaN(n) || n < 1 || n > max) return null;
  return n;
}

function daysSince(date: string | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

// ---------- intent / command handling ----------

function isGlobalCommand(intent: Intent | null): boolean {
  return ["menu", "cancel", "back", "help", "pendencies", "new_agency", "update_agency"].includes(intent ?? "");
}

// ---------- public entry point ----------

export async function processInbound(opts: {
  phone: string;
  body: string;
  rawPayload: unknown;
}): Promise<{ reply: string | null; consultant: Consultant | null; sessionId: string | null; intent: Intent | null; flow: string | null; agencyId: string | null; error?: string }> {
  const phone = normalizePhone(opts.phone);
  const consultant = await findConsultantByPhone(phone);

  // Always log the inbound message
  const intent = identifyIntent(opts.body);

  if (!consultant) {
    await supabaseAdmin.from("whatsapp_messages").insert({
      direction: "inbound",
      phone,
      message_body: opts.body,
      raw_payload: opts.rawPayload as any,
      parsed_intent: intent,
      status: "denied",
      error_message: "Telefone não cadastrado em consultants",
    });
    return {
      reply: "🚫 Telefone não autorizado. Solicite a um administrador para cadastrar seu número na plataforma.",
      consultant: null,
      sessionId: null,
      intent,
      flow: null,
      agencyId: null,
    };
  }

  const session = await getOrCreateSession(consultant, phone);
  const inboundLog = await supabaseAdmin
    .from("whatsapp_messages")
    .insert({
      direction: "inbound",
      phone,
      consultant_id: consultant.id,
      message_body: opts.body,
      raw_payload: opts.rawPayload as any,
      parsed_intent: intent,
      flow: session.current_flow,
      agency_id: session.agency_id,
      status: "received",
    })
    .select("id")
    .single();

  try {
    const reply = await route({ consultant, session, message: opts.body });

    await supabaseAdmin.from("whatsapp_messages").update({ status: "processed" }).eq("id", inboundLog.data?.id);

    return {
      reply: reply.text,
      consultant,
      sessionId: session.id,
      intent,
      flow: session.current_flow,
      agencyId: session.agency_id,
    };
  } catch (e: any) {
    await supabaseAdmin
      .from("whatsapp_messages")
      .update({ status: "error", error_message: e?.message ?? "unknown" })
      .eq("id", inboundLog.data?.id);
    return {
      reply: "⚠️ Ocorreu um erro ao processar. Digite *menu* para reiniciar.",
      consultant,
      sessionId: session.id,
      intent,
      flow: session.current_flow,
      agencyId: session.agency_id,
      error: e?.message,
    };
  }
}

// ---------- router ----------

async function route(ctx: BotContext): Promise<BotReply> {
  const intent = identifyIntent(ctx.message);

  // Global commands — always available
  if (intent === "cancel") {
    await closeSession(ctx.session.id, "cancelled");
    return { text: "❌ Fluxo cancelado.\n\n" + MENU_TEXT, done: true };
  }
  if (intent === "help") {
    return { text: HELP_TEXT };
  }
  if (intent === "menu") {
    await updateSession(ctx.session.id, { current_flow: null, current_step: "menu", agency_id: null, session_data: {} });
    return { text: `Olá, ${ctx.consultant.name.split(" ")[0]}! 👋\n\n` + MENU_TEXT };
  }

  // Direct flow shortcuts
  if (intent === "pendencies") return startPendencies(ctx);
  if (intent === "new_agency") return startNewAgency(ctx);
  if (intent === "update_agency") return startUpdateAgency(ctx);

  // No active flow → menu choice
  if (!ctx.session.current_flow) {
    if (ctx.session.current_step === "idle") {
      await updateSession(ctx.session.id, { current_step: "menu" });
      return { text: `Olá, ${ctx.consultant.name.split(" ")[0]}! 👋\n\n` + MENU_TEXT };
    }
    const choice = parseChoice(ctx.message, 3);
    if (choice === 1) return startPendencies(ctx);
    if (choice === 2) return startUpdateAgency(ctx);
    if (choice === 3) return startNewAgency(ctx);
    return { text: "Não entendi. " + MENU_TEXT };
  }

  // Active flow — dispatch to its handler
  switch (ctx.session.current_flow) {
    case "update_agency": return runUpdateAgency(ctx);
    case "new_agency": return runNewAgency(ctx);
    case "pendencies": return runPendencies(ctx);
    default:
      await updateSession(ctx.session.id, { current_flow: null, current_step: "menu" });
      return { text: MENU_TEXT };
  }
}

// ---------- flow: pendencies ----------

async function fetchPendingAgencies(consultantId: string) {
  const fifteen = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("real_estate_agencies")
    .select("id, name, city, state, contract_stock, last_interaction_date, c_level_support_needed, negotiation_status")
    .eq("consultant_id", consultantId)
    .or(`last_interaction_date.is.null,last_interaction_date.lt.${fifteen},c_level_support_needed.eq.true,contract_stock.gte.50`)
    .not("negotiation_status", "in", "(Convertida,Sem interesse)")
    .order("last_interaction_date", { ascending: true, nullsFirst: true })
    .limit(5);
  return data ?? [];
}

async function startPendencies(ctx: BotContext): Promise<BotReply> {
  const pending = await fetchPendingAgencies(ctx.consultant.id);
  if (pending.length === 0) {
    await updateSession(ctx.session.id, { current_flow: null, current_step: "menu" });
    return { text: "✅ Você está em dia! Nenhuma pendência na sua carteira no momento.\n\n" + MENU_TEXT };
  }
  await updateSession(ctx.session.id, {
    current_flow: "pendencies",
    current_step: "select",
    session_data: { agencies: pending.map((a: any) => a.id) },
  });
  const text =
    `📌 *Você tem ${pending.length} pendência(s)*:\n\n` +
    numberedList(pending, (a: any) => {
      const d = daysSince(a.last_interaction_date);
      const tags = [
        d === null ? "sem update" : `${d}d sem update`,
        a.c_level_support_needed ? "C-Level" : null,
        a.contract_stock >= 50 ? `${a.contract_stock} contratos` : null,
      ].filter(Boolean).join(" · ");
      return `*${a.name}* (${a.city}/${a.state})\n   _${tags}_`;
    }) +
    `\n\nResponda com o número para atualizar, ou *menu* para voltar.`;
  return { text };
}

async function runPendencies(ctx: BotContext): Promise<BotReply> {
  const ids: string[] = ctx.session.session_data?.agencies ?? [];
  const choice = parseChoice(ctx.message, ids.length);
  if (!choice) return { text: `Responda com um número de 1 a ${ids.length}, ou *menu* para voltar.` };
  const agencyId = ids[choice - 1];
  // pivot into update flow with selected agency
  return enterUpdateFlowForAgency(ctx, agencyId);
}

// ---------- flow: update agency ----------

async function startUpdateAgency(ctx: BotContext): Promise<BotReply> {
  const { data: agencies } = await supabaseAdmin
    .from("real_estate_agencies")
    .select("id, name, city, state, last_interaction_date")
    .eq("consultant_id", ctx.consultant.id)
    .order("last_interaction_date", { ascending: true, nullsFirst: true })
    .limit(10);
  if (!agencies || agencies.length === 0) {
    return { text: "Você não possui imobiliárias atribuídas. Fale com o gestor." };
  }
  await updateSession(ctx.session.id, {
    current_flow: "update_agency",
    current_step: "choose_agency",
    session_data: { candidates: agencies.map((a: any) => a.id) },
  });
  return {
    text:
      `🏢 *Qual imobiliária deseja atualizar?*\n\n` +
      numberedList(agencies, (a: any) => `${a.name} — ${a.city}/${a.state}`) +
      `\n\nDigite o número.`,
  };
}

async function enterUpdateFlowForAgency(ctx: BotContext, agencyId: string): Promise<BotReply> {
  const { data: agency } = await supabaseAdmin
    .from("real_estate_agencies")
    .select("*")
    .eq("id", agencyId)
    .single();
  if (!agency) return { text: "Imobiliária não encontrada." };
  await updateSession(ctx.session.id, {
    current_flow: "update_agency",
    current_step: "what_happened",
    agency_id: agencyId,
    session_data: { agency_name: agency.name, draft: {} },
  });
  return {
    text:
      `✏️ Atualizando *${agency.name}*\n\n` +
      `O que aconteceu?\n` +
      numberedList(["Nova reunião", "Proposta enviada", "Em negociação", "Stand by", "Sem interesse", "Convertida", "Apenas comentário"], (s) => s),
  };
}

const WHAT_HAPPENED_MAP: Record<number, { status?: NegotiationStatus; type: string }> = {
  1: { status: "Reunião agendada", type: "Reunião" },
  2: { status: "Proposta enviada", type: "Proposta" },
  3: { status: "Em negociação", type: "Negociação" },
  4: { status: "Stand by", type: "Stand by" },
  5: { status: "Sem interesse", type: "Sem interesse" },
  6: { status: "Convertida", type: "Conversão" },
  7: { type: "Comentário" },
};

async function runUpdateAgency(ctx: BotContext): Promise<BotReply> {
  const step = ctx.session.current_step;
  const data = ctx.session.session_data ?? {};
  const draft = data.draft ?? {};
  const msg = ctx.message.trim();
  const setDraft = (patch: any, nextStep: string) =>
    updateSession(ctx.session.id, { current_step: nextStep, session_data: { ...data, draft: { ...draft, ...patch } } });

  switch (step) {
    case "choose_agency": {
      const ids: string[] = data.candidates ?? [];
      const choice = parseChoice(msg, ids.length);
      if (!choice) return { text: `Digite um número de 1 a ${ids.length}.` };
      return enterUpdateFlowForAgency(ctx, ids[choice - 1]);
    }
    case "what_happened": {
      const choice = parseChoice(msg, 7);
      if (!choice) return { text: "Escolha uma das opções de 1 a 7." };
      const m = WHAT_HAPPENED_MAP[choice];
      await setDraft({ status_after: m.status ?? null, interaction_type: m.type }, "feedback");
      return { text: "📝 Descreva o feedback dessa interação (1 mensagem):" };
    }
    case "feedback": {
      if (msg.length < 3) return { text: "Por favor, descreva com mais detalhes (mínimo 3 caracteres)." };
      await setDraft({ feedback: msg }, "next_steps");
      return { text: "➡️ Qual o próximo passo? (ex.: \"Enviar proposta semana que vem\")" };
    }
    case "next_steps": {
      await setDraft({ next_steps: msg }, "next_date");
      return { text: "📅 Há data prevista? Envie no formato DD/MM ou responda *não*." };
    }
    case "next_date": {
      let next_date: string | null = null;
      if (!/^n(ao)?$/i.test(msg)) {
        const m = msg.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if (!m) return { text: "Formato inválido. Use DD/MM, DD/MM/AAAA, ou *não*." };
        const year = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3])) : new Date().getFullYear();
        next_date = `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      }
      await setDraft({ next_date }, "c_level");
      return { text: "🚨 Precisa de apoio C-Level? *Sim* ou *Não*" };
    }
    case "c_level": {
      const c_level = /^s(im)?$/i.test(msg);
      await setDraft({ c_level_support_needed: c_level }, "offer");
      return { text: "💰 A proposta atual mudou? Descreva, ou responda *não*." };
    }
    case "offer": {
      const offer = /^n(ao)?$/i.test(msg) ? null : msg;
      await setDraft({ current_offer: offer }, "stock");
      return { text: "📦 Estoque estimado mudou? Envie o novo número, ou *não*." };
    }
    case "stock": {
      let stock: number | null = null;
      if (!/^n(ao)?$/i.test(msg)) {
        const n = parseInt(msg.replace(/\D/g, ""), 10);
        if (isNaN(n)) return { text: "Envie um número inteiro, ou *não*." };
        stock = n;
      }
      await setDraft({ contract_stock: stock }, "confirm");
      const d = { ...draft, contract_stock: stock };
      return {
        text:
          `📋 *Confirme a atualização de ${data.agency_name}*\n\n` +
          (d.status_after ? `• Status: ${d.status_after}\n` : "") +
          `• Feedback: ${d.feedback}\n` +
          `• Próximo: ${d.next_steps}${d.next_date ? ` (em ${d.next_date})` : ""}\n` +
          `• C-Level: ${d.c_level_support_needed ? "Sim" : "Não"}\n` +
          (d.current_offer ? `• Oferta: ${d.current_offer}\n` : "") +
          (d.contract_stock !== null ? `• Estoque: ${d.contract_stock}\n` : "") +
          `\n1️⃣ Confirmar  2️⃣ Editar feedback  3️⃣ Cancelar`,
      };
    }
    case "confirm": {
      const choice = parseChoice(msg, 3);
      if (choice === 3) {
        await closeSession(ctx.session.id, "cancelled");
        return { text: "❌ Atualização cancelada.\n\n" + MENU_TEXT, done: true };
      }
      if (choice === 2) {
        await updateSession(ctx.session.id, { current_step: "feedback" });
        return { text: "📝 Reescreva o feedback:" };
      }
      if (choice !== 1) return { text: "Responda 1 (Confirmar), 2 (Editar) ou 3 (Cancelar)." };

      // Persist: insert interaction (trigger updates agency)
      const d = draft;
      const { data: agencyBefore } = await supabaseAdmin
        .from("real_estate_agencies")
        .select("negotiation_status")
        .eq("id", ctx.session.agency_id!)
        .single();
      const { error } = await supabaseAdmin.from("agency_interactions").insert({
        agency_id: ctx.session.agency_id!,
        status_before: (agencyBefore as any)?.negotiation_status ?? null,
        status_after: d.status_after ?? null,
        feedback: d.feedback ?? null,
        next_steps: d.next_steps ?? null,
        current_offer: d.current_offer ?? null,
        contract_stock: d.contract_stock ?? null,
        c_level_support_needed: d.c_level_support_needed ?? null,
        interaction_type: d.interaction_type ?? "WhatsApp",
        source: "whatsapp",
        created_by: ctx.consultant.user_id,
        created_by_name: ctx.consultant.name,
      });
      if (error) throw error;
      await closeSession(ctx.session.id, "completed");
      return {
        text:
          `✅ *${data.agency_name}* atualizada com sucesso!\n` +
          `Histórico salvo. Obrigado, ${ctx.consultant.name.split(" ")[0]}.\n\n` +
          `Digite *menu* para outra ação.`,
        done: true,
      };
    }
    default:
      await updateSession(ctx.session.id, { current_flow: null, current_step: "menu" });
      return { text: MENU_TEXT };
  }
}

// ---------- flow: new agency ----------

async function startNewAgency(ctx: BotContext): Promise<BotReply> {
  await updateSession(ctx.session.id, {
    current_flow: "new_agency",
    current_step: "name",
    agency_id: null,
    session_data: { draft: {} },
  });
  return { text: "🆕 *Cadastro de nova imobiliária*\n\nQual o nome da imobiliária?" };
}

async function runNewAgency(ctx: BotContext): Promise<BotReply> {
  const step = ctx.session.current_step;
  const data = ctx.session.session_data ?? {};
  const draft = data.draft ?? {};
  const msg = ctx.message.trim();
  const setDraft = (patch: any, nextStep: string) =>
    updateSession(ctx.session.id, { current_step: nextStep, session_data: { ...data, draft: { ...draft, ...patch } } });

  switch (step) {
    case "name": {
      if (msg.length < 2) return { text: "Nome muito curto. Tente novamente." };
      await setDraft({ name: msg }, "city");
      return { text: "📍 Cidade?" };
    }
    case "city": {
      await setDraft({ city: msg }, "state");
      return { text: "🗺️ UF? (sigla com 2 letras, ex.: SP)" };
    }
    case "state": {
      const uf = msg.toUpperCase().slice(0, 2);
      if (!BR_STATES.includes(uf as any)) return { text: `UF inválida. Envie uma das: ${BR_STATES.join(", ")}` };
      // Dedup check
      const { data: similar } = await supabaseAdmin
        .from("real_estate_agencies")
        .select("id, name, city, state")
        .ilike("name", `%${draft.name}%`)
        .ilike("city", `%${draft.city}%`)
        .eq("state", uf)
        .limit(1)
        .maybeSingle();
      if (similar) {
        await updateSession(ctx.session.id, {
          current_step: "dedup",
          session_data: { ...data, draft: { ...draft, state: uf }, similar_id: similar.id, similar_name: similar.name },
        });
        return {
          text:
            `⚠️ Encontrei uma imobiliária parecida:\n*${similar.name}* (${similar.city}/${similar.state}).\n\n` +
            `1️⃣ Atualizar a existente\n2️⃣ Criar nova mesmo assim\n3️⃣ Cancelar`,
        };
      }
      await setDraft({ state: uf }, "stock");
      return { text: "📦 Estoque estimado de contratos? (número inteiro, ou 0 se não souber)" };
    }
    case "dedup": {
      const choice = parseChoice(msg, 3);
      if (choice === 3) {
        await closeSession(ctx.session.id, "cancelled");
        return { text: "❌ Cancelado.", done: true };
      }
      if (choice === 1) {
        const sid = data.similar_id;
        return enterUpdateFlowForAgency(ctx, sid);
      }
      if (choice === 2) {
        await updateSession(ctx.session.id, { current_step: "stock", session_data: { ...data, draft } });
        return { text: "📦 Estoque estimado de contratos? (número inteiro)" };
      }
      return { text: "Responda 1, 2 ou 3." };
    }
    case "stock": {
      const n = parseInt(msg.replace(/\D/g, ""), 10);
      if (isNaN(n)) return { text: "Envie um número inteiro." };
      await setDraft({ contract_stock: n }, "guarantor");
      return { text: "🛡️ Qual o garantidor atual? (nome da empresa, ou *não tem*)" };
    }
    case "guarantor": {
      const g = /^n(ao tem|ao)?$/i.test(msg) ? null : msg;
      await setDraft({ current_guarantor: g }, "guarantor_type");
      return { text: `Tipo de garantidor?\n${numberedList([...GUARANTOR_TYPES], (s) => s)}` };
    }
    case "guarantor_type": {
      const c = parseChoice(msg, GUARANTOR_TYPES.length);
      if (!c) return { text: `Escolha de 1 a ${GUARANTOR_TYPES.length}.` };
      await setDraft({ guarantor_type: GUARANTOR_TYPES[c - 1] }, "contact_name");
      return { text: "👤 Nome do contato principal?" };
    }
    case "contact_name": {
      await setDraft({ main_contact: msg }, "contact_role");
      return { text: "💼 Cargo do contato?" };
    }
    case "contact_role": {
      await setDraft({ contact_role: msg }, "status");
      return { text: `Status inicial?\n${numberedList([...NEGOTIATION_STATUSES], (s) => s)}` };
    }
    case "status": {
      const c = parseChoice(msg, NEGOTIATION_STATUSES.length);
      if (!c) return { text: `Escolha de 1 a ${NEGOTIATION_STATUSES.length}.` };
      await setDraft({ negotiation_status: NEGOTIATION_STATUSES[c - 1] }, "next_steps");
      return { text: "➡️ Próximo passo?" };
    }
    case "next_steps": {
      await setDraft({ next_steps: msg }, "confirm");
      const d = { ...draft, next_steps: msg };
      return {
        text:
          `📋 *Confirme o cadastro*\n\n` +
          `• Nome: ${d.name}\n` +
          `• ${d.city}/${d.state}\n` +
          `• Estoque: ${d.contract_stock}\n` +
          `• Garantidor: ${d.current_guarantor ?? "—"} (${d.guarantor_type})\n` +
          `• Contato: ${d.main_contact} — ${d.contact_role}\n` +
          `• Status: ${d.negotiation_status}\n` +
          `• Próximo: ${d.next_steps}\n\n` +
          `1️⃣ Confirmar  2️⃣ Cancelar`,
      };
    }
    case "confirm": {
      const c = parseChoice(msg, 2);
      if (c === 2) {
        await closeSession(ctx.session.id, "cancelled");
        return { text: "❌ Cadastro cancelado.", done: true };
      }
      if (c !== 1) return { text: "Responda 1 (Confirmar) ou 2 (Cancelar)." };
      const { data: created, error } = await supabaseAdmin
        .from("real_estate_agencies")
        .insert({
          ...draft,
          consultant_id: ctx.consultant.id,
          created_by: ctx.consultant.user_id,
          updated_by: ctx.consultant.user_id,
        })
        .select("id")
        .single();
      if (error) throw error;
      // Log creation as an interaction
      await supabaseAdmin.from("agency_interactions").insert({
        agency_id: created.id,
        status_after: draft.negotiation_status,
        feedback: "Imobiliária cadastrada via WhatsApp",
        next_steps: draft.next_steps,
        interaction_type: "Cadastro",
        source: "whatsapp",
        created_by: ctx.consultant.user_id,
        created_by_name: ctx.consultant.name,
      });
      await closeSession(ctx.session.id, "completed");
      return {
        text: `✅ *${draft.name}* cadastrada e atribuída à sua carteira!\n\nDigite *menu* para outra ação.`,
        done: true,
      };
    }
    default:
      await updateSession(ctx.session.id, { current_flow: null, current_step: "menu" });
      return { text: MENU_TEXT };
  }
}
