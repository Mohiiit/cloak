import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, TextInput, ActivityIndicator, Animated, Easing, TouchableOpacity } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { AlertTriangle, Check, ChevronsUpDown, Pencil, RefreshCw, Repeat, X } from "lucide-react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import { Account, RpcProvider, num, transaction } from "starknet";
import {
  createCloakRuntime,
  SupabaseLite,
  DEFAULT_RPC,
  padAddress,
  buildResourceBoundsFromEstimate,
  type SwapQuote,
  type SwapExecutionStepKey,
} from "@cloak-wallet/sdk";
import { colors, borderRadius, typography } from "../lib/theme";
import { testIDs, testProps } from "../testing/testIDs";
import { TOKENS, type TokenKey } from "../lib/tokens";
import { useWallet } from "../lib/WalletContext";
import { useWardContext } from "../lib/wardContext";
import { useDualSigExecutor } from "../hooks/useDualSigExecutor";
import { getSupabaseConfig } from "../lib/twoFactor";
import { bringRateAndQuote, type QuoteBreakdown } from "../lib/swapQuote";
import { Confetti } from "../components/Confetti";

function MetricChip({
  label,
  bgColor,
}: {
  label: string;
  bgColor: string;
}) {
  return (
    <View style={styles.metricChip}>
      <View style={[styles.metricDot, { backgroundColor: bgColor }]} />
      <Text style={styles.metricText}>{label}</Text>
    </View>
  );
}

function asDecimalString(value: unknown): string | null {
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  if (typeof value === "string" && /^0x[0-9a-f]+$/i.test(value)) return BigInt(value).toString();
  return null;
}

async function fetchExecutionQuoteFallbackFromAvnu(params: {
  walletAddress: string;
  fromToken: TokenKey;
  toToken: TokenKey;
  sentUnits: string;
  slippageBps: number;
}): Promise<SwapQuote> {
  const sellAmountWei = (BigInt(params.sentUnits) * TOKENS[params.fromToken].rate).toString();
  const sellAmountHex = `0x${BigInt(sellAmountWei).toString(16)}`;
  const takers = [padAddress(params.walletAddress), params.walletAddress];
  let lastError: Error | null = null;

  for (const takerAddress of takers) {
    const query = new URLSearchParams({
      sellTokenAddress: TOKENS[params.fromToken].erc20Contract,
      buyTokenAddress: TOKENS[params.toToken].erc20Contract,
      sellAmount: sellAmountHex,
      takerAddress,
    });
    const url = `https://sepolia.api.avnu.fi/swap/v3/quotes?${query.toString()}`;
    const res = await fetch(url);
    const body = await res.text();
    if (!res.ok) {
      lastError = new Error(`Failed to fetch AVNU quote (${res.status}): ${body.slice(0, 300)}`);
      continue;
    }

    const payload = JSON.parse(body) as unknown;
    const row = Array.isArray(payload) ? payload[0] : null;
    if (!row || typeof row !== "object") {
      lastError = new Error("AVNU quote response empty");
      continue;
    }
    const quoteRow = row as Record<string, unknown>;
    const quoteId =
      (typeof quoteRow.quoteId === "string" && quoteRow.quoteId) ||
      (typeof quoteRow.id === "string" && quoteRow.id) ||
      null;
    const buyAmountWei = asDecimalString(quoteRow.buyAmount);
    if (!quoteId || !buyAmountWei) {
      lastError = new Error("AVNU quote response missing quoteId or buyAmount");
      continue;
    }
    const boundedSlippageBps = Math.max(1, Math.min(5000, params.slippageBps));
    const minBuyAmountWei = ((BigInt(buyAmountWei) * BigInt(10_000 - boundedSlippageBps)) / 10_000n).toString();
    return {
      id: quoteId,
      provider: "avnu",
      pair: { sellToken: params.fromToken, buyToken: params.toToken },
      mode: "exact_in",
      sellAmountWei,
      estimatedBuyAmountWei: buyAmountWei,
      minBuyAmountWei,
      route: quoteRow,
      meta: { slippageBps: boundedSlippageBps },
    };
  }

  throw lastError ?? new Error("Failed to fetch AVNU quote");
}

