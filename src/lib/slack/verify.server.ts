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
  if (!diagnostic.valid) console.warn("[slack.verify] invalid signature", diagnostic);
  return diagnostic.valid;
}

