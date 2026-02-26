// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { enqueueWardApprovalEvent } from "../_lib/push/outbox";
import type { SupabaseClient } from "../_lib/supabase";

function createMockSb(): SupabaseClient & {
  upsert: ReturnType<typeof vi.fn>;
} {
  return {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    del: vi.fn(),
    upsert: vi.fn().mockResolvedValue([]),
  };
}

describe("enqueueWardApprovalEvent", () => {
  it("creates an outbox row with deterministic keys", async () => {
    const sb = createMockSb();
    await enqueueWardApprovalEvent({
      sb,
      eventType: "ward_approval.created",
      row: {
        id: "wa_1",
        ward_address: "0xAAA",
        guardian_address: "0xBBB",
        action: "transfer",
        token: "STRK",
        status: "pending_ward_sig",
        event_version: 7,
      },
    });

    expect(sb.upsert).toHaveBeenCalledWith(
      "ward_approval_events_outbox",
      expect.objectContaining({
        approval_id: "wa_1",
        event_type: "ward_approval.created",
        event_version: 7,
        status: "pending",
        target_wallets: ["0xaaa", "0xbbb"],
      }),
      "approval_id,event_version,event_type",
    );
  });
});

