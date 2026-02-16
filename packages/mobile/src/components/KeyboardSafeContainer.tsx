import React, { type ReactNode } from "react";
import {
  Modal,
  View,
  StyleSheet,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  ScrollView,
  Pressable,
  Keyboard,
  Dimensions,
  Platform,
  type ModalProps,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
  type KeyboardAvoidingViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type KeyboardBehavior = NonNullable<KeyboardAvoidingViewProps["behavior"]>;

type KeyboardSafeContainerProps = {
  behavior?: KeyboardBehavior;
  keyboardVerticalOffset?: number;
  dismissOnBackdrop?: boolean;
};

export type KeyboardSafeScreenProps = ScrollViewProps &
  KeyboardSafeContainerProps & {
    containerStyle?: StyleProp<ViewStyle>;
  };

export function KeyboardSafeScreen({
  children,
  behavior,
  keyboardVerticalOffset,
  dismissOnBackdrop = true,
  containerStyle,
  keyboardShouldPersistTaps = "handled",
  ...scrollProps
}: KeyboardSafeScreenProps) {
  const insets = useSafeAreaInsets();
  const finalBehavior: KeyboardBehavior =
    behavior ?? (Platform.OS === "ios" ? "padding" : "height");
  const resolvedOffset =
    keyboardVerticalOffset ?? (Platform.OS === "ios" ? insets.top : 0);

  const content = (
    <ScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...scrollProps}
    >
      {children}
    </ScrollView>
  );

  return (
    <KeyboardAvoidingView
      behavior={finalBehavior}
      style={containerStyle ?? styles.defaultContainer}
      keyboardVerticalOffset={resolvedOffset}
    >
      {dismissOnBackdrop ? (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      {content}
    </TouchableWithoutFeedback>
      ) : (
        content
      )}
    </KeyboardAvoidingView>
  );
}

export type KeyboardSafeModalProps = Omit<ModalProps, "children" | "animationType" | "transparent"> &
  KeyboardSafeContainerProps & {
    children: ReactNode;
    overlayStyle?: StyleProp<ViewStyle>;
    contentStyle?: StyleProp<ViewStyle>;
    keyboardAvoidingStyle?: StyleProp<ViewStyle>;
    contentMaxHeight?: number | string;
  };

export function KeyboardSafeModal({
  children,
  visible,
  behavior,
  keyboardVerticalOffset,
  dismissOnBackdrop = true,
  overlayStyle,
  contentStyle,
  keyboardAvoidingStyle,
  contentMaxHeight,
  onRequestClose,
  ...modalProps
}: KeyboardSafeModalProps) {
  const insets = useSafeAreaInsets();
  const finalBehavior: KeyboardBehavior =
    behavior ?? (Platform.OS === "ios" ? "padding" : "height");
  const resolvedOffset =
    keyboardVerticalOffset ?? (Platform.OS === "ios" ? insets.top : 0);

  const resolveMaxHeight = (value: number | string): number => {
    if (typeof value === "number") {
      return value;
    }

    const percentageMatch = /^(\d+(?:\.\d+)?)%$/.exec(value.trim());
    if (percentageMatch) {
      const percentage = Number(percentageMatch[1]);
      const screenHeight = Dimensions.get("window").height;
      return (percentage / 100) * screenHeight;
    }

    return Number.parseFloat(value);
  };

  const contentHeightStyle = contentMaxHeight
    ? { maxHeight: resolveMaxHeight(contentMaxHeight) }
    : undefined;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
      {...modalProps}
    >
      <View style={[styles.modalOverlay, overlayStyle]}>
        {dismissOnBackdrop ? (
          <Pressable style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} />
        ) : null}
        <KeyboardAvoidingView
          behavior={finalBehavior}
          style={[styles.modalSafeArea, keyboardAvoidingStyle]}
          keyboardVerticalOffset={resolvedOffset}
        >
          <View style={[styles.modalContent, contentStyle, contentHeightStyle]}>
            {children}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  defaultContainer: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalSafeArea: {
    width: "100%",
    alignItems: "center",
  },
  modalContent: {
    width: "100%",
    maxHeight: "100%",
  },
});
