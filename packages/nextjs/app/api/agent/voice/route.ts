import { handleAgentChat } from "~~/lib/agent/service";
import { getVoiceModule } from "~~/lib/agent/voice";
import type { AgentChatResponse, AgentContact, AgentWard } from "~~/lib/agent/types";
import type { VoiceLanguageCode, AudioCodec } from "@cloak-wallet/sdk";

export const runtime = "nodejs";

/** Maximum audio file size: 25 MB */
const MAX_AUDIO_SIZE = 25 * 1024 * 1024;

const VALID_CODECS = new Set(["wav", "mp3", "ogg", "webm", "pcm_s16le"]);

function inferCodec(file: File): AudioCodec {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && VALID_CODECS.has(ext)) return ext as AudioCodec;

  const mime = file.type.toLowerCase();
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("webm")) return "webm";

  return "wav"; // safe default
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    // ── Extract audio file ──
    const audioFile = formData.get("audio");
    if (!audioFile || !(audioFile instanceof File)) {
      return Response.json(
        { error: "Missing 'audio' file in form data" },
        { status: 400 },
      );
    }

    if (audioFile.size > MAX_AUDIO_SIZE) {
      return Response.json(
        { error: `Audio file too large (${(audioFile.size / 1024 / 1024).toFixed(1)} MB). Max is 25 MB.` },
        { status: 400 },
      );
    }

    // ── Extract metadata ──
    const language = (formData.get("language") as string) || "en-IN";
    const provider = (formData.get("provider") as string) || undefined;
    const sessionId = (formData.get("sessionId") as string) || undefined;
    const walletAddress = (formData.get("walletAddress") as string) || undefined;

    let contacts: AgentContact[] = [];
    let wards: AgentWard[] = [];
    try {
      const contactsStr = formData.get("contacts") as string;
      if (contactsStr) contacts = JSON.parse(contactsStr);
    } catch { /* ignore malformed contacts */ }
    try {
      const wardsStr = formData.get("wards") as string;
      if (wardsStr) wards = JSON.parse(wardsStr);
    } catch { /* ignore malformed wards */ }

    // ── Transcribe audio ──
    const voiceModule = getVoiceModule(provider);
    const audioBytes = new Uint8Array(await audioFile.arrayBuffer());
    const codec = inferCodec(audioFile);

    const transcription = await voiceModule.transcribe({
      audio: { data: audioBytes, codec },
      language: language as VoiceLanguageCode,
      context: "crypto payment commands: send, transfer, withdraw, shield, unshield, swap, check balance",
    });

    voiceModule.dispose();

    if (!transcription.transcript.trim()) {
      return Response.json(
        { error: "Could not transcribe audio — no speech detected" },
        { status: 422 },
      );
    }

    // ── Feed transcript into existing agent pipeline ──
    const chatResult = await handleAgentChat({
      message: transcription.transcript,
      sessionId,
      walletAddress,
      contacts,
      wards,
      source: "voice",
      sourceLanguage: transcription.language,
    });

    const providerName = voiceModule.config().adapter.name;

    const response: AgentChatResponse = {
      ...chatResult,
      voiceMeta: {
        transcript: transcription.transcript,
        confidence: transcription.confidence,
        language: transcription.language,
        provider: providerName,
      },
    };

    return Response.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Voice processing failed";
    const status =
      message.includes("API key") || message.includes("not set") ? 503 :
      message.includes("rate limit") ? 429 :
      500;

    return Response.json({ error: message }, { status });
  }
}
