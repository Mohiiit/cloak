import type { SupabaseLite } from "./supabase";
import { normalizeAddress } from "./ward";

export type ViewingGrantStatus = "active" | "revoked" | "expired";

export interface ViewingKeyGrant {
  id?: string;
  owner_address: string;
  viewer_address: string;
  encrypted_viewing_key: string;
  scope: string;
  expires_at?: string | null;
  status?: ViewingGrantStatus;
  created_at?: string;
  revoked_at?: string | null;
  revocation_reason?: string | null;
}

export interface InnocenceProof {
  id?: string;
  owner_address: string;
  proof_hash: string;
  circuit_version: string;
  nullifier_hash?: string | null;
  note?: string | null;
  created_at?: string;
}

export interface ComplianceTables {
  viewingKeyGrants?: string;
  innocenceProofs?: string;
}

const DEFAULT_TABLES: Required<ComplianceTables> = {
  viewingKeyGrants: "viewing_key_grants",
  innocenceProofs: "innocence_proofs",
};

function tables(custom?: ComplianceTables): Required<ComplianceTables> {
  return {
    viewingKeyGrants: custom?.viewingKeyGrants ?? DEFAULT_TABLES.viewingKeyGrants,
    innocenceProofs: custom?.innocenceProofs ?? DEFAULT_TABLES.innocenceProofs,
  };
}

function normalizeGrant(input: ViewingKeyGrant): ViewingKeyGrant {
  return {
    ...input,
    owner_address: normalizeAddress(input.owner_address),
    viewer_address: normalizeAddress(input.viewer_address),
    status: input.status ?? "active",
  };
}

export async function grantViewingAccess(
  sb: SupabaseLite,
  input: ViewingKeyGrant,
  customTables?: ComplianceTables,
): Promise<ViewingKeyGrant> {
  const payload = normalizeGrant(input);
  const [row] = await sb.insert<ViewingKeyGrant>(
    tables(customTables).viewingKeyGrants,
    payload,
  );
  return row;
}

export async function revokeViewingAccess(
  sb: SupabaseLite,
  grantId: string,
  reason?: string,
  customTables?: ComplianceTables,
): Promise<ViewingKeyGrant | null> {
  const [row] = await sb.update<ViewingKeyGrant>(
    tables(customTables).viewingKeyGrants,
    `id=eq.${grantId}`,
    {
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revocation_reason: reason ?? null,
    },
  );
  return row ?? null;
}

export async function listViewingGrantsForOwner(
  sb: SupabaseLite,
  ownerAddress: string,
  includeRevoked = false,
  customTables?: ComplianceTables,
): Promise<ViewingKeyGrant[]> {
  const owner = normalizeAddress(ownerAddress);
  const filters = includeRevoked
    ? `owner_address=eq.${owner}`
    : `owner_address=eq.${owner}&status=eq.active`;
  return sb.select<ViewingKeyGrant>(
    tables(customTables).viewingKeyGrants,
    filters,
    "created_at.desc",
  );
}

export async function listViewingGrantsForViewer(
  sb: SupabaseLite,
  viewerAddress: string,
  includeRevoked = false,
  customTables?: ComplianceTables,
): Promise<ViewingKeyGrant[]> {
  const viewer = normalizeAddress(viewerAddress);
  const filters = includeRevoked
    ? `viewer_address=eq.${viewer}`
    : `viewer_address=eq.${viewer}&status=eq.active`;
  return sb.select<ViewingKeyGrant>(
    tables(customTables).viewingKeyGrants,
    filters,
    "created_at.desc",
  );
}

export async function submitInnocenceProof(
  sb: SupabaseLite,
  proof: InnocenceProof,
  customTables?: ComplianceTables,
): Promise<InnocenceProof> {
  const [row] = await sb.insert<InnocenceProof>(
    tables(customTables).innocenceProofs,
    {
      ...proof,
      owner_address: normalizeAddress(proof.owner_address),
    },
  );
  return row;
}

export async function listInnocenceProofs(
  sb: SupabaseLite,
  ownerAddress: string,
  customTables?: ComplianceTables,
): Promise<InnocenceProof[]> {
  return sb.select<InnocenceProof>(
    tables(customTables).innocenceProofs,
    `owner_address=eq.${normalizeAddress(ownerAddress)}`,
    "created_at.desc",
  );
}
