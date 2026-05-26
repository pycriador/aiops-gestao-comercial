import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { slack } from "./client.server";
import { resolveConsultant, isPrivileged, type SlackConsultant } from "./consultant.server";
import {
  homeMenu, pickAgencyView, updateAgencyView, newAgencyView, confirmView, pendingsBlocks, clevelView,
} from "./blocks";
import { daysSince } from "@/lib/constants";

// --------- agency access ----------
async function listAgenciesForConsultant(consultant: SlackConsultant) {
  const privileged = await isPrivileged(consultant.user_id);
  let q = supabaseAdmin
    .from("real_estate_agencies")
    .select("id, name, city, state, negotiation_status, contract_stock, c_level_support_needed, last_interaction_date, next_steps, current_offer, current_guarantor, guarantor_type, feedback, main_contact, consultant_id")
    .order("name", { ascending: true })
    .limit(200);
  if (!privileged) q = q.eq("consultant_id", consultant.id);
  const { data } = await q;
  return data ?? [];
}

async function listConsultantsForPicker() {
  const { data } = await supabaseAdmin
    .from("consultants")
    .select("id, name, active")
    .eq("active", true)
    .order("name", { ascending: true })
    .limit(100);
  return (data ?? []).map((c: any) => ({ id: c.id, name: c.name }));
}

async function getAgency(id: string, consultant: SlackConsultant) {
  const privileged = await isPrivileged(consultant.user_id);
  const { data } = await supabaseAdmin
    .from("real_estate_agencies")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  if (!privileged && data.consultant_id !== consultant.id) return null;
  return data;
}

// --------- public entry: command + button handlers ----------

export async function handleCommand(args: {
  command: string;            // e.g. /carteira
  slackUserId: string;
  channelId: string;
  trigger_id: string;
  text: string;
}): Promise<{ response_type?: string; text?: string; blocks?: any[] }> {
  console.log(`[slack.flow] handleCommand start`, { command: args.command, user: args.slackUserId });

  // /carteira responde imediatamente sem depender de DB ou API Slack — apenas mostra o menu.
  if (args.command === "/carteira") {
    return { response_type: "ephemeral", ...homeMenu() };
  }

  const tConsult = Date.now();
  const consultant = await resolveConsultant(args.slackUserId);
  console.log(`[slack.flow] resolveConsultant ${Date.now() - tConsult}ms`, { found: !!consultant });
  if (!consultant) {
    return {
      response_type: "ephemeral",
      text: "Não encontrei seu e-mail Slack na base de consultores. Peça ao admin para te cadastrar em Consultores no painel Loft.",
    };
  }

  switch (args.command) {
    case "/pendencias": {
      const items = await pendingsFor(consultant);
      return { response_type: "ephemeral", blocks: pendingsBlocks(items) };
    }
    case "/nova-imobiliaria": {
      const consultants = await listConsultantsForPicker();
      await slack.openView(args.trigger_id, newAgencyView({ consultants }));
      return { response_type: "ephemeral", text: "Abrindo cadastro…" };
    }
    case "/atualizar": {
      const agencies = await listAgenciesForConsultant(consultant);
      await slack.openView(args.trigger_id, pickAgencyView({
        agencies, flow: "atualizar", title: "Atualizar imobiliária", submitLabel: "Próximo",
      }));
      return { response_type: "ephemeral", text: "Selecione a imobiliária…" };
    }
    default:
      return { response_type: "ephemeral", text: "Comando desconhecido." };
  }
}


const STALE_STATUSES = new Set([
  "Reunião agendada",
  "Aguardando base",
  "Proposta enviada",
  "Em negociação",
]);

async function pendingsFor(consultant: SlackConsultant) {
  const agencies = await listAgenciesForConsultant(consultant);
  const items = agencies
    .map((a: any) => ({
      id: a.id,
      name: a.name,
      city: a.city,
      state: a.state,
      status: a.negotiation_status,
      stock: a.contract_stock ?? 0,
      next_steps: a.next_steps ?? null,
      clevel: !!a.c_level_support_needed,
      days: daysSince(a.last_interaction_date),
      last_interaction_date: a.last_interaction_date ?? null,
    }))
    .filter((a) => {
      const noInteraction = a.days === null;
      const stale = (a.days ?? 0) > 15;
      const clevel = a.clevel;
      const noNextSteps = !a.next_steps || !String(a.next_steps).trim();
      const staleStatus = STALE_STATUSES.has(a.status) && (a.days === null || (a.days ?? 0) > 15);
      return noInteraction || stale || clevel || noNextSteps || staleStatus;
    })
    .sort((a, b) => {
      // 1. C-Level first
      if (a.clevel !== b.clevel) return a.clevel ? -1 : 1;
      // 2. Higher stock first
      if (b.stock !== a.stock) return b.stock - a.stock;
      // 3. More days without update first (null = never = highest)
      const da = a.days ?? Number.MAX_SAFE_INTEGER;
      const db = b.days ?? Number.MAX_SAFE_INTEGER;
      return db - da;
    })
    .slice(0, 10);
  return items;
}

