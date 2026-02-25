import { normalizeAgentServerUrl } from "./agentApi";

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
