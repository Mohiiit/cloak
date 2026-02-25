export type X402Version = "1";
export type X402Scheme = "cloak-shielded-x402";
export type X402ErrorCode =
  | "INVALID_PAYLOAD"
  | "EXPIRED_PAYMENT"
  | "REPLAY_DETECTED"
  | "CONTEXT_MISMATCH"
  | "POLICY_DENIED"
  | "RPC_FAILURE"
  | "SETTLEMENT_FAILED"
  | "TIMEOUT";

export interface X402Challenge {
  version: X402Version;
  scheme: X402Scheme;
  challengeId: string;
  network: string;
  token: string;
  minAmount: string;
  recipient: string;
  contextHash: string;
  expiresAt: string;
  facilitator: string;
}

export interface X402PaymentPayload {
  version: X402Version;
  scheme: X402Scheme;
  challengeId: string;
  tongoAddress: string;
  token: string;
  amount: string;
  proof: string;
  replayKey: string;
  contextHash: string;
  expiresAt: string;
  nonce: string;
  createdAt: string;
}

export interface X402VerifyResponse {
  status: "accepted" | "rejected";
  reasonCode?: X402ErrorCode;
  retryable: boolean;
  paymentRef: string;
}

export interface X402SettleResponse {
  status: "settled" | "pending" | "rejected" | "failed";
  txHash?: string;
  paymentRef: string;
  reasonCode?: X402ErrorCode;
}

export interface X402FetchOptions {
  challengeHeaderName?: string;
  paymentHeaderName?: string;
  fetchImpl?: typeof fetch;
  createPayload: (challenge: X402Challenge) => Promise<X402PaymentPayload> | X402PaymentPayload;
}

const DEFAULT_CHALLENGE_HEADER = "x-x402-challenge";
const DEFAULT_PAYMENT_HEADER = "x-x402-payment";

export interface X402ChallengeRequest {
  recipient: string;
  token?: string;
  minAmount?: string;
  context?: Record<string, unknown>;
  network?: string;
  ttlSeconds?: number;
}

export interface X402VerifyRequest {
  challenge: X402Challenge;
  payment: X402PaymentPayload;
}

export interface X402SettleRequest {
  challenge: X402Challenge;
  payment: X402PaymentPayload;
}

export interface X402FacilitatorClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stableStringify(input: Record<string, unknown>): string {
  return JSON.stringify(
    Object.keys(input)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = input[key];
        return acc;
      }, {}),
  );
}

