import type {
  TranscribeRequest,
  TranscribeResult,
  VoiceLanguageCode,
  VoiceProviderAdapter,
  VoiceProviderCapabilities,
} from "./types";
import { VoiceError } from "./types";
import { BCP47_TO_WHISPER, CODEC_EXT, toBlob, whisperLangToBcp47 } from "./utils";

export interface WhisperConfig {
  apiKey: string;
  model?: "whisper-1" | "gpt-4o-transcribe";
  baseUrl?: string;
}

const DEFAULT_MODEL = "whisper-1";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

const WHISPER_LANGUAGES: VoiceLanguageCode[] = [
  "en-IN", "hi-IN", "bn-IN", "ta-IN", "te-IN",
  "kn-IN", "ml-IN", "mr-IN", "gu-IN", "pa-IN",
  "od-IN", "ur-IN",
  "en", "es", "fr", "de", "zh", "ja", "ko", "ar", "pt", "ru",
];

export function createWhisperAdapter(config: WhisperConfig): VoiceProviderAdapter {
  const { apiKey, model = DEFAULT_MODEL, baseUrl = DEFAULT_BASE_URL } = config;

  if (!apiKey) {
    throw new VoiceError("API_KEY_MISSING", "OpenAI API key is required");
  }

  return {
    name: "whisper",

    capabilities(): VoiceProviderCapabilities {
      return {
        stt: true,
        tts: false,
        streaming: false,
        supportedLanguages: WHISPER_LANGUAGES,
      };
    },

    async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
      const lang = req.language ?? "en";
      const whisperLang = BCP47_TO_WHISPER[lang] ?? "";

      const blob = toBlob(req.audio);
      const ext = CODEC_EXT[req.audio.codec] ?? "wav";

      const form = new FormData();
      form.append("file", blob, `audio.${ext}`);
      form.append("model", model);
      form.append("response_format", "verbose_json");
      if (whisperLang) {
        form.append("language", whisperLang);
      }
      if (req.context) {
        form.append("prompt", req.context);
      }

      let res: Response;
      try {
        res = await fetch(`${baseUrl}/audio/transcriptions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        });
      } catch (err) {
        throw new VoiceError(
          "NETWORK_ERROR",
          `Whisper request failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (res.status === 429) {
        throw new VoiceError("RATE_LIMITED", "OpenAI API rate limited");
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new VoiceError(
          "TRANSCRIPTION_FAILED",
          `OpenAI API ${res.status}: ${body}`,
        );
      }

      const json = await res.json() as {
        text?: string;
        language?: string;
        duration?: number;
      };

      const detectedLang = json.language
        ? whisperLangToBcp47(json.language)
        : (lang as VoiceLanguageCode);

      return {
        transcript: json.text ?? "",
        language: detectedLang,
        // Whisper doesn't return confidence scores directly;
        // use 0.95 as a reasonable default for successful transcriptions
        confidence: (json.text ?? "").trim().length > 0 ? 0.95 : 0.0,
        meta: { provider: "whisper", model, raw: json },
      };
    },
  };
}