async function probeEstimateFeeRpc(params: {
  provider: RpcProvider;
  senderAddress: string;
  calls: any[];
}): Promise<string> {
  const rpcUrl =
    (params.provider as any).channel?.nodeUrl ||
    (params.provider as any).nodeUrl ||
    DEFAULT_RPC.sepolia;
  const nonce = await params.provider.getNonceForAddress(params.senderAddress);
  const compiledCalldata = transaction.getExecuteCalldata(params.calls, "1");
  const invokeBase = {
    type: "INVOKE",
    sender_address: num.toHex(params.senderAddress),
    calldata: compiledCalldata.map((c: any) => num.toHex(BigInt(c))),
    version: "0x3",
    nonce: num.toHex(nonce),
    resource_bounds: {
      l1_gas: { max_amount: "0x100000", max_price_per_unit: "0x2540be400" },
      l2_gas: { max_amount: "0xf42400", max_price_per_unit: "0x2540be400" },
      l1_data_gas: { max_amount: "0x10000", max_price_per_unit: "0x2540be400" },
    },
    tip: "0x0",
    paymaster_data: [],
    account_deployment_data: [],
  };

  const requestVariants = [
    { ...invokeBase, signature: [] as string[], nonce_data_availability_mode: "L1", fee_data_availability_mode: "L1" },
    { ...invokeBase, signature: [] as string[], nonce_data_availability_mode: 0, fee_data_availability_mode: 0 },
    { ...invokeBase, signature: ["0x0"], nonce_data_availability_mode: "L1", fee_data_availability_mode: "L1" },
    { ...invokeBase, signature: ["0x0"], nonce_data_availability_mode: 0, fee_data_availability_mode: 0 },
  ];

  const attempts: Array<Record<string, unknown>> = [];
  let attemptId = 0;
  for (const request of requestVariants) {
    for (const blockId of ["pre_confirmed", "latest"]) {
      const paramShapes = [
        { request, simulation_flags: ["SKIP_VALIDATE"], block_id: blockId },
        [request, ["SKIP_VALIDATE"], blockId],
        { request: [request], simulation_flags: ["SKIP_VALIDATE"], block_id: blockId },
        [[request], ["SKIP_VALIDATE"], blockId],
      ];
      for (const rpcParams of paramShapes) {
        attemptId += 1;
        try {
          const res = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "starknet_estimateFee",
              params: rpcParams,
            }),
          });
          const rawResponse = await res.text();
          attempts.push({
            attemptId,
            blockId,
            httpStatus: res.status,
            params: rpcParams,
            rawResponse,
          });
        } catch (error) {
          attempts.push({
            attemptId,
            blockId,
            params: rpcParams,
            fetchError: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  return JSON.stringify(
    {
      tag: "starknet_estimateFee_debug",
      rpcUrl,
      senderAddress: params.senderAddress,
      nonce: num.toHex(nonce),
      attempts,
    },
    null,
    2,
  );
}

type SwapProgressStatus = "pending" | "running" | "success" | "failed" | "skipped";

const SWAP_FLOW_STEPS: Array<{ key: SwapExecutionStepKey; label: string }> = [
  { key: "quote", label: "Fetching quote" },
  { key: "build_route", label: "Building route" },
  { key: "prepare_withdraw", label: "Preparing withdraw call" },
  { key: "prepare_fund", label: "Preparing fund call" },
  { key: "compose", label: "Composing swap call" },
  { key: "estimate_fee", label: "Estimating fee" },
  { key: "submit", label: "Submitting transaction" },
  { key: "confirm", label: "Confirming execution" },
  { key: "refresh", label: "Refreshing balances" },
];

export default function SwapScreen() {
  const navigation = useNavigation<any>();
  const wallet = useWallet();
  const ward = useWardContext();
  const { executeDualSig, is2FAEnabled } = useDualSigExecutor();
  const [swapOverlayMode, setSwapOverlayMode] = useState<"none" | "progress" | "result">("none");
  const [showSlippageModal, setShowSlippageModal] = useState(false);
  const [fromToken, setFromToken] = useState<TokenKey>("STRK");
  const [toToken, setToToken] = useState<TokenKey>("ETH");
  const [amountInput, setAmountInput] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);
  const [slippageInput, setSlippageInput] = useState("0.50");
  const [slippageInputError, setSlippageInputError] = useState<string | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [tokenPicker, setTokenPicker] = useState<{ side: "from" | "to" } | null>(null);
  const [quoteBreakdown, setQuoteBreakdown] = useState<QuoteBreakdown | null>(null);
  const [quoteRefreshTick, setQuoteRefreshTick] = useState(0);
  const [isExecutingSwap, setIsExecutingSwap] = useState(false);
  const [swapExecutionId, setSwapExecutionId] = useState<string | null>(null);
  const [swapStepTimeline, setSwapStepTimeline] = useState<
    Array<{
      key: SwapExecutionStepKey;
      label: string;
      status: SwapProgressStatus;
      txHash?: string | null;
      message?: string | null;
    }>
  >(
    SWAP_FLOW_STEPS.map((step) => ({
      ...step,
      status: "pending",
      txHash: null,
      message: null,
    })),
  );
  const [swapResult, setSwapResult] = useState<"success" | "failure">("success");
  const [swapResultMessage, setSwapResultMessage] = useState("Your private swap settled successfully.");
  const [swapErrorDetail, setSwapErrorDetail] = useState<string | null>(null);
  const [errorCopied, setErrorCopied] = useState(false);
  const progressIconSpin = useMemo(() => new Animated.Value(0), []);
  const [lastSwapTxHash, setLastSwapTxHash] = useState<string | null>(null);
  const [swapTxHashes, setSwapTxHashes] = useState<string[]>([]);
  const showProgressModal = swapOverlayMode === "progress";
  const showCompleteModal = swapOverlayMode === "result";

  const tokenList = useMemo(() => Object.keys(TOKENS) as TokenKey[], []);
  const slippagePercentText = (slippageBps / 100).toFixed(2);

  useEffect(() => {
    const parsed = Number(amountInput);
    const sanitized = Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
    const quantizedUnits = BigInt(Math.floor(sanitized));
    const canQuote = fromToken !== toToken && quantizedUnits > 0n;

    if (!canQuote) {
      setLoadingQuote(false);
      setQuoteError(null);
      setQuoteBreakdown(null);
      return;
    }

    const walletAddress = wallet.keys?.starkAddress;
    if (!walletAddress) {
      setLoadingQuote(false);
      setQuoteError("Connect wallet to fetch quote");
      setQuoteBreakdown(null);
      return;
    }

    setLoadingQuote(true);
    setQuoteError(null);

    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const { url, key } = await getSupabaseConfig();
        const breakdown = await bringRateAndQuote({
          walletAddress,
          fromToken,
          toToken,
          sentUnits: quantizedUnits,
          slippageBps,
          supabaseUrl: url,
          supabaseKey: key,
        });
        if (cancelled) return;
        setQuoteBreakdown(breakdown);
      } catch (error) {
        if (cancelled) return;
        const reason = error instanceof Error ? error.message : "Could not fetch quote. Try again.";
        console.warn("[SwapScreen] quote fetch failed", error);
        setQuoteError(reason);
        setQuoteBreakdown(null);
      } finally {
        if (!cancelled) setLoadingQuote(false);
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [amountInput, fromToken, toToken, slippageBps, wallet.keys?.starkAddress, quoteRefreshTick]);

  const applySlippagePercent = (percent: number) => {
    const nextBps = Math.round(percent * 100);
    if (!Number.isFinite(nextBps) || nextBps < 1 || nextBps > 5000) return;
    setSlippageBps(nextBps);
    setSlippageInput(percent.toFixed(2));
    setSlippageInputError(null);
    setShowSlippageModal(false);
  };

  const applyCustomSlippage = () => {
    const parsed = Number(slippageInput);
    if (!Number.isFinite(parsed) || parsed < 0.01 || parsed > 50) {
      setSlippageInputError("Enter a value between 0.01 and 50");
      return;
    }
    applySlippagePercent(parsed);
  };

  const progressRotate = progressIconSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  useEffect(() => {
    if (!showProgressModal) {
      progressIconSpin.stopAnimation();
      progressIconSpin.setValue(0);
      return;
    }

    const spinLoop = Animated.loop(
      Animated.timing(progressIconSpin, {
        toValue: 1,
        duration: 1700,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    spinLoop.start();

    return () => {
      spinLoop.stop();
    };
  }, [showProgressModal, progressIconSpin]);

  useFocusEffect(
    React.useCallback(() => {
      return () => {
        setSwapOverlayMode("none");
        setIsExecutingSwap(false);
      };
    }, []),
  );

  const amountIsValid = (quoteBreakdown?.sentUnits ?? 0n) > 0n && fromToken !== toToken;
  const hasQuote = !loadingQuote && (quoteBreakdown?.minimumUnits ?? 0n) > 0n;
  const canReview = hasQuote && amountIsValid;
  const availableUnits = BigInt(wallet.tongoBalances[fromToken]?.balance ?? "0");
  const statusText = isExecutingSwap
    ? "Status: Executing private swap"
    : hasQuote
      ? "Status: Quote ready to confirm"
      : "Status: Select tokens and amount";

  const selectToken = (side: "from" | "to", token: TokenKey) => {
    if (side === "from") {
      if (token === toToken) {
        setToToken(fromToken);
      }
      setFromToken(token);
    } else {
      if (token === fromToken) {
        setFromToken(toToken);
      }
      setToToken(token);
    }
    setTokenPicker(null);
  };

  const resetStepTimeline = () => {
    setSwapStepTimeline(
      SWAP_FLOW_STEPS.map((step) => ({
        ...step,
        status: "pending" as const,
        txHash: null,
        message: null,
      })),
    );
  };

  const updateStepTimeline = (
    key: SwapExecutionStepKey,
    status: SwapProgressStatus,
    input?: { txHash?: string | null; message?: string | null },
  ) => {
    setSwapStepTimeline((prev) =>
      prev.map((step) =>
        step.key === key
          ? {
              ...step,
              status,
              txHash: input?.txHash ?? step.txHash ?? null,
              message: input?.message ?? step.message ?? null,
            }
          : step,
      ),
    );
  };

  const onPrimaryAction = async () => {
    if (!canReview || isExecutingSwap) return;
    if (!wallet.keys?.starkAddress) {
      setSwapResult("failure");
      setSwapResultMessage("No wallet connected.");
      setSwapOverlayMode("result");
      return;
    }
    setSwapResult("success");
    setSwapResultMessage("Your private swap settled successfully.");
    setSwapErrorDetail(null);
    setErrorCopied(false);
    setLastSwapTxHash(null);
    setSwapTxHashes([]);
    setSwapExecutionId(null);
    resetStepTimeline();
    setSwapOverlayMode("progress");
    setIsExecutingSwap(true);
    let failureStage = "execution";
    let failureStepKey: SwapExecutionStepKey | null = null;
    let executionId: string | null = null;
    let executionPrimaryTxHash: string | null = null;
    let runtimeSwapsRepo: ReturnType<typeof createCloakRuntime>["repositories"]["swaps"] | null = null;
    const executionTxHashes = new Set<string>();
    const updateStep = async (
      key: SwapExecutionStepKey,
      status: SwapProgressStatus,
      input?: { txHash?: string | null; message?: string | null; metadata?: Record<string, unknown> | null },
    ) => {
      updateStepTimeline(key, status, { txHash: input?.txHash, message: input?.message });
      if (!executionId || !runtimeSwapsRepo) return;
      const stepOrder = SWAP_FLOW_STEPS.findIndex((step) => step.key === key);
      await runtimeSwapsRepo.upsertStep({
        execution_id: executionId,
        step_key: key,
        step_order: stepOrder >= 0 ? stepOrder : 0,
        attempt: 1,
        status,
        tx_hash: input?.txHash ?? null,
        message: input?.message ?? null,
        metadata: input?.metadata ?? null,
        started_at: status === "running" ? new Date().toISOString() : null,
        finished_at:
          status === "success" || status === "failed" || status === "skipped"
            ? new Date().toISOString()
            : null,
      });
    };
    const appendTxHash = (txHash: string | null | undefined) => {
      if (!txHash) return;
      executionTxHashes.add(txHash);
      setSwapTxHashes((prev) => {
        if (prev.includes(txHash)) return prev;
        return [...prev, txHash];
      });
    };
    try {
      const walletAddress = padAddress(wallet.keys.starkAddress);
      const sentUnits = (quoteBreakdown?.sentUnits ?? 0n).toString();
      const { url, key } = await getSupabaseConfig();
      const runtime = createCloakRuntime({
        network: "sepolia",
        provider: new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia }) as any,
        supabase: new SupabaseLite(url, key),
      });
      runtimeSwapsRepo = runtime.repositories.swaps;
      executionId = `swap_${Date.now()}_${walletAddress.slice(-6)}`;
      setSwapExecutionId(executionId);
      await runtimeSwapsRepo.save({
        execution_id: executionId,
        wallet_address: walletAddress,
        ward_address: ward.isWard ? walletAddress : null,
        tx_hash: null,
        primary_tx_hash: null,
        tx_hashes: null,
        provider: "avnu",
        sell_token: fromToken,
        buy_token: toToken,
        sell_amount_wei: quoteBreakdown?.meta.sellWei || "0",
        estimated_buy_amount_wei: quoteBreakdown?.meta.estimatedBuyWei || "0",
        min_buy_amount_wei: quoteBreakdown?.meta.minBuyWei || "0",
        buy_actual_amount_wei: null,
        status: "running",
        error_message: null,
      });

      failureStage = "quote";
      failureStepKey = "quote";
      await updateStep("quote", "running");
      let quote: SwapQuote;
      try {
        quote = await runtime.swaps.quote({
          walletAddress,
          pair: { sellToken: fromToken, buyToken: toToken },
          sellAmount: { value: sentUnits, unit: "tongo_units" },
          slippageBps,
        });
      } catch (error) {
        const err = error as { message?: string; status?: number } | undefined;
        const message = err?.message || "";
        const shouldFallback = err?.status === 404 || message.toLowerCase().includes("not found");
        if (!shouldFallback) throw error;
        quote = await fetchExecutionQuoteFallbackFromAvnu({
          walletAddress,
          fromToken,
          toToken,
          sentUnits,
          slippageBps,
        });
      }
      await updateStep("quote", "success");

      failureStage = "route build";
      failureStepKey = "build_route";
      await updateStep("build_route", "running");
      const dexPlan = await runtime.swaps.build({
        walletAddress,
        pair: { sellToken: fromToken, buyToken: toToken },
        quote,
        receiverAddress: walletAddress,
      });
      await updateStep("build_route", "success");
      await runtimeSwapsRepo.updateByExecutionId(executionId, {
        sell_amount_wei: quote.sellAmountWei,
        estimated_buy_amount_wei: quote.estimatedBuyAmountWei,
        min_buy_amount_wei: quote.minBuyAmountWei,
        route_meta: (quote.route || null) as Record<string, unknown> | null,
      });

      const minBuyUnits = BigInt(dexPlan.minBuyAmountWei) / TOKENS[toToken].rate;
      if (minBuyUnits <= 0n) {
        throw new Error("Minimum received amount rounds to 0 units.");
      }

      failureStage = "shielded call preparation";
      const originalToken = wallet.selectedToken;
      const switchToken = wallet.setSelectedToken as unknown as (token: TokenKey) => Promise<void>;

      let withdrawCalls: any[] = [];
      let fundCalls: any[] = [];
      try {
        failureStepKey = "prepare_withdraw";
        await updateStep("prepare_withdraw", "running");
        await switchToken(fromToken);
        withdrawCalls = (await wallet.prepareWithdraw(sentUnits)).calls ?? [];
        await updateStep("prepare_withdraw", "success");

        failureStepKey = "prepare_fund";
        await updateStep("prepare_fund", "running");
        await switchToken(toToken);
        fundCalls = (await wallet.prepareFund(minBuyUnits.toString())).calls ?? [];
        await updateStep("prepare_fund", "success");
      } finally {
        await switchToken(originalToken);
      }

      failureStepKey = "compose";
      await updateStep("compose", "running");
      const composedPlan = {
        ...dexPlan,
        sellAmount: { value: sentUnits, unit: "tongo_units" as const },
        calls: [
          ...withdrawCalls,
          ...dexPlan.dexCalls,
          ...fundCalls,
        ],
        dexCalls: dexPlan.dexCalls,
        meta: {
          ...(dexPlan.meta || {}),
          composed: true,
        },
      };
      await updateStep("compose", "success");

      const executeDirect = async () => {
        const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
        const account = new Account({
          provider,
          address: walletAddress,
          signer: wallet.keys!.starkPrivateKey,
        } as any);
        const nonce = await account.getNonce();
        let feeEstimate: any;
        try {
          failureStepKey = "estimate_fee";
          await updateStep("estimate_fee", "running");
          feeEstimate = await runtime.ward.estimateInvokeFee(walletAddress, composedPlan.calls);
          await updateStep("estimate_fee", "success");
        } catch (error) {
          const debugBlob = await probeEstimateFeeRpc({
            provider,
            senderAddress: walletAddress,
            calls: composedPlan.calls,
          });
          const enriched = new Error(
            `${error instanceof Error ? error.message : "Fee estimation failed"}\n${debugBlob}`,
          ) as Error & { details?: string };
          enriched.details = `${error instanceof Error ? error.message : "Fee estimation failed"}\n${debugBlob}`;
          throw enriched;
        }
        const resourceBounds = buildResourceBoundsFromEstimate(feeEstimate, 1.35);
        failureStepKey = "submit";
        await updateStep("submit", "running");
        const tx = await account.execute(composedPlan.calls, {
          nonce,
          resourceBounds,
          tip: 0,
        });
        appendTxHash(tx.transaction_hash);
        await updateStep("submit", "success", { txHash: tx.transaction_hash });
        return { txHash: tx.transaction_hash };
      };

      failureStage = "transaction submit";
      failureStepKey = "submit";
      const result = await runtime.swaps.execute({
        walletAddress,
        wardAddress: ward.isWard ? walletAddress : undefined,
        is2FAEnabled: !ward.isWard ? is2FAEnabled : undefined,
        network: "sepolia",
        platform: "mobile",
        plan: composedPlan,
        executeDirect,
        execute2FA: !ward.isWard
          ? async () => {
            const tx = await executeDualSig(composedPlan.calls);
            appendTxHash(tx.txHash);
            await updateStep("submit", "success", { txHash: tx.txHash });
            return { approved: true, txHash: tx.txHash };
          }
          : undefined,
        executeWardApproval: ward.isWard
          ? async (decision, snapshot) => {
            const wardResult = await ward.initiateWardTransaction({
              action: "shielded_swap",
              token: fromToken,
              amount: sentUnits,
              calls: composedPlan.calls,
              policyOverride: {
                guardianAddress: snapshot.guardianAddress,
                needsWard2fa: decision.needsWard2fa,
                needsGuardian: decision.needsGuardian,
                needsGuardian2fa: decision.needsGuardian2fa,
              },
            });
            appendTxHash(wardResult.txHash);
            await updateStep("submit", "success", { txHash: wardResult.txHash });
            return wardResult;
          }
          : undefined,
      });

      setLastSwapTxHash(result.txHash);
      executionPrimaryTxHash = result.txHash;
      appendTxHash(result.txHash);
      await updateStep("confirm", "running");
      await updateStep("confirm", "success", { txHash: result.txHash });
      await updateStep("refresh", "running");
      await wallet.refreshBalance();
      await wallet.refreshAllBalances();
      await updateStep("refresh", "success");
      await runtimeSwapsRepo.updateByExecutionId(executionId, {
        status: "confirmed",
        tx_hash: result.txHash,
        primary_tx_hash: result.txHash,
        tx_hashes: Array.from(executionTxHashes),
        buy_actual_amount_wei: composedPlan.minBuyAmountWei,
        error_message: null,
        failure_step_key: null,
        failure_reason: null,
      });
      setSwapResult("success");
      setSwapResultMessage("Your private swap settled successfully.");
    } catch (error) {
      const err = error as { message?: string; status?: number; body?: string; details?: string } | undefined;
      const rawMessage = error instanceof Error ? error.message : "Private swap failed. Please retry.";
      let reason = rawMessage;
      if (err?.message?.includes("Failed to fetch AVNU quote")) {
        const bodySnippet = typeof err.body === "string" ? err.body.slice(0, 140) : "";
        reason = `Failed to fetch AVNU quote${err.status ? ` (${err.status})` : ""}${bodySnippet ? `: ${bodySnippet}` : ""}`;
      }
      const compactReason = reason.replace(/\s+/g, " ").trim().slice(0, 220);
      setSwapResult("failure");
      setSwapResultMessage(`${failureStage}: ${compactReason}`);
      if (failureStepKey) {
        await updateStep(failureStepKey, "failed", { message: compactReason });
      }
      if (executionId && runtimeSwapsRepo) {
        await runtimeSwapsRepo.updateByExecutionId(executionId, {
          status: "failed",
          error_message: compactReason,
          failure_step_key: failureStepKey,
          failure_reason: compactReason,
          tx_hashes: executionTxHashes.size > 0 ? Array.from(executionTxHashes) : null,
          primary_tx_hash: executionPrimaryTxHash,
          tx_hash: executionPrimaryTxHash,
        });
      }
      const rawDetail =
        (typeof err?.details === "string" && err.details) ||
        (typeof err?.body === "string" && err.body) ||
        rawMessage;
      setSwapErrorDetail(`${failureStage}\n${rawDetail}`);
      setErrorCopied(false);
    } finally {
      setIsExecutingSwap(false);
      setSwapOverlayMode("result");
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TOKEN PAIR</Text>
          <View style={styles.tokenSelectorRow}>
            <Pressable style={styles.tokenPill} onPress={() => setTokenPicker({ side: "from" })}>
              <Text style={styles.tokenPillLabel}>From</Text>
              <Text style={styles.tokenPillValue}>{fromToken}</Text>
              <ChevronsUpDown size={14} color={colors.primary} />
            </Pressable>
            <Pressable style={styles.tokenPill} onPress={() => setTokenPicker({ side: "to" })}>
              <Text style={styles.tokenPillLabel}>To</Text>
              <Text style={styles.tokenPillValue}>{toToken}</Text>
              <ChevronsUpDown size={14} color={colors.primary} />
            </Pressable>
          </View>
          <View style={styles.metricRow}>
            <MetricChip label={`Available: ${availableUnits.toString()}u`} bgColor="rgba(59, 130, 246, 1)" />
            <MetricChip label={`In est: ${(quoteBreakdown?.estimatedUnits ?? 0n).toString()}u`} bgColor="rgba(16, 185, 129, 1)" />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>YOU SEND (PRIVATE)</Text>
          <View style={styles.amountCard}>
            <TextInput
              value={amountInput}
              onChangeText={(text) => {
                if (/^\d*$/.test(text)) setAmountInput(text);
              }}
              keyboardType="numeric"
              style={styles.amountInput}
              placeholder="0"
              maxLength={12}
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.primaryLight}
            />
            <Text style={styles.amountUnit}>tongo units</Text>
            <View style={styles.availableInlineRow}>
              <Text style={styles.availableInline}>Available: {availableUnits.toString()} units</Text>
              <Pressable onPress={() => setAmountInput(availableUnits.toString())}>
                <Text style={styles.availableMax}>MAX</Text>
              </Pressable>
            </View>
            <View style={styles.slippageRow}>
              <Text style={styles.slippageLabel}>Slippage tolerance:</Text>
              <Pressable
                style={styles.slippageEditButton}
                onPress={() => {
                  setSlippageInput(slippagePercentText);
                  setSlippageInputError(null);
                  setShowSlippageModal(true);
                }}
              >
                <Text style={styles.slippageValue}>{slippagePercentText}%</Text>
                <Pencil size={12} color={colors.primaryLight} />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.quoteHeaderRow}>
            <Text style={styles.sectionLabel}>QUOTE PREVIEW</Text>
            <Pressable
              style={styles.quoteRefreshButton}
              onPress={() => setQuoteRefreshTick((v) => v + 1)}
              disabled={loadingQuote}
            >
              {loadingQuote ? (
                <ActivityIndicator size="small" color={colors.primaryLight} />
              ) : (
                <RefreshCw size={14} color={colors.primaryLight} />
              )}
            </Pressable>
          </View>
          {loadingQuote ? (
            <View style={styles.quoteLoadingCard}>
              <ActivityIndicator size="small" color={colors.primaryLight} />
              <Text style={styles.quoteLoadingText}>Loading rates...</Text>
            </View>
          ) : quoteError ? (
            <View style={styles.quoteLoadingCard}>
              <Text numberOfLines={3} ellipsizeMode="tail" style={styles.quoteErrorText}>{quoteError}</Text>
            </View>
          ) : !hasQuote ? (
            <View style={styles.quoteLoadingCard}>
              <Text style={styles.quoteLoadingText}>Select tokens and enter amount to preview quote</Text>
            </View>
          ) : (
            <View style={styles.quoteCard}>
              <View style={styles.quoteRow}>
                <Text style={styles.quoteLabel}>1) You Send</Text>
                <Text style={styles.quoteValue}>
                  {(quoteBreakdown?.sentUnits ?? 0n).toString()} units ({quoteBreakdown?.display.input ?? "0"} {fromToken})
                </Text>
              </View>
              <View style={styles.quoteRow}>
                <Text style={styles.quoteLabel}>2) DEX Output</Text>
                <Text style={styles.quoteValue}>{quoteBreakdown?.display.estimated ?? "0"} {toToken}</Text>
              </View>
              <View style={styles.quoteRow}>
                <Text style={styles.quoteLabel}>Exchange Rate</Text>
                <Text style={styles.quoteValue}>
                  {quoteBreakdown?.display.effectiveRate ? `1 ${fromToken} ≈ ${quoteBreakdown.display.effectiveRate} ${toToken}` : "-"}
                </Text>
              </View>
              <View style={styles.quoteRow}>
                <Text style={styles.quoteLabel}>Protocol Fee</Text>
                <Text style={styles.quoteValue}>
                  {quoteBreakdown?.display.protocolFee ? `${quoteBreakdown.display.protocolFee} ${quoteBreakdown.display.protocolFeeToken ?? ""}`.trim() : "-"}
                </Text>
              </View>
              <View style={styles.quoteRow}>
                <Text style={styles.quoteLabel}>Estimated Gas</Text>
                <Text style={styles.quoteValue}>{quoteBreakdown?.display.gasFeeEth ? `${quoteBreakdown.display.gasFeeEth} ETH` : "-"}</Text>
              </View>
              <View style={[styles.quoteRow, styles.quoteRowLast]}>
                <Text style={styles.quoteLabel}>3) Final (Min)</Text>
                <Text style={[styles.quoteValue, styles.warningText]}>
                  {(quoteBreakdown?.minimumUnits ?? 0n).toString()} units ({quoteBreakdown?.display.minimum ?? "0"} {toToken})
                </Text>
              </View>
            </View>
          )}

          <View style={styles.noticeBar}>
            <AlertTriangle size={13} color={colors.warning} />
            <Text style={styles.noticeText}>
              All amounts are quantized to tongo units
            </Text>
          </View>

          {hasQuote || isExecutingSwap ? (
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>{statusText}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          {...testProps(testIDs.swap.confirm)}
          style={[styles.ctaButton, (!canReview || isExecutingSwap) && styles.ctaButtonDisabled]}
          onPress={onPrimaryAction}
          disabled={!canReview || isExecutingSwap}
        >
          {isExecutingSwap ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Repeat size={16} color="#FFFFFF" />
          )}
          <Text style={styles.ctaText}>{isExecutingSwap ? "Executing..." : "Confirm Quote"}</Text>
        </Pressable>
      </View>

      <Modal
        visible={showSlippageModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSlippageModal(false)}
      >
        <View style={styles.progressOverlay}>
          <View style={styles.slippageCard}>
            <Text style={styles.slippageTitle}>Slippage tolerance</Text>
            <Text style={styles.slippageSubtitle}>Pick a preset or enter a custom percentage</Text>

            <View style={styles.slippagePresetRow}>
              {[0.1, 0.5, 1, 3].map((preset) => (
                <Pressable
                  key={preset}
                  style={styles.slippagePresetButton}
                  onPress={() => applySlippagePercent(preset)}
                >
                  <Text style={styles.slippagePresetText}>{preset.toFixed(2)}%</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.slippageCustomLabel}>Custom percentage</Text>
            <TextInput
              value={slippageInput}
              onChangeText={(value) => {
                setSlippageInput(value.replace(/[^0-9.]/g, ""));
                setSlippageInputError(null);
              }}
              keyboardType="decimal-pad"
              placeholder="0.50"
              placeholderTextColor={colors.textMuted}
              style={styles.slippageInput}
            />
            {slippageInputError ? <Text style={styles.slippageError}>{slippageInputError}</Text> : null}

            <View style={styles.slippageActions}>
              <Pressable style={styles.slippageCancelButton} onPress={() => setShowSlippageModal(false)}>
                <Text style={styles.slippageCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.slippageApplyButton} onPress={applyCustomSlippage}>
                <Text style={styles.slippageApplyText}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showProgressModal} transparent animationType="fade" statusBarTranslucent>
        <View style={swapModalStyles.overlay}>
          <View style={swapModalStyles.card} {...testProps(testIDs.swap.progressModal)}>
            <View style={swapModalStyles.swapIconWrap}>
              <Animated.View style={{ transform: [{ rotate: progressRotate }] }}>
                <Repeat size={24} color="#10B981" />
              </Animated.View>
            </View>
            <Text style={swapModalStyles.sendingTitle}>Processing Swap...</Text>
            <Text style={swapModalStyles.description}>
              {"Your private swap is being\nprocessed on Starknet"}
            </Text>

            <View style={swapModalStyles.stepperCard}>
              {swapStepTimeline.map((step) => {
                const isDone = step.status === "success";
                const isFailed = step.status === "failed";
                const isActive = step.status === "running";
                return (
                  <View key={step.key} style={swapModalStyles.stepRow}>
                    <View
                      style={[
                        swapModalStyles.stepDot,
                        isDone && swapModalStyles.stepDotDone,
                        isActive && swapModalStyles.stepDotActive,
                        isFailed && swapModalStyles.stepDotFailed,
                      ]}
                    >
                      {isActive ? (
                        <ActivityIndicator size={14} color="#10B981" />
                      ) : isDone ? (
                        <Check size={14} color="#FFFFFF" />
                      ) : isFailed ? (
                        <X size={14} color="#FFFFFF" />
                      ) : null}
                    </View>
                    <Text
                      style={[
                        swapModalStyles.stepText,
                        isDone && swapModalStyles.stepTextDone,
                        isActive && swapModalStyles.stepTextActive,
                        isFailed && swapModalStyles.stepTextFailed,
                      ]}
                    >
                      {step.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showCompleteModal && swapResult === "success"} transparent animationType="fade" statusBarTranslucent>
        <View style={swapModalStyles.overlay}>
          <View style={[swapModalStyles.card, { gap: 20, position: "relative", overflow: "hidden" }]} {...testProps(testIDs.swap.completeModal)}>
            <Confetti />
            <View style={swapModalStyles.successCircle}>
              <Check size={36} color="#10B981" />
            </View>
            <Text style={swapModalStyles.successTitle}>Swap Complete!</Text>
            <Text style={swapModalStyles.description}>Your private swap settled successfully.</Text>

            <View style={swapModalStyles.detailCard}>
              <View style={swapModalStyles.detailRow}>
                <Text style={swapModalStyles.detailLabel}>Pair</Text>
                <Text style={swapModalStyles.detailValue}>{fromToken} → {toToken}</Text>
              </View>
              <View style={swapModalStyles.detailRow}>
                <Text style={swapModalStyles.detailLabel}>Sent</Text>
                <Text style={swapModalStyles.detailValue}>{(quoteBreakdown?.sentUnits ?? 0n).toString()} tongo units</Text>
              </View>
              <View style={swapModalStyles.detailRow}>
                <Text style={swapModalStyles.detailLabel}>Received</Text>
                <Text style={[swapModalStyles.detailValue, { color: "#10B981" }]}>
                  {(quoteBreakdown?.minimumUnits ?? 0n).toString()} tongo units
                </Text>
              </View>
              <View style={swapModalStyles.detailRow}>
                <Text style={swapModalStyles.detailLabel}>Tx Hash</Text>
                <Text style={[swapModalStyles.detailValue, { color: "#3B82F6" }]} numberOfLines={1} ellipsizeMode="middle">
                  {lastSwapTxHash ? `${lastSwapTxHash.slice(0, 10)}...${lastSwapTxHash.slice(-8)}` : "-"}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              {...testProps(testIDs.swap.completeDone)}
              style={swapModalStyles.doneButton}
              onPress={() => setSwapOverlayMode("none")}
              activeOpacity={0.8}
            >
              <Check size={18} color="#fff" />
              <Text style={swapModalStyles.doneButtonText}>Done</Text>
            </TouchableOpacity>

            <TouchableOpacity
              {...testProps(testIDs.swap.completeViewDetails)}
              onPress={() => {
                setSwapOverlayMode("none");
                navigation.getParent()?.navigate("SwapDetail", {
                  pair: `${fromToken} → ${toToken}`,
                  sentUnits: (quoteBreakdown?.sentUnits ?? 0n).toString(),
                  receivedUnits: (quoteBreakdown?.minimumUnits ?? 0n).toString(),
                  sentDisplay: quoteBreakdown?.display.input ?? "0",
                  receivedDisplay: quoteBreakdown?.display.minimum ?? "0",
                  fromToken,
                  toToken,
                  rateDisplay: quoteBreakdown?.display.effectiveRate
                    ? `1 ${fromToken} ≈ ${quoteBreakdown.display.effectiveRate} ${toToken}`
                    : "-",
                  routeDisplay: `${fromToken} pool → ${toToken} pool`,
                  txHash: lastSwapTxHash ?? "-",
                  status: "Settled",
                  sellAmountErc20: quoteBreakdown?.display.input
                    ? `${quoteBreakdown.display.input} ${fromToken}`
                    : undefined,
                  estimatedBuyErc20: quoteBreakdown?.display.estimated
                    ? `${quoteBreakdown.display.estimated} ${toToken}`
                    : undefined,
                  minBuyErc20: quoteBreakdown?.display.minimum
                    ? `${quoteBreakdown.display.minimum} ${toToken}`
                    : undefined,
                  gasFee: quoteBreakdown?.display.gasFeeEth
                    ? `${quoteBreakdown.display.gasFeeEth} ETH`
                    : undefined,
                });
              }}
            >
              <Text style={swapModalStyles.explorerLink}>View swap details</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showCompleteModal && swapResult === "failure"} transparent animationType="fade" statusBarTranslucent>
        <View style={swapModalStyles.overlay}>
          <View style={[swapModalStyles.card, swapModalStyles.failedCard, { gap: 20 }]}>
            <View style={swapModalStyles.errorCircle}>
              <X size={36} color="#EF4444" />
            </View>
            <Text style={swapModalStyles.failedTitle}>Swap Failed</Text>
            <Text style={swapModalStyles.description}>
              {"The swap could not be completed.\nPlease try again."}
            </Text>
            <View style={swapModalStyles.errorBox}>
              <X size={18} color="#EF4444" style={{ flexShrink: 0 }} />
              <Text style={swapModalStyles.errorBoxText} numberOfLines={5}>
                {swapResultMessage}
              </Text>
            </View>
            {swapErrorDetail ? (
              <Pressable
                style={swapModalStyles.errorCopyButton}
                hitSlop={8}
                onPress={() => {
                  Clipboard.setString(swapErrorDetail);
                  setErrorCopied(true);
                }}
              >
                <Text style={swapModalStyles.errorCopyText}>{errorCopied ? "Copied" : "Copy full error"}</Text>
              </Pressable>
            ) : null}
            <TouchableOpacity
              {...testProps(testIDs.swap.completeDone)}
              style={swapModalStyles.cancelButton}
              onPress={() => setSwapOverlayMode("none")}
              activeOpacity={0.8}
            >
              <Text style={swapModalStyles.cancelButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!tokenPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setTokenPicker(null)}
      >
        <View style={styles.progressOverlay}>
          <View style={styles.tokenPickerCard}>
            <Text style={styles.tokenPickerTitle}>
              Choose {tokenPicker?.side === "to" ? "to" : "from"} token
            </Text>
            {tokenList.map((token) => (
              <Pressable
                key={token}
                style={styles.tokenPickerRow}
                onPress={() => selectToken(tokenPicker?.side || "from", token)}
              >
                <Text style={styles.tokenPickerToken}>{token}</Text>
                <Text style={styles.tokenPickerPool}>pool</Text>
              </Pressable>
            ))}
            <Pressable style={styles.tokenPickerClose} onPress={() => setTokenPicker(null)}>
              <Text style={styles.tokenPickerCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 18,
    gap: 24,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 2,
    fontFamily: typography.primarySemibold,
  },
  metricRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  tokenSelectorRow: {
    flexDirection: "row",
    gap: 8,
  },
  tokenPill: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tokenPillLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: typography.secondary,
  },
  tokenPillValue: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontFamily: typography.primarySemibold,
  },
  metricChip: {
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  metricDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  metricText: {
    color: colors.text,
    fontSize: 12,
    fontFamily: typography.secondarySemibold,
    flexShrink: 1,
  },
  amountCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    paddingVertical: 14,
    alignItems: "center",
    gap: 0,
  },
  amountValue: {
    color: colors.text,
    fontSize: 48,
    lineHeight: 52,
    fontFamily: typography.primarySemibold,
  },
  amountInput: {
    color: colors.text,
    fontSize: 40,
    lineHeight: 52,
    fontFamily: typography.primary,
    textAlign: "center",
    width: "100%",
    paddingHorizontal: 24,
    paddingVertical: 0,
  },
  amountUnit: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: typography.primary,
    marginTop: -4,
  },
  availableInline: {
    color: colors.success,
    fontSize: 13,
    fontFamily: typography.secondarySemibold,
  },
  availableInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  availableMax: {
    color: colors.success,
    fontSize: 13,
    fontFamily: typography.primarySemibold,
  },
  slippageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  slippageEditButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  slippageLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: typography.secondary,
  },
  slippageValue: {
    color: colors.success,
    fontSize: 12,
    fontFamily: typography.primarySemibold,
  },
  slippageCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 10,
  },
  slippageTitle: {
    color: colors.text,
    fontSize: 16,
    fontFamily: typography.primarySemibold,
  },
  slippageSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: typography.secondary,
  },
  slippagePresetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  slippagePresetButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 12,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  slippagePresetText: {
    color: colors.text,
    fontSize: 12,
    fontFamily: typography.secondarySemibold,
  },
  slippageCustomLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: typography.secondarySemibold,
    letterSpacing: 0.3,
  },
  slippageInput: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 14,
    fontFamily: typography.primarySemibold,
  },
  slippageError: {
    color: colors.warning,
    fontSize: 11,
    fontFamily: typography.secondarySemibold,
  },
  slippageActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  slippageCancelButton: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inputBg,
  },
  slippageCancelText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: typography.secondarySemibold,
  },
  slippageApplyButton: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  slippageApplyText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: typography.primarySemibold,
  },
  quoteCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  quoteLoadingCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  quoteLoadingText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: typography.secondarySemibold,
  },
  quoteHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  quoteRefreshButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  quoteErrorText: {
    color: colors.warning,
    fontSize: 12,
    fontFamily: typography.secondarySemibold,
    textAlign: "center",
  },
  quoteRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingVertical: 8,
  },
  quoteRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 2,
  },
  quoteLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: typography.secondarySemibold,
    flexShrink: 1,
  },
  quoteValue: {
    color: colors.text,
    fontSize: 12,
    fontFamily: typography.primarySemibold,
    textAlign: "right",
    flexShrink: 1,
  },
  warningText: {
    color: colors.warning,
  },
  noticeBar: {
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.25)",
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  noticeText: {
    color: colors.warning,
    fontSize: 11,
    fontFamily: typography.primary,
  },
  statusPill: {
    height: 34,
    borderRadius: 999,
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  statusText: {
    color: colors.primaryLight,
    fontSize: 11,
    fontFamily: typography.primarySemibold,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 6,
    paddingBottom: 12,
  },
  ctaButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  ctaButtonDisabled: {
    opacity: 0.45,
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: typography.primarySemibold,
  },
  progressOverlay: {
    flex: 1,
    backgroundColor: "rgba(10, 15, 28, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  tokenPickerCard: {
    width: "100%",
    maxWidth: 300,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },
  tokenPickerTitle: {
    color: colors.text,
    fontSize: 14,
    fontFamily: typography.primarySemibold,
    marginBottom: 4,
  },
  tokenPickerRow: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.bg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  tokenPickerToken: {
    color: colors.text,
    fontSize: 13,
    fontFamily: typography.primarySemibold,
  },
  tokenPickerPool: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: typography.secondary,
  },
  tokenPickerClose: {
    marginTop: 4,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  tokenPickerCloseText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: typography.primarySemibold,
  },
});

