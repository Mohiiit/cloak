import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export interface AgentContactInput {
  id: string;
  nickname?: string;
  starkName?: string;
  tongoAddress: string;
  starknetAddress?: string;
}

export interface AgentWardInput {
  address: string;
  pseudoName?: string;
}

export type AgentIntentType =
  | "send_private"
  | "send_public"
  | "history_query"
  | "ward_query"
  | "start_session"
  | "unknown";

export interface AgentIntent {
  type: AgentIntentType;
  amount?: string;
  token?: string;
  recipientName?: string;
  recipientTongoAddress?: string;
  recipientStarknetAddress?: string;
  rawText: string;
  confidence: number;
  reason: string;
}

export interface AgentPlan {
  intent: AgentIntent;
  requiresExecution: boolean;
  readyToExecute: boolean;
  missing: string[];
}

export interface ActivityCardItem {
  txHash: string;
  type: string;
  token: string;
  amount?: string;
  status?: string;
  timestamp: string;
  recipient?: string;
}

export interface SessionCardItem {
  id: string;
  title: string;
  updatedAt: string;
}

export type AgentCard =
  | { type: "activity_list"; items: ActivityCardItem[]; total: number }
  | { type: "session_list"; items: SessionCardItem[] }
  | { type: "send_preview"; token: string; amount: string; recipient: string; recipientName?: string; mode: "private" | "public" }
  | { type: "ward_summary"; name: string; address: string; guardian?: string; frozen?: boolean }
  | { type: "error"; title: string; message: string };

export interface VoiceUsageMetrics {
  creditsUsed?: number;
  creditsRemaining?: number;
  totalCredits?: number;
  estimatedCostUsd?: number;
  durationSec?: number;
  billedDurationSec?: number;
  currency?: string;
  requestId?: string;
}

export interface VoiceTimingMetrics {
  parseRequestMs: number;
  transcribeMs: number;
  agentMs: number;
  totalMs: number;
}

export interface VoiceMetrics {
  audioBytes: number;
  codec: string;
  recordingDurationMs?: number;
  transcriptChars: number;
  timings: VoiceTimingMetrics;
  usage?: VoiceUsageMetrics;
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  cards?: AgentCard[];
}

export interface AgentSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AgentMessage[];
}

export interface AgentChatResponse {
  session: AgentSession;
  plan: AgentPlan;
  reply: string;
  sessions: Array<{ id: string; title: string; updatedAt: string }>;
  cards?: AgentCard[];
  voiceMeta?: {
    transcript: string;
    confidence: number;
    language: string;
    provider: string;
    model?: string;
    metrics?: VoiceMetrics;
  };
}

const STORAGE_KEY = "cloak_agent_server_url";
const CLIENT_ID_STORAGE_KEY = "cloak_agent_client_id";
const DEFAULT_AGENT_SERVER_URL = "https://cloak-backend-vert.vercel.app";
const FALLBACK_HTTP_STATUSES = new Set([401, 404]);

class AgentHttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function normalizeAgentServerUrl(raw: string): string {
  const trimmed = (raw || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

function defaultAgentServerUrl(): string {
  const envUrl =
    (globalThis as any)?.process?.env?.EXPO_PUBLIC_AGENT_SERVER_URL ||
    (globalThis as any)?.process?.env?.AGENT_SERVER_URL;
  if (envUrl) {
    const normalized = normalizeAgentServerUrl(envUrl);
    if (normalized) return normalized;
  }

  if (__DEV__) {
    // Keep localhost ergonomics for local debug/dev sessions.
    return Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://127.0.0.1:3000";
  }

  return DEFAULT_AGENT_SERVER_URL;
}

export async function getAgentServerUrl(): Promise<string> {
  const saved = await AsyncStorage.getItem(STORAGE_KEY);
  const normalized = normalizeAgentServerUrl(saved || "");
  return normalized || defaultAgentServerUrl();
}

export async function setAgentServerUrl(url: string): Promise<void> {
  const normalized = normalizeAgentServerUrl(url);
  if (!normalized) {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEY, normalized);
}

function generateClientId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `mobile_${Platform.OS}_${Date.now().toString(36)}_${rand}`;
}

function sanitizeClientId(raw?: string | null): string | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;
  const safe = trimmed.replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 96);
  return safe || null;
}

export async function getAgentClientId(): Promise<string> {
  const saved = sanitizeClientId(await AsyncStorage.getItem(CLIENT_ID_STORAGE_KEY));
  if (saved) return saved;
  const next = generateClientId();
  await AsyncStorage.setItem(CLIENT_ID_STORAGE_KEY, next);
  return next;
}

function isNetworkRequestError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (!(err instanceof Error)) return false;
  return /network request failed|failed to fetch|network/i.test(err.message);
}

function isJsonParseError(err: unknown): boolean {
  if (err instanceof SyntaxError) return true;
  if (!(err instanceof Error)) return false;
  return /json|unexpected token/i.test(err.message);
}

