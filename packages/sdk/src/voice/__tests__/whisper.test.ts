import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createWhisperAdapter } from "../whisper";
import { VoiceError } from "../types";

describe("createWhisperAdapter", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("throws API_KEY_MISSING when no key provided", () => {
    expect(() => createWhisperAdapter({ apiKey: "" })).toThrow(VoiceError);
  });

  it("returns correct capabilities", () => {
    const adapter = createWhisperAdapter({ apiKey: "test-key" });
    const caps = adapter.capabilities();
    expect(caps.stt).toBe(true);
    expect(caps.tts).toBe(false);
    expect(caps.supportedLanguages).toContain("en");
    expect(caps.supportedLanguages).toContain("hi-IN");
    expect(caps.supportedLanguages).toContain("fr");
  });

  it("sends correct multipart request to OpenAI API", async () => {
    const mockResponse = {
      text: "send 10 STRK to bob",
      language: "en",
      duration: 3.5,
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const adapter = createWhisperAdapter({ apiKey: "sk-test" });
    const result = await adapter.transcribe({
      audio: { data: new Uint8Array([1, 2, 3]), codec: "mp3" },
      language: "en",
    });

    expect(result.transcript).toBe("send 10 STRK to bob");
    expect(result.language).toBe("en");
    expect(result.confidence).toBe(0.95);

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(fetchCall[1].method).toBe("POST");
    expect(fetchCall[1].headers.Authorization).toBe("Bearer sk-test");
    expect(fetchCall[1].body).toBeInstanceOf(FormData);
  });

  it("maps BCP-47 Indian language codes to ISO 639-1", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ text: "test", language: "hi" }), { status: 200 }),
    );

    const adapter = createWhisperAdapter({ apiKey: "sk-test" });
    const result = await adapter.transcribe({
      audio: { data: new Uint8Array([1, 2, 3]), codec: "wav" },
      language: "hi-IN",
    });

    // Verify Hindi language mapped correctly
    expect(result.language).toBe("hi-IN");

    // Verify ISO 639-1 "hi" was sent to API
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = fetchCall[1].body as FormData;
    expect(body.get("language")).toBe("hi");
  });

  it("auto-detects language when 'unknown' specified", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ text: "bonjour", language: "fr" }), { status: 200 }),
    );

    const adapter = createWhisperAdapter({ apiKey: "sk-test" });
    const result = await adapter.transcribe({
      audio: { data: new Uint8Array([1, 2, 3]), codec: "wav" },
      language: "unknown",
    });

    expect(result.language).toBe("fr");

    // Verify no language param sent (auto-detect)
    const body = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as FormData;
    expect(body.get("language")).toBeNull();
  });

  it("uses custom base URL and model", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ text: "test" }), { status: 200 }),
    );

    const adapter = createWhisperAdapter({
      apiKey: "sk-test",
      model: "gpt-4o-transcribe",
      baseUrl: "https://azure.openai.com/v1",
    });
    await adapter.transcribe({
      audio: { data: new Uint8Array([1, 2, 3]), codec: "wav" },
      language: "en",
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe("https://azure.openai.com/v1/audio/transcriptions");
    const body = fetchCall[1].body as FormData;
    expect(body.get("model")).toBe("gpt-4o-transcribe");
  });

  it("returns 0 confidence for empty transcription", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ text: "" }), { status: 200 }),
    );

    const adapter = createWhisperAdapter({ apiKey: "sk-test" });
    const result = await adapter.transcribe({
      audio: { data: new Uint8Array([1, 2, 3]), codec: "wav" },
    });

    expect(result.confidence).toBe(0.0);
  });

  it("throws RATE_LIMITED on 429", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("", { status: 429 }),
    );

    const adapter = createWhisperAdapter({ apiKey: "sk-test" });
    try {
      await adapter.transcribe({
        audio: { data: new Uint8Array([1, 2, 3]), codec: "wav" },
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(VoiceError);
      expect((err as VoiceError).code).toBe("RATE_LIMITED");
    }
  });

  it("throws NETWORK_ERROR on fetch failure", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("connection refused"),
    );

    const adapter = createWhisperAdapter({ apiKey: "sk-test" });
    try {
      await adapter.transcribe({
        audio: { data: new Uint8Array([1, 2, 3]), codec: "wav" },
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(VoiceError);
      expect((err as VoiceError).code).toBe("NETWORK_ERROR");
    }
  });

  it("includes prompt context when provided", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ text: "send STRK" }), { status: 200 }),
    );

    const adapter = createWhisperAdapter({ apiKey: "sk-test" });
    await adapter.transcribe({
      audio: { data: new Uint8Array([1, 2, 3]), codec: "wav" },
      context: "crypto payment commands: send, transfer, withdraw",
    });

    const body = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as FormData;
    expect(body.get("prompt")).toBe("crypto payment commands: send, transfer, withdraw");
  });
});
