import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AlertCircle,
  ArrowUpRight,
  Bot,
  ChevronRight,
  Clock3,
  MessageSquare,
  Mic,
  MicOff,
  Play,
  Plus,
  Save,
  Send,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react-native";
import { TOKENS, parseTokenAmount, truncateAddress } from "@cloak-wallet/sdk";
import { useWallet } from "../lib/WalletContext";
import { useContacts } from "../hooks/useContacts";
import { useWardContext } from "../lib/wardContext";
import { useTransactionRouter } from "../hooks/useTransactionRouter";
import { useToast } from "../components/Toast";
import { saveTxNote } from "../lib/storage";
import {
  deleteAgentSession,
  getAgentServerUrl,
  loadAgentState,
  sendAgentMessage,
  setAgentServerUrl,
  type AgentCard,
  type AgentMessage,
  type AgentPlan,
  type AgentSession,
} from "../lib/agentApi";
import { useVoiceAgent } from "../hooks/useVoiceAgent";
import { colors, spacing, borderRadius, fontSize, typography } from "../lib/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.8, 320);

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (isToday) return time;
    return `${d.getDate()}/${d.getMonth() + 1} ${time}`;
  } catch {
    return iso;
  }
}

function formatIntentType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

const STATUS_COLORS: Record<string, string> = {
  confirmed: colors.success,
  pending: colors.warning,
  failed: colors.error,
  rejected: colors.error,
  gas_error: colors.warning,
};

