import {
  createVoiceModule,
  createSarvamAdapter,
  createWhisperAdapter,
} from "@cloak-wallet/sdk";
import type { CloakVoiceModule } from "@cloak-wallet/sdk";

/**
 * Create a server-side voice module from environment variables.
 * The `provider` param overrides `VOICE_DEFAULT_PROVIDER` env.
 */
export function getVoiceModule(provider?: string): CloakVoiceModule {
  const p = provider ?? process.env.VOICE_DEFAULT_PROVIDER ?? "sarvam";

  if (p === "sarvam") {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
      throw new Error("SARVAM_API_KEY environment variable is not set");
    }
    return createVoiceModule({
      adapter: createSarvamAdapter({ apiKey }),
    });
  }

  if (p === "whisper") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    return createVoiceModule({
      adapter: createWhisperAdapter({ apiKey }),
    });
  }

  throw new Error(`Unknown voice provider: ${p}`);
}
