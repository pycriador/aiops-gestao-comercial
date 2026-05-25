/**
 * Intent detection — keyword based, accent insensitive.
 * Returns the canonical intent name or null.
 */
export type Intent =
  | "menu"
  | "cancel"
  | "back"
  | "help"
  | "pendencies"
  | "new_agency"
  | "update_agency"
  | "yes"
  | "no";

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

const PATTERNS: Array<[Intent, RegExp]> = [
  ["menu", /^(menu|inicio|começar|comecar|oi|olá|ola|start)$/],
  ["cancel", /^(cancelar|cancela|sair|parar)$/],
  ["back", /^(voltar|volta)$/],
  ["help", /^(ajuda|help|\?)$/],
  ["pendencies", /^(pendencias|pendente|carteira|minhas|atualizar)$/],
  ["new_agency", /^(nova|nova imobiliaria|cadastrar|cadastro|novo cadastro|adicionar)$/],
  ["update_agency", /^(atualizar imobiliaria|update|editar)$/],
  ["yes", /^(s|sim|ok|confirmar|confirma|1)$/],
  ["no", /^(n|nao|cancelar|3)$/],
];

export function identifyIntent(message: string): Intent | null {
  const m = norm(message);
  for (const [intent, re] of PATTERNS) {
    if (re.test(m)) return intent;
  }
  return null;
}
