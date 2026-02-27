import React, { useMemo, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ClipboardLib from "@react-native-clipboard/clipboard";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  ExternalLink,
  Store,
  XCircle,
} from "lucide-react-native";
import type { RootStackParamList } from "../navigation/types";
import { borderRadius, colors, fontSize, spacing, typography } from "../lib/theme";

type Route = RouteProp<RootStackParamList, "MarketplaceRunDetail">;

const VOYAGER = "https://sepolia.voyager.online/tx/";

/** Token decimals for wei → human conversion. */
const TOKEN_DECIMALS: Record<string, number> = { STRK: 18, ETH: 18, USDC: 6 };

/** Convert a wei string to human-readable with up to 4 significant decimals. */
function fromWei(wei: string, token: string): string {
  const decimals = TOKEN_DECIMALS[token] ?? 18;
  const raw = BigInt(wei || "0");
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr.slice(0, 4)}`;
}

function trunc(hash: string, front = 8, back = 6): string {
  if (hash.length <= front + back + 3) return hash;
  return `${hash.slice(0, front)}...${hash.slice(-back)}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function prettyAction(action: string | undefined): string {
  if (!action) return "Agent Run";
  return action.replace(/^agent_/, "").split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/* ── Small components ───────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const c = status === "completed" ? colors.success : status === "failed" ? colors.error : colors.warning;
  const bg = status === "completed" ? "rgba(16,185,129,0.12)" : status === "failed" ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)";
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <View style={[styles.badgeDot, { backgroundColor: c }]} />
      <Text style={[styles.badgeText, { color: c }]}>{status.charAt(0).toUpperCase() + status.slice(1)}</Text>
    </View>
  );
}

/** Clickable hash chip — tap to copy, link icon opens Voyager */
function HashChip({ hash, voyager = true }: { hash: string; voyager?: boolean }) {
  const isTx = hash.startsWith("0x");
  return (
    <View style={styles.hashChip}>
      <Pressable onPress={() => ClipboardLib.setString(hash)} hitSlop={4}>
        <Text style={styles.hashChipText}>{trunc(hash)}</Text>
      </Pressable>
      <Pressable hitSlop={6} onPress={() => ClipboardLib.setString(hash)}>
        <Copy size={11} color={colors.textMuted} />
      </Pressable>
      {voyager && isTx ? (
        <Pressable hitSlop={6} onPress={() => Linking.openURL(`${VOYAGER}${hash}`).catch(() => {})}>
          <ExternalLink size={11} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function KVRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvKey}>{label}</Text>
      <Text style={[styles.kvVal, valueColor ? { color: valueColor } : undefined]} numberOfLines={1} ellipsizeMode="middle">{value}</Text>
    </View>
  );
}

function HashKVRow({ label, hash }: { label: string; hash: string }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvKey}>{label}</Text>
      <HashChip hash={hash} />
    </View>
  );
}

/* ── Pipeline step ──────────────────────────────────────────────────────── */

type StepStatus = "success" | "failed" | "pending" | "skipped";

function PipelineStep({ label, status, hashes, detail }: {
  label: string; status: StepStatus; hashes?: string[]; detail?: string;
}) {
  const c = status === "success" ? colors.success : status === "failed" ? colors.error : colors.textMuted;
  const Icon = status === "success" ? CheckCircle2 : status === "failed" ? XCircle : Circle;
  const dim = status === "skipped";

  return (
    <View style={styles.step}>
      <Icon size={16} color={c} />
      <View style={styles.stepBody}>
        <Text style={[styles.stepLabel, dim && { color: colors.textMuted }]}>{label}</Text>
        {hashes && hashes.length > 0 ? (
          <View style={styles.stepHashes}>
            {hashes.map((h) => <HashChip key={h} hash={h} />)}
          </View>
        ) : detail ? (
          <Text style={styles.stepDetail}>{detail}</Text>
        ) : dim ? (
          <Text style={styles.stepDetail}>Not required</Text>
        ) : null}
      </View>
    </View>
  );
}

/* ── Collapsible ────────────────────────────────────────────────────────── */

function Collapsible({ title, children, open: defaultOpen = false }: {
  title: string; children: React.ReactNode; open?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.collapsible}>
      <Pressable style={styles.collapsibleTrigger} onPress={() => setOpen(!open)}>
        <Text style={styles.sectionLabel}>{title}</Text>
        {open ? <ChevronUp size={16} color={colors.textMuted} /> : <ChevronDown size={16} color={colors.textMuted} />}
      </Pressable>
      {open ? <View style={styles.card}>{children}</View> : null}
    </View>
  );
}

