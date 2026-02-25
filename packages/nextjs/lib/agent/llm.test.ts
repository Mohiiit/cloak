import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Vercel AI SDK before importing the module under test
const mockGenerateObject = vi.fn();
vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("vercel-minimax-ai-provider", () => ({
  minimax: (model: string) => `mock-minimax-${model}`,
}));

import { parseIntentWithLLM } from "~~/lib/agent/llm";
import type { AgentContact, AgentMessage, AgentWard } from "~~/lib/agent/types";

function objectResponse(obj: Record<string, unknown>) {
  return { object: obj };
}

describe("parseIntentWithLLM", () => {
  const contacts: AgentContact[] = [
    { id: "c1", nickname: "alice", tongoAddress: "tongo_alice_123", starknetAddress: "0xAlice" },
  ];
  const wards: AgentWard[] = [{ address: "0xWard1", pseudoName: "myWard" }];
  const emptyHistory: AgentMessage[] = [];

  beforeEach(() => {
    process.env.MINIMAX_API_KEY = "sk-ant-test-key";
    mockGenerateObject.mockReset();
  });

  afterEach(() => {
    delete process.env.MINIMAX_API_KEY;
  });

  it("parses a send_private intent", async () => {
    mockGenerateObject.mockResolvedValue(
      objectResponse({
        intent_type: "send_private",
        amount: "10",
        token: "STRK",
        recipient_name: "alice",
        recipient_type: "contact",
        recipient_tongo_address: "tongo_alice_123",
        confidence: 0.95,
        reason: "User wants to send 10 STRK to alice privately",
        reply: "Ready to send 10 STRK to alice privately.",
      }),
    );

    const result = await parseIntentWithLLM("send 10 strk to alice", contacts, wards, emptyHistory);

    expect(result.intent.type).toBe("send_private");
    expect(result.intent.amount).toBe("10");
    expect(result.intent.token).toBe("STRK");
    expect(result.intent.recipientName).toBe("alice");
    expect(result.intent.recipientType).toBe("contact");
    expect(result.intent.recipientTongoAddress).toBe("tongo_alice_123");
    expect(result.intent.confidence).toBe(0.95);
    expect(result.intent.rawText).toBe("send 10 strk to alice");
    expect(result.reply).toBe("Ready to send 10 STRK to alice privately.");
  });

  it("parses a send_public with ward", async () => {
    mockGenerateObject.mockResolvedValue(
      objectResponse({
        intent_type: "send_public",
        amount: "5",
        token: "ETH",
        recipient_name: "myWard",
        recipient_type: "ward",
        recipient_starknet_address: "0xWard1",
        confidence: 0.9,
        reason: "Sending to ward account publicly",
        reply: "Ready to send 5 ETH to myWard publicly.",
      }),
    );

    const result = await parseIntentWithLLM("send 5 eth to myWard public", contacts, wards, emptyHistory);

    expect(result.intent.type).toBe("send_public");
    expect(result.intent.recipientType).toBe("ward");
    expect(result.intent.recipientStarknetAddress).toBe("0xWard1");
    expect(result.reply).toContain("myWard");
  });

  it("parses a history query", async () => {
    mockGenerateObject.mockResolvedValue(
      objectResponse({
        intent_type: "history_query",
        confidence: 0.95,
        reason: "User asked about previous sessions",
        reply: "Let me show you your recent sessions.",
      }),
    );

    const result = await parseIntentWithLLM("show my previous sessions", contacts, wards, emptyHistory);

    expect(result.intent.type).toBe("history_query");
    expect(result.intent.amount).toBeUndefined();
    expect(result.intent.recipientName).toBeUndefined();
  });

  it("passes recent messages as conversation history", async () => {
    const history: AgentMessage[] = [
      { id: "m1", role: "user", text: "send 10 strk to alice", createdAt: "" },
      { id: "m2", role: "assistant", text: "Ready to send 10 STRK to alice.", createdAt: "" },
    ];

    mockGenerateObject.mockResolvedValue(
      objectResponse({
        intent_type: "send_private",
        amount: "20",
        token: "STRK",
        recipient_name: "alice",
        recipient_type: "contact",
        recipient_tongo_address: "tongo_alice_123",
        confidence: 0.9,
        reason: "User updated amount from 10 to 20",
        reply: "Updated to 20 STRK to alice.",
      }),
    );

    await parseIntentWithLLM("make it 20 instead", contacts, wards, history);

    // Verify that history was passed in the generateObject call
    const callArgs = mockGenerateObject.mock.calls[0][0];
    expect(callArgs.messages).toHaveLength(3); // 2 history + 1 current
    expect(callArgs.messages[0].content).toBe("send 10 strk to alice");
    expect(callArgs.messages[1].content).toBe("Ready to send 10 STRK to alice.");
    expect(callArgs.messages[2].content).toBe("make it 20 instead");
  });

  it("throws on timeout", async () => {
    // Simulate AbortSignal.timeout by checking the signal passed to generateObject
    mockGenerateObject.mockImplementation(({ abortSignal }: { abortSignal: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        abortSignal.addEventListener("abort", () => {
          reject(abortSignal.reason ?? new DOMException("Aborted", "AbortError"));
        });
      });
    });

    await expect(
      parseIntentWithLLM("send 10 strk", contacts, wards, emptyHistory),
    ).rejects.toThrow();
  }, 30_000);

  it("throws on generateObject failure", async () => {
    mockGenerateObject.mockRejectedValue(new Error("Model returned invalid JSON"));

    await expect(
      parseIntentWithLLM("send 10 strk", contacts, wards, emptyHistory),
    ).rejects.toThrow("Model returned invalid JSON");
  });

  it("applies defaults for partial fields", async () => {
    mockGenerateObject.mockResolvedValue(
      objectResponse({
        intent_type: "send_private",
        confidence: 0.5,
        reason: "Partial parse",
        reply: "What token and amount?",
      }),
    );

    const result = await parseIntentWithLLM("send some crypto", contacts, wards, emptyHistory);

    expect(result.intent.type).toBe("send_private");
    expect(result.intent.token).toBe("STRK"); // Default applied
    expect(result.intent.confidence).toBe(0.5);
    expect(result.intent.amount).toBeUndefined();
  });

  it("throws when no API key is set", async () => {
    delete process.env.MINIMAX_API_KEY;

    await expect(
      parseIntentWithLLM("send 10 strk", contacts, wards, emptyHistory),
    ).rejects.toThrow("MINIMAX_API_KEY not configured");
  });
});
