import { parseIntentWithLLM } from "~~/lib/agent/llm";
import { parseAgentIntent } from "~~/lib/agent/parser";
import { runScript } from "~~/lib/agent/scripts";
import {
  appendMessages,
  createMessage,
  createSession,
  getSessionById,
  listSessionSummaries,
  type SessionScope,
} from "~~/lib/agent/session-store";
import type {
  AgentCard,
  AgentChatRequest,
  AgentChatResponse,
  AgentIntent,
  AgentPlan,
  AgentSession,
} from "~~/lib/agent/types";

function buildPlan(intent: AgentIntent): AgentPlan {
  if (intent.type === "send_private") {
    const missing: string[] = [];
    if (!intent.amount) missing.push("amount");
    if (!intent.token) missing.push("token");
    if (!intent.recipientTongoAddress) missing.push("recipient_tongo_address");
    return {
      intent,
      requiresExecution: true,
      readyToExecute: missing.length === 0,
      missing,
    };
  }

  if (intent.type === "send_public") {
    const missing: string[] = [];
    if (!intent.amount) missing.push("amount");
    if (!intent.token) missing.push("token");
    if (!intent.recipientStarknetAddress) missing.push("recipient_starknet_address");
    return {
      intent,
      requiresExecution: true,
      readyToExecute: missing.length === 0,
      missing,
    };
  }

  return {
    intent,
    requiresExecution: false,
    readyToExecute: false,
    missing: [],
  };
}

function buildReply(plan: AgentPlan, sessions: Array<{ id: string; title: string; updatedAt: string }>): string {
  const { intent } = plan;

  if (intent.type === "start_session") {
    return "Started a fresh agent session. You can now ask me to send funds (private/public).";
  }

  if (intent.type === "history_query") {
    return "Let me look up your recent activity...";
  }

  if (intent.type === "ward_query") {
    const name = intent.wardName || "your ward";
    return `Looking up ${name}...`;
  }

  if (intent.type === "send_private" || intent.type === "send_public") {
    const modeLabel = intent.type === "send_private" ? "private" : "public";

    if (!plan.readyToExecute) {
      const hints: string[] = [];
      if (plan.missing.includes("amount")) hints.push("How much do you want to send?");
      if (plan.missing.includes("recipient_tongo_address")) hints.push("Who should I send to? (name from your contacts)");
      if (plan.missing.includes("recipient_starknet_address")) hints.push("Who should I send to? (contact name, ward name, or 0x address)");
      return `I understood a ${modeLabel} send, but I still need some info:\n${hints.join("\n")}`;
    }

    const recipient = intent.recipientName || intent.recipientTongoAddress || intent.recipientStarknetAddress || "recipient";
    const wardNote = intent.recipientType === "ward" ? " (ward account)" : "";
    return `Ready to ${modeLabel} send ${intent.amount} ${intent.token} to ${recipient}${wardNote}. Hit Execute to confirm.`;
  }

  return "I'm a payment assistant. I can help you send funds (private or public), check your transaction history, or look up ward info. What would you like to do?";
}

/** Fix misplaced addresses: 0x hex in tongo field → starknet field (and vice versa). */
function sanitizeAddresses(intent: AgentIntent): void {
  const looksLikeStarknet = (s?: string) => !!s && s.startsWith("0x");

  // 0x address stored as tongo → move to starknet
  if (looksLikeStarknet(intent.recipientTongoAddress)) {
    if (!intent.recipientStarknetAddress) {
      intent.recipientStarknetAddress = intent.recipientTongoAddress;
    }
    intent.recipientTongoAddress = undefined;
    // Switch to public if it was private (no tongo address available)
    if (intent.type === "send_private") {
      intent.type = "send_public";
    }
  }

  // base58 address stored as starknet → move to tongo
  if (intent.recipientStarknetAddress && !looksLikeStarknet(intent.recipientStarknetAddress)) {
    if (!intent.recipientTongoAddress) {
      intent.recipientTongoAddress = intent.recipientStarknetAddress;
    }
    intent.recipientStarknetAddress = undefined;
    if (intent.type === "send_public") {
      intent.type = "send_private";
    }
  }
}

