export { createVoiceModule } from "./module";

export { createSarvamAdapter } from "./sarvam";
export type { SarvamConfig } from "./sarvam";

export { createWhisperAdapter } from "./whisper";
export type { WhisperConfig } from "./whisper";

export {
  VoiceError,
} from "./types";
export type {
  CloakVoiceModule,
  VoiceModuleConfig,
  VoiceProviderAdapter,
  VoiceProviderCapabilities,
  TranscribeRequest,
  TranscribeResult,
  SynthesizeRequest,
  SynthesizeResult,
  AudioBlob,
  AudioCodec,
  VoiceLanguageCode,
  VoiceErrorCode,
} from "./types";

export {
  toBlob,
  base64ToUint8Array,
  uint8ArrayToBase64,
  validateAudioDuration,
  MIN_AUDIO_DURATION_MS,
  MAX_AUDIO_DURATION_MS,
  CODEC_MIME,
  CODEC_EXT,
  BCP47_TO_SARVAM,
  BCP47_TO_WHISPER,
  WHISPER_TO_BCP47,
  sarvamLangToBcp47,
  whisperLangToBcp47,
} from "./utils";
