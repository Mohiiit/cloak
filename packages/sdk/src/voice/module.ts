import type {
  CloakVoiceModule,
  TranscribeRequest,
  TranscribeResult,
  VoiceModuleConfig,
  VoiceProviderCapabilities,
} from "./types";
import { VoiceError } from "./types";
import { validateAudioDuration } from "./utils";

const DEFAULT_CONFIDENCE_THRESHOLD = 0.3;

export function createVoiceModule(config: VoiceModuleConfig): CloakVoiceModule {
  const threshold = config.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const defaultLang = config.defaultLanguage ?? "en-IN";
  const { adapter } = config;

  return {
    async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
      // Validate audio duration if provided
      validateAudioDuration(req.audio);

      // Apply default language
      const effectiveReq: TranscribeRequest = {
        ...req,
        language: req.language ?? defaultLang,
      };

      const result = await adapter.transcribe(effectiveReq);

      if (result.confidence < threshold) {
        throw new VoiceError(
          "LOW_CONFIDENCE",
          `Confidence ${result.confidence.toFixed(2)} is below threshold ${threshold}`,
        );
      }

      return result;
    },

    capabilities(): VoiceProviderCapabilities {
      return adapter.capabilities();
    },

    config(): VoiceModuleConfig {
      return { ...config, confidenceThreshold: threshold, defaultLanguage: defaultLang };
    },

    dispose(): void {
      adapter.dispose?.();
    },
  };
}
