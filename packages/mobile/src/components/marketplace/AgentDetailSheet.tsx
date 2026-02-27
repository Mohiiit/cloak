/**
 * Full-screen modal showing agent details with hire/run actions.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import {
  X,
  Sparkles,
  ShieldCheck,
  Zap,
  ChevronRight,
  AlertCircle,
} from "lucide-react-native";
import type { AgentProfileResponse, DelegationResponse } from "@cloak-wallet/sdk";
import { listMarketplaceDelegations } from "../../lib/marketplaceApi";
import { colors, spacing, fontSize, borderRadius, typography } from "../../lib/theme";
import HireModal from "./HireModal";
import RunActionModal from "./RunActionModal";

interface AgentDetailSheetProps {
  agent: AgentProfileResponse & { discovery_score?: number };
  isHired: boolean;
  hireId?: string;
  visible: boolean;
  onClose: () => void;
  onHired: (agentId: string, hireId: string) => void;
  walletAddress?: string;
  publicKey?: string;
}

/** Convert a wei string to human-readable with up to 4 significant decimals. */
function fromWei(wei: string | undefined, token: string): string {
  if (!wei) return "0";
  const decimals = token === "USDC" ? 6 : 18;
  try {
    const raw = BigInt(wei);
    const divisor = 10n ** BigInt(decimals);
    const whole = raw / divisor;
    const frac = raw % divisor;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
    return `${whole}.${fracStr.slice(0, 4)}`;
  } catch {
    return wei;
  }
}

const AGENT_TYPE_COLORS: Record<string, string> = {
  staking_steward: colors.success,
  treasury_dispatcher: colors.warning,
  swap_runner: colors.primary,
};

const AGENT_TYPE_LABELS: Record<string, string> = {
  staking_steward: "Staking Steward",
  treasury_dispatcher: "Treasury Dispatcher",
  swap_runner: "Swap Runner",
};

function extractFee(agent: AgentProfileResponse): { display: string; amount: string } {
  const pricing = agent.pricing as Record<string, unknown> | undefined;
  const rawAmount = String(pricing?.amount ?? "");
  if (!rawAmount || rawAmount === "undefined") return { display: "Free", amount: "0" };
  const num = parseFloat(rawAmount);
  if (isNaN(num) || num === 0) return { display: "Free", amount: "0" };
  return { display: `${num} shielded unit${num === 1 ? "" : "s"} (${(num * 0.05).toFixed(2)} STRK)`, amount: rawAmount };
}

