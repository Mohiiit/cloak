/**
 * ErrorBoundary — Catches uncaught JS errors during render.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, fontSize, borderRadius, spacing } from "../lib/theme";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.warn("[ErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  handleRestart = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {this.state.error?.message || "An unexpected error occurred"}
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={this.handleRestart}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonText}>Restart</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  message: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    textAlign: "center",
    lineHeight: fontSize.md * 1.5,
    marginBottom: spacing.xl,
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  buttonText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "600",
  },
});