// --------- interactions ----------

export async function handleBlockAction(payload: any): Promise<void> {
  const slackUserId: string = payload.user?.id;
  const trigger_id: string = payload.trigger_id;
  const action = payload.actions?.[0];
  if (!action) return;
  const consultant = await resolveConsultant(slackUserId);
  if (!consultant) {
    if (payload.response_url) {
      await fetch(payload.response_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response_type: "ephemeral",
          replace_original: false,
          text: "Não encontrei seu e-mail Slack na base de consultores. Peça ao admin para te cadastrar.",
        }),
      });
    }
    return;
  }

  switch (action.action_id) {
    case "view_pending":
    case "menu_pendencias": {
      const items = await pendingsFor(consultant);
      if (payload.response_url) {
        await fetch(payload.response_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ response_type: "ephemeral", replace_original: false, blocks: pendingsBlocks(items) }),
        });
      }
      return;
    }
    case "create_agency":
    case "menu_nova": {
      const consultants = await listConsultantsForPicker();
      await slack.openView(trigger_id, newAgencyView({ consultants }));
      return;
    }
    case "request_c_level_support":
    case "menu_clevel": {
      const agencies = await listAgenciesForConsultant(consultant);
      await slack.openView(trigger_id, clevelView({ agencies }));
      return;
    }
    case "update_agency":
    case "menu_atualizar": {
      const agencies = await listAgenciesForConsultant(consultant);
      await slack.openView(trigger_id, pickAgencyView({
        agencies,
        flow: "atualizar",
        title: "Atualizar",
        submitLabel: "Próximo",
      }));
      return;
    }
    case "update_from_pending": {
      const agency = await getAgency(action.value, consultant);
      if (!agency) return;
      await slack.openView(trigger_id, updateAgencyView({ agency, flow: "atualizar" }));
      return;
    }
  }
}

