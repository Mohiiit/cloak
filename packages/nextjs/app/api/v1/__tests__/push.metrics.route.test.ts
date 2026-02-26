// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../_lib/push/auth", () => ({
  isDispatchAuthorized: vi.fn(),
}));

vi.mock("../_lib/push/metrics", () => ({
  getPushMetricSnapshot: vi.fn(),
}));

import { isDispatchAuthorized } from "../_lib/push/auth";
import { getPushMetricSnapshot } from "../_lib/push/metrics";

describe("GET /api/v1/internal/push/metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isDispatchAuthorized as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (getPushMetricSnapshot as ReturnType<typeof vi.fn>).mockReturnValue({
      dispatch_cycles: 5,
    });
  });

  it("returns metrics for authorized callers", async () => {
    const { GET } = await import("../internal/push/metrics/route");
    const req = new NextRequest("http://localhost/api/v1/internal/push/metrics", {
      method: "GET",
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metrics.dispatch_cycles).toBe(5);
  });

  it("rejects unauthorized callers", async () => {
    (isDispatchAuthorized as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const { GET } = await import("../internal/push/metrics/route");
    const req = new NextRequest("http://localhost/api/v1/internal/push/metrics", {
      method: "GET",
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

