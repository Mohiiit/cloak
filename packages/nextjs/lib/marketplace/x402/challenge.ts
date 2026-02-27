import { createHmac, randomUUID } from "crypto";
import type { X402ChallengeResponse } from "@cloak-wallet/sdk";
import { X402_DEFAULTS, getFacilitatorBaseUrl } from "./constants";

function secret(): string {
  const configured = process.env.X402_FACILITATOR_SECRET?.trim();
  if (!configured) {
    throw new Error("X402_FACILITATOR_SECRET is required");
  }
  if (
    configured === "replace-me" ||
    configured === "dev-only-secret-change-me"
  ) {
    throw new Error("X402_FACILITATOR_SECRET must not use a default placeholder");
  }
  return configured;
}

function buildSignature(data: Omit<X402ChallengeResponse, "signature">): string {
  const payload = JSON.stringify({
    version: data.version,
    scheme: data.scheme,
    challengeId: data.challengeId,
    network: data.network,
    token: data.token,
    minAmount: data.minAmount,
    recipient: data.recipient,
    ...(data.tongoRecipient ? { tongoRecipient: data.tongoRecipient } : {}),
    contextHash: data.contextHash,
    expiresAt: data.expiresAt,
    facilitator: data.facilitator,
  });
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export interface BuildChallengeInput {
  token?: string;
  minAmount?: string;
  recipient: string;
  /** Base58 Tongo address for shielded transfer payments. */
  tongoRecipient?: string;
  context?: Record<string, unknown>;
  network?: string;
  ttlSeconds?: number;
}

function normalizeToken(raw: string | undefined): string {
  const value = (raw || X402_DEFAULTS.token).trim().toUpperCase();
  if (!value) {
    throw new Error("x402 token is required");
  }
  return value;
}

function normalizeMinAmount(raw: string | undefined): string {
  const value = (raw || X402_DEFAULTS.minAmount).trim();
  if (!/^\d+$/.test(value)) {
    throw new Error("x402 minAmount must be an unsigned integer string");
  }
  if (BigInt(value) <= 0n) {
    throw new Error("x402 minAmount must be greater than zero");
  }
  return value;
}

export function computeChallengeContextHash(
  input: Record<string, unknown>,
): string {
  const stable = JSON.stringify(
    Object.keys(input)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = input[key];
        return acc;
      }, {}),
  );
  return createHmac("sha256", "context-hash").update(stable).digest("hex");
}

export function buildChallenge(input: BuildChallengeInput): X402ChallengeResponse {
  const now = Date.now();
  const ttl = Math.max(10, input.ttlSeconds ?? X402_DEFAULTS.paymentExpirySeconds);
  const token = normalizeToken(input.token);
  const minAmount = normalizeMinAmount(input.minAmount);
  const challenge: Omit<X402ChallengeResponse, "signature"> = {
    version: X402_DEFAULTS.version,
    scheme: X402_DEFAULTS.scheme,
    challengeId: randomUUID(),
    network: input.network || X402_DEFAULTS.network,
    token,
    minAmount,
    recipient: input.recipient.toLowerCase(),
    ...(input.tongoRecipient ? { tongoRecipient: input.tongoRecipient } : {}),
    contextHash: computeChallengeContextHash(input.context || {}),
    expiresAt: new Date(now + ttl * 1000).toISOString(),
    facilitator: getFacilitatorBaseUrl(),
  };
  return {
    ...challenge,
    signature: buildSignature(challenge),
  };
}

export function isChallengeExpired(challenge: X402ChallengeResponse): boolean {
  return Date.parse(challenge.expiresAt) <= Date.now();
}

export function verifyChallengeSignature(challenge: X402ChallengeResponse): boolean {
  if (!challenge.signature) return false;
  const expected = buildSignature({
    version: challenge.version,
    scheme: challenge.scheme,
    challengeId: challenge.challengeId,
    network: challenge.network,
    token: challenge.token,
    minAmount: challenge.minAmount,
    recipient: challenge.recipient,
    ...(challenge.tongoRecipient ? { tongoRecipient: challenge.tongoRecipient } : {}),
    contextHash: challenge.contextHash,
    expiresAt: challenge.expiresAt,
    facilitator: challenge.facilitator,
  });
  return challenge.signature === expected;
}
