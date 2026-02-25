import type {
  TranscribeRequest,
  TranscribeResult,
  VoiceLanguageCode,
  VoiceProviderAdapter,
  VoiceProviderCapabilities,
} from "./types";
import { VoiceError } from "./types";
import { BCP47_TO_SARVAM, CODEC_EXT, sarvamLangToBcp47, toBlob } from "./utils";

export interface SarvamConfig {
  apiKey: string;
  model?: "saarika:v2.5" | "saaras:v3";
  baseUrl?: string;
}

const DEFAULT_MODEL = "saaras:v3";
const DEFAULT_BASE_URL = "https://api.sarvam.ai";

const SARVAM_LANGUAGES: VoiceLanguageCode[] = [
  "en-IN", "hi-IN", "bn-IN", "ta-IN", "te-IN",
  "kn-IN", "ml-IN", "mr-IN", "gu-IN", "pa-IN",
  "od-IN", "ur-IN",
];

export function createSarvamAdapter(config: SarvamConfig): VoiceProviderAdapter {
  const { apiKey, model = DEFAULT_MODEL, baseUrl = DEFAULT_BASE_URL } = config;

  if (!apiKey) {
    throw new VoiceError("API_KEY_MISSING", "Sarvam API key is required");
  }

  return {
    name: "sarvam",

    capabilities(): VoiceProviderCapabilities {
      return {
        stt: true,
        tts: false,
        streaming: false,
        supportedLanguages: SARVAM_LANGUAGES,
      };
    },

    async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
      const lang = req.language ?? "en-IN";
      const sarvamLang = BCP47_TO_SARVAM[lang];
      if (!sarvamLang || sarvamLang === "unknown") {
        throw new VoiceError(
          "UNSUPPORTED_LANGUAGE",
          `Sarvam does not support language: ${lang}`,
        );
      }

      const blob = toBlob(req.audio);
      const ext = CODEC_EXT[req.audio.codec] ?? "wav";

      const form = new FormData();
      form.append("file", blob, `audio.${ext}`);
      form.append("language_code", sarvamLang);
      form.append("model", model);
      if (req.context) {
        form.append("prompt", req.context);
      }

      let res: Response;
      try {
        res = await fetch(`${baseUrl}/speech-to-text`, {
          method: "POST",
          headers: { "api-subscription-key": apiKey },
          body: form,
        });
      } catch (err) {
        throw new VoiceError(
          "NETWORK_ERROR",
          `Sarvam request failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (res.status === 429) {
        throw new VoiceError("RATE_LIMITED", "Sarvam API rate limited");
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new VoiceError(
          "TRANSCRIPTION_FAILED",
          `Sarvam API ${res.status}: ${body}`,
        );
      }

      const json = await res.json() as {
        transcript?: string;
        language_code?: string;
        language_probability?: number;
      };

      return {
        transcript: json.transcript ?? "",
        language: sarvamLangToBcp47(json.language_code ?? sarvamLang),
        confidence: json.language_probability ?? 0.9,
        meta: { provider: "sarvam", model, raw: json },
      };
    },
  };
}
