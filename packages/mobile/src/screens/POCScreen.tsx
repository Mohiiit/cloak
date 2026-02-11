/**
 * POC Screen — Tests that the Tongo SDK WebView bridge works.
 * This screen will be removed after validation.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useTongoBridge } from "../bridge/useTongoBridge";

// Test account from our existing setup
const TEST_TONGO_PK =
  "0x1d51cb1ee532756fb22e71f0e3ce98ff1617a94ab03596e616a0235cdb8a124";
const TEST_STARK_ADDRESS =
  "0x03e83695578ca8a473f387f9b338e4e22f7cae02ddb8817a8951abcbf3e38248";

type LogEntry = { text: string; type: "info" | "success" | "error" };

export default function POCScreen() {
  const bridge = useTongoBridge();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const log = (text: string, type: LogEntry["type"] = "info") => {
    setLogs((prev) => [...prev, { text, type }]);
  };

  const runTests = async () => {
    setLogs([]);
    setIsRunning(true);

    try {
      // Test 1: Ping
      log("1. Testing ping...");
      const pong = await bridge.initialize({
        tongoPrivateKey: TEST_TONGO_PK,
        token: "STRK",
        starkAddress: TEST_STARK_ADDRESS,
        starkPrivateKey: TEST_TONGO_PK, // Same key for test
      });
      log("   Init successful!", "success");

      // Test 2: Get Tongo address
      log("2. Getting Tongo address...");
      const addr = await bridge.getTongoAddress();
      log(`   Address: ${addr.substring(0, 20)}...`, "success");

      // Test 3: Get rate
      log("3. Getting STRK rate...");
      const rate = await bridge.getRate();
      log(`   Rate: ${rate}`, "success");

      // Test 4: Get state (balance)
      log("4. Getting account state...");
      const state = await bridge.getState();
      log(
        `   Balance: ${state.balance}, Pending: ${state.pending}, Nonce: ${state.nonce}`,
        "success",
      );

      // Test 5: Derive public key
      log("5. Deriving public key...");
      const pubKey = await bridge.derivePublicKey(TEST_TONGO_PK);
      log(`   PubKey.x: ${pubKey.x.substring(0, 20)}...`, "success");

      // Test 6: Get tx history
      log("6. Getting transaction history...");
      const history = await bridge.getTxHistory(0);
      log(`   Found ${history.length} transactions`, "success");

      log("\nAll tests passed!", "success");
    } catch (error: any) {
      log(`ERROR: ${error.message}`, "error");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tongo Bridge POC</Text>
      <Text style={styles.subtitle}>
        Bridge ready: {bridge.isReady ? "YES" : "NO"}
      </Text>

      <TouchableOpacity
        style={[styles.button, isRunning && styles.buttonDisabled]}
        onPress={runTests}
        disabled={!bridge.isReady || isRunning}
      >
        {isRunning ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Run Tests</Text>
        )}
      </TouchableOpacity>

      <ScrollView style={styles.logContainer}>
        {logs.map((entry, i) => (
          <Text
            key={i}
            style={[
              styles.logText,
              entry.type === "success" && styles.logSuccess,
              entry.type === "error" && styles.logError,
            ]}
          >
            {entry.text}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#F8FAFC",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#94A3B8",
    marginBottom: 20,
  },
  button: {
    backgroundColor: "#3B82F6",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  logContainer: {
    flex: 1,
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 12,
  },
  logText: {
    color: "#CBD5E1",
    fontSize: 13,
    fontFamily: "monospace",
    marginBottom: 4,
  },
  logSuccess: {
    color: "#10B981",
  },
  logError: {
    color: "#EF4444",
  },
});
