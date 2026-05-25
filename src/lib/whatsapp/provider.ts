/**
 * WhatsApp provider abstraction.
 *
 * Each concrete provider (Evolution, Z-API, Twilio, WhatsApp Cloud) implements
 * this interface. The bot engine only depends on `WhatsAppProvider` — providers
 * can be swapped via env without touching business logic.
 */
export type WhatsAppProviderName = "evolution" | "zapi" | "twilio" | "cloud" | "mock";

export interface InboundMessage {
  /** Raw provider payload, kept for audit. */
  raw: unknown;
  /** E.164 normalized phone, without leading "+". */
  phone: string;
  /** Plain text body of the message. */
  body: string;
  /** Provider message id, if available. */
  externalId?: string;
  /** "text" | "interactive" | "audio" | "image" — currently only text is processed. */
  type: string;
}

export interface WhatsAppProvider {
  name: WhatsAppProviderName;
  parseIncomingMessage(payload: unknown): InboundMessage | null;
  sendMessage(phone: string, message: string): Promise<{ ok: boolean; externalId?: string; error?: string }>;
  /** Optional signature verification — return true if ok / no signature configured. */
  verifySignature?(rawBody: string, headers: Record<string, string>): boolean;
}

/** Strip everything but digits, drop leading zeros / +. */
export function normalizePhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  // strip leading zeros (some providers send "0055..." )
  return digits.replace(/^0+/, "");
}
