import { describe, it, expect, vi } from "vitest";
import { createVoiceModule } from "../module";
import { VoiceError } from "../types";
import type { VoiceProviderAdapter, TranscribeResult } from "../types";

function createMockAdapter(
  overrides: Partial<VoiceProviderAdapter> = {},
): VoiceProviderAdapter {
  return {
    name: "mock",
    capabilities: () => ({
      stt: true,
      tts: false,
      streaming: false,
      supportedLanguages: ["en-IN", "hi-IN"],
    }),
    transcribe: vi.fn().mockResolvedValue({
      transcript: "send 5 STRK to alice",
      language: "en-IN",
      confidence: 0.95,
    } satisfies TranscribeResult),
    ...overrides,
  };
}

describe("createVoiceModule", () => {
  it("transcribes audio through the adapter", async () => {
    const adapter = createMockAdapter();
    const mod = createVoiceModule({ adapter });

    const result = await mod.transcribe({
      audio: { data: new Uint8Array([1, 2, 3]), codec: "wav" },
      language: "en-IN",
    });

    expect(result.transcript).toBe("send 5 STRK to alice");
    expect(result.confidence).toBe(0.95);
    expect(adapter.transcribe).toHaveBeenCalledOnce();
  });

  it("applies default language when none specified", async () => {
    const adapter = createMockAdapter();
    const mod = createVoiceModule({ adapter, defaultLanguage: "hi-IN" });

    await mod.transcribe({
      audio: { data: new Uint8Array([1, 2, 3]), codec: "wav" },
    });

    expect(adapter.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ language: "hi-IN" }),
    );
  });

  it("defaults to en-IN when no language config", async () => {
    const adapter = createMockAdapter();
    const mod = createVoiceModule({ adapter });

    await mod.transcribe({
      audio: { data: new Uint8Array([1, 2, 3]), codec: "wav" },
    });

    expect(adapter.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ language: "en-IN" }),
    );
  });

  it("throws LOW_CONFIDENCE when below threshold", async () => {
    const adapter = createMockAdapter({
      transcribe: vi.fn().mockResolvedValue({
        transcript: "...",
        language: "en-IN",
        confidence: 0.1,
      }),
    });
    const mod = createVoiceModule({ adapter, confidenceThreshold: 0.5 });

    await expect(
      mod.transcribe({
        audio: { data: new Uint8Array([1, 2, 3]), codec: "wav" },
      }),
    ).rejects.toThrow(VoiceError);

    try {
      await mod.transcribe({
        audio: { data: new Uint8Array([1, 2, 3]), codec: "wav" },
      });
    } catch (err) {
      expect(err).toBeInstanceOf(VoiceError);
      expect((err as VoiceError).code).toBe("LOW_CONFIDENCE");
    }
  });

  it("throws AUDIO_TOO_SHORT when duration is below minimum", async () => {
    const adapter = createMockAdapter();
    const mod = createVoiceModule({ adapter });

    await expect(
      mod.transcribe({
        audio: { data: new Uint8Array([1, 2, 3]), codec: "wav", durationMs: 100 },
      }),
    ).rejects.toThrow(VoiceError);
  });

  it("throws AUDIO_TOO_LONG when duration exceeds maximum", async () => {
    const adapter = createMockAdapter();
    const mod = createVoiceModule({ adapter });

    await expect(
      mod.transcribe({
        audio: { data: new Uint8Array([1, 2, 3]), codec: "wav", durationMs: 120_000 },
      }),
    ).rejects.toThrow(VoiceError);
  });

  it("returns capabilities from adapter", () => {
    const adapter = createMockAdapter();
    const mod = createVoiceModule({ adapter });
    const caps = mod.capabilities();
    expect(caps.stt).toBe(true);
    expect(caps.supportedLanguages).toContain("en-IN");
  });

  it("returns config with defaults filled in", () => {
    const adapter = createMockAdapter();
    const mod = createVoiceModule({ adapter });
    const cfg = mod.config();
    expect(cfg.defaultLanguage).toBe("en-IN");
    expect(cfg.confidenceThreshold).toBe(0.3);
  });

  it("calls adapter.dispose on dispose", () => {
    const dispose = vi.fn();
    const adapter = createMockAdapter({ dispose });
    const mod = createVoiceModule({ adapter });
    mod.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("handles adapter without dispose gracefully", () => {
    const adapter = createMockAdapter();
    delete (adapter as Record<string, unknown>).dispose;
    const mod = createVoiceModule({ adapter });
    expect(() => mod.dispose()).not.toThrow();
  });
});