function shouldFallbackToDefault(serverUrl: string, err: unknown): boolean {
  const defaultUrl = normalizeAgentServerUrl(DEFAULT_AGENT_SERVER_URL);
  if (!serverUrl || serverUrl === defaultUrl) return false;

  if (isNetworkRequestError(err)) return true;
  if (isJsonParseError(err)) return true;
  if (err instanceof AgentHttpError) {
    return FALLBACK_HTTP_STATUSES.has(err.status);
  }
  return false;
}

async function createAgentHttpError(prefix: string, res: Response): Promise<AgentHttpError> {
  const fallback = `${prefix} (${res.status})`;
  try {
    const json = await res.clone().json();
    const detail = typeof json?.error === "string" ? json.error : "";
    return new AgentHttpError(detail || fallback, res.status);
  } catch {
    return new AgentHttpError(fallback, res.status);
  }
}

interface AgentScopeParams {
  sessionId?: string;
  walletAddress?: string;
  clientId?: string;
}

function buildChatQuery(params: AgentScopeParams): string {
  const search = new URLSearchParams();
  if (params.sessionId) search.set("sessionId", params.sessionId);
  if (params.walletAddress) search.set("walletAddress", params.walletAddress);
  if (params.clientId) search.set("clientId", params.clientId);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

async function fetchAgentState(serverUrl: string, params: AgentScopeParams): Promise<{
  session: AgentSession;
  sessions: Array<{ id: string; title: string; updatedAt: string }>;
  serverUrl: string;
}> {
  const qs = buildChatQuery(params);
  const res = await fetch(`${serverUrl}/api/agent/chat${qs}`);
  if (!res.ok) throw await createAgentHttpError("Failed to load Agent state", res);
  const json = await res.json();
  return {
    session: json.session,
    sessions: json.sessions || [],
    serverUrl,
  };
}

type LoadAgentStateInput =
  | string
  | {
      sessionId?: string;
      walletAddress?: string;
    };

function normalizeLoadStateInput(input?: LoadAgentStateInput): {
  sessionId?: string;
  walletAddress?: string;
} {
  if (!input) return {};
  if (typeof input === "string") return { sessionId: input };
  return input;
}

export async function loadAgentState(input?: LoadAgentStateInput): Promise<{
  session: AgentSession;
  sessions: Array<{ id: string; title: string; updatedAt: string }>;
  serverUrl: string;
}> {
  const { sessionId, walletAddress } = normalizeLoadStateInput(input);
  const clientId = await getAgentClientId();
  const serverUrl = await getAgentServerUrl();
  try {
    return await fetchAgentState(serverUrl, { sessionId, walletAddress, clientId });
  } catch (err) {
    if (shouldFallbackToDefault(serverUrl, err)) {
      const fallbackUrl = normalizeAgentServerUrl(DEFAULT_AGENT_SERVER_URL);
      const fallback = await fetchAgentState(fallbackUrl, {
        sessionId,
        walletAddress,
        clientId,
      });
      await setAgentServerUrl(fallbackUrl);
      return fallback;
    }
    throw err;
  }
}

export async function deleteAgentSession(
  sessionId: string,
  walletAddress?: string,
): Promise<{
  sessions: Array<{ id: string; title: string; updatedAt: string }>;
}> {
  const clientId = await getAgentClientId();
  const serverUrl = await getAgentServerUrl();
  const performDelete = async (url: string) => {
    const qs = buildChatQuery({ sessionId, walletAddress, clientId });
    const res = await fetch(
      `${url}/api/agent/chat${qs}`,
      { method: "DELETE" },
    );
    if (!res.ok) throw await createAgentHttpError("Failed to delete session", res);
    const json = await res.json();
    return { sessions: json.sessions || [] };
  };

  try {
    return await performDelete(serverUrl);
  } catch (err) {
    if (shouldFallbackToDefault(serverUrl, err)) {
      const fallbackUrl = normalizeAgentServerUrl(DEFAULT_AGENT_SERVER_URL);
      const result = await performDelete(fallbackUrl);
      await setAgentServerUrl(fallbackUrl);
      return result;
    }
    throw err;
  }
}

export async function sendAgentMessage(input: {
  message: string;
  sessionId?: string;
  walletAddress?: string;
  contacts: AgentContactInput[];
  wards?: AgentWardInput[];
}): Promise<AgentChatResponse & { serverUrl: string }> {
  const clientId = await getAgentClientId();
  const serverUrl = await getAgentServerUrl();
  const performSend = async (url: string): Promise<AgentChatResponse & { serverUrl: string }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);

    let res: Response;
    try {
      res = await fetch(`${url}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          clientId,
        }),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err?.name === "AbortError") throw new Error("Agent request timed out");
      throw err;
    }
    clearTimeout(timer);

    if (!res.ok) throw await createAgentHttpError("Agent request failed", res);

    const json = await res.json();
    return {
      ...json,
      serverUrl: url,
    };
  };

  try {
    return await performSend(serverUrl);
  } catch (err) {
    if (shouldFallbackToDefault(serverUrl, err)) {
      const fallbackUrl = normalizeAgentServerUrl(DEFAULT_AGENT_SERVER_URL);
      const result = await performSend(fallbackUrl);
      await setAgentServerUrl(fallbackUrl);
      return result;
    }
    throw err;
  }
}
