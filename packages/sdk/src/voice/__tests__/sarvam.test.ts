import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSarvamAdapter } from "../sarvam";
import { VoiceError } from "../types";

describe("createSarvamAdapter", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("throws API_KEY_MISSING when no key provided", () => {
    expect(() => createSarvamAdapter({ apiKey: "" })).toThrow(VoiceError);
  });

  it("returns correct capabilities", () => {
    const adapter = createSarvamAdapter({ apiKey: "test-key" });
    const caps = adapter.capabilities();
    expect(caps.stt).toBe(true);
    expect(caps.tts).toBe(false);
    expect(caps.supportedLanguages).toContain("hi-IN");
    expect(caps.supportedLanguages.length).toBe(12);
  });

  it("sends correct multipart request to Sarvam API", async () => {
    const mockResponse = {
      transcript: "send 5 STRK to alice",
      language_code: "en-IN",
      language_probability: 0.97,
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const adapter = createSarvamAdapter({ apiKey: "test-key" });
    const result = await adapter.transcribe({
      audio: { data: new Uint8Array([1, 2, 3]), codec: "wav" },
      language: "en-IN",
    });

    expect(result.transcript).toBe("send 5 STRK to alice");
    expect(result.language).toBe("en-IN");
    expect(result.confidence).toBe(0.97);

    // Verify fetch was called correctly
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe("https://api.sarvam.ai/speech-to-text");
    expect(fetchCall[1].method).toBe("POST");
    expect(fetchCall[1].headers["api-subscription-key"]).toBe("test-key");
    expect(fetchCall[1].body).toBeInstanceOf(FormData);
  });

  it("uses custom base URL", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ transcript: "test" }), { status: 200 }),
    );

    const adapter = createSarvamAdapter({
      apiKey: "test-key",
      baseUrl: "https://custom.api.com",
    });
    await adapter.transcribe({
      audio: { data: new Uint8Array([1, 2, 3]), codec: "wav" },
      language: "en-IN",
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe("https://custom.api.com/speech-to-text");
  });

  it("throws UNSUPPORTED_LANGUAGE for non-Indian languages", async () => {
    const adapter = createSarvamAdapter({ apiKey: "test-key" });
    await expect(
      adapter.transcribe({
        audio: { data: new Uint8Array([1, 2, 3]), codec: "wav" },
        language: "fr",
      }),
    ).rejects.toThrow(VoiceError);
  });

  it("throws RATE_LIMITED on 429 response", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("", { status: 429 }),
    );

    const adapter = createSarvamAdapter({ apiKey: "test-key" });
    await expect(
      adapter.transcribe({
        audio: { data: new Uint8Array([1, 2, 3]), codec: "wav" },
        language: "en-IN",
      }),
    ).rejects.toThrow(VoiceError);
  });

  it("throws TRANSCRIPTION_FAILED on non-200 response", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("Internal error", { status: 500 }),
    );

    const adapter = createSarvamAdapter({ apiKey: "test-key" });
    try {
      await adapter.transcribe({
        audio: { data: new Uint8Array([1, 2, 3]), codec: "wav" },
        language: "en-IN",
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(VoiceError);
      expect((err as VoiceError).code).toBe("TRANSCRIPTION_FAILED");
    }
  });

  it("throws NETWORK_ERROR on fetch failure", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("DNS resolution failed"),
    );

    const adapter = createSarvamAdapter({ apiKey: "test-key" });
    try {
      await adapter.transcribe({
        audio: { data: new Uint8Array([1, 2, 3]), codec: "wav" },
        language: "en-IN",
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(VoiceError);
      expect((err as VoiceError).code).toBe("NETWORK_ERROR");
    }
  });

  it("handles base64 audio data", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ transcript: "hello" }), { status: 200 }),
    );

    const adapter = createSarvamAdapter({ apiKey: "test-key" });
    const result = await adapter.transcribe({
      audio: { data: "AQID", codec: "wav" },  // base64 for [1, 2, 3]
      language: "hi-IN",
    });

    expect(result.transcript).toBe("hello");
  });
});