export default function AgentDetailSheet({
  agent,
  isHired,
  hireId,
  visible,
  onClose,
  onHired,
  walletAddress,
  publicKey,
}: AgentDetailSheetProps) {
  const [delegations, setDelegations] = useState<DelegationResponse[]>([]);
  const [delegationLoading, setDelegationLoading] = useState(false);
  const [showHireModal, setShowHireModal] = useState(false);
  const [showRunModal, setShowRunModal] = useState(false);

  const typeColor = AGENT_TYPE_COLORS[agent.agent_type] || colors.textMuted;
  const typeLabel = AGENT_TYPE_LABELS[agent.agent_type] || agent.agent_type;
  const fee = extractFee(agent);

  const loadDelegations = useCallback(async () => {
    if (!isHired) return;
    setDelegationLoading(true);
    try {
      const result = await listMarketplaceDelegations({ agent_id: agent.agent_id });
      setDelegations(result.filter((d) => d.status === "active"));
    } catch {
      setDelegations([]);
    } finally {
      setDelegationLoading(false);
    }
  }, [agent.agent_id, isHired]);

  useEffect(() => {
    if (visible && isHired) {
      loadDelegations().catch(() => undefined);
    }
  }, [visible, isHired, loadDelegations]);

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Agent Details</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Agent identity */}
          <View style={styles.identitySection}>
            <View style={[styles.typeIconCircle, { backgroundColor: typeColor + "22" }]}>
              <Sparkles size={28} color={typeColor} />
            </View>
            <Text style={styles.agentName}>{agent.name}</Text>
            <View style={[styles.typeBadge, { backgroundColor: typeColor + "22", borderColor: typeColor + "55" }]}>
              <Text style={[styles.typeBadgeText, { color: typeColor }]}>{typeLabel}</Text>
            </View>
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.descriptionText}>{agent.description || "No description available."}</Text>
          </View>

          {/* Fee */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Fee</Text>
            <View style={styles.feeRow}>
              <Zap size={16} color={colors.warning} />
              <Text style={styles.feeText}>{fee.display}</Text>
              <Text style={styles.feeSubtext}>per run</Text>
            </View>
          </View>

          {/* Capabilities */}
          {agent.capabilities && agent.capabilities.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Capabilities</Text>
              <View style={styles.capabilityList}>
                {agent.capabilities.map((cap) => (
                  <View key={cap} style={styles.capabilityChip}>
                    <ShieldCheck size={12} color={colors.primaryLight} />
                    <Text style={styles.capabilityText}>{cap}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Hire status */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Status</Text>
            {isHired ? (
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <Text style={styles.statusActive}>Hired</Text>
              </View>
            ) : (
              <View style={styles.statusRow}>
                <AlertCircle size={14} color={colors.textMuted} />
                <Text style={styles.statusInactive}>Not hired — hire to run actions</Text>
              </View>
            )}
          </View>

          {/* Active delegations */}
          {isHired && delegations.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Active Delegations</Text>
              {delegationLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                delegations.map((dlg) => {
                  const tok = dlg.token || "STRK";
                  return (
                    <View key={dlg.id} style={styles.delegationCard}>
                      <Text style={styles.delegationToken}>{tok}</Text>
                      <Text style={styles.delegationAmount}>
                        Max/run: {fromWei(dlg.max_per_run, tok)} | Total: {fromWei(dlg.total_allowance, tok)} {tok}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </ScrollView>

        {/* Actions */}
        <View style={styles.actionBar}>
          {!isHired ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setShowHireModal(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.primaryButtonText}>Hire Agent</Text>
              <ChevronRight size={18} color={colors.text} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setShowRunModal(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.primaryButtonText}>Run Action</Text>
              <ChevronRight size={18} color={colors.text} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Sub-modals */}
      <HireModal
        visible={showHireModal}
        agent={agent}
        walletAddress={walletAddress}
        publicKey={publicKey}
        onClose={() => setShowHireModal(false)}
        onHired={(hId) => {
          setShowHireModal(false);
          onHired(agent.agent_id, hId);
        }}
      />

      {showRunModal && hireId && (
        <RunActionModal
          visible={showRunModal}
          agent={agent}
          hireId={hireId}
          onClose={() => setShowRunModal(false)}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontFamily: typography.primarySemibold,
    color: colors.text,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  identitySection: {
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  typeIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  agentName: {
    fontSize: fontSize.xl,
    fontFamily: typography.primarySemibold,
    color: colors.text,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: typography.primarySemibold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontFamily: typography.primarySemibold,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  descriptionText: {
    fontSize: fontSize.md,
    fontFamily: typography.secondary,
    color: colors.text,
    lineHeight: 22,
  },
  feeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  feeText: {
    fontSize: fontSize.lg,
    fontFamily: typography.primarySemibold,
    color: colors.text,
  },
  feeSubtext: {
    fontSize: fontSize.sm,
    fontFamily: typography.secondary,
    color: colors.textMuted,
  },
  capabilityList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  capabilityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primaryDim,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
  },
  capabilityText: {
    fontSize: fontSize.xs,
    fontFamily: typography.primary,
    color: colors.primaryLight,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  statusActive: {
    fontSize: fontSize.md,
    fontFamily: typography.secondarySemibold,
    color: colors.success,
  },
  statusInactive: {
    fontSize: fontSize.md,
    fontFamily: typography.secondary,
    color: colors.textMuted,
  },
  delegationCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  delegationToken: {
    fontSize: fontSize.sm,
    fontFamily: typography.primarySemibold,
    color: colors.primary,
    marginBottom: 2,
  },
  delegationAmount: {
    fontSize: fontSize.xs,
    fontFamily: typography.primary,
    color: colors.textSecondary,
  },
  actionBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    gap: spacing.sm,
  },
  primaryButtonText: {
    fontSize: fontSize.md,
    fontFamily: typography.primarySemibold,
    color: colors.text,
  },
});
