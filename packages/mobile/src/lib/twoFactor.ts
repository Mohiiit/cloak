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

// ─── Address Normalization ──────────────────────────────────────────────────

export function normalizeAddress(addr: string): string {
  const lower = addr.toLowerCase();
  if (!lower.startsWith("0x")) return lower;
  const stripped = lower.slice(2).replace(/^0+/, "");
  return "0x" + (stripped || "0");
}

// ─── Storage Keys ────────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  SUPABASE_URL: "cloak_2fa_supabase_url",
  SUPABASE_KEY: "cloak_2fa_supabase_key",
  SECONDARY_PK: "cloak_2fa_secondary_pk",
};

// ─── Default Supabase Credentials ────────────────────────────────────────────

const DEFAULT_SUPABASE_URL = "https://inrrwwpzglyywrrumxfr.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_TPLbWlk9ucpb6zLduRShvg_pq4K4cad";

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
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
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

// ─── Signing Utilities (mirrors SDK) ─────────────────────────────────────────

export function signTransactionHash(
  txHash: string,
  privateKey: string,
): [string, string] {
  const sig = ec.starkCurve.sign(num.toHex(BigInt(txHash)), privateKey);
  return ["0x" + sig.r.toString(16), "0x" + sig.s.toString(16)];
}

export function combinedSignature(
  sig1: [string, string],
  sig2: [string, string],
): string[] {
  return [...sig1, ...sig2];
}

export function deserializeCalls(json: string): any[] {
  return JSON.parse(json);
}

// ─── Supabase REST Client ────────────────────────────────────────────────────

interface SupabaseLite {
  url: string;
  key: string;
  get: (
    table: string,
    query: string,
  ) => Promise<{ data: any[]; error: string | null }>;
  post: (
    table: string,
    body: any,
  ) => Promise<{ data: any; error: string | null }>;
  patch: (
    table: string,
    query: string,
    body: any,
  ) => Promise<{ data: any; error: string | null }>;
  del: (
    table: string,
    query: string,
  ) => Promise<{ data: any; error: string | null }>;
}

export async function getSupabaseLite(): Promise<SupabaseLite> {
  const { url, key } = await getSupabaseConfig();

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  async function get(table: string, query: string) {
    try {
      const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
        method: "GET",
        headers,
      });
      if (!res.ok) {
        const text = await res.text();
        return { data: [], error: text };
      }
      const data = await res.json();
      return { data, error: null };
    } catch (e: any) {
      return { data: [], error: e.message };
    }
  }

  async function post(table: string, body: any) {
    try {
      const res = await fetch(`${url}/rest/v1/${table}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
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

  async function patch(table: string, query: string, body: any) {
    try {
      const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      });
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

  async function del(table: string, query: string) {
    try {
      const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const text = await res.text();
        return { data: null, error: text };
      }
      // DELETE may return empty body
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      return { data, error: null };
    } catch (e: any) {
      return { data: null, error: e.message };
    }
  }

  return { url, key, get, post, patch, del };
}

// ─── Supabase CRUD Operations ────────────────────────────────────────────────

export async function fetchPendingRequests(
  walletAddress: string,
): Promise<{ data: ApprovalRequest[]; error: string | null }> {
  const sb = await getSupabaseLite();
  return sb.get(
    "approval_requests",
    `status=eq.pending&wallet_address=eq.${walletAddress}&order=created_at.desc`,
  );
}

export async function updateRequestStatus(
  id: string,
  status: ApprovalStatus,
  finalTxHash?: string,
  errorMessage?: string,
): Promise<{ data: any; error: string | null }> {
  const sb = await getSupabaseLite();
  const body: any = {
    status,
    responded_at: new Date().toISOString(),
  };
  if (finalTxHash) body.final_tx_hash = finalTxHash;
  if (errorMessage) body.error_message = errorMessage;
  return sb.patch("approval_requests", `id=eq.${id}`, body);
}

export async function enableTwoFactorConfig(
  walletAddress: string,
  secondaryPubKey: string,
): Promise<{ data: any; error: string | null }> {
  const sb = await getSupabaseLite();
  return sb.post("two_factor_configs", {
    wallet_address: walletAddress,
    secondary_public_key: secondaryPubKey,
    is_enabled: true,
  });
}

export async function disableTwoFactorConfig(
  walletAddress: string,
): Promise<{ data: any; error: string | null }> {
  const sb = await getSupabaseLite();
  return sb.del(
    "two_factor_configs",
    `wallet_address=eq.${walletAddress}`,
  );
}

export async function isTwoFactorConfigured(
  walletAddress: string,
): Promise<{ configured: boolean; config: TwoFactorConfig | null }> {
  const sb = await getSupabaseLite();
  const { data, error } = await sb.get(
    "two_factor_configs",
    `wallet_address=eq.${walletAddress}&limit=1`,
  );
  if (error || !data || data.length === 0) {
    return { configured: false, config: null };
  }
  return { configured: true, config: data[0] };
}
