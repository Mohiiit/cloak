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

  it("keeps sessions scoped per wallet", async () => {
    const { handleAgentChat, loadAgentState } = await resetModulesWithStorePath(tmpStore);

    await handleAgentChat({
      message: "send 2 strk to alice",
      walletAddress: "0xaaa",
      contacts: [],
    });
    await handleAgentChat({
      message: "send 3 strk to bob",
      walletAddress: "0xbbb",
      contacts: [],
    });

    const stateA = await loadAgentState(undefined, { walletAddress: "0xaaa" });
    const stateB = await loadAgentState(undefined, { walletAddress: "0xbbb" });

    expect(stateA.session.id).toBeTruthy();
    expect(stateB.session.id).toBeTruthy();
    expect(stateA.session.id).not.toBe(stateB.session.id);

    const aUserMessages = stateA.session.messages.filter((m: { role: string }) => m.role === "user");
    const bUserMessages = stateB.session.messages.filter((m: { role: string }) => m.role === "user");
    expect(aUserMessages[aUserMessages.length - 1]?.text.toLowerCase()).toContain("alice");
    expect(bUserMessages[bUserMessages.length - 1]?.text.toLowerCase()).toContain("bob");
  });

  it("keeps sessions isolated per client for the same wallet", async () => {
    const { handleAgentChat, loadAgentState } = await resetModulesWithStorePath(tmpStore);

    await handleAgentChat({
      message: "hello from ios",
      walletAddress: "0xabc",
      clientId: "ios_device",
      contacts: [],
    });
    await handleAgentChat({
      message: "hello from android",
      walletAddress: "0xabc",
      clientId: "android_device",
      contacts: [],
    });

    const iosState = await loadAgentState(undefined, {
      walletAddress: "0xabc",
      clientId: "ios_device",
    });
    const androidState = await loadAgentState(undefined, {
      walletAddress: "0xabc",
      clientId: "android_device",
    });

    expect(iosState.session.id).not.toBe(androidState.session.id);
    const iosLast = iosState.session.messages
      .filter((m: { role: string }) => m.role === "user")
      .slice(-1)[0]?.text.toLowerCase();
    const androidLast = androidState.session.messages
      .filter((m: { role: string }) => m.role === "user")
      .slice(-1)[0]?.text.toLowerCase();
    expect(iosLast).toContain("ios");
    expect(androidLast).toContain("android");
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

  it("starts a fresh session with assistant-first message", async () => {
    const { handleAgentChat } = await resetModulesWithStorePath(tmpStore);
    const out = await handleAgentChat({
      message: "start new session",
      contacts: [],
    });

    expect(out.session.messages.length).toBe(1);
    expect(out.session.messages[0].role).toBe("assistant");
    expect(out.session.messages[0].text.toLowerCase()).toContain("started");
    expect(out.plan.intent.type).toBe("start_session");
  });
});