export async function handleViewSubmission(payload: any): Promise<any> {
  const slackUserId: string = payload.user?.id;
  const view = payload.view;
  const callback_id: string = view.callback_id;
  const values = view.state.values;
  const consultant = await resolveConsultant(slackUserId);
  if (!consultant) {
    return { response_action: "errors", errors: { agency: "Consultor não identificado." } };
  }

  if (callback_id === "pick_agency") {
    const meta = JSON.parse(view.private_metadata || "{}");
    const agencyId = values.agency?.agency_id?.selected_option?.value;
    if (!agencyId) return { response_action: "errors", errors: { agency: "Selecione uma imobiliária." } };
    const agency = await getAgency(agencyId, consultant);
    if (!agency) return { response_action: "errors", errors: { agency: "Imobiliária não encontrada na sua carteira." } };

    if (meta.flow === "clevel") {
      // direct: flag C-Level + post confirmation
      await supabaseAdmin.from("real_estate_agencies").update({ c_level_support_needed: true }).eq("id", agencyId);
      await supabaseAdmin.from("agency_interactions").insert({
        agency_id: agencyId, created_by: consultant.user_id, created_by_name: consultant.name,
        interaction_type: "slack", feedback: "Solicitou apoio C-Level via Slack.",
        c_level_support_needed: true, source: "web",
      });
      await dmConsultant(slackUserId, `🚨 *Apoio C-Level* solicitado para *${agency.name}*. Gestor será notificado.`);
      return { response_action: "clear" };
    }

    return { response_action: "update", view: updateAgencyView({ agency, flow: meta.flow ?? "atualizar" }) };
  }

  if (callback_id === "submit_update") {
    const meta = JSON.parse(view.private_metadata || "{}");
    const agency = await getAgency(meta.agency_id, consultant);
    if (!agency) return { response_action: "errors", errors: { status: "Imobiliária não encontrada." } };
    const patch: any = {
      status: values.status?.v?.selected_option?.value ?? null,
      stock: values.stock?.v?.value ? parseInt(values.stock.v.value, 10) : null,
      guarantor_type: values.guarantor_type?.v?.selected_option?.value ?? null,
      guarantor: values.guarantor?.v?.value ?? null,
      offer: values.offer?.v?.value ?? null,
      feedback: values.feedback?.v?.value ?? null,
      next_steps: values.next_steps?.v?.value ?? null,
      clevel: !!values.clevel?.v?.selected_options?.length,
    };

    const summary = [
      `*${agency.name}* — ${agency.city}/${agency.state}`,
      patch.status ? `*Status:* ${patch.status}` : null,
      patch.stock !== null && patch.stock !== undefined && !isNaN(patch.stock) ? `*Estoque:* ${patch.stock}` : null,
      patch.guarantor_type ? `*Garantidor:* ${patch.guarantor_type}${patch.guarantor ? ` (${patch.guarantor})` : ""}` : null,
      patch.offer ? `*Oferta:* ${patch.offer}` : null,
      patch.feedback ? `*Feedback:* ${patch.feedback}` : null,
      patch.next_steps ? `*Próximos passos:* ${patch.next_steps}` : null,
      patch.clevel ? `🚨 *Apoio C-Level solicitado*` : null,
    ].filter(Boolean) as string[];

    return {
      response_action: "push",
      view: confirmView({
        title: "Confirmar update",
        summaryLines: summary,
        private_metadata: JSON.stringify({ kind: "update", agency_id: agency.id, status_before: agency.negotiation_status, patch }),
      }),
    };
  }

  if (callback_id === "submit_new_agency") {
    const draft = {
      name: values.name?.v?.value?.trim(),
      city: values.city?.v?.value?.trim(),
      state: values.state?.v?.selected_option?.value,
      regional_director: values.regional_director?.v?.value?.trim() ?? null,
      status: values.status?.v?.selected_option?.value,
      consultant_id: values.consultant?.v?.selected_option?.value ?? consultant.id,
      stock: values.stock?.v?.value ? parseInt(values.stock.v.value, 10) : 0,
      guarantor: values.guarantor?.v?.value ?? null,
      guarantor_type: values.guarantor_type?.v?.selected_option?.value ?? null,
      main_contact: values.main_contact?.v?.value ?? null,
      contact_role: values.contact_role?.v?.value ?? null,
      feedback: values.feedback?.v?.value ?? null,
      offer: values.offer?.v?.value ?? null,
      next_steps: values.next_steps?.v?.value ?? null,
      clevel: !!values.clevel?.v?.selected_options?.length,
    };
    const errors: Record<string, string> = {};
    if (!draft.name) errors.name = "Obrigatório.";
    if (!draft.city) errors.city = "Obrigatório.";
    if (!draft.state) errors.state = "Obrigatório.";
    if (!draft.regional_director) errors.regional_director = "Obrigatório.";
    if (!draft.status) errors.status = "Obrigatório.";
    if (Object.keys(errors).length) return { response_action: "errors", errors: errors as any };

    // Dedupe: Imobiliária + Cidade + UF
    const { data: dupes } = await supabaseAdmin
      .from("real_estate_agencies")
      .select("id, name, city, state")
      .ilike("name", draft.name!)
      .ilike("city", draft.city!)
      .eq("state", draft.state!)
      .limit(1);
    if (dupes && dupes.length > 0) {
      return {
        response_action: "errors",
        errors: { name: `Possível duplicidade: já existe "${dupes[0].name}" em ${dupes[0].city}/${dupes[0].state}.` } as any,
      };
    }

    const summary = [
      `*${draft.name}* — ${draft.city}/${draft.state}`,
      `*Diretor Regional:* ${draft.regional_director}`,
      `*Status:* ${draft.status} · *Estoque:* ${draft.stock}`,
      draft.guarantor_type ? `*Garantidor:* ${draft.guarantor_type}${draft.guarantor ? ` (${draft.guarantor})` : ""}` : null,
      draft.main_contact ? `*Contato:* ${draft.main_contact}${draft.contact_role ? ` — ${draft.contact_role}` : ""}` : null,
      draft.offer ? `*Proposta:* ${draft.offer}` : null,
      draft.feedback ? `*Feedback:* ${draft.feedback}` : null,
      draft.next_steps ? `*Próximos passos:* ${draft.next_steps}` : null,
      draft.clevel ? `🚨 *Apoio C-Level solicitado*` : null,
    ].filter(Boolean) as string[];

    return {
      response_action: "push",
      view: confirmView({
        title: "Confirmar cadastro",
        summaryLines: summary,
        private_metadata: JSON.stringify({ kind: "new", draft }),
      }),
    };
  }

  if (callback_id === "confirm_save") {
    const meta = JSON.parse(view.private_metadata || "{}");
    if (meta.kind === "update") {
      const { agency_id, status_before, patch } = meta;
      const updates: any = { updated_by: consultant.user_id };
      if (patch.status) updates.negotiation_status = patch.status;
      if (patch.stock !== null && !isNaN(patch.stock)) updates.contract_stock = patch.stock;
      if (patch.guarantor_type) updates.guarantor_type = patch.guarantor_type;
      if (patch.guarantor !== null) updates.current_guarantor = patch.guarantor;
      if (patch.offer !== null) updates.current_offer = patch.offer;
      if (patch.feedback !== null) updates.feedback = patch.feedback;
      if (patch.next_steps !== null) updates.next_steps = patch.next_steps;
      if (typeof patch.clevel === "boolean") updates.c_level_support_needed = patch.clevel;

      // 1. agency update (interaction trigger also syncs core fields, but explicit update keeps non-interaction fields)
      await supabaseAdmin.from("real_estate_agencies").update(updates).eq("id", agency_id);
      // 2. interaction log (immutable history)
      await supabaseAdmin.from("agency_interactions").insert({
        agency_id, created_by: consultant.user_id, created_by_name: consultant.name,
        interaction_type: "slack", source: "web", // 'slack' não está no enum update_source; usar web
        feedback: patch.feedback ?? null,
        next_steps: patch.next_steps ?? null,
        status_before, status_after: patch.status ?? null,
        c_level_support_needed: patch.clevel ?? null,
        current_offer: patch.offer ?? null,
        contract_stock: patch.stock ?? null,
      });
      // 3. fetch agency name for summary
      const { data: agencyRow } = await supabaseAdmin
        .from("real_estate_agencies")
        .select("name")
        .eq("id", agency_id)
        .maybeSingle();
      const summaryLines = [
        `✅ *Atualização registrada com sucesso.*`,
        `*Imobiliária:* ${agencyRow?.name ?? "—"}`,
        `*Novo status:* ${patch.status ?? "(mantido)"}`,
        `*Feedback:* ${patch.feedback ?? "—"}`,
        `*Próximo passo:* ${patch.next_steps ?? "—"}`,
        `*Apoio C-Level:* ${patch.clevel ? "🚨 Sim" : "Não"}`,
      ].join("\n");
      await dmConsultant(slackUserId, summaryLines);
      return { response_action: "clear" };
    }
    if (meta.kind === "new") {
      const { draft } = meta;
      const now = new Date().toISOString();
      const hasFeedback = !!(draft.feedback && String(draft.feedback).trim());
      const hasNextSteps = !!(draft.next_steps && String(draft.next_steps).trim());

      const { data, error } = await supabaseAdmin
        .from("real_estate_agencies")
        .insert({
          name: draft.name,
          city: draft.city,
          state: draft.state,
          regional_director: draft.regional_director,
          negotiation_status: draft.status,
          consultant_id: draft.consultant_id ?? consultant.id,
          contract_stock: draft.stock ?? 0,
          current_guarantor: draft.guarantor,
          guarantor_type: draft.guarantor_type,
          main_contact: draft.main_contact,
          contact_role: draft.contact_role,
          current_offer: draft.offer,
          feedback: draft.feedback,
          next_steps: draft.next_steps,
          c_level_support_needed: !!draft.clevel,
          last_interaction_date: hasFeedback || hasNextSteps ? now : null,
          total_interactions: hasFeedback ? 1 : 0,
          created_by: consultant.user_id,
          updated_by: consultant.user_id,
        })
        .select("id, name")
        .single();
      if (error) {
        return { response_action: "errors", errors: { name: error.message.slice(0, 150) } as any };
      }

      if (hasFeedback) {
        // Insert history WITHOUT triggering the sync trigger duplicating fields:
        // the agency was just created with these values; trigger will bump total_interactions to 2.
        // To keep consistency, decrement total_interactions counter by resetting it after insert.
        await supabaseAdmin.from("agency_interactions").insert({
          agency_id: data.id,
          created_by: consultant.user_id,
          created_by_name: consultant.name,
          interaction_type: "slack",
          source: "web",
          feedback: draft.feedback,
          next_steps: draft.next_steps,
          status_after: draft.status,
          c_level_support_needed: !!draft.clevel,
          current_offer: draft.offer,
          contract_stock: draft.stock ?? 0,
        });
        // The trigger incremented total_interactions; normalize back to 1.
        await supabaseAdmin
          .from("real_estate_agencies")
          .update({ total_interactions: 1 })
          .eq("id", data.id);
      }

      await dmConsultant(
        slackUserId,
        [
          `✅ *Nova imobiliária cadastrada com sucesso.*`,
          `*Imobiliária:* ${data.name}`,
          `*Cidade/UF:* ${draft.city}/${draft.state}`,
          `*Status:* ${draft.status}`,
          draft.feedback ? `*Feedback:* ${draft.feedback}` : null,
          draft.next_steps ? `*Próximo passo:* ${draft.next_steps}` : null,
          draft.clevel ? `*Apoio C-Level:* 🚨 Sim` : null,
        ].filter(Boolean).join("\n"),
      );
      return { response_action: "clear" };
    }
  }

  return { response_action: "clear" };
}

async function dmConsultant(slackUserId: string, text: string) {
  const channel = await slack.openDM(slackUserId);
  if (channel) await slack.postMessage(channel, { text });
}
