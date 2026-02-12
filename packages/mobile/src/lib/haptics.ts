/**
 * Thin wrapper around react-native-haptic-feedback.
 */
import ReactNativeHapticFeedback from "react-native-haptic-feedback";

const options = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

export function triggerSuccess() {
  ReactNativeHapticFeedback.trigger("notificationSuccess", options);
}

export function triggerError() {
  ReactNativeHapticFeedback.trigger("notificationError", options);
}

export function triggerMedium() {
  ReactNativeHapticFeedback.trigger("impactMedium", options);
}