function randomId(): string {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hashHex(input: string): string {
  // Deterministic non-cryptographic hash for client-side context binding.
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c;
    h2 = Math.imul(h2, 0x27d4eb2d);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const part2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${part1}${part2}${part1}${part2}${part1}${part2}${part1}${part2}`;
}

export function createContextHash(input: Record<string, unknown>): string {
  return hashHex(stableStringify(input));
}

export function encodeX402PaymentHeader(payload: X402PaymentPayload): string {
  return JSON.stringify(payload);
}

export function decodeX402PaymentHeader(value: string): X402PaymentPayload {
  const parsed = JSON.parse(value) as X402PaymentPayload;
  assertValidPaymentPayload(parsed);
  return parsed;
}

export function extractX402PaymentPayload(
  headers: Headers,
  headerName = DEFAULT_PAYMENT_HEADER,
): X402PaymentPayload | null {
  const raw = headers.get(headerName);
  if (!raw) return null;
  try {
    return decodeX402PaymentHeader(raw);
  } catch {
    return null;
  }
}

export function parseX402Challenge(
  source: Response | Headers | string | Record<string, unknown>,
  headerName = DEFAULT_CHALLENGE_HEADER,
): X402Challenge {
  if (typeof source === "string") {
    const parsed = JSON.parse(source) as X402Challenge;
    assertValidChallenge(parsed);
    return parsed;
  }

  if (source instanceof Response) {
    const raw = source.headers.get(headerName);
    if (!raw) {
      throw new Error("Missing x402 challenge header");
    }
    return parseX402Challenge(raw, headerName);
  }

  if (source instanceof Headers) {
    const raw = source.get(headerName);
    if (!raw) {
      throw new Error("Missing x402 challenge header");
    }
    return parseX402Challenge(raw, headerName);
  }

  if (isObject(source)) {
    assertValidChallenge(source);
    return source as X402Challenge;
  }

  throw new Error("Unsupported x402 challenge source");
}

export function createShieldedPaymentPayload(
  challenge: X402Challenge,
  input: {
    tongoAddress: string;
    amount?: string;
    proof: string;
    replayKey?: string;
    nonce?: string;
  },
): X402PaymentPayload {
  const payload: X402PaymentPayload = {
    version: "1",
    scheme: "cloak-shielded-x402",
    challengeId: challenge.challengeId,
    tongoAddress: input.tongoAddress,
    token: challenge.token,
    amount: input.amount ?? challenge.minAmount,
    proof: input.proof,
    replayKey: input.replayKey ?? randomId(),
    contextHash: challenge.contextHash,
    expiresAt: challenge.expiresAt,
    nonce: input.nonce ?? randomId(),
    createdAt: new Date().toISOString(),
  };
  assertValidPaymentPayload(payload);
  return payload;
}

export async function x402Fetch(
  input: RequestInfo | URL,
  init: RequestInit,
  options: X402FetchOptions,
): Promise<Response> {
  const challengeHeader = options.challengeHeaderName ?? DEFAULT_CHALLENGE_HEADER;
  const paymentHeader = options.paymentHeaderName ?? DEFAULT_PAYMENT_HEADER;
  const fetchImpl = options.fetchImpl ?? fetch;

  const first = await fetchImpl(input, init);
  if (first.status !== 402) return first;

  const challenge = parseX402Challenge(first, challengeHeader);
  const payload = await options.createPayload(challenge);
  assertValidPaymentPayload(payload);

  const retryHeaders = new Headers(init.headers ?? {});
  retryHeaders.set(challengeHeader, JSON.stringify(challenge));
  retryHeaders.set(paymentHeader, encodeX402PaymentHeader(payload));

  return fetchImpl(input, {
    ...init,
    headers: retryHeaders,
  });
}

export async function payWithX402(
  input: RequestInfo | URL,
  init: RequestInit,
  payload: X402PaymentPayload,
  options?: Pick<X402FetchOptions, "paymentHeaderName" | "fetchImpl">,
): Promise<Response> {
  assertValidPaymentPayload(payload);
  const headerName = options?.paymentHeaderName ?? DEFAULT_PAYMENT_HEADER;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const headers = new Headers(init.headers ?? {});
  headers.set(headerName, encodeX402PaymentHeader(payload));
  return fetchImpl(input, {
    ...init,
    headers,
  });
}

export class X402FacilitatorClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: X402FacilitatorClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async challenge(input: X402ChallengeRequest): Promise<X402Challenge> {
    const res = await this.fetchImpl(`${this.baseUrl}/challenge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      throw new Error(`x402 challenge failed: ${res.status}`);
    }
    const json = (await res.json()) as { challenge: X402Challenge };
    assertValidChallenge(json.challenge);
    return json.challenge;
  }

  async verify(input: X402VerifyRequest): Promise<X402VerifyResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      throw new Error(`x402 verify failed: ${res.status}`);
    }
    return (await res.json()) as X402VerifyResponse;
  }

  async settle(input: X402SettleRequest): Promise<X402SettleResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/settle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      throw new Error(`x402 settle failed: ${res.status}`);
    }
    return (await res.json()) as X402SettleResponse;
  }
}

export function createShieldedFacilitatorClient(
  options: X402FacilitatorClientOptions,
): X402FacilitatorClient {
  return new X402FacilitatorClient(options);
}

export function assertValidChallenge(challenge: unknown): asserts challenge is X402Challenge {
  if (!isObject(challenge)) throw new Error("Invalid x402 challenge");
  if (challenge.version !== "1") throw new Error("Invalid x402 challenge version");
  if (challenge.scheme !== "cloak-shielded-x402") throw new Error("Invalid x402 challenge scheme");
  const required = [
    "challengeId",
    "network",
    "token",
    "minAmount",
    "recipient",
    "contextHash",
    "expiresAt",
    "facilitator",
  ] as const;
  for (const key of required) {
    if (typeof challenge[key] !== "string" || !challenge[key]) {
      throw new Error(`Invalid x402 challenge field: ${key}`);
    }
  }
}

export function assertValidPaymentPayload(payload: unknown): asserts payload is X402PaymentPayload {
  if (!isObject(payload)) throw new Error("Invalid x402 payment payload");
  if (payload.version !== "1") throw new Error("Invalid x402 payload version");
  if (payload.scheme !== "cloak-shielded-x402") throw new Error("Invalid x402 payload scheme");
  const required = [
    "challengeId",
    "tongoAddress",
    "token",
    "amount",
    "proof",
    "replayKey",
    "contextHash",
    "expiresAt",
    "nonce",
    "createdAt",
  ] as const;
  for (const key of required) {
    if (typeof payload[key] !== "string" || !payload[key]) {
      throw new Error(`Invalid x402 payload field: ${key}`);
    }
  }
}
