/**
 * TongoBridge — Hidden WebView that runs the Tongo SDK.
 *
 * Usage:
 *   const bridge = useTongoBridge();
 *   const state = await bridge.send("getState");
 *   const rate = await bridge.send("getRate");
 */
import React, { useRef, useState, useCallback, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import WebView, { WebViewMessageEvent } from "react-native-webview";

// Inline HTML with Tongo SDK bundled via webpack
import { BRIDGE_HTML } from "./bridgeHtml";

type PendingCall = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type TongoBridgeRef = {
  send: (command: string, params?: Record<string, any>) => Promise<any>;
  isReady: boolean;
};

// Singleton bridge state
let globalBridge: TongoBridgeRef | null = null;
let readyListeners: Array<(bridge: TongoBridgeRef) => void> = [];

export function getTongoBridge(): Promise<TongoBridgeRef> {
  if (globalBridge?.isReady) return Promise.resolve(globalBridge);
  return new Promise((resolve) => {
    readyListeners.push(resolve);
  });
}

/**
 * Hidden WebView component — mount this once at the app root.
 */
export function TongoBridgeProvider({ children }: { children: React.ReactNode }) {
  const webViewRef = useRef<WebView>(null);
  const pendingCalls = useRef<Map<string, PendingCall>>(new Map());
  const [isReady, setIsReady] = useState(false);
  const callIdCounter = useRef(0);
  const didReset = useRef(false);

  // Reset stale global bridge synchronously on first render
  // (must run before children's useEffects call getTongoBridge)
  if (!didReset.current) {
    didReset.current = true;
    globalBridge = null;
    readyListeners = [];
  }

  const send = useCallback(
    (command: string, params?: Record<string, any>): Promise<any> => {
      return new Promise((resolve, reject) => {
        if (!webViewRef.current) {
          reject(new Error("WebView not mounted"));
          return;
        }

        const id = `call_${++callIdCounter.current}`;
        const timeout = setTimeout(() => {
          pendingCalls.current.delete(id);
          reject(new Error(`Bridge timeout: ${command}`));
        }, 60000); // 60s timeout for ZK proof generation

        pendingCalls.current.set(id, { resolve, reject, timeout });

        const message = JSON.stringify({ id, command, params });
        webViewRef.current.injectJavaScript(`
          window.postMessage(${JSON.stringify(message)}, '*');
          true;
        `);
      });
    },
    [],
  );

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      // Bridge ready signal
      if (data.type === "bridge-ready") {
        setIsReady(true);
        const bridge: TongoBridgeRef = { send, isReady: true };
        globalBridge = bridge;
        readyListeners.forEach((listener) => listener(bridge));
        readyListeners = [];
        return;
      }

      // Error from WebView (non-critical — e.g. cross-origin "Script error")
      if (data.type === "error") {
        if (data.message === "Script error." || data.message === "Script error") {
          // Cross-origin noise on iOS — ignore
          return;
        }
        console.warn("[TongoBridge] WebView error:", data.message);
        return;
      }

      // Response to a call
      const { id, result, error } = data;
      if (!id) return;

      const pending = pendingCalls.current.get(id);
      if (!pending) return;

      clearTimeout(pending.timeout);
      pendingCalls.current.delete(id);

      if (error) {
        // Only log unexpected errors; getTxHistory failures are known and silenced
        if (data.stack && !data.stack.includes("getTxHistory")) {
          console.warn("[TongoBridge] Stack:", data.stack);
        }
        pending.reject(new Error(error));
      } else {
        pending.resolve(result);
      }
    } catch (e) {
      console.warn("[TongoBridge] Parse error:", e);
    }
  }, [send]);

  // Update global bridge reference when send changes
  useEffect(() => {
    if (isReady) {
      globalBridge = { send, isReady: true };
    }
  }, [send, isReady]);

  return (
    <View style={styles.container}>
      <View style={styles.hidden}>
        <WebView
          ref={webViewRef}
          source={{ html: BRIDGE_HTML, baseUrl: "https://localhost" }}
          onMessage={onMessage}
          javaScriptEnabled={true}
          originWhitelist={["*"]}
          mixedContentMode="always"
          allowFileAccess={true}
          onError={(e) => console.warn("[TongoBridge] Load error:", e.nativeEvent)}
        />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hidden: {
    height: 0,
    width: 0,
    opacity: 0,
    position: "absolute",
  },
});
