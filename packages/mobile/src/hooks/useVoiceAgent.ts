import { useCallback, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAudioRecorder } from "./useAudioRecorder";
import { getAgentServerUrl, type AgentChatResponse, type AgentContactInput, type AgentWardInput } from "../lib/agentApi";
import type { VoiceLanguageCode } from "@cloak-wallet/sdk";

const VOICE_LANGUAGE_KEY = "cloak_voice_language";
const VOICE_PROVIDER_KEY = "cloak_voice_provider";

export interface UseVoiceAgentReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  durationMs: number;
  transcript: string | null;
  startRecording(): Promise<boolean>;
  stopAndTranscribe(params: VoiceAgentParams): Promise<(AgentChatResponse & { serverUrl: string }) | null>;
  cancel(): void;
  language: VoiceLanguageCode;
  setLanguage(lang: VoiceLanguageCode): void;
  provider: string;
  setProvider(p: string): void;
}

interface VoiceAgentParams {
  sessionId?: string;
  walletAddress?: string;
  contacts: AgentContactInput[];
  wards?: AgentWardInput[];
}

function normalizeProvider(value?: string | null): string {
  if (!value) return "auto";
  const normalized = value.trim().toLowerCase();
  if (normalized === "sarvam" || normalized === "whisper" || normalized === "auto") return normalized;
  return "auto";
}

export function useVoiceAgent(): UseVoiceAgentReturn {
  const recorder = useAudioRecorder();
  const {
    isRecording,
    durationMs,
    startRecording,
    stopRecording,
    cancel: cancelRecording,
  } = recorder;
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [language, setLanguageState] = useState<VoiceLanguageCode>("en-IN");
  const [provider, setProviderState] = useState("auto");
  const abortRef = useRef<AbortController | null>(null);

  // Load persisted preferences on first render
  const loadedRef = useRef(false);
  if (!loadedRef.current) {
    loadedRef.current = true;
    AsyncStorage.getItem(VOICE_LANGUAGE_KEY).then((v) => {
      if (v) setLanguageState(v as VoiceLanguageCode);
    });
    AsyncStorage.getItem(VOICE_PROVIDER_KEY).then((v) => {
      if (v) setProviderState(normalizeProvider(v));
    });
  }

  const setLanguage = useCallback((lang: VoiceLanguageCode) => {
    setLanguageState(lang);
    AsyncStorage.setItem(VOICE_LANGUAGE_KEY, lang);
  }, []);

  const setProvider = useCallback((p: string) => {
    const normalized = normalizeProvider(p);
    setProviderState(normalized);
    AsyncStorage.setItem(VOICE_PROVIDER_KEY, normalized);
  }, []);

  const stopAndTranscribe = useCallback(
    async (params: VoiceAgentParams): Promise<(AgentChatResponse & { serverUrl: string }) | null> => {
      const result = await stopRecording();
      if (!result) return null;

      setIsTranscribing(true);
      setTranscript(null);
      abortRef.current = new AbortController();

      try {
        const serverUrl = await getAgentServerUrl();

        // Build multipart form data
        const formData = new FormData();

        // Convert base64 wav to a blob-like object for RN FormData
        formData.append("audio", {
          uri: `data:audio/wav;base64,${result.base64}`,
          type: "audio/wav",
          name: "recording.wav",
        } as any);

        formData.append("language", language);
        if (provider !== "auto") formData.append("provider", provider);
        if (params.sessionId) formData.append("sessionId", params.sessionId);
        if (params.walletAddress) formData.append("walletAddress", params.walletAddress);
        if (params.contacts.length > 0) formData.append("contacts", JSON.stringify(params.contacts));
        if (params.wards && params.wards.length > 0) formData.append("wards", JSON.stringify(params.wards));

        const res = await fetch(`${serverUrl}/api/agent/voice`, {
          method: "POST",
          body: formData,
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: `Voice request failed (${res.status})` }));
          throw new Error(body?.error || `Voice request failed (${res.status})`);
        }

        const json = await res.json();
        const t = json.voiceMeta?.transcript ?? "";
        setTranscript(t);

        return { ...json, serverUrl };
      } finally {
        setIsTranscribing(false);
        abortRef.current = null;
      }
    },
    [language, provider, stopRecording],
  );

  const cancel = useCallback(() => {
    cancelRecording();
    abortRef.current?.abort();
    setIsTranscribing(false);
    setTranscript(null);
  }, [cancelRecording]);

  return {
    isRecording,
    isTranscribing,
    durationMs,
    transcript,
    startRecording,
    stopAndTranscribe,
    cancel,
    language,
    setLanguage,
    provider,
    setProvider,
  };
}
