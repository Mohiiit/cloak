import { handleAgentChat } from "~~/lib/agent/service";
import { extractVoiceUsageMetrics } from "~~/lib/agent/voice-metrics";
import { getVoiceModule } from "~~/lib/agent/voice";
import type { AgentChatResponse, AgentContact, AgentWard, VoiceMetrics } from "~~/lib/agent/types";
import type { VoiceLanguageCode, AudioCodec } from "@cloak-wallet/sdk";

export const runtime = "nodejs";

/** Maximum audio file size: 25 MB */
const MAX_AUDIO_SIZE = 25 * 1024 * 1024;

const VALID_CODECS = new Set(["wav", "mp3", "ogg", "webm", "pcm_s16le"]);

function normalizeCodec(value?: string | null): AudioCodec | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!VALID_CODECS.has(normalized)) return undefined;
  return normalized as AudioCodec;
}

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

function inferCodecFromMimeType(mime: string): AudioCodec | undefined {
  const m = mime.toLowerCase();
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("webm")) return "webm";
  return undefined;
}

function parseRecordingDurationMs(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed);
}

export async function POST(req: Request) {
  const reqStartedAt = Date.now();
  try {
    const formData = await req.formData();

    // ── Extract audio payload ──
    const audioFile = formData.get("audio");
    const audioBase64Raw = formData.get("audioBase64");
    const codecOverride = normalizeCodec(formData.get("codec") as string | null);
    let audioBytes: Uint8Array | null = null;
    let codec: AudioCodec = codecOverride || "wav";

    if (audioFile instanceof File) {
      if (audioFile.size > MAX_AUDIO_SIZE) {
        return Response.json(
          { error: `Audio file too large (${(audioFile.size / 1024 / 1024).toFixed(1)} MB). Max is 25 MB.` },
          { status: 400 },
        );
      }
      audioBytes = new Uint8Array(await audioFile.arrayBuffer());
      codec = codecOverride || inferCodec(audioFile);
    } else if (typeof audioBase64Raw === "string" && audioBase64Raw.trim()) {
      let audioBase64 = audioBase64Raw.trim();
      const dataUrlMatch = audioBase64.match(/^data:([^;]+);base64,(.+)$/i);
      if (dataUrlMatch) {
        audioBase64 = dataUrlMatch[2];
        codec = codecOverride || inferCodecFromMimeType(dataUrlMatch[1]) || "wav";
      }

      const decoded = Buffer.from(audioBase64, "base64");
      if (decoded.byteLength > MAX_AUDIO_SIZE) {
        return Response.json(
          { error: `Audio file too large (${(decoded.byteLength / 1024 / 1024).toFixed(1)} MB). Max is 25 MB.` },
          { status: 400 },
        );
      }
      audioBytes = new Uint8Array(decoded);
    } else {
      return Response.json(
        { error: "Missing audio payload. Provide 'audio' file or 'audioBase64'." },
        { status: 400 },
      );
    }

    if (!audioBytes || audioBytes.byteLength === 0) {
      return Response.json(
        { error: "Empty audio payload. Please record and try again." },
        { status: 400 },
      );
    }

    // WAV header is 44 bytes; if payload is only header there is no audio body.
    if (codec === "wav" && audioBytes.byteLength <= 44) {
      return Response.json(
        { error: "Recorded audio is empty. Hold the mic button a little longer and retry." },
        { status: 400 },
      );
    }

    // ── Extract metadata ──
    const language = (formData.get("language") as string) || "en-IN";
    const provider = (formData.get("provider") as string) || undefined;
    const sessionId = (formData.get("sessionId") as string) || undefined;
    const walletAddress = (formData.get("walletAddress") as string) || undefined;
    const clientId = (formData.get("clientId") as string) || undefined;
    const recordingDurationMs = parseRecordingDurationMs(formData.get("recordingDurationMs"));
    const parseRequestMs = Date.now() - reqStartedAt;

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
    let transcription;
    const providerName = voiceModule.config().adapter.name;
    const transcribeStartedAt = Date.now();
    try {
      transcription = await voiceModule.transcribe({
        audio: { data: audioBytes, codec },
        language: language as VoiceLanguageCode,
        context: "crypto payment commands: send, transfer, withdraw, shield, unshield, swap, check balance",
      });
    } finally {
      voiceModule.dispose();
    }
    const transcribeMs = Date.now() - transcribeStartedAt;

    if (!transcription.transcript.trim()) {
      return Response.json(
        { error: "Could not transcribe audio — no speech detected" },
        { status: 422 },
      );
    }

    // ── Feed transcript into existing agent pipeline ──
    const agentStartedAt = Date.now();
    const chatResult = await handleAgentChat({
      message: transcription.transcript,
      sessionId,
      walletAddress,
      clientId,
      contacts,
      wards,
      source: "voice",
      sourceLanguage: transcription.language,
    });
    const agentMs = Date.now() - agentStartedAt;
    const totalMs = Date.now() - reqStartedAt;

    const usage = extractVoiceUsageMetrics(transcription.meta);
    const model = typeof transcription.meta?.model === "string" ? transcription.meta.model : undefined;
    const metrics: VoiceMetrics = {
      audioBytes: audioBytes.byteLength,
      codec,
      recordingDurationMs,
      transcriptChars: transcription.transcript.length,
      timings: {
        parseRequestMs,
        transcribeMs,
        agentMs,
        totalMs,
      },
      usage,
    };

    console.info(
      "[agent.voice.metrics]",
      JSON.stringify({
        provider: providerName,
        model: model ?? null,
        sessionId: sessionId ?? null,
        hasWalletAddress: Boolean(walletAddress),
        hasClientId: Boolean(clientId),
        audioBytes: metrics.audioBytes,
        codec: metrics.codec,
        recordingDurationMs: metrics.recordingDurationMs ?? null,
        transcriptChars: metrics.transcriptChars,
        confidence: transcription.confidence,
        language: transcription.language,
        timings: metrics.timings,
        usage: metrics.usage ?? null,
      }),
    );

    const response: AgentChatResponse = {
      ...chatResult,
      voiceMeta: {
        transcript: transcription.transcript,
        confidence: transcription.confidence,
        language: transcription.language,
        provider: providerName,
        model,
        metrics,
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
