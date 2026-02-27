import {
  createShieldedPaymentPayload,
  createX402TongoProofEnvelope,
  encodeX402TongoProofEnvelope,
  type X402Challenge,
  type X402PaymentPayload,
  type X402TongoProofBundle,
} from "../../../../sdk/src/x402";
import { GENERATOR } from "../../../node_modules/@fatsolutions/tongo-sdk/src/constants";
import { proveWithdraw } from "../../../node_modules/@fatsolutions/tongo-sdk/src/provers/withdraw";
import { createCipherBalance } from "../../../node_modules/@fatsolutions/tongo-sdk/src/types";

function randomRef(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
}

function serializeTongoValue(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(item => serializeTongoValue(item));
  if (value && typeof value === "object") {
    if (
      typeof (value as { toAffine?: () => { x: bigint; y: bigint } }).toAffine ===
      "function"
    ) {
      const affine = (value as { toAffine: () => { x: bigint; y: bigint } }).toAffine();
      return {
        x: affine.x.toString(),
        y: affine.y.toString(),
      };
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        serializeTongoValue(nested),
      ]),
    );
  }
  return value;
}

export function ensureX402FacilitatorSecretForTests(secret = "x402-test-secret"): void {
  process.env.X402_FACILITATOR_SECRET = secret;
}

export function createWithdrawProofBundle(
  recipient: string,
  amount: string,
  tamper = false,
): X402TongoProofBundle {
  const privateKey = 123456n;
  const withdrawAmount = BigInt(amount);
  const initialBalance = withdrawAmount + 10n;
  const bitSize = 128;
  const recipientBigInt = BigInt(recipient);
  const initialCipherBalance = createCipherBalance(
    GENERATOR.multiply(privateKey),
    initialBalance,
    7n,
  );
  const { inputs, proof } = proveWithdraw(
    privateKey,
    initialBalance,
    withdrawAmount,
    recipientBigInt,
    initialCipherBalance,
    1n,
    bitSize,
    {
      chain_id: 0x534e5f5345504f4c4941n,
      tongo_address: 0x1111111111111111111111111111111n,
      sender_address: 0x2222222222222222222222222222222n,
    },
  );

  const serializedProof = serializeTongoValue(proof) as Record<string, unknown>;
  if (tamper && typeof serializedProof.sx === "string") {
    serializedProof.sx = (BigInt(serializedProof.sx) + 1n).toString();
  }

  return {
    operation: "withdraw",
    inputs: serializeTongoValue(inputs),
    proof: serializedProof,
  };
}

export function createStrictX402Payment(
  challenge: X402Challenge,
  input?: {
    tongoAddress?: string;
    amount?: string;
    replayKey?: string;
    nonce?: string;
    settlementTxHash?: string;
    attestor?: string;
    tongoProof?: X402TongoProofBundle;
  },
): X402PaymentPayload {
  const tongoAddress = input?.tongoAddress || "tongo1test";
  const amount = input?.amount || challenge.minAmount;
  const replayKey = input?.replayKey || randomRef("rk");
  const nonce = input?.nonce || randomRef("nonce");
  const tongoProof =
    input?.tongoProof || createWithdrawProofBundle(challenge.recipient, amount);
  const envelope = createX402TongoProofEnvelope({
    challenge,
    tongoAddress,
    amount,
    replayKey,
    nonce,
    settlementTxHash:
      input?.settlementTxHash ||
      "0x111122223333444455556666777788889999aaaabbbbccccddddeeeeffff",
    attestor: input?.attestor || "test-suite",
    tongoProof,
  });
  return createShieldedPaymentPayload(challenge, {
    tongoAddress,
    amount,
    replayKey,
    nonce,
    proof: encodeX402TongoProofEnvelope(envelope),
  });
}
