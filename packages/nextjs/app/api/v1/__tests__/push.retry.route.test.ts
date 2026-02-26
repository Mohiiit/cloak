// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../_lib/push/auth", () => ({
  isDispatchAuthorized: vi.fn(),
}));

vi.mock("../_lib/push/dispatcher", () => ({
  retryDeadLetterEvent: vi.fn(),
}));

import { isDispatchAuthorized } from "../_lib/push/auth";
import { retryDeadLetterEvent } from "../_lib/push/dispatcher";

function makeReq(url: string): NextRequest {
  return new NextRequest(url, {
    method: "POST",
  });
}

describe("POST /api/v1/internal/push/retry-dead-letter/:eventId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isDispatchAuthorized as ReturnType<typeof vi.fn>).mockReturnValue(true);
  });

  it("rejects unauthorized calls", async () => {
    (isDispatchAuthorized as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const { POST } = await import(
      "../internal/push/retry-dead-letter/[eventId]/route"
    );

    const res = await POST(makeReq("http://localhost/api/v1/internal/push/retry-dead-letter/evt_1"), {
      params: Promise.resolve({ eventId: "evt_1" }),
    });

    expect(res.status).toBe(401);
    expect(retryDeadLetterEvent).not.toHaveBeenCalled();
  });

  it("returns 404 when event is not found", async () => {
    (retryDeadLetterEvent as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { POST } = await import(
      "../internal/push/retry-dead-letter/[eventId]/route"
    );

    const res = await POST(makeReq("http://localhost/api/v1/internal/push/retry-dead-letter/evt_1"), {
      params: Promise.resolve({ eventId: "evt_1" }),
    });

    expect(res.status).toBe(404);
  });

  it("requeues a dead-letter event", async () => {
    (retryDeadLetterEvent as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "evt_1",
      status: "retry",
    });
    const { POST } = await import(
      "../internal/push/retry-dead-letter/[eventId]/route"
    );

    const res = await POST(makeReq("http://localhost/api/v1/internal/push/retry-dead-letter/evt_1"), {
      params: Promise.resolve({ eventId: "evt_1" }),
    });

    expect(res.status).toBe(200);
    expect(retryDeadLetterEvent).toHaveBeenCalledWith({ eventId: "evt_1" });
  });
});

