const DEFAULT_CHALLENGE_HEADER = "x-x402-challenge";
const DEFAULT_PAYMENT_HEADER = "x-x402-payment";

type X402Challenge = {
  version: "1";
  scheme: "cloak-shielded-x402";
  challengeId: string;
  network: string;
  token: string;
  minAmount: string;
  recipient: string;
  contextHash: string;
  expiresAt: string;
  facilitator: string;
};

type X402PaymentPayload = {
  version: "1";
  scheme: "cloak-shielded-x402";
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
};

type X402ProofProviderInput = {
  challenge: X402Challenge;
  tongoAddress: string;
  amount: string;
  contextHash: string;
  replayKey?: string;
  nonce?: string;
  intentHash?: string;
};

type X402ProofProviderOutput = {
  proof: string;
  replayKey?: string;
  nonce?: string;
};

export interface X402ProofProvider {
  createProof(
    input: X402ProofProviderInput,
  ): Promise<X402ProofProviderOutput> | X402ProofProviderOutput;
}

export class StaticX402ProofProvider implements X402ProofProvider {
  constructor(private readonly staticProof: string) {}

  createProof(): X402ProofProviderOutput {
    return { proof: this.staticProof };
  }
}

function randomId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function hashHex(input: string): string {
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

function computeIntentHash(input: {
  challenge: X402Challenge;
  tongoAddress: string;
  amount: string;
  replayKey: string;
  nonce: string;
}): string {
  return hashHex(
    JSON.stringify({
      amount: input.amount,
      challengeId: input.challenge.challengeId,
      contextHash: input.challenge.contextHash,
      expiresAt: input.challenge.expiresAt,
      nonce: input.nonce,
      recipient: input.challenge.recipient.toLowerCase(),
      replayKey: input.replayKey,
      tongoAddress: input.tongoAddress,
      token: input.challenge.token,
    }),
  );
}

function parseChallenge(res: Response, challengeHeaderName: string): X402Challenge {
  const header = res.headers.get(challengeHeaderName);
  if (!header) {
    throw new Error(`Missing ${challengeHeaderName} header in 402 response`);
  }
  const parsed = JSON.parse(header) as X402Challenge;
  if (
    parsed.version !== "1" ||
    parsed.scheme !== "cloak-shielded-x402" ||
    !parsed.challengeId
  ) {
    throw new Error("Invalid x402 challenge payload");
  }
  return parsed;
}

function buildPayload(input: {
  challenge: X402Challenge;
  tongoAddress: string;
  amount?: string;
  proof: string;
  replayKey?: string;
  nonce?: string;
}): X402PaymentPayload {
  return {
    version: "1",
    scheme: "cloak-shielded-x402",
    challengeId: input.challenge.challengeId,
    tongoAddress: input.tongoAddress,
    token: input.challenge.token,
    amount: input.amount || input.challenge.minAmount,
    proof: input.proof,
    replayKey: input.replayKey || randomId(),
    contextHash: input.challenge.contextHash,
    expiresAt: input.challenge.expiresAt,
    nonce: input.nonce || randomId(),
    createdAt: new Date().toISOString(),
  };
}

export async function x402FetchWithProofProvider(
  input: RequestInfo | URL,
  init: RequestInit,
  options: {
    tongoAddress: string;
    amount?: string;
    proofProvider: X402ProofProvider;
    challengeHeaderName?: string;
    paymentHeaderName?: string;
    fetchImpl?: typeof fetch;
  },
): Promise<Response> {
  const challengeHeaderName = options.challengeHeaderName || DEFAULT_CHALLENGE_HEADER;
  const paymentHeaderName = options.paymentHeaderName || DEFAULT_PAYMENT_HEADER;
  const fetchImpl = options.fetchImpl || fetch;

  const first = await fetchImpl(input, init);
  if (first.status !== 402) return first;

  const challenge = parseChallenge(first, challengeHeaderName);
  const amount = options.amount || challenge.minAmount;
  const seededReplayKey = randomId();
  const seededNonce = randomId();
  const seededIntentHash = computeIntentHash({
    challenge,
    tongoAddress: options.tongoAddress,
    amount,
    replayKey: seededReplayKey,
    nonce: seededNonce,
  });
  const proof = await options.proofProvider.createProof({
    challenge,
    tongoAddress: options.tongoAddress,
    amount,
    contextHash: challenge.contextHash,
    replayKey: seededReplayKey,
    nonce: seededNonce,
    intentHash: seededIntentHash,
  });
  const payload = buildPayload({
    challenge,
    tongoAddress: options.tongoAddress,
    amount,
    proof: proof.proof,
    replayKey: proof.replayKey || seededReplayKey,
    nonce: proof.nonce || seededNonce,
  });

  const retryHeaders = new Headers(init.headers || {});
  retryHeaders.set(challengeHeaderName, JSON.stringify(challenge));
  retryHeaders.set(paymentHeaderName, JSON.stringify(payload));

  return fetchImpl(input, {
    ...init,
    headers: retryHeaders,
  });
}