function ActivityListCardMobile({ items, total }: { items: Array<{ txHash: string; type: string; token: string; amount?: string; status?: string; timestamp: string }> ; total: number }) {
  return (
    <View style={cardStyles.cardContainer}>
      <View style={cardStyles.cardHeader}>
        <ArrowUpRight size={14} color={colors.primaryLight} />
        <Text style={cardStyles.cardHeaderText}>Recent Activity</Text>
        {total > items.length && (
          <Text style={cardStyles.cardHeaderMeta}>{total} total</Text>
        )}
      </View>
      {items.map((item, i) => (
        <View key={item.txHash || i} style={[cardStyles.activityRow, i > 0 && cardStyles.activityRowBorder]}>
          <View style={cardStyles.activityIcon}>
            <ArrowUpRight size={14} color={colors.textMuted} />
          </View>
          <View style={cardStyles.activityContent}>
            <View style={cardStyles.activityTopRow}>
              <Text style={cardStyles.activityType}>{item.type}</Text>
              {item.amount && <Text style={cardStyles.activityAmount}>{item.amount} {item.token}</Text>}
            </View>
            <View style={cardStyles.activityBottomRow}>
              <Text style={[cardStyles.activityStatus, { color: STATUS_COLORS[item.status || ""] || colors.textMuted }]}>
                {item.status || "unknown"}
              </Text>
              <Text style={cardStyles.activityTime}>{formatTimeAgo(item.timestamp)}</Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function SendPreviewCardMobile({ token, amount, recipient, recipientName, mode }: {
  token: string; amount: string; recipient: string; recipientName?: string; mode: "private" | "public";
}) {
  return (
    <View style={cardStyles.cardContainer}>
      <View style={cardStyles.cardHeader}>
        {mode === "private" ? (
          <Shield size={14} color={colors.primaryLight} />
        ) : (
          <ArrowUpRight size={14} color={colors.success} />
        )}
        <Text style={cardStyles.cardHeaderText}>Send Preview</Text>
        <View style={[cardStyles.modeBadge, mode === "private" ? cardStyles.modeBadgePrivate : cardStyles.modeBadgePublic]}>
          <Text style={[cardStyles.modeBadgeText, mode === "private" ? cardStyles.modeBadgeTextPrivate : cardStyles.modeBadgeTextPublic]}>{mode}</Text>
        </View>
      </View>
      <View style={cardStyles.detailRow}>
        <Text style={cardStyles.detailLabel}>Amount</Text>
        <Text style={cardStyles.detailValue}>{amount} {token}</Text>
      </View>
      <View style={cardStyles.detailRow}>
        <Text style={cardStyles.detailLabel}>To</Text>
        <Text style={cardStyles.detailValueMono}>{recipientName || truncateAddress(recipient)}</Text>
      </View>
    </View>
  );
}

function WardSummaryCardMobile({ name, address, guardian, frozen }: {
  name: string; address: string; guardian?: string; frozen?: boolean;
}) {
  return (
    <View style={cardStyles.cardContainer}>
      <View style={cardStyles.cardHeader}>
        <ShieldAlert size={14} color="#A78BFA" />
        <Text style={cardStyles.cardHeaderText}>Ward Account</Text>
        {frozen && (
          <View style={cardStyles.frozenBadge}>
            <Text style={cardStyles.frozenBadgeText}>Frozen</Text>
          </View>
        )}
      </View>
      <View style={cardStyles.detailRow}>
        <Text style={cardStyles.detailLabel}>Name</Text>
        <Text style={cardStyles.detailValue}>{name}</Text>
      </View>
      <View style={cardStyles.detailRow}>
        <Text style={cardStyles.detailLabel}>Address</Text>
        <Text style={cardStyles.detailValueMono}>{truncateAddress(address)}</Text>
      </View>
      {guardian && (
        <View style={cardStyles.detailRow}>
          <Text style={cardStyles.detailLabel}>Guardian</Text>
          <Text style={cardStyles.detailValueMono}>{truncateAddress(guardian)}</Text>
        </View>
      )}
    </View>
  );
}

function ErrorCardMobile({ title, message }: { title: string; message: string }) {
  return (
    <View style={cardStyles.errorContainer}>
      <AlertCircle size={14} color={colors.error} />
      <View style={{ flex: 1 }}>
        <Text style={cardStyles.errorTitle}>{title}</Text>
        <Text style={cardStyles.errorMessage}>{message}</Text>
      </View>
    </View>
  );
}

function AgentCardRendererMobile({ card }: { card: AgentCard }) {
  switch (card.type) {
    case "activity_list":
      return <ActivityListCardMobile items={card.items} total={card.total} />;
    case "session_list":
      return null;
    case "send_preview":
      return <SendPreviewCardMobile {...card} />;
    case "ward_summary":
      return <WardSummaryCardMobile {...card} />;
    case "error":
      return <ErrorCardMobile {...card} />;
    default:
      return null;
  }
}

export default function AgentScreen() {
  const wallet = useWallet();
  const { contacts } = useContacts();
  const { wards } = useWardContext();
  const { execute } = useTransactionRouter();
  const { showToast } = useToast();

  const voice = useVoiceAgent();

  const [serverUrl, setServerUrlState] = useState("");
  const [serverDraft, setServerDraft] = useState("");
  const [showServerModal, setShowServerModal] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);

  const [activeSession, setActiveSession] = useState<AgentSession | null>(null);
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; updatedAt: string }>>([]);
  const [input, setInput] = useState("");
  const [plan, setPlan] = useState<AgentPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const drawerAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  useEffect(() => {
    void refreshState();
  }, []);

  useEffect(() => {
    Animated.timing(drawerAnim, {
      toValue: showDrawer ? 0 : -DRAWER_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [showDrawer]);

  const mappedContacts = useMemo(
    () =>
      contacts.map((c) => ({
        id: c.id,
        nickname: c.nickname,
        tongoAddress: c.tongoAddress,
        starknetAddress: c.starknetAddress,
      })),
    [contacts],
  );

  const mappedWards = useMemo(
    () =>
      wards.map((w) => ({
        address: w.wardAddress,
        pseudoName: w.pseudoName,
      })),
    [wards],
  );

  async function refreshState(sessionId?: string) {
    setIsLoading(true);
    try {
      const data = await loadAgentState(sessionId);
      setActiveSession(data.session);
      setSessions(data.sessions);
      setServerUrlState(data.serverUrl);
      setServerDraft(data.serverUrl);
      setPlan(null);
    } catch (err: any) {
      const fallback = await getAgentServerUrl();
      setServerUrlState(fallback);
      setServerDraft(fallback);
      showToast(err?.message || "Unable to load agent state", "error");
    } finally {
      setIsLoading(false);
    }
  }

  async function submitMessage(message: string, overrideSessionId?: string | null) {
    if (!message.trim()) return;
    setIsSending(true);
    setInput("");

    // Optimistically append user message so the UI feels instant
    if (activeSession) {
      setActiveSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: [
            ...prev.messages,
            { id: `tmp_${Date.now()}`, role: "user" as const, text: message, createdAt: new Date().toISOString() },
          ],
        };
      });
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }

    try {
      const result = await sendAgentMessage({
        message,
        sessionId: overrideSessionId === undefined ? activeSession?.id : overrideSessionId || undefined,
        walletAddress: wallet.address || undefined,
        contacts: mappedContacts,
        wards: mappedWards,
      });
      setActiveSession(result.session);
      setSessions(result.sessions);
      setPlan(result.plan);
      setServerUrlState(result.serverUrl);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    } catch (err: any) {
      showToast(err?.message || "Agent request failed", "error");
    } finally {
      setIsSending(false);
    }
  }

  async function startNewSession() {
    setActiveSession(null);
    setPlan(null);
    setShowDrawer(false);
    await submitMessage("start new session", null);
  }

  async function selectSession(id: string) {
    setShowDrawer(false);
    await refreshState(id);
  }

  async function handleDeleteSession(id: string) {
    try {
      const result = await deleteAgentSession(id);
      setSessions(result.sessions);
      if (activeSession?.id === id) {
        setActiveSession(null);
        setPlan(null);
        if (result.sessions.length > 0) {
          await refreshState(result.sessions[0].id);
        } else {
          await refreshState();
        }
      }
    } catch (err: any) {
      showToast(err?.message || "Failed to delete session", "error");
    }
  }

  async function runPlan() {
    if (!plan?.requiresExecution || !plan.readyToExecute) return;

    const intent = plan.intent;
    const token = (intent.token || wallet.selectedToken || "STRK").toUpperCase();
    if (!(token in TOKENS)) {
      showToast(`Unsupported token ${token}`, "error");
      return;
    }

    setIsExecuting(true);
    try {
      if (intent.type === "send_private") {
        if (!intent.recipientTongoAddress) throw new Error("Missing recipient cloak address");
        if (!intent.amount) throw new Error("Missing amount");

        const cfg = TOKENS[token as keyof typeof TOKENS];
        const amountWei = parseTokenAmount(intent.amount, cfg.decimals);
        const units = amountWei / cfg.rate;
        if (units <= 0n) throw new Error("Amount too small for private transfer unit size");

        const tx = await execute({
          action: "transfer",
          token,
          amount: units.toString(),
          recipient: intent.recipientTongoAddress,
          recipientName: intent.recipientName,
          note: `Agent: ${intent.rawText}`,
        });

        await saveTxNote(tx.txHash, {
          txHash: tx.txHash,
          recipient: intent.recipientTongoAddress,
          recipientName: intent.recipientName,
          note: `Agent: ${intent.rawText}`,
          privacyLevel: "private",
          timestamp: Date.now(),
          type: "send",
          token,
          amount: intent.amount,
        });
      } else if (intent.type === "send_public") {
        if (!intent.recipientStarknetAddress) throw new Error("Missing recipient Starknet address");
        if (!intent.amount) throw new Error("Missing amount");

        const tx = await execute({
          action: "erc20_transfer",
          token,
          amount: intent.amount,
          recipient: intent.recipientStarknetAddress,
          recipientName: intent.recipientName,
          note: `Agent: ${intent.rawText}`,
        });

        await saveTxNote(tx.txHash, {
          txHash: tx.txHash,
          recipient: intent.recipientStarknetAddress,
          recipientName: intent.recipientName,
          note: `Agent: ${intent.rawText}`,
          privacyLevel: "public",
          timestamp: Date.now(),
          type: "erc20_transfer",
          token,
          amount: intent.amount,
        });
      }

      showToast("Agent payment submitted", "success");
      if (activeSession?.id) {
        await submitMessage("what are my previous sessions", activeSession.id);
      }
    } catch (err: any) {
      showToast(err?.message || "Failed to execute agent action", "error");
    } finally {
      setIsExecuting(false);
    }
  }

  async function saveServerConfig() {
    try {
      await setAgentServerUrl(serverDraft);
      const updated = await getAgentServerUrl();
      setServerUrlState(updated);
      setShowServerModal(false);
      showToast("Agent server saved", "success");
      await refreshState(activeSession?.id);
    } catch (err: any) {
      showToast(err?.message || "Failed to save server URL", "error");
    }
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <View style={styles.loadingIcon}>
          <Sparkles size={24} color={colors.primary} />
        </View>
        <Text style={styles.loadingText}>Connecting to agent...</Text>
      </View>
    );
  }

  const messages = activeSession?.messages || [];
  const hasMessages = messages.length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {/* ─── Server Config Modal ─── */}
      <Modal visible={showServerModal} transparent animationType="fade" onRequestClose={() => setShowServerModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Agent Server</Text>
              <TouchableOpacity onPress={() => setShowServerModal(false)}>
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>URL of the Next.js server this device can reach.</Text>
            <TextInput
              style={styles.modalInput}
              value={serverDraft}
              onChangeText={setServerDraft}
              placeholder="https://cloak-backend-vert.vercel.app"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowServerModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveServerConfig}>
                <Save size={14} color="#fff" />
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Sessions Drawer Overlay ─── */}
      {showDrawer && (
        <TouchableOpacity
          style={styles.drawerOverlay}
          activeOpacity={1}
          onPress={() => setShowDrawer(false)}
        />
      )}

      {/* ─── Sessions Drawer ─── */}
      <Animated.View style={[styles.drawer, { transform: [{ translateX: drawerAnim }] }]}>
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>Sessions</Text>
          <TouchableOpacity onPress={() => setShowDrawer(false)}>
            <X size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.newSessionBtn} onPress={startNewSession}>
          <Plus size={16} color="#fff" />
          <Text style={styles.newSessionText}>New Session</Text>
        </TouchableOpacity>

        <ScrollView style={styles.drawerList} contentContainerStyle={{ gap: 6, paddingBottom: 24 }}>
          {sessions.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.drawerItem, activeSession?.id === s.id && styles.drawerItemActive]}
              onPress={() => void selectSession(s.id)}
            >
              <View style={styles.drawerItemRow}>
                <MessageSquare size={14} color={activeSession?.id === s.id ? colors.primaryLight : colors.textMuted} />
                <Text
                  style={[styles.drawerItemTitle, activeSession?.id === s.id && styles.drawerItemTitleActive]}
                  numberOfLines={1}
                >
                  {s.title}
                </Text>
                <TouchableOpacity
                  style={styles.drawerItemDelete}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() => void handleDeleteSession(s.id)}
                >
                  <X size={12} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={styles.drawerItemMeta}>
                <Clock3 size={10} color={colors.textMuted} />
                <Text style={styles.drawerItemTime}>{formatTime(s.updatedAt)}</Text>
              </View>
            </TouchableOpacity>
          ))}
          {sessions.length === 0 && (
            <Text style={styles.drawerEmpty}>No sessions yet. Start chatting!</Text>
          )}
        </ScrollView>

        <TouchableOpacity style={styles.drawerServerBtn} onPress={() => { setShowDrawer(false); setShowServerModal(true); }}>
          <Server size={14} color={colors.textMuted} />
          <Text style={styles.drawerServerText} numberOfLines={1}>{serverUrl || "Configure server"}</Text>
          <ChevronRight size={14} color={colors.textMuted} />
        </TouchableOpacity>
      </Animated.View>

      {/* ─── Header ─── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => setShowDrawer(true)}>
          <MessageSquare size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Sparkles size={16} color={colors.primary} />
          <Text style={styles.headerTitle}>Agent</Text>
        </View>
        <TouchableOpacity style={styles.headerBtn} onPress={() => setShowServerModal(true)}>
          <Settings size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* ─── Chat Area ─── */}
      <ScrollView
        ref={scrollRef}
        style={styles.chatArea}
        contentContainerStyle={[styles.chatContent, !hasMessages && styles.chatContentEmpty]}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled"
      >
        {!hasMessages && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Bot size={32} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Agent Mode</Text>
            <Text style={styles.emptySubtitle}>
              Natural language commands for payments.{"\n"}
              Try one of the examples below.
            </Text>
            <View style={styles.exampleChips}>
              {[
                "Send 10 STRK to alice",
                "Transfer 5 USDC to bob public",
                "Show my history",
              ].map((ex) => (
                <TouchableOpacity
                  key={ex}
                  style={styles.exampleChip}
                  onPress={() => {
                    setInput(ex);
                  }}
                >
                  <Text style={styles.exampleChipText}>{ex}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {messages.map((m: AgentMessage) => (
          <View key={m.id}>
            <View style={m.role === "user" ? styles.messageRowUser : styles.messageRowAssistant}>
              {m.role === "assistant" && (
                <View style={styles.avatarBot}>
                  <Bot size={14} color={colors.primary} />
                </View>
              )}
              <View style={[styles.bubble, m.role === "user" ? styles.bubbleUser : styles.bubbleAssistant]}>
                <Text style={[styles.bubbleText, m.role === "user" && styles.bubbleTextUser]}>{m.text}</Text>
              </View>
            </View>
            {m.role === "assistant" && m.cards && m.cards.length > 0 && (
              <View style={styles.cardsContainer}>
                {m.cards.map((card, i) => (
                  <AgentCardRendererMobile key={i} card={card} />
                ))}
              </View>
            )}
          </View>
        ))}

        {isSending && (
          <View style={styles.messageRowAssistant}>
            <View style={styles.avatarBot}>
              <Bot size={14} color={colors.primary} />
            </View>
            <View style={[styles.bubble, styles.bubbleAssistant]}>
              <View style={styles.typingDots}>
                <View style={[styles.dot, styles.dot1]} />
                <View style={[styles.dot, styles.dot2]} />
                <View style={[styles.dot, styles.dot3]} />
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ─── Plan Card ─── */}
      {plan && (
        <View style={styles.planCard}>
          <View style={styles.planHeader}>
            <View style={styles.planBadge}>
              <Text style={styles.planBadgeText}>{formatIntentType(plan.intent.type)}</Text>
            </View>
            {plan.readyToExecute && (
              <View style={styles.readyBadge}>
                <Text style={styles.readyBadgeText}>Ready</Text>
              </View>
            )}
          </View>

          <View style={styles.planDetails}>
            {plan.intent.amount && (
              <View style={styles.planDetailRow}>
                <Text style={styles.planDetailLabel}>Amount</Text>
                <Text style={styles.planDetailValue}>
                  {plan.intent.amount} {plan.intent.token || "STRK"}
                </Text>
              </View>
            )}
            {plan.intent.recipientName && (
              <View style={styles.planDetailRow}>
                <Text style={styles.planDetailLabel}>To</Text>
                <Text style={styles.planDetailValue}>{plan.intent.recipientName}</Text>
              </View>
            )}
          </View>

          {plan.missing.length > 0 && (
            <View style={styles.missingRow}>
              <Text style={styles.missingLabel}>Missing:</Text>
              <Text style={styles.missingValue}>{plan.missing.join(", ").replace(/_/g, " ")}</Text>
            </View>
          )}

          {plan.requiresExecution && (
            <TouchableOpacity
              style={[styles.executeBtn, (!plan.readyToExecute || isExecuting) && styles.disabledBtn]}
              disabled={!plan.readyToExecute || isExecuting}
              onPress={runPlan}
            >
              {isExecuting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Play size={16} color="#fff" />
              )}
              <Text style={styles.executeBtnText}>
                {isExecuting ? "Executing..." : plan.readyToExecute ? "Execute Payment" : "Incomplete"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ─── Input Bar ─── */}
      <View style={styles.inputBar}>
        {voice.isRecording || voice.isTranscribing ? (
          /* Recording / Transcribing state */
          <View style={styles.voiceRow}>
            {voice.isRecording && (
              <View style={styles.recordingDot} />
            )}
            <Text style={styles.voiceStatusText}>
              {voice.isTranscribing
                ? "Transcribing..."
                : `Listening... ${Math.floor(voice.durationMs / 1000)}s`}
            </Text>
            {voice.isTranscribing && (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />
            )}
            <View style={{ flex: 1 }} />
            {voice.isRecording && (
              <TouchableOpacity
                style={styles.voiceStopBtn}
                onPress={async () => {
                  const result = await voice.stopAndTranscribe({
                    sessionId: activeSession?.id,
                    walletAddress: wallet.address || undefined,
                    contacts: mappedContacts,
                    wards: mappedWards,
                  });
                  if (result) {
                    setActiveSession(result.session);
                    setSessions(result.sessions);
                    if (result.plan) setPlan(result.plan);
                    setServerUrlState(result.serverUrl);
                    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
                  }
                }}
              >
                <Send size={18} color="#fff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.voiceCancelBtn}
              onPress={voice.cancel}
            >
              <X size={16} color={colors.error} />
            </TouchableOpacity>
          </View>
        ) : (
          /* Normal text input */
          <>
            <TouchableOpacity
              style={styles.micBtn}
              onPress={async () => {
                const ok = await voice.startRecording();
                if (!ok) {
                  showToast("Microphone permission denied or audio module not available", "error");
                }
              }}
              disabled={isSending}
            >
              <Mic size={18} color={colors.primary} />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Type a command..."
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={() => {
                if (input.trim()) void submitMessage(input);
              }}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (isSending || !input.trim()) && styles.sendBtnDisabled]}
              disabled={isSending || !input.trim()}
              onPress={() => void submitMessage(input)}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Send size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    gap: spacing.md,
  },
  loadingIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryDim,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: colors.textMuted,
    fontFamily: typography.secondary,
    fontSize: fontSize.sm,
  },

  // ─── Header ───
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontFamily: typography.primarySemibold,
  },

  // ─── Chat Area ───
  chatArea: {
    flex: 1,
  },
  chatContent: {
    padding: spacing.md,
    gap: 12,
    paddingBottom: spacing.lg,
  },
  chatContentEmpty: {
    flex: 1,
    justifyContent: "center",
  },

  // ─── Empty State ───
  emptyState: {
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryDim,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontFamily: typography.primarySemibold,
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontFamily: typography.secondary,
    textAlign: "center",
    lineHeight: 20,
  },
  exampleChips: {
    gap: spacing.sm,
    marginTop: spacing.sm,
    width: "100%",
  },
  exampleChip: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  exampleChipText: {
    color: colors.primaryLight,
    fontSize: fontSize.sm,
    fontFamily: typography.secondary,
    textAlign: "center",
  },

  cardsContainer: {
    marginLeft: 36, // align with bot bubble (avatar 28 + gap 8)
    marginTop: 4,
    gap: 6,
    maxWidth: "80%" as any,
  },

  // ─── Messages ───
  messageRowUser: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  messageRowAssistant: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  avatarBot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryDim,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: borderRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontFamily: typography.secondary,
    lineHeight: 20,
  },
  bubbleTextUser: {
    color: "#fff",
  },

  // ─── Typing indicator ───
  typingDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textMuted,
  },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.6 },
  dot3: { opacity: 0.8 },

  // ─── Plan Card ───
  planCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 10,
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  planBadge: {
    backgroundColor: colors.primaryDim,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  planBadgeText: {
    color: colors.primaryLight,
    fontSize: 11,
    fontFamily: typography.primarySemibold,
  },
  readyBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  readyBadgeText: {
    color: colors.success,
    fontSize: 11,
    fontFamily: typography.primarySemibold,
  },
  planDetails: {
    gap: 4,
  },
  planDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  planDetailLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: typography.secondary,
    width: 50,
  },
  planDetailValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontFamily: typography.secondarySemibold,
  },
  missingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  missingLabel: {
    color: colors.warning,
    fontSize: 12,
    fontFamily: typography.secondary,
  },
  missingValue: {
    color: colors.warning,
    fontSize: 12,
    fontFamily: typography.secondary,
    opacity: 0.8,
  },
  executeBtn: {
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  executeBtnText: {
    color: "#fff",
    fontSize: fontSize.sm,
    fontFamily: typography.primarySemibold,
  },
  disabledBtn: {
    opacity: 0.45,
  },

  // ─── Input Bar ───
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.md,
    height: 44,
    fontFamily: typography.secondary,
    fontSize: fontSize.sm,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryDim,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.error,
  },
  voiceStatusText: {
    color: colors.text,
    fontFamily: typography.secondary,
    fontSize: fontSize.sm,
  },
  voiceStopBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceCancelBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },

  // ─── Drawer ───
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 10,
  },
  drawer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: colors.bg,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    zIndex: 20,
    paddingTop: Platform.OS === "ios" ? 8 : 0,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  drawerTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontFamily: typography.primarySemibold,
  },
  newSessionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    height: 42,
    marginBottom: spacing.md,
  },
  newSessionText: {
    color: "#fff",
    fontSize: fontSize.sm,
    fontFamily: typography.primarySemibold,
  },
  drawerList: {
    flex: 1,
  },
  drawerItem: {
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: 4,
  },
  drawerItemActive: {
    backgroundColor: colors.primaryDim,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.3)",
  },
  drawerItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  drawerItemTitle: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontFamily: typography.secondary,
    flex: 1,
  },
  drawerItemDelete: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  drawerItemTitleActive: {
    color: colors.primaryLight,
  },
  drawerItemMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 22,
  },
  drawerItemTime: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: typography.secondary,
  },
  drawerEmpty: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontFamily: typography.secondary,
    textAlign: "center",
    paddingTop: spacing.xl,
  },
  drawerServerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  drawerServerText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: typography.secondary,
  },

  // ─── Server Modal ───
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    width: "100%",
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontFamily: typography.primarySemibold,
  },
  modalHint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontFamily: typography.secondary,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: typography.secondary,
    paddingHorizontal: spacing.sm,
    height: 44,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  modalCancelBtn: {
    height: 38,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: {
    color: colors.textMuted,
    fontFamily: typography.secondary,
  },
  modalSaveBtn: {
    height: 38,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  modalSaveText: {
    color: "#fff",
    fontFamily: typography.primarySemibold,
  },
});

