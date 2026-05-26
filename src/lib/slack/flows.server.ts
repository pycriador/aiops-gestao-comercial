import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { slack } from "./client.server";
import { resolveConsultant, isPrivileged, type SlackConsultant } from "./consultant.server";
import {
  homeMenu, pickAgencyView, updateAgencyView, newAgencyView, confirmView, pendingsBlocks,
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
    case "/nova-imobiliaria":
      await slack.openView(args.trigger_id, newAgencyView());
      return { response_type: "ephemeral", text: "Abrindo cadastro…" };
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


async function pendingsFor(consultant: SlackConsultant) {
  const agencies = await listAgenciesForConsultant(consultant);
  const items = agencies
    .map((a: any) => ({
      id: a.id,
      name: a.name,
      city: a.city,
      state: a.state,
      status: a.negotiation_status,
      clevel: !!a.c_level_support_needed,
      days: daysSince(a.last_interaction_date),
    }))
    .filter((a) => a.clevel || a.days === null || (a.days ?? 0) >= 15)
    .sort((a, b) => (b.clevel ? 1 : 0) - (a.clevel ? 1 : 0) || ((b.days ?? 999) - (a.days ?? 999)));
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
    case "menu_nova":
      await slack.openView(trigger_id, newAgencyView());
      return;
    case "update_agency":
    case "menu_atualizar":
    case "request_c_level_support":
    case "menu_clevel": {
      const agencies = await listAgenciesForConsultant(consultant);
      const isClevel = action.action_id === "menu_clevel" || action.action_id === "request_c_level_support";
      await slack.openView(trigger_id, pickAgencyView({
        agencies,
        flow: isClevel ? "clevel" : "atualizar",
        title: isClevel ? "Apoio C-Level" : "Atualizar",
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
      stock: values.stock?.v?.value ? parseInt(values.stock.v.value, 10) : 0,
      main_contact: values.main_contact?.v?.value ?? null,
      status: values.status?.v?.selected_option?.value ?? "Pipeline de Prospecção",
      feedback: values.feedback?.v?.value ?? null,
    };
    if (!draft.name || !draft.city || !draft.state) {
      return { response_action: "errors", errors: { name: !draft.name ? "Obrigatório." : undefined, city: !draft.city ? "Obrigatório." : undefined, state: !draft.state ? "Obrigatório." : undefined } as any };
    }
    const summary = [
      `*${draft.name}* — ${draft.city}/${draft.state}`,
      `*Status:* ${draft.status} · *Estoque:* ${draft.stock}`,
      draft.main_contact ? `*Contato:* ${draft.main_contact}` : null,
      draft.feedback ? `*Contexto:* ${draft.feedback}` : null,
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
      await dmConsultant(slackUserId, `✅ Atualização salva. Obrigado!`);
      return { response_action: "clear" };
    }
    if (meta.kind === "new") {
      const { draft } = meta;
      const { data, error } = await supabaseAdmin
        .from("real_estate_agencies")
        .insert({
          name: draft.name, city: draft.city, state: draft.state,
          contract_stock: draft.stock ?? 0,
          main_contact: draft.main_contact,
          negotiation_status: draft.status,
          feedback: draft.feedback,
          consultant_id: consultant.id,
          created_by: consultant.user_id,
          updated_by: consultant.user_id,
        })
        .select("id, name")
        .single();
      if (error) {
        return { response_action: "errors", errors: { name: error.message.slice(0, 150) } as any };
      }
      await dmConsultant(slackUserId, `🆕 *${data.name}* cadastrada na sua carteira.`);
      return { response_action: "clear" };
    }
  }

  return { response_action: "clear" };
}

async function dmConsultant(slackUserId: string, text: string) {
  const channel = await slack.openDM(slackUserId);
  if (channel) await slack.postMessage(channel, { text });
}
