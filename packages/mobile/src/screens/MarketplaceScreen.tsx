import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ArrowLeft, RefreshCw, Search, ShieldCheck, Sparkles } from "lucide-react-native";
import type { AgentProfileResponse } from "@cloak-wallet/sdk";
import {
  discoverMarketplaceAgents,
  executeMarketplacePaidRun,
  hireMarketplaceAgent,
} from "../lib/marketplaceApi";
import { useWallet } from "../lib/WalletContext";
import { borderRadius, colors, fontSize, spacing, typography } from "../lib/theme";

type AgentCard = AgentProfileResponse & { discovery_score?: number };

const CAPABILITY_FILTERS = ["", "stake", "dispatch", "swap", "x402_shielded"] as const;
const ACTIONS_BY_AGENT_TYPE: Record<AgentProfileResponse["agent_type"], string[]> = {
  staking_steward: ["stake", "unstake", "rebalance"],
  treasury_dispatcher: ["dispatch_batch", "sweep_idle"],
  swap_runner: ["swap", "dca_tick"],
};

function defaultRunParamsForAction(action: string): string {
  if (action === "stake") {
    return JSON.stringify(
      {
        pool: "starkzap-staking",
        amount: "25",
      },
      null,
      2,
    );
  }
  if (action === "dispatch_batch") {
    return JSON.stringify(
      {
        transfers: [
          {
            token: "USDC",
            amount: "5",
            to: "0xrecipient",
          },
        ],
      },
      null,
      2,
    );
  }
  return JSON.stringify(
    {
      from_token: "USDC",
      to_token: "STRK",
      amount: "25",
    },
    null,
    2,
  );
}

