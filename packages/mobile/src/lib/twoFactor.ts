/**
 * twoFactor.ts — 2FA utilities: biometrics, secondary key management,
 * API operations for approval_requests and two_factor_configs.
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
  CloakApiClient,
} from "@cloak-wallet/sdk";
import { getApiClient } from "./apiClient";
import { getRuntimeMode, isMockMode } from "../testing/runtimeConfig";
import { MockApprovalBackend } from "../testing/mocks/MockApprovalBackend";
import { loadActiveScenarioFixture } from "../testing/fixtures/loadScenarioFixture";
import type {
  ApprovalBackend,
  ApprovalRequestRecord,
  ApprovalStatus as BackendApprovalStatus,
  TwoFactorConfigRecord,
} from "../testing/interfaces/ApprovalBackend";

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
  SECONDARY_PK: "cloak_2fa_secondary_pk",
};

// ─── Types (matching SDK two-factor.ts) ──────────────────────────────────────

export type TwoFactorAction = ApprovalRequestRecord["action"];
export type ApprovalStatus = BackendApprovalStatus;

export interface TwoFactorConfig extends TwoFactorConfigRecord {}

export interface ApprovalRequest extends ApprovalRequestRecord {}

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
  if (isMockMode()) {
    const approved = getNextMockBiometricDecision();
    console.warn(
      `[twoFactor] e2e-mock biometric ${approved ? "approved" : "rejected"}: ${message}`,
    );
    return approved;
  }

  try {
    const ReactNativeBiometrics =
      require("react-native-biometrics").default ||
      require("react-native-biometrics");
    const rnBiometrics = new ReactNativeBiometrics();
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

type BiometricFixture = {
  biometricPrompts?: boolean[];
};

let biometricPromptIndex = 0;

function getNextMockBiometricDecision(): boolean {
  const fixture =
    loadActiveScenarioFixture<BiometricFixture>("approvalBackend");
  const sequence = fixture.biometricPrompts;
  if (!sequence?.length) return true;

  const index = biometricPromptIndex % sequence.length;
  biometricPromptIndex += 1;
  return !!sequence[index];
}

export function resetMockBiometricSequenceForTesting(): void {
  biometricPromptIndex = 0;
}

// ─── Secondary Key Management ────────────────────────────────────────────────

export function generateSecondaryKey(): {
  privateKey: string;
  publicKey: string;
} {
  const bytes = new Uint8Array(32);
  const cryptoApi = (globalThis as any)?.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("crypto.getRandomValues is unavailable");
  }
  cryptoApi.getRandomValues(bytes);
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

// ─── API Backend Selection ───────────────────────────────────────────────────

class LiveApprovalBackend implements ApprovalBackend {
  readonly mode = getRuntimeMode();

  private async getClient(walletAddress?: string): Promise<CloakApiClient> {
    return getApiClient({ walletAddress });
  }

  async fetchPendingRequests(
    walletAddress: string,
  ): Promise<ApprovalRequestRecord[]> {
    const client = await this.getClient(walletAddress);
    const approvals = await client.getPendingApprovals(walletAddress);
    return approvals as unknown as ApprovalRequestRecord[];
  }

  async updateRequestStatus(
    id: string,
    status: ApprovalStatus,
    finalTxHash?: string,
    errorMessage?: string,
  ): Promise<any> {
    const client = await this.getClient();
    const body: any = {
      status,
      responded_at: new Date().toISOString(),
    };
    if (finalTxHash) body.final_tx_hash = finalTxHash;
    if (errorMessage) body.error_message = errorMessage;
    await client.updateApproval(id, body);
    return body;
  }

  async enableTwoFactorConfig(
    walletAddress: string,
    secondaryPubKey: string,
  ): Promise<any> {
    const client = await this.getClient(walletAddress);
    await client.enableTwoFactor({
      wallet_address: walletAddress,
      secondary_public_key: secondaryPubKey,
    });
    return null;
  }

  async disableTwoFactorConfig(walletAddress: string): Promise<any> {
    const client = await this.getClient(walletAddress);
    await client.disableTwoFactor(walletAddress);
    return null;
  }

  async isTwoFactorConfigured(
    walletAddress: string,
  ): Promise<TwoFactorConfigRecord | null> {
    const client = await this.getClient(walletAddress);
    try {
      const status = await client.getTwoFactorStatus(walletAddress);
      if (!status || !status.enabled) return null;
      return {
        id: "",
        wallet_address: status.wallet_address || walletAddress,
        secondary_public_key: status.secondary_public_key || "",
        is_enabled: status.enabled,
        created_at: "",
      } as TwoFactorConfigRecord;
    } catch {
      return null;
    }
  }
}

let backendCache: ApprovalBackend | null = null;

function getApprovalBackend(): ApprovalBackend {
  const mode = getRuntimeMode();
  if (backendCache && backendCache.mode === mode) {
    return backendCache;
  }

  backendCache = mode === "e2e-mock" ? new MockApprovalBackend() : new LiveApprovalBackend();
  return backendCache;
}

// ─── API CRUD Operations ─────────────────────────────────────────────────────

export async function fetchPendingRequests(
  walletAddress: string,
): Promise<{ data: ApprovalRequest[]; error: string | null }> {
  try {
    const data = await getApprovalBackend().fetchPendingRequests(walletAddress);
    return { data: data as ApprovalRequest[], error: null };
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
    const data = await getApprovalBackend().updateRequestStatus(
      id,
      status,
      finalTxHash,
      errorMessage,
    );
    return { data, error: null };
  } catch (e: any) {
    return { data: null, error: e.message };
  }
}

export async function enableTwoFactorConfig(
  walletAddress: string,
  secondaryPubKey: string,
): Promise<{ data: any; error: string | null }> {
  try {
    const data = await getApprovalBackend().enableTwoFactorConfig(
      walletAddress,
      secondaryPubKey,
    );
    return { data, error: null };
  } catch (e: any) {
    return { data: null, error: e.message };
  }
}

export async function disableTwoFactorConfig(
  walletAddress: string,
): Promise<{ data: any; error: string | null }> {
  try {
    const data = await getApprovalBackend().disableTwoFactorConfig(walletAddress);
    return { data, error: null };
  } catch (e: any) {
    return { data: null, error: e.message };
  }
}

export async function isTwoFactorConfigured(
  walletAddress: string,
): Promise<{ configured: boolean; config: TwoFactorConfig | null }> {
  try {
    const config = await getApprovalBackend().isTwoFactorConfigured(walletAddress);
    if (!config) {
      return { configured: false, config: null };
    }
    return { configured: true, config: config as TwoFactorConfig };
  } catch {
    return { configured: false, config: null };
  }
}
