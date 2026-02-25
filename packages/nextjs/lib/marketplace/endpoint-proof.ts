import type { AgentEndpointOwnershipProof } from "@cloak-wallet/sdk";

function normalizeEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  const pathname = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
  return `${url.protocol}//${url.host}${pathname || "/"}`;
}

function digestHex(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x27d4eb2d;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const p1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const p2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${p1}${p2}${p1}${p2}${p1}${p2}${p1}${p2}`;
}

export function buildEndpointOwnershipDigest(input: {
  endpoint: string;
  operatorWallet: string;
  nonce: string;
}): string {
  return digestHex(
    `${normalizeEndpoint(input.endpoint)}|${input.operatorWallet.toLowerCase()}|${input.nonce}`,
  );
}

export function verifyEndpointProofSet(input: {
  operatorWallet: string;
  endpoints: string[];
  proofs: AgentEndpointOwnershipProof[];
}): { ok: boolean; reason?: string } {
  if (input.endpoints.length !== input.proofs.length) {
    return {
      ok: false,
      reason: "endpoint_proofs length must match endpoints length",
    };
  }

  const proofByEndpoint = new Map(
    input.proofs.map((proof) => [normalizeEndpoint(proof.endpoint), proof]),
  );

  for (const endpoint of input.endpoints) {
    const normalized = normalizeEndpoint(endpoint);
    const proof = proofByEndpoint.get(normalized);
    if (!proof) {
      return {
        ok: false,
        reason: `Missing endpoint proof for ${normalized}`,
      };
    }
    const expected = buildEndpointOwnershipDigest({
      endpoint: normalized,
      operatorWallet: input.operatorWallet,
      nonce: proof.nonce,
    });
    if (proof.digest.toLowerCase() !== expected.toLowerCase()) {
      return {
        ok: false,
        reason: `Invalid endpoint digest for ${normalized}`,
      };
    }
  }

  return { ok: true };
}

