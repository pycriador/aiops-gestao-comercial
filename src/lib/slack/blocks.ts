import { NEGOTIATION_STATUSES, BR_STATES, GUARANTOR_TYPES } from "@/lib/constants";

const option = (value: string, text?: string) => ({
  text: { type: "plain_text", text: text ?? value, emoji: true },
  value,
});

export function homeMenu() {
  return {
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Loft · Carteira", emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: "Operação da sua carteira de imobiliárias. Escolha uma ação:" } },
      {
        type: "actions",
        block_id: "main_menu",
        elements: [
          { type: "button", text: { type: "plain_text", text: "📋 Pendências" }, action_id: "view_pending", style: "primary" },
          { type: "button", text: { type: "plain_text", text: "✏️ Atualizar imobiliária" }, action_id: "update_agency" },
          { type: "button", text: { type: "plain_text", text: "🆕 Nova imobiliária" }, action_id: "create_agency" },
          { type: "button", text: { type: "plain_text", text: "🚨 Apoio C-Level" }, action_id: "request_c_level_support", style: "danger" },
        ],
      },
      { type: "context", elements: [{ type: "mrkdwn", text: "_Comandos rápidos: `/carteira` `/pendencias` `/atualizar` `/nova-imobiliaria`_" }] },
    ],
  };
}


export function pickAgencyView(args: {
  agencies: Array<{ id: string; name: string; city: string; state: string }>;
  flow: "atualizar" | "interacao" | "clevel";
  title: string;
  submitLabel: string;
}) {
  const opts = args.agencies.slice(0, 100).map((a) =>
    option(a.id, `${a.name} — ${a.city}/${a.state}`.slice(0, 75)),
  );
  return {
    type: "modal",
    callback_id: "pick_agency",
    private_metadata: JSON.stringify({ flow: args.flow }),
    title: { type: "plain_text", text: args.title.slice(0, 24) },
    submit: { type: "plain_text", text: args.submitLabel },
    close: { type: "plain_text", text: "Cancelar" },
    blocks: [
      {
        type: "input",
        block_id: "agency",
        label: { type: "plain_text", text: "Imobiliária" },
        element: opts.length
          ? {
              type: "static_select",
              action_id: "agency_id",
              placeholder: { type: "plain_text", text: "Selecione" },
              options: opts,
            }
          : {
              type: "plain_text_input",
              action_id: "agency_id",
              placeholder: { type: "plain_text", text: "Nenhuma imobiliária na sua carteira" },
            },
      },
    ],
  };
}

export function updateAgencyView(args: {
  agency: any;
  flow: "atualizar" | "interacao";
}) {
  const { agency } = args;
  const statusOpts = NEGOTIATION_STATUSES.map((s) => option(s));

  return {
    type: "modal",
    callback_id: "submit_update",
    private_metadata: JSON.stringify({ agency_id: agency.id, flow: args.flow }),
    title: { type: "plain_text", text: "Atualizar imobiliária" },
    submit: { type: "plain_text", text: "Revisar" },
    close: { type: "plain_text", text: "Cancelar" },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${agency.name}* — ${agency.city}/${agency.state}\nStatus atual: \`${agency.negotiation_status}\` · Estoque: *${agency.contract_stock ?? 0}*`,
        },
      },
      { type: "divider" },
      {
        type: "input",
        block_id: "status",
        optional: true,
        label: { type: "plain_text", text: "Status da negociação" },
        element: {
          type: "static_select",
          action_id: "v",
          initial_option: option(agency.negotiation_status),
          options: statusOpts,
        },
      },
      {
        type: "input",
        block_id: "feedback",
        optional: true,
        label: { type: "plain_text", text: "Feedback recebido" },
        element: { type: "plain_text_input", action_id: "v", multiline: true },
      },
      {
        type: "input",
        block_id: "next_steps",
        optional: true,
        label: { type: "plain_text", text: "Próximos passos" },
        element: { type: "plain_text_input", action_id: "v", multiline: true },
      },
      {
        type: "input",
        block_id: "offer",
        optional: true,
        label: { type: "plain_text", text: "Proposta atual" },
        element: { type: "plain_text_input", action_id: "v", initial_value: agency.current_offer ?? "" },
      },
      {
        type: "input",
        block_id: "stock",
        optional: true,
        label: { type: "plain_text", text: "Estoque de contratos" },
        element: {
          type: "number_input",
          is_decimal_allowed: false,
          action_id: "v",
          initial_value: String(agency.contract_stock ?? 0),
          min_value: "0",
        },
      },
      {
        type: "actions",
        block_id: "clevel",
        elements: [
          {
            type: "checkboxes",
            action_id: "v",
            ...(agency.c_level_support_needed
              ? { initial_options: [option("yes", "🚨 Apoio C-Level necessário")] }
              : {}),
            options: [option("yes", "🚨 Apoio C-Level necessário")],
          },
        ],
      },
    ],
  };
}

