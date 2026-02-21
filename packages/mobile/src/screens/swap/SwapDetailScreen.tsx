import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ArrowLeft, Copy, ExternalLink, Repeat } from "lucide-react-native";
import { colors, borderRadius, typography } from "../../lib/theme";

function DetailRow({ label, value, valueStyle }: { label: string; value: string; valueStyle?: object }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailKey}>{label}</Text>
      <Text style={[styles.detailValue, valueStyle]}>{value}</Text>
    </View>
  );
}

export default function SwapDetailScreen() {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={18} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Swap Detail</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.iconWrap}>
        <Repeat size={16} color={colors.primaryLight} />
      </View>

      <Text style={styles.amount}>31.00 tongo units</Text>

      <View style={styles.statusPill}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>Settled</Text>
      </View>

      <View style={styles.detailCard}>
        <DetailRow label="Pair" value="STRK → ETH" />
        <DetailRow label="Sent" value="12.00 tongo units" />
        <DetailRow label="Received" value="31.00 tongo units" valueStyle={styles.valueSuccess} />
        <DetailRow label="Rate" value="1 STRK = 2.58 ETH" />
        <DetailRow label="Route" value="STRK pool → ETH pool" />
      </View>

      <Text style={styles.hashLabel}>Swap Tx Hash</Text>
      <View style={styles.hashRow}>
        <Text style={styles.hashValue}>0x8b92f7ac...d1b14c49</Text>
        <Copy size={14} color={colors.textMuted} />
      </View>

      <Pressable style={styles.voyagerButton}>
        <ExternalLink size={14} color={colors.primaryLight} />
        <Text style={styles.voyagerText}>View settlement on Voyager</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  backButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontFamily: typography.primarySemibold,
  },
  headerSpacer: {
    width: 28,
  },
  iconWrap: {
    alignSelf: "center",
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  amount: {
    textAlign: "center",
    color: colors.text,
    fontSize: 24,
    lineHeight: 30,
    marginBottom: 10,
    fontFamily: typography.primarySemibold,
  },
  statusPill: {
    alignSelf: "center",
    height: 24,
    borderRadius: 999,
    backgroundColor: "rgba(16, 185, 129, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.35)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  statusText: {
    color: colors.success,
    fontSize: 10,
    fontFamily: typography.secondarySemibold,
  },
  detailCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  detailKey: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: typography.secondary,
  },
  detailValue: {
    color: colors.text,
    fontSize: 12,
    fontFamily: typography.secondarySemibold,
  },
  valueSuccess: {
    color: colors.success,
  },
  hashLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: typography.secondary,
    marginBottom: 4,
  },
  hashRow: {
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  hashValue: {
    color: colors.text,
    fontSize: 11,
    fontFamily: typography.secondarySemibold,
  },
  voyagerButton: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  voyagerText: {
    color: colors.primaryLight,
    fontSize: 12,
    fontFamily: typography.secondarySemibold,
  },
});
