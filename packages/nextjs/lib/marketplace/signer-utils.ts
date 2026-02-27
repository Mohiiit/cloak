/**
 * Shared signer configuration and account construction for backend agents.
 *
 * Extracted from basic-protocol-adapter.ts to be reusable by
 * spend-authorization.ts and other modules that need the backend signer.
 */

import { Account, RpcProvider, Signer, ec, num } from "starknet";

function sanitizeEnvCredential(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const cleaned = value
    .replace(/\\r/gi, "")
    .replace(/\\n/gi, "")
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

export interface SignerConfig {
  rpcUrl: string;
  signerAddress: string;
  signerPrivateKey: string;
  signerSecondaryPrivateKey?: string;
  signerCairoVersion: "0" | "1";
}

class DualKeySigner extends Signer {
  private secondaryPrivateKey: string;

  constructor(primaryPrivateKey: string, secondaryPrivateKey: string) {
    super(primaryPrivateKey);
    this.secondaryPrivateKey = secondaryPrivateKey;
  }

  protected async signRaw(msgHash: string): Promise<string[]> {
    const sig1 = ec.starkCurve.sign(msgHash, this.pk);
    const sig2 = ec.starkCurve.sign(msgHash, this.secondaryPrivateKey);
    return [
      num.toHex(sig1.r),
      num.toHex(sig1.s),
      num.toHex(sig2.r),
      num.toHex(sig2.s),
    ];
  }
}

export function resolveSignerConfig(
  env: NodeJS.ProcessEnv = process.env,
): SignerConfig {
  const rpcUrl = env.CLOAK_SEPOLIA_RPC_URL || env.NEXT_PUBLIC_SEPOLIA_PROVIDER_URL;
  if (!rpcUrl) {
    throw new Error("CLOAK_SEPOLIA_RPC_URL is required");
  }

  const signerAddress =
    sanitizeEnvCredential(env.BASIC_PROTOCOL_SIGNER_ADDRESS) ||
    sanitizeEnvCredential(env.ERC8004_SIGNER_ADDRESS);
  const signerPrivateKey =
    sanitizeEnvCredential(env.BASIC_PROTOCOL_SIGNER_PRIVATE_KEY) ||
    sanitizeEnvCredential(env.ERC8004_SIGNER_PRIVATE_KEY);
  const signerSecondaryPrivateKey =
    sanitizeEnvCredential(env.BASIC_PROTOCOL_SIGNER_SECONDARY_PRIVATE_KEY) ||
    sanitizeEnvCredential(env.ERC8004_SIGNER_SECONDARY_PRIVATE_KEY) ||
    undefined;
  const signerCairoVersion =
    env.BASIC_PROTOCOL_SIGNER_CAIRO_VERSION === "0" ||
    env.ERC8004_SIGNER_CAIRO_VERSION === "0"
      ? "0"
      : "1";

  if (!signerAddress || !signerPrivateKey) {
    throw new Error(
      "Backend signer not configured (set BASIC_PROTOCOL_SIGNER_ADDRESS/BASIC_PROTOCOL_SIGNER_PRIVATE_KEY or ERC8004_SIGNER_ADDRESS/ERC8004_SIGNER_PRIVATE_KEY)",
    );
  }

  return {
    rpcUrl,
    signerAddress,
    signerPrivateKey,
    signerSecondaryPrivateKey,
    signerCairoVersion,
  };
}

export async function buildSignerAccount(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ account: Account; provider: RpcProvider }> {
  const config = resolveSignerConfig(env);
  const provider = new RpcProvider({ nodeUrl: config.rpcUrl });

  // Check if account has 2FA enabled
  let requiresTwoFactor = false;
  try {
    const result = await provider.callContract({
      contractAddress: config.signerAddress,
      entrypoint: "is_2fa_enabled",
      calldata: [],
    });
    if (Array.isArray(result) && result.length > 0) {
      requiresTwoFactor = BigInt(result[0] || "0") !== 0n;
    }
  } catch {
    // Not all accounts expose is_2fa_enabled
  }

  if (requiresTwoFactor && !config.signerSecondaryPrivateKey) {
    throw new Error(
      "Signer account has 2FA enabled; set BASIC_PROTOCOL_SIGNER_SECONDARY_PRIVATE_KEY",
    );
  }

  const signerKeyOrDual =
    requiresTwoFactor && config.signerSecondaryPrivateKey
      ? new DualKeySigner(config.signerPrivateKey, config.signerSecondaryPrivateKey)
      : config.signerPrivateKey;

  const account = new Account({
    provider,
    address: config.signerAddress,
    signer: signerKeyOrDual,
    cairoVersion: config.signerCairoVersion,
  });

  return { account, provider };
}
