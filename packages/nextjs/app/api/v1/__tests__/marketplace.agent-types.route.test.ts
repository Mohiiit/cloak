// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearRateLimits } from "~~/lib/marketplace/rate-limit";

vi.mock("../_lib/auth", () => ({
  authenticate: vi.fn().mockResolvedValue({
    wallet_address: "0xabc123",
    api_key_id: "key_1",
  }),
  AuthError: class AuthError extends Error {},
}));

import { GET as agentTypesGET } from "../marketplace/agent-types/route";

describe("marketplace agent types route", () => {
  it("returns supported agent types for marketplace UI", async () => {
    clearRateLimits();
    const req = new NextRequest("http://localhost/api/v1/marketplace/agent-types", {
      method: "GET",
      headers: {
        "X-API-Key": "test-key-1234567890",
      },
    });
    const res = await agentTypesGET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.agent_types)).toBe(true);
    expect(json.agent_types.length).toBeGreaterThanOrEqual(3);
    expect(json.agent_types.some((item: { value: string }) => item.value === "staking_steward")).toBe(
      true,
    );
    expect(json.agent_types.some((item: { value: string }) => item.value === "treasury_dispatcher")).toBe(
      true,
    );
    expect(json.agent_types.some((item: { value: string }) => item.value === "swap_runner")).toBe(
      true,
    );
  });
});
