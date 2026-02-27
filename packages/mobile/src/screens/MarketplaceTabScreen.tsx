import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Search,
  X,
  TrendingUp,
  Wallet,
  ArrowLeftRight,
  ChevronRight,
  Sparkles,
} from "lucide-react-native";
import type { AgentProfileResponse } from "@cloak-wallet/sdk";
import {
  discoverMarketplaceAgents,
  listMarketplaceHires,
} from "../lib/marketplaceApi";
import { useWallet } from "../lib/WalletContext";
import {
  borderRadius,
  colors,
  fontSize,
  spacing,
  typography,
} from "../lib/theme";
import AgentDetailSheet from "../components/marketplace/AgentDetailSheet";

type AgentCard = AgentProfileResponse & { discovery_score?: number };

const CAPABILITY_FILTERS = [
  { key: "", label: "All" },
  { key: "stake", label: "Staking" },
  { key: "dispatch", label: "Treasury" },
  { key: "swap", label: "Swap" },
] as const;

type FilterKey = (typeof CAPABILITY_FILTERS)[number]["key"];

// ─── Agent type display config ───────────────────────────────────────────────

const AGENT_TYPE_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.FC<{ size: number; color: string }> }
> = {
  staking_steward: {
    label: "Staking",
    color: colors.success,
    icon: ({ size, color }) => <TrendingUp size={size} color={color} />,
  },
  treasury_dispatcher: {
    label: "Treasury",
    color: colors.warning,
    icon: ({ size, color }) => <Wallet size={size} color={color} />,
  },
  swap_runner: {
    label: "Swap",
    color: colors.primary,
    icon: ({ size, color }) => <ArrowLeftRight size={size} color={color} />,
  },
};

function getTypeConfig(agentType: string) {
  return (
    AGENT_TYPE_CONFIG[agentType] || {
      label: agentType.replace(/_/g, " "),
      color: colors.textMuted,
      icon: ({ size, color }: { size: number; color: string }) => (
        <Sparkles size={size} color={color} />
      ),
    }
  );
}

/** Extract fee from agent pricing object: { mode, amount, token } */
function extractFee(agent: AgentCard): { amount: string; token: string } {
  const pricing = agent.pricing as Record<string, unknown> | undefined;
  const amount = String(pricing?.amount ?? "");
  const token = String(pricing?.token ?? "STRK").toUpperCase();
  return { amount, token };
}

function formatFee(rawAmount: string): string {
  if (!rawAmount || rawAmount === "undefined" || rawAmount === "null") return "Free";
  const num = parseFloat(rawAmount);
  if (isNaN(num) || num === 0) return "Free";
  return `${num} unit${num === 1 ? "" : "s"} (${(num * 0.05).toFixed(2)} STRK)`;
}

