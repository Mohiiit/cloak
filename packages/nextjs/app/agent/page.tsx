"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Send, Clock3, Play, Loader2, Plus, X, ArrowUpRight, Shield, ShieldAlert, Activity, AlertCircle, Lock, Unlock, Mic, MicOff } from "lucide-react";
import { useAccount } from "@starknet-react/core";
import { CallData, uint256 } from "starknet";
import toast from "react-hot-toast";
import { useContacts } from "~~/hooks/useContacts";
import { useWard } from "~~/hooks/useWard";
import { useTongoTransfer } from "~~/hooks/useTongoTransfer";
import { useTransactionRouter } from "~~/hooks/useTransactionRouter";
import { useTongo } from "~~/components/providers/TongoProvider";
import { TOKENS, parseTokenAmount } from "~~/lib/tokens";
import { saveTxNote } from "~~/lib/storage";
import { truncateAddress } from "@cloak-wallet/sdk";
import { useVoiceAgent } from "~~/hooks/useVoiceAgent";

type AgentIntentType =
  | "send_private"
  | "send_public"
  | "history_query"
  | "ward_query"
  | "start_session"
  | "unknown";

interface AgentIntent {
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

interface AgentPlan {
  intent: AgentIntent;
  requiresExecution: boolean;
  readyToExecute: boolean;
  missing: string[];
}

interface ActivityCardItem {
  txHash: string;
  type: string;
  token: string;
  amount?: string;
  status?: string;
  timestamp: string;
  recipient?: string;
}

interface SessionCardItem {
  id: string;
  title: string;
  updatedAt: string;
}

type AgentCard =
  | { type: "activity_list"; items: ActivityCardItem[]; total: number }
  | { type: "session_list"; items: SessionCardItem[] }
  | { type: "send_preview"; token: string; amount: string; recipient: string; recipientName?: string; mode: "private" | "public" }
  | { type: "ward_summary"; name: string; address: string; guardian?: string; frozen?: boolean }
  | { type: "error"; title: string; message: string };

interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  cards?: AgentCard[];
}

interface AgentSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AgentMessage[];
}

interface AgentApiResponse {
  session: AgentSession;
  plan: AgentPlan;
  reply: string;
  sessions: Array<{ id: string; title: string; updatedAt: string }>;
  cards?: AgentCard[];
}

