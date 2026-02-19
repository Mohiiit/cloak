"use client";

import React, { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Shield,
  CheckCircle,
  Send,
  User,
  Globe,
  Users,
  Lock,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "@starknet-react/core";
import { CallData, uint256 } from "starknet";
import { useTongo } from "~~/components/providers/TongoProvider";
import { useTongoBalance } from "~~/hooks/useTongoBalance";
import { useTongoTransfer } from "~~/hooks/useTongoTransfer";
import { useTransactionRouter } from "~~/hooks/useTransactionRouter";
import { useContacts } from "~~/hooks/useContacts";
import { use2FA } from "~~/hooks/use2FA";
import { check2FAEnabled, fetchWalletNonce } from "~~/lib/two-factor";
import { TwoFactorWaiting } from "~~/components/TwoFactorWaiting";
import { FeeRetryModal } from "~~/components/FeeRetryModal";
import { padAddress } from "~~/lib/address";
import { TOKENS, parseTokenAmount } from "~~/lib/tokens";
import { saveTxNote } from "~~/lib/storage";
import { parseInsufficientGasError } from "@cloak-wallet/sdk";
import toast from "react-hot-toast";

type SendMode = "private" | "public";

type Step = "recipient" | "amount" | "note" | "success";

export default function SendPage() {
  const router = useRouter();
  const { status, address } = useAccount();
  const { selectedToken, tongoAccount, tongoAddress } = useTongo();
  const { shieldedDisplay, balance } = useTongoBalance();
  const { transfer, isPending } = useTongoTransfer();
  const { executeOrRoute } = useTransactionRouter();
  const { contacts } = useContacts();
  const { gate, isWaiting: is2FAWaiting, status: twoFAStatus, cancel: cancel2FA } = use2FA();
  const tokenConfig = TOKENS[selectedToken];

  const [sendMode, setSendMode] = useState<SendMode>("private");
  const [step, setStep] = useState<Step>("recipient");
  const [isPublicSending, setIsPublicSending] = useState(false);
  const [recipientAddress, setRecipientAddress] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [privacyLevel, setPrivacyLevel] = useState<
    "public" | "friends" | "private"
  >("public");
  const [txHash, setTxHash] = useState("");
  const [addressError, setAddressError] = useState("");
  const [showFeeRetry, setShowFeeRetry] = useState(false);
  const [gasErrorMsg, setGasErrorMsg] = useState("");
  const [feeRetryCount, setFeeRetryCount] = useState(0);

  if (status !== "connected") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <Send className="w-12 h-12 text-slate-600 mb-4" />
        <p className="text-slate-400">
          Connect your wallet to send payments
        </p>
      </div>
    );
  }

  const handleSend = async () => {
    if (!tongoAccount || !recipientAddress || !amount || !address) return;
    setFeeRetryCount(0);

    try {
      const erc20Amount = parseTokenAmount(amount, tokenConfig.decimals);
      const tongoAmount = await tongoAccount.erc20ToTongo(erc20Amount);

      // Check if 2FA is enabled for this wallet
      const is2FA = await check2FAEnabled(address);
      if (is2FA) {
        // Prepare transfer calls to serialize for mobile approval
        const { pubKeyBase58ToAffine } = await import("@fatsolutions/tongo-sdk");
        const recipientPubKey = pubKeyBase58ToAffine(recipientAddress);
        const transferOp = await tongoAccount.transfer({
          amount: tongoAmount,
          to: recipientPubKey,
          sender: padAddress(address),
        });
        const calls = [transferOp.toCalldata()];
        const callsJson = JSON.stringify(calls, (_k, v) =>
          typeof v === "bigint" ? v.toString() : v,
        );

        const result = await gate({
          walletAddress: address,
          action: "transfer",
          token: selectedToken,
          amount,
          recipient: recipientAddress,
          callsJson,
          sig1Json: "[]", // web cannot sign — mobile handles both keys
          nonce: await fetchWalletNonce(address),
          resourceBoundsJson: "{}",
          txHash: "",
        });

        if (result.approved) {
          const finalHash = result.txHash || "";
          setTxHash(finalHash);
          saveTxNote(finalHash, {
            txHash: finalHash,
            recipient: recipientAddress,
            recipientName: recipientName || undefined,
            note: note || undefined,
            privacyLevel,
            timestamp: Math.floor(Date.now() / 1000),
            type: "send",
            token: selectedToken,
            amount,
          });
          toast.success("Payment sent (approved via mobile)!");
          setStep("success");
        } else {
          toast.error(result.error || "2FA approval failed");
        }
        return;
      }

      const hash = await transfer(recipientAddress, tongoAmount);
      if (hash) {
        setTxHash(hash);
        // Save metadata locally
        saveTxNote(hash, {
          txHash: hash,
          recipient: recipientAddress,
          recipientName: recipientName || undefined,
          note: note || undefined,
          privacyLevel,
          timestamp: Math.floor(Date.now() / 1000),
          type: "send",
          token: selectedToken,
          amount,
        });
        setStep("success");
      }
    } catch (err: any) {
      const msg = err?.message || "Transfer failed";
      const gasInfo = parseInsufficientGasError(msg);
      if (gasInfo && feeRetryCount < 3) {
        setGasErrorMsg(msg);
        setShowFeeRetry(true);
      } else {
        const lower = msg.toLowerCase();
        if (lower.includes("invalid point") || lower.includes("expected length of 33")) {
          toast.error("Invalid recipient address. Please check and try again.");
        } else if (lower.includes("nonce too old") || lower.includes("invalid transaction nonce")) {
          toast.error("Transaction conflict. Please try again.");
        } else if (lower.includes("execution reverted")) {
          toast.error("Transaction was rejected by the network.");
        } else if (lower.includes("timeout")) {
          toast.error("Request timed out. Check your connection.");
        } else {
          toast.error(msg);
        }
      }
    }
  };

  const handleFeeRetry = () => {
    setFeeRetryCount(prev => prev + 1);
    setShowFeeRetry(false);
    if (sendMode === "public") {
      handlePublicSend();
    } else {
      handleSend();
    }
  };

  const handlePublicSend = async () => {
    if (!recipientAddress || !amount || !address) return;
    setIsPublicSending(true);
    setFeeRetryCount(0);

    try {
      const amountWei = parseTokenAmount(amount, tokenConfig.decimals);
      const calls = [
        {
          contractAddress: tokenConfig.erc20Address,
          entrypoint: "transfer",
          calldata: CallData.compile({
            recipient: recipientAddress,
            amount: uint256.bnToUint256(amountWei),
          }),
        },
      ];

      const hash = await executeOrRoute(calls, {
        action: "erc20_transfer",
        token: selectedToken,
        amount,
        recipient: recipientAddress,
      });

      if (hash) {
        setTxHash(hash);
        saveTxNote(hash, {
          txHash: hash,
          recipient: recipientAddress,
          recipientName: recipientName || undefined,
          note: note || undefined,
          privacyLevel,
          timestamp: Math.floor(Date.now() / 1000),
          type: "send",
          token: selectedToken,
          amount,
        });
        toast.success("Public transfer sent!");
        setStep("success");
      }
    } catch (err: any) {
      const msg = err?.message || "Transfer failed";
      const gasInfo = parseInsufficientGasError(msg);
      if (gasInfo && feeRetryCount < 3) {
        setGasErrorMsg(msg);
        setShowFeeRetry(true);
      } else {
        const lower = msg.toLowerCase();
        if (lower.includes("nonce too old") || lower.includes("invalid transaction nonce")) {
          toast.error("Transaction conflict. Please try again.");
        } else if (lower.includes("execution reverted")) {
          toast.error("Transaction was rejected by the network.");
        } else if (lower.includes("timeout")) {
          toast.error("Request timed out. Check your connection.");
        } else {
          toast.error(msg);
        }
      }
    } finally {
      setIsPublicSending(false);
    }
  };

  const quickEmojis = ["🍕", "🍔", "🍺", "🎵", "🏠", "🚗", "🎮", "🎬", "💰", "🎉", "🎂", "✈️"];

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        {step !== "success" && step !== "recipient" && (
          <button
            onClick={() => {
              if (step === "amount") setStep("recipient");
              if (step === "note") setStep("amount");
            }}
            className="text-slate-400 hover:text-slate-200"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <h1 className="text-lg font-semibold text-slate-50">
          {step === "success" ? "Payment Sent!" : "Send Payment"}
        </h1>
      </div>

      {/* Mode toggle */}
      {step === "recipient" && (
        <div className="flex rounded-xl bg-slate-800/50 border border-slate-700/30 p-1">
          <button
            onClick={() => { setSendMode("private"); setRecipientAddress(""); setAmount(""); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              sendMode === "private"
                ? "bg-violet-600/20 text-violet-300"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Private
          </button>
          <button
            onClick={() => { setSendMode("public"); setRecipientAddress(""); setAmount(""); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              sendMode === "public"
                ? "bg-blue-600/20 text-blue-300"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            Public
          </button>
        </div>
      )}

      {/* Step indicator */}
      {step !== "success" && (
        <div className="flex gap-2">
          {(
            [
              { key: "recipient", label: "To" },
              { key: "amount", label: "Amount" },
              { key: "note", label: "Confirm" },
            ] as const
          ).map(({ key, label }, i) => {
            const currentIdx = (["recipient", "amount", "note"] as const).indexOf(step);
            const isCompleted = currentIdx > i;
            const isActive = currentIdx === i;
            return (
              <div key={key} className="flex-1 flex flex-col items-center gap-1">
                <span
                  className={`text-[10px] font-medium ${
                    isActive
                      ? "text-blue-400"
                      : isCompleted
                        ? "text-blue-400/60"
                        : "text-slate-600"
                  }`}
                >
                  {label}
                </span>
                <div
                  className={`w-full h-1 rounded-full transition-colors ${
                    isActive || isCompleted ? "bg-blue-500" : "bg-slate-700/50"
                  }`}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Step: Recipient */}
      {step === "recipient" && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-sm text-slate-400 mb-2 block">
              {sendMode === "public" ? "Recipient Starknet Address" : "Recipient Cloak Address"}
            </label>
            <input
              type="text"
              placeholder={sendMode === "public" ? "0x..." : "Enter recipient's Cloak address"}
              value={recipientAddress}
              onChange={(e) => { setRecipientAddress(e.target.value); setAddressError(""); }}
              spellCheck={false}
              autoComplete="off"
              className={`w-full bg-slate-800 rounded-xl border px-4 py-3 text-slate-50 outline-none focus:border-blue-500/50 transition-colors font-mono text-sm ${addressError ? "border-red-500/50" : "border-slate-700/50"}`}
            />
            {addressError && (
              <p className="text-red-400 text-xs mt-1">{addressError}</p>
            )}
            {sendMode === "public" && (
              <p className="text-xs text-slate-500 mt-1">
                Standard ERC-20 transfer (not shielded)
              </p>
            )}
          </div>

          <div>
            <label className="text-sm text-slate-400 mb-2 block">
              Nickname (optional)
            </label>
            <input
              type="text"
              placeholder="alice.stark"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              className="w-full bg-slate-800 rounded-xl border border-slate-700/50 px-4 py-3 text-slate-50 outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>

          {/* Contacts (only in private mode — contacts store Tongo addresses) */}
          {sendMode === "private" && contacts.length > 0 && (
            <div>
              <label className="text-sm text-slate-400 mb-2 block">
                From Contacts
              </label>
              <div className="flex flex-col gap-2">
                {contacts.slice(0, 5).map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => {
                      setRecipientAddress(contact.tongoAddress);
                      setRecipientName(
                        contact.nickname ||
                          contact.starkName ||
                          ""
                      );
                    }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/30 hover:border-blue-500/30 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                      <User className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">
                        {contact.nickname ||
                          contact.starkName ||
                          "Unknown"}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {contact.tongoAddress}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={async () => {
              if (!recipientAddress) {
                toast.error("Enter a recipient address");
                return;
              }
              if (sendMode === "public") {
                // Validate Starknet hex address
                const trimmed = recipientAddress.trim();
                if (!/^0x[0-9a-fA-F]{1,64}$/.test(trimmed)) {
                  setAddressError("Invalid Starknet address. Must be a hex address starting with 0x.");
                  return;
                }
                setAddressError("");
                setStep("amount");
                return;
              }
              try {
                const { validateTongoAddress } = await import("@cloak-wallet/sdk");
                if (!validateTongoAddress(recipientAddress.trim())) {
                  setAddressError("Invalid Cloak address. Please check and try again.");
                  return;
                }
              } catch {
                // SDK import failed — skip validation
              }
              setAddressError("");
              setStep("amount");
            }}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-medium transition-colors"
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Step: Amount */}
      {step === "amount" && (
        <div className="flex flex-col gap-4">
          <div className="text-center py-4">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                const v = e.target.value;
                if (/^\d*\.?\d*$/.test(v)) setAmount(v);
              }}
              className="bg-transparent text-4xl font-bold text-slate-50 outline-none text-center w-full"
              autoFocus
            />
            <p className="text-slate-400 mt-1">{selectedToken}</p>
          </div>

          {sendMode === "private" && (
            <>
              <p className="text-xs text-slate-500 text-center">
                Available: {shieldedDisplay} {selectedToken}
              </p>

              <div className="flex gap-2">
                {["25%", "50%", "MAX"].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => {
                      const mult =
                        pct === "MAX" ? 1 : pct === "50%" ? 0.5 : 0.25;
                      const val =
                        parseFloat(shieldedDisplay || "0") * mult;
                      setAmount(val > 0 ? val.toString() : "");
                    }}
                    className="flex-1 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"
                  >
                    {pct}
                  </button>
                ))}
              </div>
            </>
          )}
          {sendMode === "public" && (
            <p className="text-xs text-slate-500 text-center">
              Enter amount in {selectedToken} (public ERC-20 transfer)
            </p>
          )}

          <button
            onClick={() => {
              if (
                !amount ||
                parseFloat(amount) <= 0
              ) {
                toast.error("Enter a valid amount");
                return;
              }
              setStep("note");
            }}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-medium transition-colors"
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Step: Note + Confirm */}
      {step === "note" && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-sm text-slate-400 mb-2 block">
              Add a note
            </label>
            <input
              type="text"
              placeholder="What's this for?"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 100))}
              maxLength={100}
              className="w-full bg-slate-800 rounded-xl border border-slate-700/50 px-4 py-3 text-slate-50 outline-none focus:border-blue-500/50 transition-colors"
              autoFocus
            />
            <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1 scrollbar-hide">
              {quickEmojis.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => setNote((prev) => prev + emoji)}
                  className="text-lg w-9 h-9 flex items-center justify-center rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/30 hover:border-blue-500/30 transition-all hover:scale-105 shrink-0"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Privacy selector */}
          <div>
            <label className="text-sm text-slate-400 mb-2 block">
              Privacy
            </label>
            <div className="flex gap-2">
              {(
                [
                  { key: "public", label: "Public", Icon: Globe },
                  { key: "friends", label: "Friends", Icon: Users },
                  { key: "private", label: "Private", Icon: Lock },
                ] as const
              ).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  onClick={() => setPrivacyLevel(key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-sm font-medium transition-colors border ${
                    privacyLevel === key
                      ? "bg-blue-600/20 border-blue-500/50 text-blue-300"
                      : "bg-slate-800 border-slate-700/50 text-slate-400"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/30">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-400">Mode</span>
              <span className={`text-sm font-medium ${sendMode === "private" ? "text-violet-300" : "text-blue-300"}`}>
                {sendMode === "private" ? "Private (Shielded)" : "Public (ERC-20)"}
              </span>
            </div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-400">To</span>
              <span className="text-slate-200 truncate ml-4 max-w-[200px]">
                {recipientName || recipientAddress}
              </span>
            </div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-400">Amount</span>
              <span className="text-slate-200">
                {amount} {selectedToken}
              </span>
            </div>
            {note && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Note</span>
                <span className="text-slate-200 truncate ml-4 max-w-[200px]">
                  {note}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={sendMode === "public" ? handlePublicSend : handleSend}
            disabled={isPending || isPublicSending}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-medium transition-colors disabled:opacity-50"
          >
            {isPending || isPublicSending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Sending...
              </>
            ) : (
              <>
                {sendMode === "private" ? (
                  <Shield className="w-4 h-4" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {sendMode === "private" ? "Send Payment" : "Send Public Transfer"}
              </>
            )}
          </button>
        </div>
      )}

      {/* Step: Success */}
      {step === "success" && (
        <div className="flex flex-col items-center text-center gap-4 py-8">
          <div className="relative">
            <div className="absolute inset-0 bg-green-500/20 rounded-full blur-2xl" />
            <CheckCircle className="w-16 h-16 text-green-400 relative" />
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-50 mb-1">
              {sendMode === "public" ? "Transfer Sent!" : "Payment Sent!"}
            </p>
            <p className="text-sm text-slate-400">
              {amount} {selectedToken} sent to{" "}
              {recipientName || "recipient"}
              {sendMode === "public" && " (public)"}
            </p>
          </div>
          {note && (
            <p className="text-slate-300 bg-slate-800/50 rounded-xl px-4 py-2">
              {note}
            </p>
          )}
          <div className="flex gap-3 w-full mt-4">
            <button
              onClick={() => {
                setStep("recipient");
                setSendMode("private");
                setRecipientAddress("");
                setRecipientName("");
                setAmount("");
                setNote("");
                setTxHash("");
                setAddressError("");
              }}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Send Another
            </button>
            <Link
              href="/"
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors text-center"
            >
              Done
            </Link>
          </div>
        </div>
      )}

      {/* 2FA Waiting Modal */}
      <TwoFactorWaiting
        isOpen={is2FAWaiting}
        status={twoFAStatus}
        onCancel={cancel2FA}
      />

      {/* Fee Retry Modal */}
      <FeeRetryModal
        isOpen={showFeeRetry}
        errorMessage={gasErrorMsg}
        retryCount={feeRetryCount}
        maxRetries={3}
        isRetrying={isPending}
        onRetry={handleFeeRetry}
        onCancel={() => setShowFeeRetry(false)}
      />
    </div>
  );
}