/* ── Screen ─────────────────────────────────────────────────────────────── */

export default function MarketplaceRunDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<Route>();
  const run = route.params.run;

  const params = run.params as Record<string, unknown>;
  const action = prettyAction(run.action);
  const token = (params?.token as string) || "STRK";
  const amount = params?.amount as string | undefined;

  const statusColor = useMemo(() => {
    if (run.status === "completed") return colors.success;
    if (run.status === "failed") return colors.error;
    return colors.warning;
  }, [run.status]);

  const pipeline = useMemo(() => {
    const s: { label: string; status: StepStatus; hashes?: string[]; detail?: string }[] = [];

    const hasRef = !!run.payment_ref;
    s.push({ label: "x402 Challenge", status: hasRef ? "success" : run.billable ? "pending" : "skipped", detail: hasRef ? run.payment_ref! : undefined });

    const hasSettle = !!run.settlement_tx_hash;
    s.push({ label: "Fee Payment", status: hasSettle ? "success" : run.status === "pending_payment" ? "failed" : run.billable ? "pending" : "skipped", hashes: hasSettle ? [run.settlement_tx_hash!] : undefined });

    const hasPE = !!run.payment_evidence;
    s.push({ label: "Settlement Verified", status: hasPE ? "success" : hasSettle ? "pending" : "skipped", detail: run.payment_evidence?.state || undefined });

    const de = run.delegation_evidence;
    const dHashes: string[] = [];
    if (de?.delegation_consume_tx_hash) dHashes.push(de.delegation_consume_tx_hash);
    // Only add escrow hash if it's different from consume hash (often the same tx)
    if (de?.escrow_transfer_tx_hash && de.escrow_transfer_tx_hash !== de.delegation_consume_tx_hash) {
      dHashes.push(de.escrow_transfer_tx_hash);
    }
    s.push({ label: "Delegation", status: de ? "success" : "skipped", hashes: dHashes.length ? dHashes : undefined, detail: de ? `${fromWei(de.consumed_amount, token)}/${fromWei(de.authorized_amount, token)} ${token} used` : undefined });

    const eH = run.execution_tx_hashes ?? [];
    s.push({ label: "Agent Executed", status: eH.length ? "success" : run.status === "failed" ? "failed" : run.status === "running" ? "pending" : "skipped", hashes: eH.length ? eH : undefined });

    return s;
  }, [run]);

  const extraParams = useMemo(() => {
    const rows: { label: string; value: string }[] = [];
    for (const [key, val] of Object.entries(params || {})) {
      if (["token", "amount", "action", "amount_unit"].includes(key)) continue;
      if (val == null) continue;
      const d = typeof val === "object" ? JSON.stringify(val) : String(val);
      if (d.length > 120) continue;
      rows.push({ label: key.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "), value: d });
    }
    return rows;
  }, [params]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ArrowLeft size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Run Detail</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* ── Hero ─────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: `${statusColor}1A` }]}>
            <Store size={24} color={statusColor} />
          </View>
          <View style={styles.heroMeta}>
            <View style={styles.heroLine1}>
              <Text style={styles.heroAction}>{action}</Text>
              <StatusBadge status={run.status} />
            </View>
            <Text style={styles.heroSub}>
              {amount ? `${amount} ${token}` : token} · Agent {run.agent_id}
            </Text>
          </View>
        </View>

        {/* ── Pipeline (always open) ──────────────────────────── */}
        <Text style={[styles.sectionLabel, { marginBottom: 8 }]}>PIPELINE</Text>
        <View style={styles.card}>
          {pipeline.map((p) => (
            <PipelineStep key={p.label} {...p} />
          ))}
        </View>

        {/* ── Details (collapsible) ──────────────────────────── */}
        <Collapsible title="DETAILS & METADATA">
          <KVRow label="Action" value={action} />
          <KVRow label="Token" value={token} />
          {amount ? <KVRow label="Amount" value={amount} /> : null}
          {extraParams.map((r) => <KVRow key={r.label} label={r.label} value={r.value} />)}
          {run.payment_ref ? <HashKVRow label="Payment Ref" hash={run.payment_ref} /> : null}
          {run.settlement_tx_hash ? <HashKVRow label="Settlement Tx" hash={run.settlement_tx_hash} /> : null}
          {run.payment_evidence?.state ? (
            <KVRow label="Payment State" value={run.payment_evidence.state} valueColor={run.payment_evidence.state === "settled" ? colors.success : colors.warning} />
          ) : null}
          {run.execution_tx_hashes?.map((h, i) => (
            <HashKVRow key={h} label={`Execution Tx${run.execution_tx_hashes!.length > 1 ? ` ${i + 1}` : ""}`} hash={h} />
          ))}
          {run.delegation_evidence ? (
            <>
              <KVRow label="Delegation" value={`${fromWei(run.delegation_evidence.consumed_amount, token)}/${fromWei(run.delegation_evidence.authorized_amount, token)} ${token} used`} />
              {run.delegation_evidence.delegation_consume_tx_hash ? <HashKVRow label="Consume Tx" hash={run.delegation_evidence.delegation_consume_tx_hash} /> : null}
              {run.delegation_evidence.escrow_transfer_tx_hash ? <HashKVRow label="Escrow Tx" hash={run.delegation_evidence.escrow_transfer_tx_hash} /> : null}
            </>
          ) : null}
          {run.result && typeof (run.result as Record<string, unknown>).summary === "string" ? (
            <KVRow label="Result" value={(run.result as Record<string, unknown>).summary as string} valueColor={colors.success} />
          ) : null}
          {run.result && (run.result as Record<string, unknown>).unclaimed_rewards_wei ? (
            <KVRow label="Rewards Claimed" value={`${fromWei((run.result as Record<string, unknown>).unclaimed_rewards_wei as string, token)} ${token}`} valueColor={colors.success} />
          ) : null}
          {run.result && (run.result as Record<string, unknown>).total_staked_after_wei ? (
            <KVRow label="Total Staked After" value={`${fromWei((run.result as Record<string, unknown>).total_staked_after_wei as string, token)} ${token}`} />
          ) : null}
          {/* divider */}
          <View style={styles.divider} />
          <HashKVRow label="Run ID" hash={run.id} />
          <KVRow label="Agent" value={run.agent_id} />
          <HashKVRow label="Hire" hash={run.hire_id} />
          <KVRow label="Created" value={fmtDate(run.created_at)} />
          <KVRow label="Updated" value={fmtDate(run.updated_at)} />
        </Collapsible>

        {/* ── Voyager CTA ─────────────────────────────────────── */}
        {run.settlement_tx_hash ? (
          <Pressable style={styles.voyager} onPress={() => Linking.openURL(`${VOYAGER}${run.settlement_tx_hash}`).catch(() => {})}>
            <ExternalLink size={15} color={colors.primary} />
            <Text style={styles.voyagerText}>View on Voyager</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ── Styles ──────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  /* Header */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 52,
    paddingHorizontal: 16,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: colors.text,
    fontSize: 16,
    fontFamily: typography.primarySemibold,
  },

  body: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  /* Hero */
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    marginBottom: 4,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  heroMeta: { flex: 1, gap: 4 },
  heroLine1: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroAction: {
    color: colors.text,
    fontSize: 22,
    fontFamily: typography.primarySemibold,
  },
  heroSub: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: typography.primary,
  },

  /* Badge */
  badge: {
    height: 24,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontFamily: typography.primarySemibold },

  /* Section */
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 1.2,
    fontFamily: typography.primarySemibold,
  },

  /* Card */
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    overflow: "hidden",
    marginBottom: 16,
  },

  /* Pipeline */
  step: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  stepBody: { flex: 1, gap: 4 },
  stepLabel: { color: colors.text, fontSize: 14, fontFamily: typography.primarySemibold },
  stepDetail: { color: colors.textMuted, fontSize: 12, fontFamily: typography.primary },
  stepHashes: { gap: 4 },

  /* Hash chip */
  hashChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  hashChipText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: typography.primarySemibold,
  },

  /* KV rows */
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  kvKey: { color: colors.textMuted, fontSize: 13, fontFamily: typography.secondary },
  kvVal: {
    color: colors.text,
    fontSize: 13,
    fontFamily: typography.primarySemibold,
    flexShrink: 1,
    textAlign: "right",
    maxWidth: "58%",
  },
  hashActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },

  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
    marginVertical: 4,
  },

  /* Collapsible */
  collapsible: { marginBottom: 16 },
  collapsibleTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },

  /* Voyager */
  voyager: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  voyagerText: {
    color: colors.primary,
    fontSize: 14,
    fontFamily: typography.primarySemibold,
  },
});
