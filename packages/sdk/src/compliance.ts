import type { CloakApiClient } from "./api-client";
import type { ViewingGrantResponse, InnocenceProofResponse } from "./types/api";
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

// ─── Mappers ──────────────────────────────────────────────────────────────────

function toViewingKeyGrant(res: ViewingGrantResponse): ViewingKeyGrant {
  return {
    id: res.id,
    owner_address: res.owner_address,
    viewer_address: res.viewer_address,
    encrypted_viewing_key: res.encrypted_viewing_key,
    scope: res.scope,
    expires_at: res.expires_at,
    status: res.status as ViewingGrantStatus,
    created_at: res.created_at,
    revoked_at: res.revoked_at,
    revocation_reason: res.revocation_reason,
  };
}

function toInnocenceProof(res: InnocenceProofResponse): InnocenceProof {
  return {
    id: res.id,
    owner_address: res.owner_address,
    proof_hash: res.proof_hash,
    circuit_version: res.circuit_version,
    nullifier_hash: res.nullifier_hash,
    note: res.note,
    created_at: res.created_at,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function grantViewingAccess(
  client: CloakApiClient,
  input: ViewingKeyGrant,
): Promise<ViewingKeyGrant> {
  const res = await client.createViewingGrant({
    viewer_address: normalizeAddress(input.viewer_address),
    encrypted_viewing_key: input.encrypted_viewing_key,
    scope: input.scope,
    expires_at: input.expires_at ?? null,
  });
  return toViewingKeyGrant(res);
}

export async function revokeViewingAccess(
  client: CloakApiClient,
  grantId: string,
  reason?: string,
): Promise<ViewingKeyGrant | null> {
  await client.revokeViewingGrant(grantId, reason);
  return null;
}

export async function listViewingGrantsForOwner(
  client: CloakApiClient,
  ownerAddress: string,
  includeRevoked = false,
): Promise<ViewingKeyGrant[]> {
  const results = await client.listViewingGrants({
    role: "owner",
    include_revoked: includeRevoked,
  });
  return results.map(toViewingKeyGrant);
}

export async function listViewingGrantsForViewer(
  client: CloakApiClient,
  viewerAddress: string,
  includeRevoked = false,
): Promise<ViewingKeyGrant[]> {
  const results = await client.listViewingGrants({
    role: "viewer",
    include_revoked: includeRevoked,
  });
  return results.map(toViewingKeyGrant);
}

export async function submitInnocenceProof(
  client: CloakApiClient,
  proof: InnocenceProof,
): Promise<InnocenceProof> {
  const res = await client.submitInnocenceProof({
    proof_hash: proof.proof_hash,
    circuit_version: proof.circuit_version,
    nullifier_hash: proof.nullifier_hash ?? null,
    note: proof.note ?? null,
  });
  return toInnocenceProof(res);
}

export async function listInnocenceProofs(
  client: CloakApiClient,
  ownerAddress: string,
): Promise<InnocenceProof[]> {
  const results = await client.listInnocenceProofs();
  return results.map(toInnocenceProof);
}