export function newAgencyView(args?: {
  consultants?: Array<{ id: string; name: string }>;
}) {
  const statusOpts = NEGOTIATION_STATUSES.map((s) => option(s));
  const stateOpts = BR_STATES.map((s) => option(s));
  const guarantorTypeOpts = GUARANTOR_TYPES.map((g) => option(g));
  const consultantOpts = (args?.consultants ?? []).slice(0, 100).map((c) =>
    option(c.id, c.name.slice(0, 75)),
  );
  return {
    type: "modal",
    callback_id: "submit_new_agency",
    title: { type: "plain_text", text: "Nova imobiliária" },
    submit: { type: "plain_text", text: "Cadastrar" },
    close: { type: "plain_text", text: "Cancelar" },
    blocks: [
      {
        type: "input",
        block_id: "name",
        label: { type: "plain_text", text: "Imobiliária" },
        element: { type: "plain_text_input", action_id: "v" },
      },
      {
        type: "input",
        block_id: "city",
        label: { type: "plain_text", text: "Cidade" },
        element: { type: "plain_text_input", action_id: "v" },
      },
      {
        type: "input",
        block_id: "state",
        label: { type: "plain_text", text: "UF" },
        element: { type: "static_select", action_id: "v", options: stateOpts },
      },
      {
        type: "input",
        block_id: "regional_director",
        label: { type: "plain_text", text: "Diretor Regional" },
        element: { type: "plain_text_input", action_id: "v" },
      },
      {
        type: "input",
        block_id: "status",
        label: { type: "plain_text", text: "Status da Negociação" },
        element: {
          type: "static_select", action_id: "v",
          initial_option: option("Pipeline de Prospecção"),
          options: statusOpts,
        },
      },
      ...(consultantOpts.length
        ? [{
            type: "input",
            block_id: "consultant",
            optional: true,
            label: { type: "plain_text", text: "Consultor responsável" },
            element: {
              type: "static_select", action_id: "v",
              placeholder: { type: "plain_text", text: "Selecione" },
              options: consultantOpts,
            },
          }]
        : []),
      {
        type: "input",
        block_id: "stock",
        optional: true,
        label: { type: "plain_text", text: "Estoque de contratos" },
        element: { type: "number_input", is_decimal_allowed: false, action_id: "v", initial_value: "0", min_value: "0" },
      },
      {
        type: "input",
        block_id: "guarantor",
        optional: true,
        label: { type: "plain_text", text: "Garantidor" },
        element: { type: "plain_text_input", action_id: "v" },
      },
      {
        type: "input",
        block_id: "guarantor_type",
        optional: true,
        label: { type: "plain_text", text: "Tipo de Garantidor" },
        element: { type: "static_select", action_id: "v", options: guarantorTypeOpts },
      },
      {
        type: "input",
        block_id: "main_contact",
        optional: true,
        label: { type: "plain_text", text: "Contato Principal" },
        element: { type: "plain_text_input", action_id: "v" },
      },
      {
        type: "input",
        block_id: "contact_role",
        optional: true,
        label: { type: "plain_text", text: "Cargo" },
        element: { type: "plain_text_input", action_id: "v" },
      },
      {
        type: "input",
        block_id: "feedback",
        optional: true,
        label: { type: "plain_text", text: "Feedback Recebido" },
        element: { type: "plain_text_input", action_id: "v", multiline: true },
      },
      {
        type: "input",
        block_id: "offer",
        optional: true,
        label: { type: "plain_text", text: "Proposta Atual" },
        element: { type: "plain_text_input", action_id: "v" },
      },
      {
        type: "input",
        block_id: "next_steps",
        optional: true,
        label: { type: "plain_text", text: "Próximos Passos" },
        element: { type: "plain_text_input", action_id: "v", multiline: true },
      },
      {
        type: "actions",
        block_id: "clevel",
        elements: [
          {
            type: "checkboxes",
            action_id: "v",
            options: [option("yes", "🚨 Apoio C-Level Necessário")],
          },
        ],
      },
    ],
  };
}

export function confirmView(args: { title: string; summaryLines: string[]; private_metadata: string }) {
  return {
    type: "modal",
    callback_id: "confirm_save",
    private_metadata: args.private_metadata,
    title: { type: "plain_text", text: args.title.slice(0, 24) },
    submit: { type: "plain_text", text: "Confirmar e salvar" },
    close: { type: "plain_text", text: "Voltar" },
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: "Revise antes de salvar:" } },
      { type: "divider" },
      ...args.summaryLines.map((line) => ({ type: "section", text: { type: "mrkdwn", text: line } })),
    ],
  };
}

export function pendingsBlocks(items: Array<{ id: string; name: string; city: string; state: string; days: number | null; status: string; clevel: boolean }>) {
  if (!items.length) {
    return [{ type: "section", text: { type: "mrkdwn", text: "✅ *Tudo em dia.* Nenhuma pendência crítica agora." } }];
  }
  return [
    { type: "section", text: { type: "mrkdwn", text: `*Pendências da sua carteira* (${items.length})` } },
    { type: "divider" },
    ...items.slice(0, 15).flatMap((it) => [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${it.name}* — ${it.city}/${it.state}\n_Status:_ \`${it.status}\` · ${it.days === null ? "_sem interação_" : `*${it.days}d* sem update`}${it.clevel ? " · 🚨 C-Level" : ""}`,
        },
        accessory: {
          type: "button",
          text: { type: "plain_text", text: "Atualizar" },
          action_id: "update_from_pending",
          value: it.id,
        },
      },
      { type: "divider" },
    ]),
  ];
}
