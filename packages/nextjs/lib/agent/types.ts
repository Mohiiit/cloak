export type AgentRole = "user" | "assistant";

export interface AgentContact {
  id: string;
  nickname?: string;
  starkName?: string;
  tongoAddress: string;
  starknetAddress?: string;
}

export interface AgentWard {
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
  recipientType?: "contact" | "ward" | "inline_address" | "unknown";
  wardName?: string;
  wardQueryType?: "info" | "activity";
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

export interface AgentMessage {
  id: string;
  role: AgentRole;
  text: string;
  createdAt: string;
  intent?: AgentIntent;
  cards?: AgentCard[];
}

export interface AgentSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AgentMessage[];
}

// ─── Card Types ───

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

// ─── Request / Response ───

export interface AgentChatRequest {
  message: string;
  sessionId?: string;
  walletAddress?: string;
  clientId?: string;
  contacts?: AgentContact[];
  wards?: AgentWard[];
  source?: "text" | "voice";
  sourceLanguage?: string;
}

export interface AgentChatResponse {
  session: AgentSession;
  plan: AgentPlan;
  reply: string;
  sessions: Array<{
    id: string;
    title: string;
    updatedAt: string;
  }>;
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
