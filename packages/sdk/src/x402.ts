export type X402Version = "1";
export type X402Scheme = "cloak-shielded-x402";
export type X402ErrorCode =
  | "INVALID_PAYLOAD"
  | "INVALID_TONGO_PROOF"
  | "TONGO_UNCONFIRMED"
  | "TONGO_CONTEXT_MISMATCH"
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

export type X402TongoProofType = "tongo_attestation_v1";

export interface X402TongoProofEnvelope {
  envelopeVersion: "1";
  proofType: X402TongoProofType;
  intentHash: string;
  settlementTxHash?: string;
  attestor?: string;
  issuedAt?: string;
  signature?: string;
  metadata?: Record<string, unknown>;
}

export interface X402IntentHashInput {
  challengeId: string;
  contextHash: string;
  recipient: string;
  token: string;
  tongoAddress: string;
  amount: string;
  replayKey: string;
  nonce: string;
  expiresAt: string;
}

export interface CreateX402TongoProofEnvelopeInput {
  challenge: X402Challenge;
  tongoAddress: string;
  amount?: string;
  replayKey: string;
  nonce: string;
  settlementTxHash?: string;
  attestor?: string;
  issuedAt?: string;
  signature?: string;
  metadata?: Record<string, unknown>;
}

export interface X402ProofProviderInput {
  challenge: X402Challenge;
  tongoAddress: string;
  amount: string;
  contextHash: string;
  replayKey?: string;
  nonce?: string;
  intentHash?: string;
}

export interface X402ProofProviderOutput {
  proof: string;
  replayKey?: string;
  nonce?: string;
  envelope?: X402TongoProofEnvelope;
}

export interface X402ProofProvider {
  createProof(
    input: X402ProofProviderInput,
  ): Promise<X402ProofProviderOutput> | X402ProofProviderOutput;
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

export interface X402FetchWithProofProviderOptions {
  tongoAddress: string;
  amount?: string;
  proofProvider: X402ProofProvider;
  challengeHeaderName?: string;
  paymentHeaderName?: string;
  fetchImpl?: typeof fetch;
}

export interface X402FetchWithTongoProofOptions
  extends X402FetchWithProofProviderOptions {}

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

export interface WaitForX402SettlementOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  onAttempt?: (attempt: number, response: X402SettleResponse) => void;
}

const DEFAULT_SETTLEMENT_POLL_INTERVAL_MS = 1500;
const DEFAULT_SETTLEMENT_TIMEOUT_MS = 45_000;

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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

export function computeX402IntentHash(input: X402IntentHashInput): string {
  return hashHex(
    stableStringify({
      challengeId: input.challengeId,
      contextHash: input.contextHash,
      recipient: input.recipient.toLowerCase(),
      token: input.token,
      tongoAddress: input.tongoAddress,
      amount: input.amount,
      replayKey: input.replayKey,
      nonce: input.nonce,
      expiresAt: input.expiresAt,
    }),
  );
}

export function encodeX402TongoProofEnvelope(
  envelope: X402TongoProofEnvelope,
): string {
  assertValidTongoProofEnvelope(envelope);
  return JSON.stringify(envelope);
}

export function decodeX402TongoProofEnvelope(
  proof: string,
): X402TongoProofEnvelope {
  const parsed = JSON.parse(proof) as X402TongoProofEnvelope;
  assertValidTongoProofEnvelope(parsed);
  return parsed;
}

