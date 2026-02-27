import { verifyAudit } from "../../../node_modules/@fatsolutions/tongo-sdk/src/provers/audit";
import { verifyFund } from "../../../node_modules/@fatsolutions/tongo-sdk/src/provers/fund";
import { verifyRagequit } from "../../../node_modules/@fatsolutions/tongo-sdk/src/provers/ragequit";
import { verifyRollover } from "../../../node_modules/@fatsolutions/tongo-sdk/src/provers/rollover";
import { verifyTransfer } from "../../../node_modules/@fatsolutions/tongo-sdk/src/provers/transfer";
import { verifyWithdraw } from "../../../node_modules/@fatsolutions/tongo-sdk/src/provers/withdraw";
import { ProjectivePoint } from "../../../node_modules/@fatsolutions/tongo-sdk/src/types";

export type X402TongoProofOperation =
  | "fund"
  | "transfer"
  | "withdraw"
  | "ragequit"
  | "rollover"
  | "audit";

export interface X402TongoProofBundle {
  operation: X402TongoProofOperation;
  inputs: unknown;
  proof: unknown;
}

export interface X402TongoCryptoVerificationResult {
  ok: boolean;
  details?: string;
}

const OPERATION_SET: ReadonlySet<string> = new Set([
  "fund",
  "transfer",
  "withdraw",
  "ragequit",
  "rollover",
  "audit",
]);

const verifiers: Record<
  X402TongoProofOperation,
  (inputs: unknown, proof: unknown) => boolean
> = {
  fund: verifyFund as unknown as (inputs: unknown, proof: unknown) => boolean,
  transfer: verifyTransfer as unknown as (
    inputs: unknown,
    proof: unknown,
  ) => boolean,
  withdraw: verifyWithdraw as unknown as (
    inputs: unknown,
    proof: unknown,
  ) => boolean,
  ragequit: verifyRagequit as unknown as (
    inputs: unknown,
    proof: unknown,
  ) => boolean,
  rollover: verifyRollover as unknown as (
    inputs: unknown,
    proof: unknown,
  ) => boolean,
  audit: verifyAudit as unknown as (inputs: unknown, proof: unknown) => boolean,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNumericLikeString(value: string): boolean {
  return /^-?(0x[0-9a-fA-F]+|\d+)$/.test(value);
}

function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === "string" && isNumericLikeString(value)) {
    return BigInt(value);
  }
  throw new Error("Cannot coerce value to bigint");
}

function isPointLike(value: unknown): value is { x: unknown; y: unknown; z?: unknown } {
  if (!isObject(value)) return false;
  if (!("x" in value) || !("y" in value)) return false;
  const keys = Object.keys(value);
  return keys.every(key => key === "x" || key === "y" || key === "z");
}

function reviveTongoValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => reviveTongoValue(item));
  }
  if (isPointLike(value)) {
    return new ProjectivePoint(
      toBigInt(value.x),
      toBigInt(value.y),
      value.z !== undefined ? toBigInt(value.z) : 1n,
    );
  }
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, reviveTongoValue(nested)]),
    );
  }
  if (typeof value === "string" && isNumericLikeString(value)) {
    return BigInt(value);
  }
  return value;
}

export function isX402TongoProofOperation(
  value: unknown,
): value is X402TongoProofOperation {
  return typeof value === "string" && OPERATION_SET.has(value);
}

export function isX402TongoProofBundle(
  value: unknown,
): value is X402TongoProofBundle {
  if (!isObject(value)) return false;
  if (!isX402TongoProofOperation(value.operation)) return false;
  if (!("inputs" in value) || !("proof" in value)) return false;
  return true;
}

export function verifyX402TongoProofBundle(
  bundle: X402TongoProofBundle,
): X402TongoCryptoVerificationResult {
  if (!isX402TongoProofBundle(bundle)) {
    return {
      ok: false,
      details: "tongo proof bundle shape invalid",
    };
  }
  try {
    const revivedInputs = reviveTongoValue(bundle.inputs);
    const revivedProof = reviveTongoValue(bundle.proof);
    const verified = verifiers[bundle.operation](revivedInputs, revivedProof);
    if (verified === false) {
      return {
        ok: false,
        details: `tongo ${bundle.operation} proof verification returned false`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      details: error instanceof Error ? error.message : "tongo verification failed",
    };
  }
}
