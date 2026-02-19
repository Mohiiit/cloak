import React, { useState, useRef, useEffect } from "react";
import { TOKENS, parseTokenAmount, validateTongoAddress, parseInsufficientGasError } from "@cloak-wallet/sdk";
import { Header, ErrorBox } from "./ShieldForm";
import type { useExtensionWallet } from "../hooks/useExtensionWallet";
import { saveTxNote, type TxMetadata } from "../lib/storage";
import { useContacts } from "../hooks/useContacts";
import { TxConfirmModal } from "./TxConfirmModal";
import { TxSuccessModal } from "./TxSuccessModal";
import { TwoFactorWaiting } from "./TwoFactorWaiting";
import { FeeRetryModal } from "./FeeRetryModal";
import { useWard } from "../hooks/useWard";

interface Props {
  wallet: ReturnType<typeof useExtensionWallet>;
  onBack: () => void;
}

export function SendForm({ wallet: w, onBack }: Props) {
  const { isWard } = useWard(w.wallet?.starkAddress);
  const { contacts } = useContacts();
  const [sendMode, setSendMode] = useState<"private" | "public">("private");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [addressError, setAddressError] = useState("");
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [show2FAWaiting, setShow2FAWaiting] = useState(false);
  const [twoFAStatus, setTwoFAStatus] = useState("");
  const [showFeeRetry, setShowFeeRetry] = useState(false);
  const [gasErrorMsg, setGasErrorMsg] = useState("");
  const [feeRetryCount, setFeeRetryCount] = useState(0);
  const abortController = useRef<AbortController | null>(null);

  const token = TOKENS[w.selectedToken];
  const isPublic = sendMode === "public";

  const handleRequestConfirm = () => {
    if (!amount || !recipient) return;
    setFeeRetryCount(0);

    if (isPublic) {
      const addr = recipient.trim();
      if (!addr.startsWith("0x") || !/^0x[0-9a-fA-F]+$/.test(addr)) {
        setAddressError("Invalid Starknet address. Must be a hex address starting with 0x.");
        return;
      }
      setAddressError("");
      const erc20Amount = parseTokenAmount(amount, token.decimals);
      if (erc20Amount <= 0n) {
        w.setError("Amount too small");
        return;
      }
      setShowConfirm(true);
      return;
    }

    if (!validateTongoAddress(recipient.trim())) {
      setAddressError("Invalid Cloak address. Please check and try again.");
      return;
    }
    setAddressError("");
    const erc20Amount = parseTokenAmount(amount, token.decimals);
    const tongoAmount = erc20Amount / token.rate;
    if (tongoAmount <= 0n) {
      w.setError("Amount too small");
      return;
    }
    setShowConfirm(true);
  };

  // Listen for 2FA/ward status updates from background
  useEffect(() => {
    const listener = (msg: any) => {
      if (msg.type === "2FA_STATUS_UPDATE" && loading) {
        setShow2FAWaiting(true);
        setTwoFAStatus(msg.status);
      }
      if (msg.type === "2FA_COMPLETE" && loading) {
        setShow2FAWaiting(false);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [loading]);

  const handleConfirmedSubmit = async () => {
    setShowConfirm(false);
    setLoading(true);
    try {
      let hash: string | null = null;

      if (isPublic) {
        // Public ERC-20 transfer
        hash = await w.erc20Transfer(recipient.trim(), amount);
      } else {
        // Private shielded transfer
        const erc20Amount = parseTokenAmount(amount, token.decimals);
        const tongoAmount = erc20Amount / token.rate;
        hash = await w.transfer(recipient.trim(), tongoAmount);
      }

      setShow2FAWaiting(false);
      if (hash) {
        setTxHash(hash);
        await saveTxNote(hash, {
          txHash: hash,
          recipient: recipient.trim(),
          recipientName: undefined,
          note: undefined,
          privacyLevel: isPublic ? "public" : "private",
          timestamp: Date.now(),
          type: isPublic ? "erc20_transfer" : "send",
          token: w.selectedToken,
          amount: amount,
        });
        setShowSuccess(true);
      }
    } catch (e: any) {
      const gasInfo = parseInsufficientGasError(e?.message || "");
      if (gasInfo && feeRetryCount < 3) {
        setGasErrorMsg(e.message);
        setShowFeeRetry(true);
      } else {
        w.setError(e?.message || "Send failed");
      }
    } finally {
      setLoading(false);
      setShow2FAWaiting(false);
    }
  };

  const handleFeeRetry = () => {
    setFeeRetryCount(prev => prev + 1);
    setShowFeeRetry(false);
    handleConfirmedSubmit();
  };

  const handleDone = () => {
    setShowSuccess(false);
    setTxHash(null);
    setRecipient("");
    setAmount("");
    onBack();
  };

  return (
    <div className="flex flex-col h-[580px] bg-cloak-bg p-6 animate-fade-in">
      <Header title={isPublic ? "Public Send" : "Private Send"} onBack={onBack} />

      {/* Private / Public toggle */}
      <div className="flex bg-cloak-card rounded-xl p-1 mb-4 border border-cloak-border-light">
        <button
          onClick={() => { setSendMode("private"); setRecipient(""); setAddressError(""); }}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${sendMode === "private" ? "bg-cloak-primary/20 text-cloak-primary" : "text-cloak-text-dim hover:text-cloak-text"}`}
        >
          Private
        </button>
        <button
          onClick={() => { setSendMode("public"); setRecipient(""); setAddressError(""); }}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${sendMode === "public" ? "bg-cloak-primary/20 text-cloak-primary" : "text-cloak-text-dim hover:text-cloak-text"}`}
        >
          Public
        </button>
      </div>

      <p className="text-cloak-text-dim text-xs mb-4">
        {isPublic
          ? `Send ${w.selectedToken} to any Starknet address. This transfer is public.`
          : `Send shielded ${w.selectedToken} to another Tongo address. The transfer is private.`}
      </p>

      {!isPublic && contacts.length > 0 && (
        <div className="mb-3">
          <label className="text-xs text-cloak-text-dim mb-1.5 block">From Contacts</label>
          <div className="flex flex-wrap gap-1.5">
            {contacts.slice(0, 4).map((c) => (
              <button
                key={c.id}
                onClick={() => setRecipient(c.tongoAddress)}
                className="px-2.5 py-1.5 rounded-lg bg-cloak-card border border-cloak-border-light text-xs text-cloak-text hover:border-cloak-primary/50 transition-colors"
              >
                {c.nickname || c.tongoAddress.slice(0, 8) + "..."}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mb-3">
        <label className="text-xs text-cloak-text-dim mb-1.5 block">
          {isPublic ? "Recipient Starknet Address" : "Recipient Tongo Address"}
        </label>
        <input
          type="text"
          value={recipient}
          onChange={(e) => { setRecipient(e.target.value); setAddressError(""); }}
          placeholder={isPublic ? "0x..." : "Enter recipient's Cloak address"}
          className={`w-full px-4 py-3 rounded-xl bg-cloak-card border text-cloak-text text-sm font-mono placeholder:text-cloak-muted focus:outline-none focus:border-cloak-primary/50 ${addressError ? "border-red-500/50" : "border-cloak-border"}`}
          spellCheck={false}
          autoComplete="off"
        />
        {addressError && (
          <p className="text-red-400 text-xs mt-1">{addressError}</p>
        )}
      </div>

      <div className="mb-4">
        <label className="text-xs text-cloak-text-dim mb-1.5 block">Amount ({w.selectedToken})</label>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            const v = e.target.value;
            if (/^\d*\.?\d*$/.test(v)) setAmount(v);
          }}
          placeholder="0.00"
          className="w-full px-4 py-3 rounded-xl bg-cloak-card border border-cloak-border text-cloak-text text-lg font-mono placeholder:text-cloak-muted focus:outline-none focus:border-cloak-primary/50"
        />
      </div>

      {w.error && <ErrorBox message={w.error} onDismiss={() => w.setError(null)} />}

      <button
        onClick={handleRequestConfirm}
        disabled={loading || !amount || !recipient}
        className="mt-auto w-full py-3 rounded-xl bg-cloak-primary hover:bg-cloak-primary-hover text-white font-medium transition-colors disabled:opacity-50"
      >
        {loading ? "Sending..." : `${isPublic ? "Public" : "Private"} Send ${w.selectedToken}`}
      </button>

      <TxConfirmModal
        visible={showConfirm}
        action={isPublic ? "public send" : "send"}
        token={w.selectedToken}
        amount={amount}
        recipient={recipient.trim()}
        onConfirm={handleConfirmedSubmit}
        onCancel={() => setShowConfirm(false)}
      />

      {txHash && (
        <TxSuccessModal
          visible={showSuccess}
          title="Payment Sent!"
          amount={`${amount} ${w.selectedToken}`}
          txHash={txHash}
          onDone={handleDone}
        />
      )}

      <TwoFactorWaiting
        isOpen={show2FAWaiting}
        status={twoFAStatus}
        onCancel={() => {
          abortController.current?.abort();
          setShow2FAWaiting(false);
          setLoading(false);
        }}
        isWard={isWard}
      />

      <FeeRetryModal
        isOpen={showFeeRetry}
        errorMessage={gasErrorMsg}
        retryCount={feeRetryCount}
        onRetry={handleFeeRetry}
        onCancel={() => { setShowFeeRetry(false); setLoading(false); }}
      />
    </div>
  );
}
