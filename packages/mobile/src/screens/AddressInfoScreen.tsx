/**
 * AddressInfoScreen — Three-tab view showing Tongo address, Starknet address,
 * and a combined contact card QR for sharing.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import Clipboard from "@react-native-clipboard/clipboard";
import QRCode from "react-native-qrcode-svg";
import { ArrowLeft, Copy, Check, Share2 } from "lucide-react-native";
import { useWallet } from "../lib/WalletContext";
import { colors, spacing, fontSize, borderRadius, typography } from "../lib/theme";
import { testIDs, testProps } from "../testing/testIDs";
import { useToast } from "../components/Toast";

type TabId = "tongo" | "starknet" | "contact";

function shortenMiddle(value: string, prefixLen: number, suffixLen: number): string {
  const v = value || "";
  if (v.length <= prefixLen + suffixLen + 3) return v;
  return `${v.slice(0, prefixLen)}...${v.slice(-suffixLen)}`;
}

export default function AddressInfoScreen() {
  const navigation = useNavigation();
  const wallet = useWallet();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>("tongo");
  const [copied, setCopied] = useState(false);

  const tongoAddress = wallet.keys?.tongoAddress || "";
  const starknetAddress = wallet.keys?.starkAddress || "";

  const contactCardPayload = JSON.stringify({
    type: "cloak-contact",
    tongoAddress,
    starknetAddress,
  });

  const handleCopy = (value: string) => {
    Clipboard.setString(value);
    setCopied(true);
    showToast("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: "tongo", label: "Tongo" },
    { id: "starknet", label: "Starknet" },
    { id: "contact", label: "Contact Card" },
  ];

  const tabContent = {
    tongo: {
      qrValue: tongoAddress,
      title: "Private Address",
      subtitle: "Others can send you shielded payments with this address",
      addresses: [{ label: "TONGO ADDRESS", value: tongoAddress }],
    },
    starknet: {
      qrValue: starknetAddress,
      title: "Public Address",
      subtitle: "Others can send you public payments with this address",
      addresses: [{ label: "STARKNET ADDRESS", value: starknetAddress }],
    },
    contact: {
      qrValue: contactCardPayload,
      title: "Your Contact Card",
      subtitle: "Share this so others can add you as a contact",
      addresses: [
        { label: "TONGO ADDRESS", value: tongoAddress },
        { label: "STARKNET ADDRESS", value: starknetAddress },
      ],
    },
  };

  const current = tabContent[activeTab];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Address Info</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Tab toggle */}
          <View style={styles.tabContainer}>
            {tabs.map((tab, idx) => (
              <TouchableOpacity
                key={tab.id}
                {...testProps(
                  tab.id === "tongo"
                    ? testIDs.addressInfo.tabTongo
                    : tab.id === "starknet"
                    ? testIDs.addressInfo.tabStarknet
                    : testIDs.addressInfo.tabContact,
                )}
                style={[
                  styles.tab,
                  idx === 0 && styles.tabLeft,
                  idx === tabs.length - 1 && styles.tabRight,
                  activeTab === tab.id && styles.tabActive,
                ]}
                onPress={() => {
                  setActiveTab(tab.id);
                  setCopied(false);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === tab.id && styles.tabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Title + subtitle */}
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.subtitle}>{current.subtitle}</Text>

          {/* QR Code */}
          <View
            {...testProps(testIDs.addressInfo.qrCode)}
            style={styles.qrWrapper}
          >
            <View style={styles.qrWhiteBg}>
              <QRCode
                value={current.qrValue}
                size={220}
                backgroundColor="#FFFFFF"
                color="#000000"
              />
            </View>
          </View>

          {/* Address rows */}
          {current.addresses.map((addr) => (
            <View key={addr.label} style={styles.addressRow}>
              <Text style={styles.addressLabel}>{addr.label}</Text>
              <TouchableOpacity
                {...testProps(testIDs.addressInfo.copyBtn)}
                style={styles.addressValueRow}
                onPress={() => handleCopy(addr.value)}
              >
                <Text style={styles.addressValue} numberOfLines={1}>
                  {shortenMiddle(addr.value, 12, 6)}
                </Text>
                {copied ? (
                  <Check size={16} color={colors.success} />
                ) : (
                  <Copy size={16} color={colors.textMuted} />
                )}
              </TouchableOpacity>
            </View>
          ))}

          {/* Share button */}
          <TouchableOpacity
            {...testProps(testIDs.addressInfo.shareBtn)}
            style={styles.shareBtn}
            onPress={() => {
              if (activeTab === "contact") {
                handleCopy(contactCardPayload);
              } else {
                handleCopy(current.addresses[0].value);
              }
            }}
          >
            <Share2 size={18} color="#FFFFFF" />
            <Text style={styles.shareBtnText}>
              {activeTab === "contact" ? "Copy Contact Card" : "Copy Address"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 56,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontFamily: typography.primarySemibold,
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  headerSpacer: {
    width: 24,
    height: 24,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    gap: 16,
    paddingBottom: 40,
  },

  // Tab toggle
  tabContainer: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    height: 42,
    overflow: "hidden",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: 42,
    backgroundColor: "transparent",
  },
  tabLeft: {
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  tabRight: {
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
  },
  tabActive: {
    backgroundColor: colors.secondary,
  },
  tabText: {
    fontFamily: typography.secondarySemibold,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: "#FFFFFF",
  },

  // Title / subtitle
  title: {
    fontSize: fontSize.xl,
    fontFamily: typography.secondarySemibold,
    color: colors.text,
    textAlign: "center",
    marginTop: 8,
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontFamily: typography.secondary,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: fontSize.sm * 1.5,
  },

  // QR
  qrWrapper: {
    alignItems: "center",
    paddingVertical: 16,
  },
  qrWhiteBg: {
    backgroundColor: "#FFFFFF",
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },

  // Address rows
  addressRow: {
    gap: 4,
  },
  addressLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontFamily: typography.primarySemibold,
  },
  addressValueRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.inputBg,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    gap: spacing.sm,
  },
  addressValue: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
    fontFamily: typography.primary,
  },

  // Share button
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    gap: 8,
    marginTop: 8,
  },
  shareBtnText: {
    fontFamily: typography.primarySemibold,
    fontSize: fontSize.md,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
