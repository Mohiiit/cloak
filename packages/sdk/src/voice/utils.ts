import type { AudioBlob, VoiceLanguageCode } from "./types";
import { VoiceError } from "./types";

/** Minimum audio duration in milliseconds (0.5s) */
export const MIN_AUDIO_DURATION_MS = 500;

/** Maximum audio duration in milliseconds (60s) */
export const MAX_AUDIO_DURATION_MS = 60_000;

/** MIME types by codec */
export const CODEC_MIME: Record<string, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  webm: "audio/webm",
  pcm_s16le: "audio/pcm",
};

/** File extensions by codec */
export const CODEC_EXT: Record<string, string> = {
  wav: "wav",
  mp3: "mp3",
  ogg: "ogg",
  webm: "webm",
  pcm_s16le: "pcm",
};

/**
 * Convert an AudioBlob.data to a Blob suitable for FormData.
 * Handles base64 strings (React Native), Uint8Array (Node), and Blob (Web).
 */
export function toBlob(audio: AudioBlob): Blob {
  const mime = CODEC_MIME[audio.codec] ?? "application/octet-stream";
  const { data } = audio;

  if (data instanceof Blob) return data;

  if (typeof data === "string") {
    // base64 string → Uint8Array → Blob
    const raw = base64ToUint8Array(data);
    return new Blob([raw.buffer as ArrayBuffer], { type: mime });
  }

  // Uint8Array
  return new Blob([data.buffer as ArrayBuffer], { type: mime });
}

/** Decode a base64-encoded string to Uint8Array */
export function base64ToUint8Array(b64: string): Uint8Array {
  // Works in both Node (Buffer) and browser (atob)
  if (typeof globalThis !== "undefined" && (globalThis as Record<string, unknown>).Buffer) {
    const NodeBuffer = (globalThis as Record<string, unknown>).Buffer as {
      from(s: string, enc: string): { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
    };
    const buf = NodeBuffer.from(b64, "base64");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

/** Encode Uint8Array to base64 string */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof globalThis !== "undefined" && (globalThis as Record<string, unknown>).Buffer) {
    const NodeBuffer = (globalThis as Record<string, unknown>).Buffer as {
      from(arr: Uint8Array): { toString(enc: string): string };
    };
    return NodeBuffer.from(bytes).toString("base64");
  }
  let bin = "";
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin);
}

/** Validate audio duration constraints if durationMs is provided. */
export function validateAudioDuration(audio: AudioBlob): void {
  if (audio.durationMs === undefined) return;

  if (audio.durationMs < MIN_AUDIO_DURATION_MS) {
    throw new VoiceError(
      "AUDIO_TOO_SHORT",
      `Audio is ${audio.durationMs}ms — minimum is ${MIN_AUDIO_DURATION_MS}ms`,
    );
  }
  if (audio.durationMs > MAX_AUDIO_DURATION_MS) {
    throw new VoiceError(
      "AUDIO_TOO_LONG",
      `Audio is ${audio.durationMs}ms — maximum is ${MAX_AUDIO_DURATION_MS}ms`,
    );
  }
}

// ── Language code mapping ────────────────────────────────────────────

/** Map BCP-47 codes to Sarvam's language_code parameter */
export const BCP47_TO_SARVAM: Record<string, string> = {
  "en-IN": "en-IN",
  "hi-IN": "hi-IN",
  "bn-IN": "bn-IN",
  "ta-IN": "ta-IN",
  "te-IN": "te-IN",
  "kn-IN": "kn-IN",
  "ml-IN": "ml-IN",
  "mr-IN": "mr-IN",
  "gu-IN": "gu-IN",
  "pa-IN": "pa-IN",
  "od-IN": "od-IN",
  "ur-IN": "ur-IN",
  // Fallback: map generic English to Indian English for Sarvam
  "en": "en-IN",
  "unknown": "unknown",
};

/** Map BCP-47 codes to Whisper's ISO 639-1 language param */
export const BCP47_TO_WHISPER: Record<string, string> = {
  "en-IN": "en",
  "hi-IN": "hi",
  "bn-IN": "bn",
  "ta-IN": "ta",
  "te-IN": "te",
  "kn-IN": "kn",
  "ml-IN": "ml",
  "mr-IN": "mr",
  "gu-IN": "gu",
  "pa-IN": "pa",
  "od-IN": "or",  // Odia → ISO 639-1 "or"
  "ur-IN": "ur",
  "en": "en",
  "es": "es",
  "fr": "fr",
  "de": "de",
  "zh": "zh",
  "ja": "ja",
  "ko": "ko",
  "ar": "ar",
  "pt": "pt",
  "ru": "ru",
  "unknown": "",  // empty = auto-detect
};

/** Map Whisper ISO 639-1 back to our VoiceLanguageCode */
export const WHISPER_TO_BCP47: Record<string, VoiceLanguageCode> = {
  en: "en",
  hi: "hi-IN",
  bn: "bn-IN",
  ta: "ta-IN",
  te: "te-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  mr: "mr-IN",
  gu: "gu-IN",
  pa: "pa-IN",
  or: "od-IN",
  ur: "ur-IN",
  es: "es",
  fr: "fr",
  de: "de",
  zh: "zh",
  ja: "ja",
  ko: "ko",
  ar: "ar",
  pt: "pt",
  ru: "ru",
};

/** Map Sarvam response language_code back to our BCP-47 */
export function sarvamLangToBcp47(sarvamLang: string): VoiceLanguageCode {
  // Sarvam returns the same BCP-47 codes we send
  if (BCP47_TO_SARVAM[sarvamLang]) return sarvamLang as VoiceLanguageCode;
  return "unknown";
}

/** Map Whisper ISO 639-1 response language back to our BCP-47 */
export function whisperLangToBcp47(whisperLang: string): VoiceLanguageCode {
  return WHISPER_TO_BCP47[whisperLang] ?? "unknown";
}
