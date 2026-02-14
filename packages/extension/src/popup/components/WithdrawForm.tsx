import React, { useState, useRef } from "react";
import { TOKENS, parseTokenAmount } from "@cloak-wallet/sdk";
import { Header, ErrorBox } from "./ShieldForm";
import type { useExtensionWallet } from "../hooks/useExtensionWallet";
import { saveTxNote } from "../lib/storage";
import { check2FAEnabled, request2FAApproval } from "@/shared/two-factor";
import { TxConfirmModal } from "./TxConfirmModal";
import { TxSuccessModal } from "./TxSuccessModal";
import { TwoFactorWaiting } from "./TwoFactorWaiting";

interface Props {
  wallet: ReturnType<typeof useExtensionWallet>;
  onBack: () => void;
}

export function WithdrawForm({ wallet: w, onBack }: Props) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [show2FAWaiting, setShow2FAWaiting] = useState(false);
  const [twoFAStatus, setTwoFAStatus] = useState("");
  const abortController = useRef<AbortController | null>(null);

  const token = TOKENS[w.selectedToken];

  const handleRequestConfirm = () => {
    if (!amount) return;
    const erc20Amount = parseTokenAmount(amount, token.decimals);
    const tongoAmount = erc20Amount / token.rate;
    if (tongoAmount <= 0n) {
      w.setError("Amount too small");
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirmedSubmit = async () => {
    setShowConfirm(false);
    setLoading(true);
    try {
      // ─── 2FA gate ─────────────────────────────────────────────
      const is2FA = await check2FAEnabled(w.wallet!.starkAddress);
      if (is2FA) {
        const erc20Amount = parseTokenAmount(amount, token.decimals);
        const tongoAmount = erc20Amount / token.rate;

        abortController.current = new AbortController();
        setShow2FAWaiting(true);
        setTwoFAStatus("Preparing transaction...");

        // Build calls only (mobile handles both signatures)
        const prepResult = await chrome.runtime.sendMessage({
          type: "BUILD_CALLS",
          token: w.selectedToken,
          action: "withdraw",
          amount: tongoAmount.toString(),
        });

        if (!prepResult.success) {
          setShow2FAWaiting(false);
          w.setError(prepResult.error || "Failed to prepare transaction");
          return;
        }

        // Request approval via Supabase (mobile signs with both keys)
        const result = await request2FAApproval({
          walletAddress: w.wallet!.starkAddress,
          action: "withdraw",
          token: w.selectedToken,
          amount: amount,
          recipient: null,
          callsJson: JSON.stringify(prepResult.data.calls),
          sig1Json: "[]",
          nonce: "",
          resourceBoundsJson: "{}",
          txHash: "",
          onStatusChange: setTwoFAStatus,
          signal: abortController.current.signal,
        });

        setShow2FAWaiting(false);
        if (result.approved && result.txHash) {
          setTxHash(result.txHash);
          await saveTxNote(result.txHash, {
            txHash: result.txHash,
            privacyLevel: "private",
            timestamp: Date.now(),
            type: "withdraw",
            token: w.selectedToken,
            amount: amount,
          });
          setShowSuccess(true);
        } else {
          w.setError(result.error || "Approval denied");
        }
        return;
      }

      // ─── Normal (non-2FA) execution ───────────────────────────
      const erc20Amount = parseTokenAmount(amount, token.decimals);
      const tongoAmount = erc20Amount / token.rate;
      const hash = await w.withdraw(tongoAmount);
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
    } finally {
      setLoading(false);
    }
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
        isOpen={show2FAWaiting}
        status={twoFAStatus}
        onCancel={() => {
          abortController.current?.abort();
          setShow2FAWaiting(false);
          setLoading(false);
        }}
      />
    </div>
  );
}
