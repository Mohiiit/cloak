/**
 * Toast — Lightweight auto-dismissing notification system.
 */
import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import {
  Animated,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { colors, fontSize, borderRadius, spacing } from "../lib/theme";

type ToastType = "error" | "warning" | "success" | "info";

type ToastState = {
  message: string;
  type: ToastType;
  id: number;
};

type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const TYPE_COLORS: Record<ToastType, string> = {
  error: colors.error,
  warning: colors.warning,
  success: colors.success,
  info: colors.primary,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const translateY = useRef(new Animated.Value(-100)).current;
  const idCounter = useRef(0);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    Animated.timing(translateY, {
      toValue: -100,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setToast(null));
  }, [translateY]);

  const showToast = useCallback(
    (message: string, type: ToastType = "info") => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);

      const id = ++idCounter.current;
      setToast({ message, type, id });
      translateY.setValue(-100);

      Animated.timing(translateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();

      dismissTimer.current = setTimeout(() => {
        // Only dismiss if this toast is still showing
        if (idCounter.current === id) dismiss();
      }, 4000);
    },
    [translateY, dismiss],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <Animated.View
          style={[
            styles.container,
            { transform: [{ translateY }], borderLeftColor: TYPE_COLORS[toast.type] },
          ]}
        >
          <TouchableOpacity
            style={styles.touchable}
            onPress={dismiss}
            activeOpacity={0.8}
          >
            <Text style={styles.message} numberOfLines={2}>
              {toast.message}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 40,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 9999,
  },
  touchable: {
    padding: spacing.md,
  },
  message: {
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.4,
  },
});
