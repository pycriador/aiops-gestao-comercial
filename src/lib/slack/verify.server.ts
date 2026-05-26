import { createHmac, timingSafeEqual } from "crypto";

export type SlackSignatureDiagnostic = {
  hasSignature: boolean;
  hasTimestamp: boolean;
  timestampDriftSeconds: number | null;
  calculatedSignaturePrefix: string | null;
  receivedSignaturePrefix: string | null;
  valid: boolean;
  reason: string | null;
};

export function inspectSlackSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  signingSecret: string | undefined,
): SlackSignatureDiagnostic {
  const base = timestamp ? `v0:${timestamp}:${rawBody}` : null;
  const expected = base && signingSecret
    ? `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`
    : null;
  const tsNum = timestamp ? parseInt(timestamp, 10) : NaN;
  const drift = Number.isFinite(tsNum) ? Math.round(Math.abs(Date.now() / 1000 - tsNum)) : null;

  const diagnostic: SlackSignatureDiagnostic = {
    hasSignature: !!signature,
    hasTimestamp: !!timestamp,
    timestampDriftSeconds: drift,
    calculatedSignaturePrefix: expected?.slice(0, 8) ?? null,
    receivedSignaturePrefix: signature?.slice(0, 8) ?? null,
    valid: false,
    reason: null,
  };

  if (!signingSecret) return { ...diagnostic, reason: "missing_signing_secret" };
  if (!timestamp || !signature) return { ...diagnostic, reason: "missing_headers" };
  if (!Number.isFinite(tsNum)) return { ...diagnostic, reason: "timestamp_not_numeric" };
  if (drift !== null && drift > 60 * 5) return { ...diagnostic, reason: "timestamp_drift_too_large" };
  if (!expected) return { ...diagnostic, reason: "signature_not_calculated" };

  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return { ...diagnostic, reason: "signature_length_mismatch" };
    const valid = timingSafeEqual(a, b);
    return { ...diagnostic, valid, reason: valid ? null : "signature_mismatch" };
  } catch {
    return { ...diagnostic, reason: "signature_compare_exception" };
  }
}

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
  const diagnostic = inspectSlackSignature(rawBody, timestamp, signature, signingSecret);
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

  if (!diagnostic.valid && diagnostic.reason === "signature_mismatch") {
    console.warn("[slack.verify] signature mismatch", diagnostic);
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