const cardStyles = StyleSheet.create({
  cardContainer: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cardHeaderText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: typography.primarySemibold,
    flex: 1,
  },
  cardHeaderMeta: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: typography.secondary,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  activityRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  activityIcon: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  activityContent: {
    flex: 1,
  },
  activityTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  activityType: {
    color: colors.text,
    fontSize: 12,
    fontFamily: typography.secondarySemibold,
    textTransform: "capitalize",
  },
  activityAmount: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: typography.secondary,
  },
  activityBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  activityStatus: {
    fontSize: 10,
    fontFamily: typography.secondary,
    textTransform: "capitalize",
  },
  activityTime: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: typography.secondary,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  detailLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: typography.secondary,
  },
  detailValue: {
    color: colors.text,
    fontSize: 13,
    fontFamily: typography.secondarySemibold,
  },
  detailValueMono: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: typography.secondary,
  },
  modeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  modeBadgePrivate: {
    backgroundColor: "rgba(59,130,246,0.15)",
  },
  modeBadgePublic: {
    backgroundColor: "rgba(16,185,129,0.15)",
  },
  modeBadgeText: {
    fontSize: 10,
    fontFamily: typography.primarySemibold,
  },
  modeBadgeTextPrivate: {
    color: colors.primaryLight,
  },
  modeBadgeTextPublic: {
    color: colors.success,
  },
  frozenBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: "rgba(239,68,68,0.15)",
  },
  frozenBadgeText: {
    color: colors.error,
    fontSize: 10,
    fontFamily: typography.primarySemibold,
  },
  errorContainer: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
    backgroundColor: "rgba(239,68,68,0.05)",
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 10,
    gap: 8,
  },
  errorTitle: {
    color: "#FCA5A5",
    fontSize: 12,
    fontFamily: typography.primarySemibold,
  },
  errorMessage: {
    color: "rgba(252,165,165,0.7)",
    fontSize: 11,
    fontFamily: typography.secondary,
    marginTop: 2,
  },
});
