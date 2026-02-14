/**
 * twoFactor.ts — 2FA utilities: biometrics, secondary key management,
 * Supabase REST operations for approval_requests and two_factor_configs.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Signer,
  ec,
  num,
  type Call,
  type SignerInterface,
  type InvocationsSignerDetails,
  type DeclareSignerDetails,
  type DeployAccountSignerDetails,
  type TypedData,
} from "starknet";
import {
  normalizeAddress,
  signTransactionHash,
  combinedSignature,
  deserializeCalls,
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_KEY,
  SupabaseLite as SdkSupabaseLite,
} from "@cloak-wallet/sdk";

// Re-export SDK utilities so existing callers don't break
export { normalizeAddress, signTransactionHash, combinedSignature, deserializeCalls };

// ─── DualKeySigner ──────────────────────────────────────────────────────────
// Extends starknet.js Signer to sign with TWO private keys.
// starknet.js computes the tx hash internally, then calls signRaw() →
// we sign with both keys → return [r1, s1, r2, s2].
// CloakAccount's on-chain __validate__ checks both signatures.

export class DualKeySigner extends Signer {
  private _pk2: string;

  constructor(pk1: string, pk2: string) {
    super(pk1);
    this._pk2 = pk2;
  }

  protected async signRaw(msgHash: string): Promise<string[]> {
    const sig1 = ec.starkCurve.sign(msgHash, this.pk);
    const sig2 = ec.starkCurve.sign(msgHash, this._pk2);
    return [
      num.toHex(sig1.r),
      num.toHex(sig1.s),
      num.toHex(sig2.r),
      num.toHex(sig2.s),
    ];
  }
}

// ─── DualSignSigner (legacy — pre-computed combined signature) ───────────────
// Used when signature is already computed externally (e.g. disable2FA fallback).

export class DualSignSigner implements SignerInterface {
  constructor(private sig: string[]) {}

  async getPubKey(): Promise<string> {
    return "0x0";
  }

  async signMessage(
    _typedData: TypedData,
    _accountAddress: string,
  ): Promise<string[]> {
    return this.sig;
  }

  async signTransaction(
    _transactions: Call[],
    _details: InvocationsSignerDetails,
  ): Promise<string[]> {
    return this.sig;
  }

  async signDeclareTransaction(
    _details: DeclareSignerDetails,
  ): Promise<string[]> {
    return this.sig;
  }

  async signDeployAccountTransaction(
    _details: DeployAccountSignerDetails,
  ): Promise<string[]> {
    return this.sig;
  }
}

// ─── Storage Keys ────────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  SUPABASE_URL: "cloak_2fa_supabase_url",
  SUPABASE_KEY: "cloak_2fa_supabase_key",
  SECONDARY_PK: "cloak_2fa_secondary_pk",
};

// ─── Types (matching SDK two-factor.ts) ──────────────────────────────────────

export type TwoFactorAction = "fund" | "transfer" | "withdraw" | "rollover";
export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "completed"
  | "failed"
  | "expired";

export interface TwoFactorConfig {
  id: string;
  wallet_address: string;
  secondary_public_key: string;
  is_enabled: boolean;
  created_at: string;
}

export interface ApprovalRequest {
  id: string;
  wallet_address: string;
  action: TwoFactorAction;
  token: string;
  amount: string | null;
  recipient: string | null;
  calls_json: string;
  sig1_json: string; // JSON: ["r1_hex", "s1_hex"]
  nonce: string;
  resource_bounds_json: string;
  tx_hash: string;
  status: ApprovalStatus;
  final_tx_hash: string | null;
  error_message: string | null;
  created_at: string;
  expires_at: string;
  responded_at: string | null;
}

// ─── Supabase Config ─────────────────────────────────────────────────────────

export async function getSupabaseConfig(): Promise<{
  url: string;
  key: string;
}> {
  const [url, key] = await AsyncStorage.multiGet([
    STORAGE_KEYS.SUPABASE_URL,
    STORAGE_KEYS.SUPABASE_KEY,
  ]);
  return {
    url: url[1] || DEFAULT_SUPABASE_URL,
    key: key[1] || DEFAULT_SUPABASE_KEY,
  };
}

export async function saveSupabaseConfig(
  url: string,
  key: string,
): Promise<void> {
  await AsyncStorage.multiSet([
    [STORAGE_KEYS.SUPABASE_URL, url],
    [STORAGE_KEYS.SUPABASE_KEY, key],
  ]);
}

// ─── Biometrics ──────────────────────────────────────────────────────────────

export async function isBiometricsAvailable(): Promise<boolean> {
  try {
    const ReactNativeBiometrics =
      require("react-native-biometrics").default ||
      require("react-native-biometrics");
    const rnBiometrics = new ReactNativeBiometrics();
    const { available } = await rnBiometrics.isSensorAvailable();
    return available;
  } catch {
    console.warn(
      "[twoFactor] react-native-biometrics not available, using stub",
    );
    return true;
  }
}

export async function promptBiometric(message: string): Promise<boolean> {
  try {
    const ReactNativeBiometrics =
      require("react-native-biometrics").default ||
      require("react-native-biometrics");
    const rnBiometrics = new ReactNativeBiometrics();
    // Check if biometrics are available first
    const { available } = await rnBiometrics.isSensorAvailable();
    if (!available) {
      console.warn("[twoFactor] Biometrics not available (simulator?), auto-approving");
      return true;
    }
    const { success } = await rnBiometrics.simplePrompt({
      promptMessage: message,
    });
    return success;
  } catch {
    console.warn("[twoFactor] Biometric prompt unavailable, auto-approving");
    return true;
  }
}

// ─── Secondary Key Management ────────────────────────────────────────────────

export function generateSecondaryKey(): {
  privateKey: string;
  publicKey: string;
} {
  // Use crypto.getRandomValues directly (polyfilled by react-native-get-random-values)
  // instead of ec.starkCurve.utils.randomPrivateKey() which fails on iOS
  // because @noble/curves' internal RNG lookup doesn't find the polyfill.
  //
  // The Stark curve order is ~2^251, so we generate 32 bytes (256 bits) and
  // mask the top byte to ensure the value fits within the valid range.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // Mask top byte to keep value < 2^251 (well within Stark curve order)
  bytes[0] = bytes[0] & 0x07;
  const privateKeyHex =
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  const publicKey = ec.starkCurve.getStarkKey(privateKeyHex);
  return {
    privateKey: privateKeyHex,
    publicKey,
  };
}

export async function saveSecondaryPrivateKey(pk: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.SECONDARY_PK, pk);
}

export async function getSecondaryPrivateKey(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.SECONDARY_PK);
}

export async function clearSecondaryKey(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.SECONDARY_PK);
}

export async function getSecondaryPublicKey(): Promise<string | null> {
  const pk = await getSecondaryPrivateKey();
  if (!pk) return null;
  try {
    return ec.starkCurve.getStarkKey(pk);
  } catch {
    return null;
  }
}

// ─── Supabase REST Client (uses SDK SupabaseLite) ───────────────────────────

export async function getSupabaseLite(): Promise<SdkSupabaseLite> {
  const { url, key } = await getSupabaseConfig();
  return new SdkSupabaseLite(url, key);
}

// ─── Supabase CRUD Operations ────────────────────────────────────────────────

export async function fetchPendingRequests(
  walletAddress: string,
): Promise<{ data: ApprovalRequest[]; error: string | null }> {
  try {
    const sb = await getSupabaseLite();
    const data = await sb.select<ApprovalRequest>(
      "approval_requests",
      `status=eq.pending&wallet_address=eq.${walletAddress}&order=created_at.desc`,
    );
    return { data, error: null };
  } catch (e: any) {
    return { data: [], error: e.message };
  }
}

export async function updateRequestStatus(
  id: string,
  status: ApprovalStatus,
  finalTxHash?: string,
  errorMessage?: string,
): Promise<{ data: any; error: string | null }> {
  try {
    const sb = await getSupabaseLite();
    const body: any = {
      status,
      responded_at: new Date().toISOString(),
    };
    if (finalTxHash) body.final_tx_hash = finalTxHash;
    if (errorMessage) body.error_message = errorMessage;
    const data = await sb.update("approval_requests", `id=eq.${id}`, body);
    return { data, error: null };
  } catch (e: any) {
    return { data: null, error: e.message };
  }
}

export async function enableTwoFactorConfig(
  walletAddress: string,
  secondaryPubKey: string,
): Promise<{ data: any; error: string | null }> {
  // Use upsert with on_conflict so re-enabling doesn't fail
  // if a row already exists for this wallet address.
  // SDK's SupabaseLite doesn't expose upsert, so use raw fetch with config from storage.
  const { url, key } = await getSupabaseConfig();
  const upsertHeaders = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation,resolution=merge-duplicates",
  };
  try {
    const res = await fetch(
      `${url}/rest/v1/two_factor_configs?on_conflict=wallet_address`,
      {
        method: "POST",
        headers: upsertHeaders,
        body: JSON.stringify({
          wallet_address: walletAddress,
          secondary_public_key: secondaryPubKey,
          is_enabled: true,
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      return { data: null, error: text };
    }
    const data = await res.json();
    return { data, error: null };
  } catch (e: any) {
    return { data: null, error: e.message };
  }
}

export async function disableTwoFactorConfig(
  walletAddress: string,
): Promise<{ data: any; error: string | null }> {
  try {
    const sb = await getSupabaseLite();
    await sb.delete(
      "two_factor_configs",
      `wallet_address=eq.${walletAddress}`,
    );
    return { data: null, error: null };
  } catch (e: any) {
    return { data: null, error: e.message };
  }
}

export async function isTwoFactorConfigured(
  walletAddress: string,
): Promise<{ configured: boolean; config: TwoFactorConfig | null }> {
  try {
    const sb = await getSupabaseLite();
    const data = await sb.select<TwoFactorConfig>(
      "two_factor_configs",
      `wallet_address=eq.${walletAddress}&limit=1`,
    );
    if (!data || data.length === 0) {
      return { configured: false, config: null };
    }
    return { configured: true, config: data[0] };
  } catch {
    return { configured: false, config: null };
  }
}
