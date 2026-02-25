"use client";

import { useCallback, useRef, useState } from "react";
import { useAudioRecorder } from "./useAudioRecorder";
import type { VoiceLanguageCode } from "@cloak-wallet/sdk";

interface AgentContact {
  id: string;
  nickname?: string;
  starkName?: string;
  tongoAddress: string;
  starknetAddress?: string;
}

interface AgentWard {
  address: string;
  pseudoName?: string;
}

interface VoiceAgentParams {
  sessionId?: string;
  walletAddress?: string;
  contacts?: AgentContact[];
  wards?: AgentWard[];
}

interface VoiceMeta {
  transcript: string;
  confidence: number;
  language: string;
  provider: string;
}

interface VoiceAgentResponse {
  session: any;
  plan: any;
  reply: string;
  sessions: any[];
  cards?: any[];
  voiceMeta?: VoiceMeta;
}

export interface UseVoiceAgentReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  durationMs: number;
  transcript: string | null;
  startRecording(): Promise<boolean>;
  stopAndTranscribe(params: VoiceAgentParams): Promise<VoiceAgentResponse | null>;
  cancel(): void;
  language: VoiceLanguageCode;
  setLanguage(lang: VoiceLanguageCode): void;
}

const VOICE_LANG_KEY = "cloak_voice_language";

function loadLanguage(): VoiceLanguageCode {
  if (typeof window === "undefined") return "en-IN";
  return (localStorage.getItem(VOICE_LANG_KEY) as VoiceLanguageCode) || "en-IN";
}

export function useVoiceAgent(): UseVoiceAgentReturn {
  const recorder = useAudioRecorder();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [language, setLanguageState] = useState<VoiceLanguageCode>(loadLanguage);
  const abortRef = useRef<AbortController | null>(null);

  const setLanguage = useCallback((lang: VoiceLanguageCode) => {
    setLanguageState(lang);
    localStorage.setItem(VOICE_LANG_KEY, lang);
  }, []);

  const stopAndTranscribe = useCallback(
    async (params: VoiceAgentParams): Promise<VoiceAgentResponse | null> => {
      const blob = await recorder.stopRecording();
      if (!blob) return null;

      setIsTranscribing(true);
      setTranscript(null);
      abortRef.current = new AbortController();

      try {
        const formData = new FormData();
        const ext = blob.type.includes("webm") ? "webm" : blob.type.includes("ogg") ? "ogg" : "wav";
        formData.append("audio", blob, `recording.${ext}`);
        formData.append("language", language);
        if (params.sessionId) formData.append("sessionId", params.sessionId);
        if (params.walletAddress) formData.append("walletAddress", params.walletAddress);
        if (params.contacts?.length) formData.append("contacts", JSON.stringify(params.contacts));
        if (params.wards?.length) formData.append("wards", JSON.stringify(params.wards));

        const res = await fetch("/api/agent/voice", {
          method: "POST",
          body: formData,
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: `Voice request failed (${res.status})` }));
          throw new Error(body?.error || `Voice request failed (${res.status})`);
        }

        const json: VoiceAgentResponse = await res.json();
        setTranscript(json.voiceMeta?.transcript ?? null);
        return json;
      } finally {
        setIsTranscribing(false);
        abortRef.current = null;
      }
    },
    [recorder.stopRecording, language],
  );

  const cancel = useCallback(() => {
    recorder.cancel();
    abortRef.current?.abort();
    setIsTranscribing(false);
    setTranscript(null);
  }, [recorder.cancel]);

  return {
    isRecording: recorder.isRecording,
    isTranscribing,
    durationMs: recorder.durationMs,
    transcript,
    startRecording: recorder.startRecording,
    stopAndTranscribe,
    cancel,
    language,
    setLanguage,
  };
}
