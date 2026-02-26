// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../_lib/push/auth", () => ({
  isDispatchAuthorized: vi.fn(),
}));

vi.mock("../_lib/push/dispatcher", () => ({
  dispatchWardApprovalPushEvents: vi.fn(),
}));

import { isDispatchAuthorized } from "../_lib/push/auth";
import { dispatchWardApprovalPushEvents } from "../_lib/push/dispatcher";

function makeReq(
  url: string,
  opts?: { method?: string; body?: unknown },
): NextRequest {
  const init: RequestInit = {
    method: opts?.method || "POST",
    headers: {
      "Content-Type": "application/json",
    },
  };
  if (opts?.body !== undefined) {
    init.body = JSON.stringify(opts.body);
  }
  return new NextRequest(url, init);
}

describe("POST /api/v1/internal/push/dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isDispatchAuthorized as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (dispatchWardApprovalPushEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: true,
      shadowMode: false,
      dryRun: false,
      claimed: 2,
      sent: 2,
      retried: 0,
      deadLettered: 0,
      skippedNoSubscribers: 0,
      deliveriesSent: 2,
      deliveriesFailed: 0,
      metrics: {},
    });
  });

  it("rejects unauthorized calls", async () => {
    (isDispatchAuthorized as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const { POST } = await import("../internal/push/dispatch/route");
    const res = await POST(
      makeReq("http://localhost/api/v1/internal/push/dispatch", {
        method: "POST",
      }),
    );

    expect(res.status).toBe(401);
    expect(dispatchWardApprovalPushEvents).not.toHaveBeenCalled();
  });

  it("validates max_events payload", async () => {
    const { POST } = await import("../internal/push/dispatch/route");
    const res = await POST(
      makeReq("http://localhost/api/v1/internal/push/dispatch", {
        method: "POST",
        body: { max_events: -1 },
      }),
    );

    expect(res.status).toBe(400);
    expect(dispatchWardApprovalPushEvents).not.toHaveBeenCalled();
  });

  it("dispatches using provided options", async () => {
    const { POST } = await import("../internal/push/dispatch/route");
    const res = await POST(
      makeReq("http://localhost/api/v1/internal/push/dispatch", {
        method: "POST",
        body: { max_events: 42, dry_run: true },
      }),
    );

    expect(res.status).toBe(200);
    expect(dispatchWardApprovalPushEvents).toHaveBeenCalledWith({
      maxEvents: 42,
      dryRun: true,
    });
  });
});

describe("GET /api/v1/internal/push/dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isDispatchAuthorized as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (dispatchWardApprovalPushEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: true,
      shadowMode: false,
      dryRun: false,
      claimed: 0,
      sent: 0,
      retried: 0,
      deadLettered: 0,
      skippedNoSubscribers: 0,
      deliveriesSent: 0,
      deliveriesFailed: 0,
      metrics: {},
    });
  });

  it("runs a default dispatch cycle", async () => {
    const { GET } = await import("../internal/push/dispatch/route");
    const res = await GET(
      makeReq("http://localhost/api/v1/internal/push/dispatch", {
        method: "GET",
      }),
    );

    expect(res.status).toBe(200);
    expect(dispatchWardApprovalPushEvents).toHaveBeenCalledWith();
  });
});

