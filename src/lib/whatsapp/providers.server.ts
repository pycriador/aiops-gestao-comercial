import type { InboundMessage, WhatsAppProvider } from "./provider";
import { normalizePhone } from "./provider";

/**
 * Evolution API adapter.
 * Webhook payload: { event, instance, data: { key:{remoteJid,id}, message:{conversation,extendedTextMessage:{text}} } }
 * Send: POST {EVOLUTION_API_URL}/message/sendText/{INSTANCE}
 *       headers: { apikey: EVOLUTION_API_KEY }
 *       body: { number, text }
 */
export const evolutionProvider: WhatsAppProvider = {
  name: "evolution",
  parseIncomingMessage(payload: any): InboundMessage | null {
    try {
      const data = payload?.data ?? payload;
      const remoteJid: string = data?.key?.remoteJid ?? "";
      // ignore groups
      if (remoteJid.endsWith("@g.us")) return null;
      const phone = normalizePhone(remoteJid.split("@")[0]);
      const body: string =
        data?.message?.conversation ??
        data?.message?.extendedTextMessage?.text ??
        data?.message?.buttonsResponseMessage?.selectedDisplayText ??
        data?.message?.listResponseMessage?.title ??
        "";
      if (!phone || !body) return null;
      return {
        raw: payload,
        phone,
        body: String(body).trim(),
        externalId: data?.key?.id,
        type: "text",
      };
    } catch {
      return null;
    }
  },
  async sendMessage(phone, message) {
    const base = process.env.EVOLUTION_API_URL?.replace(/\/$/, "");
    const instance = process.env.EVOLUTION_INSTANCE;
    const key = process.env.EVOLUTION_API_KEY;
    if (!base || !instance || !key) {
      return { ok: false, error: "Evolution API not configured (EVOLUTION_API_URL/INSTANCE/KEY)" };
    }
    try {
      const res = await fetch(`${base}/message/sendText/${instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key },
        body: JSON.stringify({ number: phone, text: message }),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const json = await res.json().catch(() => ({}));
      return { ok: true, externalId: json?.key?.id };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "send failed" };
    }
  },
};

/**
 * Z-API adapter.
 * Webhook: { phone, text:{ message }, fromMe, isGroup, ... }
 * Send: POST https://api.z-api.io/instances/{INSTANCE}/token/{TOKEN}/send-text
 *       body: { phone, message }
 */
export const zapiProvider: WhatsAppProvider = {
  name: "zapi",
  parseIncomingMessage(payload: any): InboundMessage | null {
    try {
      if (payload?.fromMe) return null;
      if (payload?.isGroup) return null;
      const phone = normalizePhone(payload?.phone ?? "");
      const body =
        payload?.text?.message ??
        payload?.message ??
        payload?.body ??
        "";
      if (!phone || !body) return null;
      return { raw: payload, phone, body: String(body).trim(), externalId: payload?.messageId, type: "text" };
    } catch {
      return null;
    }
  },
  async sendMessage(phone, message) {
    const instance = process.env.ZAPI_INSTANCE;
    const token = process.env.ZAPI_TOKEN;
    if (!instance || !token) return { ok: false, error: "Z-API not configured (ZAPI_INSTANCE/TOKEN)" };
    try {
      const res = await fetch(`https://api.z-api.io/instances/${instance}/token/${token}/send-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message }),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const json = await res.json().catch(() => ({}));
      return { ok: true, externalId: json?.messageId };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "send failed" };
    }
  },
};

/** Mock provider for local dev — logs to console, never sends. */
export const mockProvider: WhatsAppProvider = {
  name: "mock",
  parseIncomingMessage(payload: any): InboundMessage | null {
    if (!payload?.phone || !payload?.body) return null;
    return {
      raw: payload,
      phone: normalizePhone(payload.phone),
      body: String(payload.body).trim(),
      type: "text",
    };
  },
  async sendMessage(phone, message) {
    console.log(`[mock-whatsapp] -> ${phone}: ${message}`);
    return { ok: true };
  },
};

export function getProvider(): WhatsAppProvider {
  const name = (process.env.WHATSAPP_PROVIDER ?? "mock").toLowerCase();
  switch (name) {
    case "evolution": return evolutionProvider;
    case "zapi": return zapiProvider;
    case "mock": return mockProvider;
    default:
      console.warn(`[whatsapp] unknown provider "${name}", falling back to mock`);
      return mockProvider;
  }
}