function getSessionScope(input: {
  walletAddress?: string;
  clientId?: string;
}): SessionScope {
  return {
    walletAddress: input.walletAddress,
    clientId: input.clientId,
  };
}

async function resolveSession(input: AgentChatRequest, scope: SessionScope): Promise<AgentSession> {
  if (input.sessionId) {
    const existing = await getSessionById(input.sessionId, scope);
    if (existing) return existing;
  }
  return createSession(scope);
}

export async function handleAgentChat(input: AgentChatRequest): Promise<AgentChatResponse> {
  const scope = getSessionScope(input);
  const sessionsBefore = await listSessionSummaries(scope);
  let session = await resolveSession(input, scope);

  const message = input.message || "";
  const contacts = input.contacts || [];
  const wards = input.wards || [];

  let intent: AgentIntent;
  let llmReply: string | undefined;

  if (process.env.MINIMAX_API_KEY) {
    try {
      const result = await parseIntentWithLLM(message, contacts, wards, session.messages);
      intent = result.intent;
      llmReply = result.reply;
    } catch (err) {
      console.warn("[agent] LLM parse failed, falling back to regex:", (err as Error).message);
      intent = parseAgentIntent(message, contacts, wards);
    }
  } else {
    intent = parseAgentIntent(message, contacts, wards);
  }

  sanitizeAddresses(intent);

  if (intent.type === "start_session") {
    // Always create a fresh session and let the assistant open it.
    session = await createSession(scope);
  }

  const plan = buildPlan(intent);

  // Run scripts to generate cards and potentially override the reply
  let cards: AgentCard[] = [];
  let reply = llmReply || buildReply(plan, sessionsBefore);

  try {
    const scriptResult = await runScript(intent, {
      walletAddress: input.walletAddress,
      wardConfigs: input.wards,
    });
    cards = scriptResult.cards;
    if (scriptResult.reply) reply = scriptResult.reply;
  } catch (err) {
    console.warn("[agent] Script execution failed:", err);
  }

  // Build send_preview card for ready-to-execute send intents
  if (
    (intent.type === "send_private" || intent.type === "send_public") &&
    plan.readyToExecute &&
    intent.amount &&
    intent.token
  ) {
    const recipient = intent.recipientStarknetAddress || intent.recipientTongoAddress || "";
    cards.push({
      type: "send_preview",
      token: intent.token,
      amount: intent.amount,
      recipient,
      recipientName: intent.recipientName,
      mode: intent.type === "send_private" ? "private" : "public",
    });
  }

  const includeUserMessage = intent.type !== "start_session";
  const userMsg = includeUserMessage ? createMessage("user", input.message || "") : null;
  if (userMsg) {
    userMsg.intent = intent;
  }
  const assistantMsg = createMessage("assistant", reply);
  assistantMsg.cards = cards.length > 0 ? cards : undefined;

  const toAppend = userMsg ? [userMsg, assistantMsg] : [assistantMsg];
  let updatedSession = await appendMessages(session.id, toAppend, scope);
  if (!updatedSession) {
    updatedSession = {
      ...session,
      updatedAt: new Date().toISOString(),
      messages: userMsg
        ? [...session.messages, userMsg, assistantMsg]
        : [...session.messages, assistantMsg],
    };
  }

  const sessions = await listSessionSummaries(scope);

  return {
    session: updatedSession,
    plan,
    reply,
    sessions,
    cards: cards.length > 0 ? cards : undefined,
  };
}

export async function loadAgentState(
  sessionId?: string,
  scopeInput?: { walletAddress?: string; clientId?: string },
): Promise<{
  session: AgentSession;
  sessions: Array<{ id: string; title: string; updatedAt: string }>;
}> {
  const scope = getSessionScope(scopeInput || {});
  const sessions = await listSessionSummaries(scope);

  if (sessionId) {
    const found = await getSessionById(sessionId, scope);
    if (found) {
      return { session: found, sessions };
    }
  }

  if (sessions.length > 0) {
    const latest = await getSessionById(sessions[0].id, scope);
    if (latest) {
      return { session: latest, sessions };
    }
  }

  const created = await createSession(scope);
  return {
    session: created,
    sessions: await listSessionSummaries(scope),
  };
}