/** Deduplicate agents — keep one per agent_type, prefer the one with a real description. */
function deduplicateAgents(agents: AgentCard[]): AgentCard[] {
  const byType = new Map<string, AgentCard>();
  for (const agent of agents) {
    const existing = byType.get(agent.agent_type);
    if (!existing) {
      byType.set(agent.agent_type, agent);
      continue;
    }
    // Prefer the one with a description, then the one without "Live" prefix
    const existingHasDesc = !!existing.description?.trim();
    const newHasDesc = !!agent.description?.trim();
    if (newHasDesc && !existingHasDesc) {
      byType.set(agent.agent_type, agent);
    } else if (newHasDesc === existingHasDesc && !agent.name.startsWith("Live ")) {
      byType.set(agent.agent_type, agent);
    }
  }
  return Array.from(byType.values());
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MarketplaceTabScreen() {
  const { keys } = useWallet();

  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [capability, setCapability] = useState<FilterKey>("");
  const [hiredAgentIds, setHiredAgentIds] = useState<Set<string>>(new Set());
  const [hireIdsByAgent, setHireIdsByAgent] = useState<Record<string, string>>({});
  const [selectedAgent, setSelectedAgent] = useState<AgentCard | null>(null);

  const walletContext = useMemo(
    () =>
      keys
        ? { walletAddress: keys.starkAddress, publicKey: keys.starkPublicKey }
        : undefined,
    [keys],
  );

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const result = await discoverMarketplaceAgents({
        wallet: walletContext,
        limit: 50,
      });
      setAgents(deduplicateAgents(result));
    } catch (err) {
      console.warn("[MarketplaceTab] Failed to load agents:", err);
    } finally {
      setLoading(false);
    }
  }, [walletContext]);

  const loadHires = useCallback(async () => {
    try {
      const hires = await listMarketplaceHires({
        wallet: walletContext,
        status: "active",
      });
      setHiredAgentIds(new Set(hires.map((h) => h.agent_id)));
      const idMap: Record<string, string> = {};
      for (const h of hires) {
        if (h.agent_id && h.id && !idMap[h.agent_id]) idMap[h.agent_id] = h.id;
      }
      setHireIdsByAgent(idMap);
    } catch (err) {
      console.warn("[MarketplaceTab] Failed to load hires:", err);
    }
  }, [walletContext]);

  useEffect(() => {
    loadAgents();
    loadHires();
  }, [loadAgents, loadHires]);

  const filteredAgents = useMemo(() => {
    let result = agents;

    if (capability) {
      result = result.filter(
        (a) => a.capabilities && a.capabilities.includes(capability),
      );
    }

    if (searchText.trim()) {
      const query = searchText.trim().toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(query) ||
          (a.description && a.description.toLowerCase().includes(query)),
      );
    }

    return result;
  }, [agents, capability, searchText]);

  const handleCardPress = useCallback((agent: AgentCard) => {
    setSelectedAgent(agent);
  }, []);

  const handleDetailClose = useCallback(() => {
    setSelectedAgent(null);
  }, []);

  const handleHired = useCallback((_agentId: string, _hireId: string) => {
    loadHires();
  }, [loadHires]);

  // ─── Render ──────────────────────────────────────────────────────────────

  const renderAgentCard = useCallback(
    ({ item }: { item: AgentCard }) => {
      const config = getTypeConfig(item.agent_type);
      const isHired = hiredAgentIds.has(item.agent_id);
      const IconComp = config.icon;
      const { amount: feeAmount } = extractFee(item);
      const fee = formatFee(feeAmount);

      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.7}
          onPress={() => handleCardPress(item)}
        >
          {/* Top row: icon + name + hired badge */}
          <View style={styles.cardTopRow}>
            <View style={[styles.typeIconCircle, { backgroundColor: config.color + "18" }]}>
              <IconComp size={18} color={config.color} />
            </View>
            <View style={styles.cardNameBlock}>
              <Text style={styles.cardName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[styles.typeLabel, { color: config.color }]}>
                {config.label}
              </Text>
            </View>
            {isHired ? (
              <View style={styles.hiredBadge}>
                <View style={styles.hiredDot} />
                <Text style={styles.hiredText}>Active</Text>
              </View>
            ) : (
              <ChevronRight size={16} color={colors.textMuted} />
            )}
          </View>

          {/* Description */}
          {item.description ? (
            <Text style={styles.cardDescription} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}

          {/* Bottom row: fee + capabilities */}
          <View style={styles.cardBottomRow}>
            <Text style={styles.feeText}>
              {fee === "Free" ? "Free" : fee + " / run"}
            </Text>
            {item.capabilities && item.capabilities.length > 0 && (
              <View style={styles.capRow}>
                {item.capabilities.slice(0, 3).map((cap) => (
                  <View key={cap} style={styles.capChip}>
                    <Text style={styles.capText}>{cap}</Text>
                  </View>
                ))}
                {item.capabilities.length > 3 && (
                  <Text style={styles.capOverflow}>
                    +{item.capabilities.length - 3}
                  </Text>
                )}
              </View>
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [hiredAgentIds, handleCardPress],
  );

  const renderEmpty = useCallback(() => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Sparkles size={32} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>No agents found</Text>
        <Text style={styles.emptySubtitle}>
          {searchText.trim()
            ? "Try adjusting your search or filters"
            : "Pull down to refresh"}
        </Text>
      </View>
    );
  }, [loading, searchText]);

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Search size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search agents..."
          placeholderTextColor={colors.textMuted}
          value={searchText}
          onChangeText={setSearchText}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType="search"
        />
        {searchText.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchText("")}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterRowContent}
      >
        {CAPABILITY_FILTERS.map((f) => {
          const isActive = capability === f.key;
          return (
            <TouchableOpacity
              key={f.key || "__all__"}
              onPress={() => setCapability(f.key)}
              style={[styles.chip, isActive && styles.chipActive]}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Agent list */}
      {loading && agents.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Discovering agents...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredAgents}
          keyExtractor={(a) => a.agent_id}
          renderItem={renderAgentCard}
          refreshing={loading}
          onRefresh={loadAgents}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Agent detail sheet */}
      {selectedAgent && (
        <AgentDetailSheet
          agent={selectedAgent}
          isHired={hiredAgentIds.has(selectedAgent.agent_id)}
          hireId={hireIdsByAgent[selectedAgent.agent_id]}
          visible={true}
          onClose={handleDetailClose}
          onHired={handleHired}
          walletAddress={keys?.starkAddress}
          publicKey={keys?.starkPublicKey}
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  /* Search */
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: 14,
    height: 42,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.secondary,
    fontSize: fontSize.sm,
    paddingVertical: 0,
  },

  /* Filter chips */
  filterRow: {
    marginTop: spacing.sm,
    maxHeight: 36,
  },
  filterRowContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primaryDim,
    borderColor: colors.primary,
  },
  chipText: {
    fontFamily: typography.secondarySemibold,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.primary,
  },

  /* Loading */
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
  },
  loadingText: {
    fontFamily: typography.secondary,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },

  /* List */
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },

  /* Card */
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },

  /* Card top row: icon + name + status */
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  typeIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardNameBlock: {
    flex: 1,
  },
  cardName: {
    fontFamily: typography.secondarySemibold,
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: 20,
  },
  typeLabel: {
    fontFamily: typography.primary,
    fontSize: fontSize.xs,
    marginTop: 1,
  },

  /* Hired badge */
  hiredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.success + "18",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  hiredDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.success,
  },
  hiredText: {
    fontFamily: typography.primarySemibold,
    fontSize: 10,
    color: colors.success,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },

  /* Description */
  cardDescription: {
    fontFamily: typography.secondary,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 17,
    marginBottom: 10,
  },

  /* Bottom row: fee + caps */
  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  feeText: {
    fontFamily: typography.primary,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  capRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  capChip: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  capText: {
    fontFamily: typography.primary,
    fontSize: 9,
    color: colors.textMuted,
    textTransform: "lowercase",
  },
  capOverflow: {
    fontFamily: typography.primary,
    fontSize: 9,
    color: colors.textMuted,
  },

  /* Empty state */
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: typography.secondarySemibold,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  emptySubtitle: {
    fontFamily: typography.secondary,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: "center",
  },
});
