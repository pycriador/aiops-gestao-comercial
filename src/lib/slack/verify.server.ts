import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify Slack request signature.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  signingSecret: string,
): boolean {
  if (!timestamp || !signature) {
    console.warn("[slack.verify] missing timestamp or signature", { has_ts: !!timestamp, has_sig: !!signature });
    return false;
  }
  const tsNum = parseInt(timestamp, 10);
  if (!Number.isFinite(tsNum)) {
    console.warn("[slack.verify] timestamp not numeric", { timestamp });
    return false;
  }
  const drift = Math.abs(Date.now() / 1000 - tsNum);
  if (drift > 60 * 5) {
    console.warn("[slack.verify] timestamp drift too large", { drift });
    return false;
  }

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length) {
      console.warn("[slack.verify] signature length mismatch", { expected_len: a.length, got_len: b.length });
      return false;
    }
    const ok = timingSafeEqual(a, b);
    if (!ok) console.warn("[slack.verify] signature mismatch (secret pode estar diferente)");
    return ok;
  } catch (err) {
    console.error("[slack.verify] exception", err);
    return false;
  }
}

