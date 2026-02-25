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

export function createEndpointOwnershipProof(input: {
  endpoint: string;
  operatorWallet: string;
  nonce: string;
}) {
  return {
    endpoint: input.endpoint,
    nonce: input.nonce,
    digest: buildEndpointOwnershipDigest(input),
  };
}