/* ─── Swap modal styles (matches SendScreen pattern) ───────────────── */

const swapModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10, 15, 28, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    width: 320,
    backgroundColor: "#1E293B",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2D3B4D",
    paddingTop: 40,
    paddingHorizontal: 32,
    paddingBottom: 32,
    alignItems: "center",
    gap: 24,
  },
  failedCard: {
    borderColor: "rgba(239, 68, 68, 0.25)",
  },

  /* Swap icon */
  swapIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(16, 185, 129, 0.13)",
    borderWidth: 2,
    borderColor: "rgba(16, 185, 129, 0.4)",
    justifyContent: "center",
    alignItems: "center",
  },

  /* Sending */
  sendingTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#F8FAFC",
    fontFamily: typography.primarySemibold,
  },
  description: {
    fontSize: 14,
    color: "#94A3B8",
    fontFamily: typography.secondary,
    textAlign: "center",
    lineHeight: 21,
  },

  /* Step list */
  stepperCard: {
    width: "100%",
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#64748B",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotDone: {
    borderColor: "#10B981",
    backgroundColor: "#10B981",
  },
  stepDotActive: {
    borderWidth: 1.5,
    borderColor: "#10B981",
    backgroundColor: "transparent",
  },
  stepDotFailed: {
    borderColor: "#EF4444",
    backgroundColor: "#EF4444",
  },
  stepText: {
    fontSize: 15,
    color: "#64748B",
    fontFamily: typography.secondary,
  },
  stepTextDone: {
    color: "#64748B",
  },
  stepTextActive: {
    color: "#F8FAFC",
    fontWeight: "700",
    fontFamily: typography.secondarySemibold,
  },
  stepTextFailed: {
    color: "#EF4444",
  },

  /* Success */
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(16, 185, 129, 0.13)",
    borderWidth: 3,
    borderColor: "#10B981",
    justifyContent: "center",
    alignItems: "center",
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#10B981",
    fontFamily: typography.primarySemibold,
  },
  detailCard: {
    width: "100%",
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailLabel: {
    fontSize: 12,
    color: "#64748B",
    fontFamily: typography.primary,
  },
  detailValue: {
    fontSize: 12,
    color: "#F8FAFC",
    fontFamily: typography.primarySemibold,
    flexShrink: 1,
    textAlign: "right",
    maxWidth: "60%",
  },
  doneButton: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    backgroundColor: "#10B981",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
    fontFamily: typography.primarySemibold,
  },
  explorerLink: {
    fontSize: 13,
    color: "#3B82F6",
    fontFamily: typography.primarySemibold,
  },

  /* Failed */
  errorCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(239, 68, 68, 0.13)",
    borderWidth: 3,
    borderColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
  },
  failedTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#EF4444",
    fontFamily: typography.primarySemibold,
  },
  errorBox: {
    width: "100%",
    backgroundColor: "rgba(239, 68, 68, 0.06)",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.19)",
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  errorBoxText: {
    flex: 1,
    fontSize: 12,
    color: "#EF4444",
    opacity: 0.9,
    fontFamily: typography.secondary,
    lineHeight: 16.8,
  },
  errorCopyButton: {
    alignSelf: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.5)",
    backgroundColor: "rgba(153, 27, 27, 0.28)",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  errorCopyText: {
    color: "#FCA5A5",
    fontSize: 11,
    fontFamily: typography.secondarySemibold,
  },
  cancelButton: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2D3B4D",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#94A3B8",
    fontFamily: typography.primarySemibold,
  },
});
