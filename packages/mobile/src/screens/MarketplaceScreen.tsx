/**
 * Legacy MarketplaceScreen — redirects to the Marketplace tab.
 *
 * Kept as a stack route for deep linking. All marketplace functionality
 * now lives in MarketplaceTabScreen and its sub-components.
 */
import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { colors, fontSize, typography } from "../lib/theme";

export default function MarketplaceScreen() {
  const navigation = useNavigation<any>();

  useEffect(() => {
    // Redirect to the Marketplace tab
    navigation.dispatch(
      CommonActions.navigate({
        name: "AppTabs",
        params: { screen: "Marketplace" },
      }),
    );
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Redirecting to Marketplace...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontSize: fontSize.sm,
    fontFamily: typography.secondary,
    color: colors.textMuted,
  },
});
