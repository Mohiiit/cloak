// ── Language codes (BCP-47) ──────────────────────────────────────────
// Sarvam supports Indian languages, Whisper supports global coverage.

export type VoiceLanguageCode =
  // Indian languages (Sarvam + Whisper)
  | "en-IN" | "hi-IN" | "bn-IN" | "ta-IN" | "te-IN"
  | "kn-IN" | "ml-IN" | "mr-IN" | "gu-IN" | "pa-IN"
  | "od-IN" | "ur-IN"
  // Global languages (Whisper)
  | "en" | "es" | "fr" | "de" | "zh" | "ja" | "ko" | "ar" | "pt" | "ru"
  | "unknown";

export type AudioCodec = "wav" | "mp3" | "ogg" | "webm" | "pcm_s16le";

export interface AudioBlob {
  /** RN = base64 string, web = Blob, node = Uint8Array */
  data: Uint8Array | Blob | string;
  codec: AudioCodec;
  sampleRate?: number;   // default 16000
  durationMs?: number;   // optional, for validation
}

// ── Provider adapter ─────────────────────────────────────────────────

export interface VoiceProviderAdapter {
  readonly name: string;
  capabilities(): VoiceProviderCapabilities;
  transcribe(req: TranscribeRequest): Promise<TranscribeResult>;
  /** Optional — for TTS. Not implemented this iteration. */
  synthesize?(req: SynthesizeRequest): Promise<SynthesizeResult>;
  dispose?(): void;
}

export interface VoiceProviderCapabilities {
  stt: boolean;
  tts: boolean;
  streaming: boolean;
  supportedLanguages: VoiceLanguageCode[];
}

// ── STT ──────────────────────────────────────────────────────────────

export interface TranscribeRequest {
  audio: AudioBlob;
  language?: VoiceLanguageCode;  // "unknown" = auto-detect
  context?: string;              // prompt hint for the model
}

export interface TranscribeResult {
  transcript: string;
  language: VoiceLanguageCode;
  confidence: number;            // 0.0–1.0
  meta?: Record<string, unknown>;
}

// ── TTS (interface only — deferred) ──────────────────────────────────

export interface SynthesizeRequest {
  text: string;
  language: VoiceLanguageCode;
  voiceId?: string;
  codec?: AudioCodec;
  speed?: number;                // 0.5–2.0
}

export interface SynthesizeResult {
  audio: AudioBlob;
  durationMs: number;
  meta?: Record<string, unknown>;
}

// ── Module config & interface ────────────────────────────────────────

export interface VoiceModuleConfig {
  adapter: VoiceProviderAdapter;
  defaultLanguage?: VoiceLanguageCode;   // default "en-IN"
  confidenceThreshold?: number;          // default 0.3
}

export interface CloakVoiceModule {
  transcribe(req: TranscribeRequest): Promise<TranscribeResult>;
  capabilities(): VoiceProviderCapabilities;
  config(): VoiceModuleConfig;
  dispose(): void;
}

// ── Errors ───────────────────────────────────────────────────────────

export type VoiceErrorCode =
  | "TRANSCRIPTION_FAILED"
  | "UNSUPPORTED_LANGUAGE"
  | "AUDIO_TOO_SHORT"
  | "AUDIO_TOO_LONG"
  | "LOW_CONFIDENCE"
  | "NETWORK_ERROR"
  | "API_KEY_MISSING"
  | "RATE_LIMITED";

export class VoiceError extends Error {
  readonly code: VoiceErrorCode;

  constructor(code: VoiceErrorCode, message: string) {
    super(message);
    this.name = "VoiceError";
    this.code = code;
  }
}