function SessionTime({ iso }: { iso: string }) {
  const label = useMemo(() => {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }, [iso]);
  return <span>{label}</span>;
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const TX_TYPE_ICONS: Record<string, string> = {
  send: "arrow-up-right",
  transfer: "arrow-up-right",
  fund: "shield",
  withdraw: "unlock",
  rollover: "refresh-cw",
  swap: "repeat",
  approval: "check-circle",
};

const STATUS_COLORS: Record<string, string> = {
  confirmed: "text-emerald-400",
  pending: "text-amber-400",
  failed: "text-red-400",
  rejected: "text-red-400",
  gas_error: "text-orange-400",
};

function ActivityListCard({ items, total }: { items: ActivityCardItem[]; total: number }) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-700/40 flex items-center gap-2">
        <Activity className="w-3.5 h-3.5 text-blue-400" />
        <span className="text-xs font-medium text-slate-300">Recent Activity</span>
        {total > items.length && (
          <span className="ml-auto text-[10px] text-slate-500">{total} total</span>
        )}
      </div>
      <div className="divide-y divide-slate-700/30">
        {items.map((item) => (
          <div key={item.txHash} className="px-3 py-2 flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-200 capitalize">{item.type}</span>
                {item.amount && (
                  <span className="text-xs text-slate-400">{item.amount} {item.token}</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] capitalize ${STATUS_COLORS[item.status || ""] || "text-slate-500"}`}>
                  {item.status || "unknown"}
                </span>
                <span className="text-[10px] text-slate-600">{formatTimeAgo(item.timestamp)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <a
        href="/activity"
        className="block px-3 py-2 text-center text-[11px] text-blue-400 hover:text-blue-300 border-t border-slate-700/30"
      >
        View full history
      </a>
    </div>
  );
}

function SendPreviewCard({ token, amount, recipient, recipientName, mode }: {
  token: string; amount: string; recipient: string; recipientName?: string; mode: "private" | "public";
}) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-3">
      <div className="flex items-center gap-2 mb-2">
        {mode === "private" ? (
          <Shield className="w-4 h-4 text-blue-400" />
        ) : (
          <ArrowUpRight className="w-4 h-4 text-emerald-400" />
        )}
        <span className="text-xs font-medium text-slate-300">Send Preview</span>
        <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${
          mode === "private" ? "bg-blue-500/15 text-blue-400" : "bg-emerald-500/15 text-emerald-400"
        }`}>
          {mode}
        </span>
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-500">Amount</span>
          <span className="text-sm font-medium text-slate-100">{amount} {token}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-500">To</span>
          <span className="text-xs text-slate-200">{recipientName || truncateAddress(recipient)}</span>
        </div>
      </div>
    </div>
  );
}

function WardSummaryCard({ name, address, guardian, frozen }: {
  name: string; address: string; guardian?: string; frozen?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-3">
      <div className="flex items-center gap-2 mb-2">
        <ShieldAlert className="w-4 h-4 text-purple-400" />
        <span className="text-xs font-medium text-slate-300">Ward Account</span>
        {frozen && (
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
            Frozen
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-500">Name</span>
          <span className="text-sm font-medium text-slate-100">{name}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-500">Address</span>
          <span className="text-xs text-slate-300 font-mono">{truncateAddress(address)}</span>
        </div>
        {guardian && (
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500">Guardian</span>
            <span className="text-xs text-slate-300 font-mono">{truncateAddress(guardian)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 flex items-start gap-2">
      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-xs font-medium text-red-300">{title}</p>
        <p className="text-[11px] text-red-400/80 mt-0.5">{message}</p>
      </div>
    </div>
  );
}

function AgentCardRenderer({ card }: { card: AgentCard }) {
  switch (card.type) {
    case "activity_list":
      return <ActivityListCard items={card.items} total={card.total} />;
    case "session_list":
      return null; // sessions already shown in sidebar
    case "send_preview":
      return <SendPreviewCard {...card} />;
    case "ward_summary":
      return <WardSummaryCard {...card} />;
    case "error":
      return <ErrorCard {...card} />;
    default:
      return null;
  }
}

export default function AgentPage() {
  const { status, address } = useAccount();
  const { contacts } = useContacts();
  const { wards } = useWard();
  const { transfer, isPending: isPrivatePending } = useTongoTransfer();
  const { executeOrRoute } = useTransactionRouter();
  const { tongoAccount } = useTongo();

  const [activeSession, setActiveSession] = useState<AgentSession | null>(null);
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; updatedAt: string }>>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastPlan, setLastPlan] = useState<AgentPlan | null>(null);
  const [lastCards, setLastCards] = useState<AgentCard[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const voice = useVoiceAgent();

  useEffect(() => {
    void loadState();
  }, []);

  async function loadState(sessionId?: string) {
    try {
      const res = await fetch(`/api/agent/chat${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`);
      if (!res.ok) throw new Error("Failed to load agent state");
      const data = (await res.json()) as { session: AgentSession; sessions: Array<{ id: string; title: string; updatedAt: string }> };
      setActiveSession(data.session);
      setSessions(data.sessions);
      setLastPlan(null);
    } catch (err: any) {
      toast.error(err?.message || "Failed to initialize agent mode");
    }
  }

  async function deleteSessionById(sessionId: string) {
    try {
      const res = await fetch(`/api/agent/chat?sessionId=${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete session");
      const data = (await res.json()) as { sessions: Array<{ id: string; title: string; updatedAt: string }> };
      setSessions(data.sessions);
      if (activeSession?.id === sessionId) {
        setActiveSession(null);
        setLastPlan(null);
        if (data.sessions.length > 0) {
          void loadState(data.sessions[0].id);
        } else {
          void loadState();
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete session");
    }
  }

  async function startNewSession() {
    setActiveSession(null);
    setLastPlan(null);
    await sendMessage("start new session", null);
  }

  async function sendMessage(message: string, sessionId?: string | null) {
    if (!message.trim()) return;
    setIsSending(true);
    try {
      const payload = {
        message,
        sessionId: sessionId ?? activeSession?.id,
        walletAddress: address,
        contacts,
        wards: wards.map((w) => ({
          address: w.wardAddress,
          pseudoName: w.pseudoName,
        })),
      };

      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Agent request failed (${res.status})`);
      }

      const data = (await res.json()) as AgentApiResponse;
      setActiveSession(data.session);
      setSessions(data.sessions);
      setLastPlan(data.plan);
      setLastCards(data.cards || []);
      setInput("");
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err: any) {
      toast.error(err?.message || "Agent request failed");
    } finally {
      setIsSending(false);
    }
  }

  async function executeLastPlan() {
    if (!lastPlan || !lastPlan.requiresExecution || !lastPlan.readyToExecute) return;
    if (!activeSession) return;

    const intent = lastPlan.intent;
    const token = (intent.token || "STRK").toUpperCase();

    if (!(token in TOKENS)) {
      toast.error(`Unsupported token: ${token}`);
      return;
    }

    const tokenConfig = TOKENS[token as keyof typeof TOKENS];

    setIsExecuting(true);
    try {
      if (intent.type === "send_private") {
        if (!tongoAccount) throw new Error("Wallet not ready for private transfer");
        if (!intent.recipientTongoAddress) throw new Error("Missing recipient cloak address");
        if (!intent.amount) throw new Error("Missing amount");

        const erc20Amount = parseTokenAmount(intent.amount, tokenConfig.decimals);
        const tongoAmount = await tongoAccount.erc20ToTongo(erc20Amount);
        const txHash = await transfer(intent.recipientTongoAddress, tongoAmount);
        if (!txHash) throw new Error("Private transfer failed");

        saveTxNote(txHash, {
          txHash,
          recipient: intent.recipientTongoAddress,
          recipientName: intent.recipientName,
          privacyLevel: "private",
          timestamp: Math.floor(Date.now() / 1000),
          type: "send",
          token,
          amount: intent.amount,
          note: `Agent: ${intent.rawText}`,
        });

        toast.success(`Private transfer submitted: ${txHash.slice(0, 10)}...`);
      }

      if (intent.type === "send_public") {
        if (!intent.recipientStarknetAddress) throw new Error("Missing recipient Starknet address");
        if (!intent.amount) throw new Error("Missing amount");

        const amountWei = parseTokenAmount(intent.amount, tokenConfig.decimals);
        const calls = [
          {
            contractAddress: tokenConfig.erc20Address,
            entrypoint: "transfer",
            calldata: CallData.compile({
              recipient: intent.recipientStarknetAddress,
              amount: uint256.bnToUint256(amountWei),
            }),
          },
        ];

        const txHash = await executeOrRoute(calls, {
          action: "erc20_transfer",
          token,
          amount: intent.amount,
          recipient: intent.recipientStarknetAddress,
        });

        saveTxNote(txHash, {
          txHash,
          recipient: intent.recipientStarknetAddress,
          recipientName: intent.recipientName,
          privacyLevel: "public",
          timestamp: Math.floor(Date.now() / 1000),
          type: "send",
          token,
          amount: intent.amount,
          note: `Agent: ${intent.rawText}`,
        });

        toast.success(`Public transfer submitted: ${txHash.slice(0, 10)}...`);
      }

      await sendMessage("show my previous sessions", activeSession.id);
    } catch (err: any) {
      toast.error(err?.message || "Failed to execute agent plan");
    } finally {
      setIsExecuting(false);
    }
  }

  if (status !== "connected") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <Bot className="w-12 h-12 text-slate-600 mb-4" />
        <p className="text-slate-400">Connect wallet to use Agent Mode</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
      <aside className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-3 h-fit md:sticky md:top-4">
        <button
          onClick={startNewSession}
          className="w-full mb-3 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-3 py-2 text-sm font-medium text-white"
        >
          <Plus className="w-4 h-4" />
          New Session
        </button>

        <div className="text-xs text-slate-400 mb-2">Previous Sessions</div>
        <div className="flex flex-col gap-2 max-h-[40vh] overflow-auto pr-1">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => void loadState(s.id)}
              className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                activeSession?.id === s.id
                  ? "border-blue-500/60 bg-blue-500/10"
                  : "border-slate-700/50 bg-slate-900/40 hover:border-slate-500/60"
              }`}
            >
              <p className="text-sm text-slate-100 truncate">{s.title}</p>
              <p className="mt-1 text-[11px] text-slate-500 inline-flex items-center gap-1">
                <Clock3 className="w-3 h-3" />
                <SessionTime iso={s.updatedAt} />
              </p>
            </button>
          ))}
          {sessions.length === 0 && <p className="text-xs text-slate-500">No sessions yet.</p>}
        </div>
      </aside>

      <section className="bg-slate-800/40 border border-slate-700/40 rounded-2xl flex flex-col min-h-[70vh]">
        <div className="border-b border-slate-700/40 px-4 py-3">
          <h1 className="text-lg font-semibold text-slate-50">Agent Mode</h1>
          <p className="text-xs text-slate-400 mt-1">
            Type natural commands, e.g. &ldquo;send 10 STRK to mobileMohit private&rdquo;
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activeSession?.messages.map((m) => (
            <div key={m.id} className="space-y-2">
              <div
                className={`max-w-[90%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "ml-auto bg-blue-600/20 border border-blue-500/30 text-blue-100"
                    : "mr-auto bg-slate-900/70 border border-slate-700/50 text-slate-200"
                }`}
              >
                {m.text}
              </div>
              {m.role === "assistant" && m.cards && m.cards.length > 0 && (
                <div className="mr-auto max-w-[90%] space-y-2">
                  {m.cards.map((card, i) => (
                    <AgentCardRenderer key={i} card={card} />
                  ))}
                </div>
              )}
            </div>
          ))}

          {isSending && (
            <div className="mr-auto flex items-center gap-1.5 rounded-xl bg-slate-900/70 border border-slate-700/50 px-4 py-3">
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
            </div>
          )}

          {!activeSession && <p className="text-sm text-slate-500">Loading session...</p>}
          <div ref={chatEndRef} />
        </div>

        <div className="border-t border-slate-700/40 p-4 space-y-3">
          {lastPlan && (
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-3">
              <p className="text-xs text-slate-400">Current plan</p>
              <p className="mt-1 text-sm text-slate-200">
                Intent: <span className="text-blue-300">{lastPlan.intent.type}</span>
                {lastPlan.intent.amount ? `, amount ${lastPlan.intent.amount}` : ""}
                {lastPlan.intent.token ? ` ${lastPlan.intent.token}` : ""}
                {lastPlan.intent.recipientName ? ` to ${lastPlan.intent.recipientName}` : ""}
              </p>
              {lastPlan.missing.length > 0 && (
                <p className="mt-1 text-xs text-amber-300">
                  Missing: {lastPlan.missing.join(", ")}
                </p>
              )}

              {lastPlan.requiresExecution && (
                <button
                  onClick={() => void executeLastPlan()}
                  disabled={!lastPlan.readyToExecute || isExecuting || isPrivatePending}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-2 text-sm font-medium text-white"
                >
                  {isExecuting || isPrivatePending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Executing
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Execute
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {voice.isRecording || voice.isTranscribing ? (
            /* Recording / Transcribing state */
            <div className="flex items-center gap-3 px-1 py-2">
              {voice.isRecording && (
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              )}
              <span className="text-sm text-slate-300">
                {voice.isTranscribing
                  ? "Transcribing..."
                  : `Listening... ${Math.floor(voice.durationMs / 1000)}s`}
              </span>
              {voice.isTranscribing && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
              <div className="flex-1" />
              {voice.isRecording && (
                <button
                  onClick={async () => {
                    const result = await voice.stopAndTranscribe({
                      sessionId: activeSession?.id,
                      walletAddress: address,
                      contacts: contacts.map((c) => ({
                        id: c.id,
                        nickname: c.nickname,
                        tongoAddress: c.tongoAddress,
                        starknetAddress: c.starknetAddress,
                      })),
                      wards: wards.map((w) => ({ address: w.wardAddress, pseudoName: w.pseudoName })),
                    });
                    if (result) {
                      setActiveSession(result.session);
                      setSessions(result.sessions || []);
                      if (result.plan) setLastPlan(result.plan);
                      if (result.cards) setLastCards(result.cards);
                    }
                  }}
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-700 w-10 h-10 text-white"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={voice.cancel}
                className="inline-flex items-center justify-center rounded-xl bg-red-500/20 hover:bg-red-500/30 w-10 h-10 text-red-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* Normal text input */
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage(input);
              }}
              className="flex items-center gap-2"
            >
              <button
                type="button"
                onClick={async () => {
                  const ok = await voice.startRecording();
                  if (!ok) toast.error("Microphone permission denied");
                }}
                disabled={isSending}
                className="inline-flex items-center justify-center rounded-xl bg-blue-500/15 hover:bg-blue-500/25 disabled:opacity-50 w-10 h-10 text-blue-400"
              >
                <Mic className="w-4 h-4" />
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder='Ask agent: "send 10 STRK to mobileMohit"'
                className="flex-1 rounded-xl border border-slate-700/50 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-blue-500/60"
              />
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 w-11 h-11 text-white"
              >
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
