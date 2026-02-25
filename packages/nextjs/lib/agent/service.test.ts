import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function resetModulesWithStorePath(storePath: string) {
  process.env.CLOAK_AGENT_STORE_PATH = storePath;
  const servicePath = "~~/lib/agent/service";
  const storePathMod = "~~/lib/agent/session-store";
  // Ensure module constants are rebuilt with the fresh env path.
  await import(storePathMod + "?t=" + Date.now());
  return import(servicePath + "?t=" + Date.now());
}

describe("agent service", () => {
  let tmpStore: string;

  beforeEach(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cloak-agent-test-"));
    tmpStore = path.join(dir, "sessions.json");
  });

  it("creates a session and stores messages", async () => {
    const { handleAgentChat } = await resetModulesWithStorePath(tmpStore);
    const out = await handleAgentChat({
      message: "send 10 strk to mobileMohit private",
      contacts: [{ id: "c1", nickname: "mobileMohit", tongoAddress: "tongo_1" }],
    });

    expect(out.session.id).toBeTruthy();
    expect(out.session.messages.length).toBe(2);
    expect(out.plan.intent.type).toBe("send_private");
    expect(out.plan.readyToExecute).toBe(true);
  });

  it("answers previous sessions query", async () => {
    const { handleAgentChat } = await resetModulesWithStorePath(tmpStore);

    await handleAgentChat({ message: "send 2 strk to bob", contacts: [] });
    const second = await handleAgentChat({ message: "what are my previous sessions", contacts: [] });

    expect(second.plan.intent.type).toBe("history_query");
    // Without walletAddress, the script returns a helpful error about connecting wallet
    expect(second.reply.toLowerCase()).toContain("wallet");
  });

  it("falls back to regex when LLM throws", async () => {
    // Set API key so the LLM path is attempted
    process.env.MINIMAX_API_KEY = "test-fake-key";

    // Mock the LLM module to throw
    vi.doMock("~~/lib/agent/llm", () => ({
      parseIntentWithLLM: vi.fn().mockRejectedValue(new Error("Network error")),
    }));

    // Re-import to pick up the mock
    const { handleAgentChat } = await resetModulesWithStorePath(tmpStore);

    const out = await handleAgentChat({
      message: "send 10 strk to mobileMohit",
      contacts: [{ id: "c1", nickname: "mobileMohit", tongoAddress: "tongo_1" }],
    });

    // Should still produce a valid response via regex fallback
    expect(out.plan.intent.type).toBe("send_private");
    expect(out.plan.intent.amount).toBe("10");
    expect(out.reply).toBeTruthy();
    expect(out.session.messages.length).toBe(2);

    // Cleanup
    delete process.env.MINIMAX_API_KEY;
    vi.doUnmock("~~/lib/agent/llm");
  });
});
