export const X402_DEFAULTS = {
  version: "1" as const,
  scheme: "cloak-shielded-x402" as const,
  network: process.env.AGENTIC_MARKETPLACE_NETWORK || "sepolia",
  token: process.env.X402_DEFAULT_TOKEN || "STRK",
  minAmount: process.env.X402_DEFAULT_MIN_AMOUNT || "100000000000000000",
  paymentExpirySeconds: Number(process.env.X402_PAYMENT_EXPIRY_SECONDS || 300),
  facilitatorPath: "/api/v1/marketplace/payments/x402",
};

export function getFacilitatorBaseUrl(): string {
  return (
    process.env.X402_FACILITATOR_URL ||
    `http://localhost:3000${X402_DEFAULTS.facilitatorPath}`
  );
}

