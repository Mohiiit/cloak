import { useCallback, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import { Camera } from "react-native-vision-camera";

/**
 * Lightweight audio recorder for React Native.
 *
 * Uses react-native-live-audio-stream for PCM capture, then wraps the
 * raw samples into a WAV container for upload. Falls back gracefully
 * if the native module is missing.
 */

interface UseAudioRecorderReturn {
  isRecording: boolean;
  /** Duration of current recording in milliseconds */
  durationMs: number;
  startRecording(): Promise<boolean>;
  stopRecording(): Promise<{ base64: string; durationMs: number } | null>;
  cancel(): void;
}

const IOS_SAMPLE_RATE = 44100;
const ANDROID_SAMPLE_RATE = 32000;
const SAMPLE_RATE = Platform.OS === "ios" ? IOS_SAMPLE_RATE : ANDROID_SAMPLE_RATE;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const BUFFER_SIZE = Platform.OS === "ios" ? 8192 : 4096;
const STOP_FLUSH_DELAY_MS = 250;

/** Request mic permission (Android requires runtime permission) */
async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS === "ios") {
    try {
      const status = await Camera.getMicrophonePermissionStatus();
      console.warn(`[useAudioRecorder] iOS microphone permission status=${status}`);
      if (status === "granted") return true;
      if (status === "not-determined" || status === "denied") {
        const next = await Camera.requestMicrophonePermission();
        console.warn(`[useAudioRecorder] iOS microphone permission request result=${next}`);
        return next === "granted";
      }
      return false;
    } catch {
      return false;
    }
  }
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: "Microphone Permission",
        message: "Cloak needs microphone access for voice commands",
        buttonPositive: "Allow",
      },
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/** Encode raw PCM Int16 samples as a WAV file (base64) */
function pcmToWavBase64(pcmChunks: string[]): string {
  // Decode base64 PCM chunks into a single buffer
  const buffers: Uint8Array[] = pcmChunks.map((chunk) => {
    const bin = atob(chunk);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      arr[i] = bin.charCodeAt(i);
    }
    return arr;
  });

  const totalDataLen = buffers.reduce((sum, b) => sum + b.length, 0);
  const wavHeaderLen = 44;
  const wav = new Uint8Array(wavHeaderLen + totalDataLen);
  const view = new DataView(wav.buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + totalDataLen, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8), true);
  view.setUint16(32, CHANNELS * (BITS_PER_SAMPLE / 8), true);
  view.setUint16(34, BITS_PER_SAMPLE, true);

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, totalDataLen, true);

  // Write PCM data
  let offset = wavHeaderLen;
  for (const buf of buffers) {
    wav.set(buf, offset);
    offset += buf.length;
  }

  // Encode to base64
  let binary = "";
  for (const byte of wav) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const chunksRef = useRef<string[]>([]);
  const chunkCountRef = useRef(0);
  const chunkByteLenRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const streamRef = useRef<{ stop: () => void } | null>(null);

  const startRecording = useCallback(async () => {
    const granted = await requestMicPermission();
    if (!granted) return false;

    let LiveAudioStream: any;
    try {
      LiveAudioStream = require("react-native-live-audio-stream").default;
    } catch {
      console.warn("[useAudioRecorder] react-native-live-audio-stream not installed");
      return false;
    }

    chunksRef.current = [];
    chunkCountRef.current = 0;
    chunkByteLenRef.current = 0;
    setDurationMs(0);
    startTimeRef.current = Date.now();

    const recorderOptions: any = {
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      bitsPerSample: BITS_PER_SAMPLE,
      bufferSize: BUFFER_SIZE,
    };
    if (Platform.OS === "android") {
      recorderOptions.audioSource = 6; // VOICE_RECOGNITION
    }
    LiveAudioStream.init(recorderOptions);

    // Subscribe before start so we never miss the first buffers.
    const subscription = LiveAudioStream.on("data", (data: string) => {
      if (typeof data !== "string") return;
      const normalized = data.replace(/\s+/g, "");
      if (normalized.length === 0) return;
      chunkCountRef.current += 1;
      chunkByteLenRef.current += normalized.length;
      chunksRef.current.push(normalized);
    });

    LiveAudioStream.start();
    setIsRecording(true);
    streamRef.current = {
      stop: () => {
        LiveAudioStream.stop();
        subscription?.remove?.();
      },
    };

    // Duration timer
    timerRef.current = setInterval(() => {
      setDurationMs(Date.now() - startTimeRef.current);
    }, 100);

    return true;
  }, []);

  const stopRecording = useCallback(async () => {
    if (!isRecording) return null;

    // Let the native queue flush one final frame before stopping.
    await new Promise<void>((resolve) => setTimeout(() => resolve(), STOP_FLUSH_DELAY_MS));

    streamRef.current?.stop();
    streamRef.current = null;
    setIsRecording(false);

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const finalDuration = Date.now() - startTimeRef.current;
    setDurationMs(finalDuration);

    if (chunksRef.current.length === 0) {
      console.warn(
        `[useAudioRecorder] no chunks captured (durationMs=${finalDuration}, chunkCount=${chunkCountRef.current}, byteLen=${chunkByteLenRef.current})`,
      );
      return null;
    }

    const chunks = chunksRef.current.filter((chunk) => chunk.length > 0);
    chunksRef.current = [];

    if (chunks.length === 0) {
      console.warn(
        `[useAudioRecorder] chunks were empty after cleanup (durationMs=${finalDuration}, chunkCount=${chunkCountRef.current}, byteLen=${chunkByteLenRef.current})`,
      );
      return null;
    }

    const base64 = pcmToWavBase64(chunks);
    console.warn(
      `[useAudioRecorder] captured chunks=${chunks.length} (rawCount=${chunkCountRef.current}, byteLen=${chunkByteLenRef.current}, durationMs=${finalDuration})`,
    );

    return { base64, durationMs: finalDuration };
  }, [isRecording]);

  const cancel = useCallback(() => {
    streamRef.current?.stop();
    streamRef.current = null;
    setIsRecording(false);
    chunksRef.current = [];

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setDurationMs(0);
  }, []);

  return { isRecording, durationMs, startRecording, stopRecording, cancel };
}
