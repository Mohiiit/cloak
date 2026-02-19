import React, { useState, useRef, useEffect } from "react";
import { TOKENS, parseTokenAmount, parseInsufficientGasError } from "@cloak-wallet/sdk";
import { Header, ErrorBox } from "./ShieldForm";
import type { useExtensionWallet } from "../hooks/useExtensionWallet";
import { saveTxNote } from "../lib/storage";
import { TxConfirmModal } from "./TxConfirmModal";
import { TxSuccessModal } from "./TxSuccessModal";
import { TwoFactorWaiting } from "./TwoFactorWaiting";
import { FeeRetryModal } from "./FeeRetryModal";
import { useWard } from "../hooks/useWard";

interface Props {
  wallet: ReturnType<typeof useExtensionWallet>;
  onBack: () => void;
}

export function WithdrawForm({ wallet: w, onBack }: Props) {
  const { isWard, wardInfo } = useWard(w.wallet?.starkAddress);
  const [amount, setAmount] = useState("");
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

  const handleRequestConfirm = () => {
    if (!amount) return;
    setFeeRetryCount(0);
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
      // Background router handles ward/2FA checks automatically
      const erc20Amount = parseTokenAmount(amount, token.decimals);
      const tongoAmount = erc20Amount / token.rate;
      const hash = await w.withdraw(tongoAmount);
      setShow2FAWaiting(false);
      if (hash) {
        setTxHash(hash);
        await saveTxNote(hash, {
          txHash: hash,
          privacyLevel: "private",
          timestamp: Date.now(),
          type: "withdraw",
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
        w.setError(e?.message || "Withdraw failed");
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
    setAmount("");
    onBack();
  };

  return (
    <div className="flex flex-col h-[580px] bg-cloak-bg p-6 animate-fade-in">
      <Header title="Unshield Funds" onBack={onBack} />

      <p className="text-cloak-text-dim text-xs mb-4">
        Move {w.selectedToken} from your shielded balance back to your public wallet.
      </p>

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
        disabled={loading || !amount}
        className="mt-auto w-full py-3 rounded-xl bg-cloak-primary hover:bg-cloak-primary-hover text-white font-medium transition-colors disabled:opacity-50"
      >
        {loading ? "Unshielding..." : `Unshield ${w.selectedToken}`}
      </button>

      <TxConfirmModal
        visible={showConfirm}
        action="withdraw"
        token={w.selectedToken}
        amount={amount}
        onConfirm={handleConfirmedSubmit}
        onCancel={() => setShowConfirm(false)}
      />

      {txHash && (
        <TxSuccessModal
          visible={showSuccess}
          title="Tokens Unshielded!"
          amount={`${amount} ${w.selectedToken}`}
          txHash={txHash}
          onDone={handleDone}
        />
      )}

      <TwoFactorWaiting
        isOpen={loading}
        status={twoFAStatus || "Submitting to network..."}
        onCancel={() => {
          abortController.current?.abort();
          setShow2FAWaiting(false);
          setLoading(false);
        }}
        title={!show2FAWaiting ? "Unshielding Tokens" : undefined}
        subtitle={!show2FAWaiting ? "Your transaction is being submitted\nto the Starknet network." : undefined}
        isWard={show2FAWaiting ? isWard : false}
        wardHas2fa={show2FAWaiting ? wardInfo?.is2faEnabled : false}
        amount={amount}
        token={w.selectedToken}
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
