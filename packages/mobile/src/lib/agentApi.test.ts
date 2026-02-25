import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadAgentState, normalizeAgentServerUrl, setAgentServerUrl } from "./agentApi";

function mockResponse(status: number, body: any) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
    clone() {
      return {
        json: jest.fn().mockResolvedValue(body),
      };
    },
  } as any;
}

describe("normalizeAgentServerUrl", () => {
  it("adds protocol when missing", () => {
    expect(normalizeAgentServerUrl("10.0.2.2:3000")).toBe("http://10.0.2.2:3000");
  });

  it("removes trailing slash", () => {
    expect(normalizeAgentServerUrl("http://127.0.0.1:3000/")).toBe("http://127.0.0.1:3000");
  });

  it("returns empty for empty input", () => {
    expect(normalizeAgentServerUrl("   ")).toBe("");
  });
});

describe("loadAgentState fallback", () => {
  const originalFetch = global.fetch;

  afterEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
    global.fetch = originalFetch;
  });

  it("falls back to the default backend when saved server returns 404", async () => {
    await setAgentServerUrl("https://cloak-backend.vercel.app");

    const session = {
      id: "session_1",
      title: "test",
      createdAt: "2026-02-25T00:00:00.000Z",
      updatedAt: "2026-02-25T00:00:00.000Z",
      messages: [],
    };

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.startsWith("https://cloak-backend.vercel.app")) {
        return Promise.resolve(mockResponse(404, { error: "NOT_FOUND" }));
      }
      if (url.startsWith("https://cloak-backend-vert.vercel.app")) {
        return Promise.resolve(mockResponse(200, { session, sessions: [] }));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as any;

    const result = await loadAgentState();
    expect(result.serverUrl).toBe("https://cloak-backend-vert.vercel.app");
    expect((global.fetch as any).mock.calls).toHaveLength(2);
    expect((global.fetch as any).mock.calls[1][0]).toContain(
      "https://cloak-backend-vert.vercel.app/api/agent/chat?",
    );
    expect(await AsyncStorage.getItem("cloak_agent_server_url")).toBe(
      "https://cloak-backend-vert.vercel.app",
    );
  });
});
