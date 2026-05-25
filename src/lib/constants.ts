export const NEGOTIATION_STATUSES = [
  "Pipeline de Prospecção",
  "Conversas iniciadas",
  "Reunião agendada",
  "Aguardando base",
  "Stand by",
  "Sem interesse",
  "Proposta enviada",
  "Em negociação",
  "Convertida",
] as const;

export type NegotiationStatus = (typeof NEGOTIATION_STATUSES)[number];

export const GUARANTOR_TYPES = [
  "Garantia Propria",
  "Concorrente",
  "Seguradora",
  "Outro",
] as const;

export type GuarantorType = (typeof GUARANTOR_TYPES)[number];

export const BR_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const STATUS_TONE: Record<NegotiationStatus, "neutral" | "info" | "warning" | "success" | "destructive"> = {
  "Pipeline de Prospecção": "neutral",
  "Conversas iniciadas": "info",
  "Reunião agendada": "info",
  "Aguardando base": "warning",
  "Stand by": "warning",
  "Sem interesse": "destructive",
  "Proposta enviada": "info",
  "Em negociação": "info",
  "Convertida": "success",
};

export const STATUS_PRIORITY: Record<NegotiationStatus, number> = {
  "Em negociação": 9,
  "Proposta enviada": 8,
  "Reunião agendada": 7,
  "Conversas iniciadas": 6,
  "Aguardando base": 5,
  "Pipeline de Prospecção": 4,
  "Stand by": 2,
  "Convertida": 3,
  "Sem interesse": 1,
};

export function daysSince(date: string | null | undefined): number | null {
  if (!date) return null;
  const ms = Date.now() - new Date(date).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
