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
  };
}

const STORAGE_KEY = "cloak_agent_server_url";
const DEFAULT_AGENT_SERVER_URL = "https://cloak-backend-vert.vercel.app";

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

export async function loadAgentState(sessionId?: string): Promise<{
  session: AgentSession;
  sessions: Array<{ id: string; title: string; updatedAt: string }>;
  serverUrl: string;
}> {
  const serverUrl = await getAgentServerUrl();
  const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
  const res = await fetch(`${serverUrl}/api/agent/chat${qs}`);
  if (!res.ok) throw new Error(`Failed to load Agent state (${res.status})`);
  const json = await res.json();
  return {
    session: json.session,
    sessions: json.sessions || [],
    serverUrl,
  };
}

export async function deleteAgentSession(sessionId: string): Promise<{
  sessions: Array<{ id: string; title: string; updatedAt: string }>;
}> {
  const serverUrl = await getAgentServerUrl();
  const res = await fetch(
    `${serverUrl}/api/agent/chat?sessionId=${encodeURIComponent(sessionId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Failed to delete session (${res.status})`);
  const json = await res.json();
  return { sessions: json.sessions || [] };
}

export async function sendAgentMessage(input: {
  message: string;
  sessionId?: string;
  walletAddress?: string;
  contacts: AgentContactInput[];
  wards?: AgentWardInput[];
}): Promise<AgentChatResponse & { serverUrl: string }> {
  const serverUrl = await getAgentServerUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  let res: Response;
  try {
    res = await fetch(`${serverUrl}/api/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === "AbortError") throw new Error("Agent request timed out");
    throw err;
  }
  clearTimeout(timer);

  if (!res.ok) {
    const fallback = `Agent request failed (${res.status})`;
    try {
      const err = await res.json();
      throw new Error(err?.error || fallback);
    } catch {
      throw new Error(fallback);
    }
  }

  const json = await res.json();
  return {
    ...json,
    serverUrl,
  };
}