export function createX402TongoProofEnvelope(
  input: CreateX402TongoProofEnvelopeInput,
): X402TongoProofEnvelope {
  const amount = input.amount ?? input.challenge.minAmount;
  const envelope: X402TongoProofEnvelope = {
    envelopeVersion: "1",
    proofType: "tongo_attestation_v1",
    intentHash: computeX402IntentHash({
      challengeId: input.challenge.challengeId,
      contextHash: input.challenge.contextHash,
      recipient: input.challenge.recipient,
      token: input.challenge.token,
      tongoAddress: input.tongoAddress,
      amount,
      replayKey: input.replayKey,
      nonce: input.nonce,
      expiresAt: input.challenge.expiresAt,
    }),
    settlementTxHash: input.settlementTxHash,
    attestor: input.attestor,
    issuedAt: input.issuedAt || new Date().toISOString(),
    signature: input.signature,
    metadata: input.metadata,
  };
  assertValidTongoProofEnvelope(envelope);
  return envelope;
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

export class StaticX402ProofProvider implements X402ProofProvider {
  constructor(private readonly staticProof: string) {}

  createProof(): X402ProofProviderOutput {
    return {
      proof: this.staticProof,
    };
  }
}

export class TongoEnvelopeProofProvider implements X402ProofProvider {
  constructor(
    private readonly resolver: (
      input: Required<
        Pick<X402ProofProviderInput, "challenge" | "tongoAddress" | "amount" | "contextHash">
      > & {
        replayKey: string;
        nonce: string;
        intentHash: string;
      },
    ) => Promise<X402TongoProofEnvelope> | X402TongoProofEnvelope,
  ) {}

  async createProof(input: X402ProofProviderInput): Promise<X402ProofProviderOutput> {
    const replayKey = input.replayKey ?? randomId();
    const nonce = input.nonce ?? randomId();
    const amount = input.amount;
    const intentHash =
      input.intentHash ??
      computeX402IntentHash({
        challengeId: input.challenge.challengeId,
        contextHash: input.contextHash,
        recipient: input.challenge.recipient,
        token: input.challenge.token,
        tongoAddress: input.tongoAddress,
        amount,
        replayKey,
        nonce,
        expiresAt: input.challenge.expiresAt,
      });
    const envelope = await this.resolver({
      challenge: input.challenge,
      tongoAddress: input.tongoAddress,
      amount,
      contextHash: input.contextHash,
      replayKey,
      nonce,
      intentHash,
    });
    if (envelope.intentHash !== intentHash) {
      throw new Error("Tongo proof intent hash mismatch");
    }
    return {
      proof: encodeX402TongoProofEnvelope(envelope),
      replayKey,
      nonce,
      envelope,
    };
  }
}

export async function createShieldedPaymentPayloadWithProofProvider(
  challenge: X402Challenge,
  input: {
    tongoAddress: string;
    amount?: string;
    proofProvider: X402ProofProvider;
  },
): Promise<X402PaymentPayload> {
  const resolvedAmount = input.amount ?? challenge.minAmount;
  const seededReplayKey = randomId();
  const seededNonce = randomId();
  const seededIntentHash = computeX402IntentHash({
    challengeId: challenge.challengeId,
    contextHash: challenge.contextHash,
    recipient: challenge.recipient,
    token: challenge.token,
    tongoAddress: input.tongoAddress,
    amount: resolvedAmount,
    replayKey: seededReplayKey,
    nonce: seededNonce,
    expiresAt: challenge.expiresAt,
  });
  const proofPayload = await input.proofProvider.createProof({
    challenge,
    tongoAddress: input.tongoAddress,
    amount: resolvedAmount,
    contextHash: challenge.contextHash,
    replayKey: seededReplayKey,
    nonce: seededNonce,
    intentHash: seededIntentHash,
  });
  const replayKey = proofPayload.replayKey ?? seededReplayKey;
  const nonce = proofPayload.nonce ?? seededNonce;
  const finalIntentHash = computeX402IntentHash({
    challengeId: challenge.challengeId,
    contextHash: challenge.contextHash,
    recipient: challenge.recipient,
    token: challenge.token,
    tongoAddress: input.tongoAddress,
    amount: resolvedAmount,
    replayKey,
    nonce,
    expiresAt: challenge.expiresAt,
  });
  if (
    proofPayload.envelope &&
    proofPayload.envelope.intentHash !== finalIntentHash
  ) {
    throw new Error("Tongo proof envelope intent hash mismatch");
  }
  const proof =
    proofPayload.proof ||
    (proofPayload.envelope
      ? encodeX402TongoProofEnvelope(proofPayload.envelope)
      : "");
  if (!proof) {
    throw new Error("Proof provider did not return a usable proof");
  }

  return createShieldedPaymentPayload(challenge, {
    tongoAddress: input.tongoAddress,
    amount: resolvedAmount,
    proof,
    replayKey,
    nonce,
  });
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

export async function x402FetchWithProofProvider(
  input: RequestInfo | URL,
  init: RequestInit,
  options: X402FetchWithProofProviderOptions,
): Promise<Response> {
  return x402Fetch(input, init, {
    challengeHeaderName: options.challengeHeaderName,
    paymentHeaderName: options.paymentHeaderName,
    fetchImpl: options.fetchImpl,
    createPayload: challenge =>
      createShieldedPaymentPayloadWithProofProvider(challenge, {
        tongoAddress: options.tongoAddress,
        amount: options.amount,
        proofProvider: options.proofProvider,
      }),
  });
}

export async function x402FetchWithTongoProof(
  input: RequestInfo | URL,
  init: RequestInit,
  options: X402FetchWithTongoProofOptions,
): Promise<Response> {
  return x402FetchWithProofProvider(input, init, options);
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

export class X402SettlementError extends Error {
  readonly code: X402ErrorCode;
  readonly paymentRef?: string;

  constructor(
    message: string,
    code: X402ErrorCode,
    paymentRef?: string,
  ) {
    super(message);
    this.name = "X402SettlementError";
    this.code = code;
    this.paymentRef = paymentRef;
  }
}

export function createShieldedFacilitatorClient(
  options: X402FacilitatorClientOptions,
): X402FacilitatorClient {
  return new X402FacilitatorClient(options);
}

export async function waitForX402Settlement(
  client: Pick<X402FacilitatorClient, "settle">,
  input: X402SettleRequest,
  options?: WaitForX402SettlementOptions,
): Promise<X402SettleResponse> {
  const pollIntervalMs = Math.max(
    100,
    Math.trunc(options?.pollIntervalMs ?? DEFAULT_SETTLEMENT_POLL_INTERVAL_MS),
  );
  const timeoutMs = Math.max(
    pollIntervalMs,
    Math.trunc(options?.timeoutMs ?? DEFAULT_SETTLEMENT_TIMEOUT_MS),
  );
  const maxAttempts =
    options?.maxAttempts && options.maxAttempts > 0
      ? Math.trunc(options.maxAttempts)
      : null;

  const startedAt = Date.now();
  let attempt = 0;
  while (true) {
    attempt += 1;
    const response = await client.settle(input);
    options?.onAttempt?.(attempt, response);
    if (response.status === "settled") {
      return response;
    }
    if (response.status === "failed" || response.status === "rejected") {
      throw new X402SettlementError(
        `x402 settlement ${response.status}: ${response.reasonCode || "SETTLEMENT_FAILED"}`,
        response.reasonCode || "SETTLEMENT_FAILED",
        response.paymentRef,
      );
    }
    if (maxAttempts && attempt >= maxAttempts) {
      throw new X402SettlementError(
        "x402 settlement polling exceeded max attempts",
        "TIMEOUT",
        response.paymentRef,
      );
    }
    if (Date.now() - startedAt + pollIntervalMs > timeoutMs) {
      throw new X402SettlementError(
        "x402 settlement polling timed out",
        "TIMEOUT",
        response.paymentRef,
      );
    }
    await sleep(pollIntervalMs);
  }
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

export function assertValidTongoProofEnvelope(
  envelope: unknown,
): asserts envelope is X402TongoProofEnvelope {
  if (!isObject(envelope)) throw new Error("Invalid tongo proof envelope");
  if (envelope.envelopeVersion !== "1") {
    throw new Error("Invalid tongo envelope version");
  }
  if (envelope.proofType !== "tongo_attestation_v1") {
    throw new Error("Invalid tongo proof type");
  }
  if (typeof envelope.intentHash !== "string" || envelope.intentHash.length < 16) {
    throw new Error("Invalid tongo proof intent hash");
  }
  if (
    envelope.settlementTxHash !== undefined &&
    (typeof envelope.settlementTxHash !== "string" ||
      !/^0x[0-9a-fA-F]+$/.test(envelope.settlementTxHash))
  ) {
    throw new Error("Invalid tongo settlement tx hash");
  }
}