export default function MarketplaceScreen() {
  const navigation = useNavigation<any>();
  const wallet = useWallet();
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [hiringAgent, setHiringAgent] = useState<string | null>(null);
  const [capability, setCapability] = useState<(typeof CAPABILITY_FILTERS)[number]>("");
  const [searchText, setSearchText] = useState("");
  const [policyDraft, setPolicyDraft] = useState(
    JSON.stringify(
      {
        max_usd_per_run: 25,
        allowed_actions: ["stake", "dispatch", "swap"],
      },
      null,
      2,
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [hireIdsByAgent, setHireIdsByAgent] = useState<Record<string, string>>({});
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [runAction, setRunAction] = useState("swap");
  const [runParamsDraft, setRunParamsDraft] = useState(defaultRunParamsForAction("swap"));
  const [runPayerAddress, setRunPayerAddress] = useState("tongo-mobile-operator");

  const filteredAgents = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return agents;
    return agents.filter(agent => {
      const haystack = `${agent.name} ${agent.description} ${agent.agent_type}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [agents, searchText]);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const discovered = await discoverMarketplaceAgents({
        wallet: {
          walletAddress: wallet.keys?.starkAddress,
          publicKey: wallet.keys?.starkPublicKey,
        },
        capability: capability || undefined,
        limit: 50,
        offset: 0,
      });
      setAgents(discovered);
    } catch (err: any) {
      setError(err?.message || "Failed to load marketplace agents");
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [capability, wallet.keys?.starkPublicKey, wallet.keys?.starkAddress]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const createHire = useCallback(
    async (agent: AgentCard) => {
      setHiringAgent(agent.agent_id);
      setError(null);
      setStatus(null);
      try {
        let policySnapshot: Record<string, unknown> = {};
        try {
          policySnapshot = JSON.parse(policyDraft) as Record<string, unknown>;
        } catch {
          throw new Error("Policy JSON is invalid");
        }

        const hire = await hireMarketplaceAgent({
          wallet: {
            walletAddress: wallet.keys?.starkAddress,
            publicKey: wallet.keys?.starkPublicKey,
          },
          agentId: agent.agent_id,
          policySnapshot,
          billingMode: "per_run",
        });
        setHireIdsByAgent(prev => ({
          ...prev,
          [agent.agent_id]: hire.id,
        }));
        const defaultActions = ACTIONS_BY_AGENT_TYPE[agent.agent_type];
        if (defaultActions.length > 0) {
          const nextAction = defaultActions[0];
          setRunAction(nextAction);
          setRunParamsDraft(defaultRunParamsForAction(nextAction));
        }
        setStatus(`Hire created for ${agent.name}: ${hire.id}`);
      } catch (err: any) {
        setError(err?.message || "Failed to hire agent");
      } finally {
        setHiringAgent(null);
      }
    },
    [policyDraft, wallet.keys?.starkPublicKey, wallet.keys?.starkAddress],
  );

  const runPaidExecution = useCallback(
    async (agent: AgentCard) => {
      const hireId = hireIdsByAgent[agent.agent_id];
      if (!hireId) {
        setError("Create a hire before running paid execution");
        return;
      }
      const normalizedAction = runAction.trim().toLowerCase();
      const supportedActions = ACTIONS_BY_AGENT_TYPE[agent.agent_type] ?? [];
      if (supportedActions.length > 0 && !supportedActions.includes(normalizedAction)) {
        setError(
          `Action "${normalizedAction}" is not supported for ${agent.name}. Supported actions: ${supportedActions.join(", ")}`,
        );
        return;
      }

      setRunningAgent(agent.agent_id);
      setError(null);
      setStatus(null);
      try {
        let params: Record<string, unknown> = {};
        try {
          params = JSON.parse(runParamsDraft) as Record<string, unknown>;
        } catch {
          throw new Error("Run params JSON is invalid");
        }

        const run = await executeMarketplacePaidRun({
          hireId,
          agentId: agent.agent_id,
          action: normalizedAction,
          params,
          payerTongoAddress: runPayerAddress,
        });
        setStatus(`Paid run completed: ${run.id}`);
        navigation.navigate("MarketplaceRunDetail", {
          run,
          agentName: agent.name,
        });
      } catch (err: any) {
        setError(err?.message || "Failed to execute paid run");
      } finally {
        setRunningAgent(null);
      }
    },
    [hireIdsByAgent, navigation, runAction, runParamsDraft, runPayerAddress],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={16} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Sparkles size={15} color={colors.primaryLight} />
          <Text style={styles.headerTitle}>Agent Marketplace</Text>
        </View>
        <TouchableOpacity style={styles.backButton} onPress={() => void loadAgents()}>
          <RefreshCw size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.filtersCard}>
        <View style={styles.searchWrap}>
          <Search size={14} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search agents"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={styles.capabilityRow}>
          {CAPABILITY_FILTERS.map(option => {
            const label = option || "all";
            const selected = capability === option;
            return (
              <TouchableOpacity
                key={label}
                style={[styles.capabilityChip, selected && styles.capabilityChipActive]}
                onPress={() => setCapability(option)}
              >
                <Text style={[styles.capabilityText, selected && styles.capabilityTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.policyCard}>
        <Text style={styles.policyTitle}>Hire policy JSON</Text>
        <TextInput
          style={styles.policyInput}
          value={policyDraft}
          onChangeText={setPolicyDraft}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
        />
      </View>

      <View style={styles.policyCard}>
        <Text style={styles.policyTitle}>Paid run config (x402)</Text>
        <TextInput
          style={styles.singleLineInput}
          value={runAction}
          onChangeText={setRunAction}
          placeholder="Action (swap/stake/dispatch_batch)"
          placeholderTextColor={colors.textMuted}
        />
        <TextInput
          style={styles.singleLineInput}
          value={runPayerAddress}
          onChangeText={setRunPayerAddress}
          placeholder="Payer tongo address"
          placeholderTextColor={colors.textMuted}
        />
        <TextInput
          style={styles.policyInput}
          value={runParamsDraft}
          onChangeText={setRunParamsDraft}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
        />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {status ? <Text style={styles.statusText}>{status}</Text> : null}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Loading agents…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {filteredAgents.length === 0 ? (
            <Text style={styles.emptyText}>No agents matched current filters.</Text>
          ) : (
            filteredAgents.map(agent => (
              <View key={agent.agent_id} style={styles.agentCard}>
                <View style={styles.agentHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.agentName}>{agent.name}</Text>
                    <Text style={styles.agentType}>{agent.agent_type}</Text>
                  </View>
                  <View style={styles.scorePill}>
                    <Text style={styles.scoreText}>score {agent.discovery_score ?? agent.trust_score}</Text>
                  </View>
                </View>
                <Text style={styles.agentDescription}>{agent.description}</Text>
                <View style={styles.metaRow}>
                  <ShieldCheck size={12} color={agent.verified ? colors.success : colors.warning} />
                  <Text style={styles.metaText}>
                    {agent.verified ? "verified" : "unverified"} · trust {agent.trust_score}
                  </Text>
                </View>
                <View style={styles.capabilityRow}>
                  {agent.capabilities.slice(0, 5).map(cap => (
                    <View key={`${agent.agent_id}-${cap}`} style={styles.capabilityTag}>
                      <Text style={styles.capabilityTagText}>{cap}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  style={styles.hireButton}
                  disabled={hiringAgent === agent.agent_id}
                  onPress={() => void createHire(agent)}
                >
                  {hiringAgent === agent.agent_id ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.hireButtonText}>
                      {hireIdsByAgent[agent.agent_id] ? "Hire active" : "Hire agent"}
                    </Text>
                  )}
                </TouchableOpacity>
                {hireIdsByAgent[agent.agent_id] ? (
                  <Text style={styles.hireIdText}>hire: {hireIdsByAgent[agent.agent_id]}</Text>
                ) : null}
                <TouchableOpacity
                  style={[
                    styles.runButton,
                    !hireIdsByAgent[agent.agent_id] && styles.runButtonDisabled,
                  ]}
                  disabled={
                    !hireIdsByAgent[agent.agent_id] || runningAgent === agent.agent_id
                  }
                  onPress={() => void runPaidExecution(agent)}
                >
                  {runningAgent === agent.agent_id ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.runButtonText}>Run paid action</Text>
                  )}
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontFamily: typography.primarySemibold,
  },
  filtersCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.inputBg,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    height: 38,
    color: colors.text,
    fontFamily: typography.secondary,
    fontSize: fontSize.sm,
  },
  capabilityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  capabilityChip: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  capabilityChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryDim,
  },
  capabilityText: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontFamily: typography.secondary,
  },
  capabilityTextActive: {
    color: colors.primaryLight,
    fontFamily: typography.secondarySemibold,
  },
  policyCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  policyTitle: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontFamily: typography.secondarySemibold,
  },
  policyInput: {
    minHeight: 92,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.inputBg,
    color: colors.text,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: fontSize.xs,
    fontFamily: typography.primary,
    textAlignVertical: "top",
  },
  singleLineInput: {
    height: 38,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.inputBg,
    color: colors.text,
    paddingHorizontal: spacing.sm,
    fontSize: fontSize.xs,
    fontFamily: typography.primary,
  },
  errorText: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    color: colors.error,
    fontSize: fontSize.xs,
    fontFamily: typography.secondary,
  },
  statusText: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    color: colors.success,
    fontSize: fontSize.xs,
    fontFamily: typography.secondary,
  },
  loadingWrap: {
    marginTop: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontFamily: typography.secondary,
  },
  list: {
    flex: 1,
    marginTop: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.lg,
    fontSize: fontSize.sm,
    fontFamily: typography.secondary,
  },
  agentCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  agentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  agentName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontFamily: typography.primarySemibold,
  },
  agentType: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontFamily: typography.secondary,
  },
  scorePill: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  scoreText: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontFamily: typography.secondary,
  },
  agentDescription: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontFamily: typography.secondary,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontFamily: typography.secondary,
  },
  capabilityTag: {
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryDim,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  capabilityTagText: {
    color: colors.primaryLight,
    fontSize: fontSize.xs,
    fontFamily: typography.secondary,
  },
  hireButton: {
    marginTop: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primary,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  hireButtonText: {
    color: "#fff",
    fontSize: fontSize.sm,
    fontFamily: typography.primarySemibold,
  },
  hireIdText: {
    color: colors.success,
    fontSize: fontSize.xs,
    fontFamily: typography.primary,
  },
  runButton: {
    marginTop: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.secondary,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  runButtonDisabled: {
    opacity: 0.45,
  },
  runButtonText: {
    color: "#fff",
    fontSize: fontSize.xs,
    fontFamily: typography.primarySemibold,
  },
});
