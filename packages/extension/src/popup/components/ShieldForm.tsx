import React, { useState, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { TOKENS, parseTokenAmount } from "@cloak-wallet/sdk";
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

export function ShieldForm({ wallet: w, onBack }: Props) {
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
          action: "fund",
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
          action: "fund",
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
            type: "fund",
            token: w.selectedToken,
            amount: amount,
          });
          setShowSuccess(true);
        } else {
          w.setError(result.error || "Approval denied");
        }
        return; // Skip normal execution
      }

      // ─── Normal (non-2FA) execution ───────────────────────────
      const erc20Amount = parseTokenAmount(amount, token.decimals);
      const tongoAmount = erc20Amount / token.rate;
      const hash = await w.fund(tongoAmount);
      if (hash) {
        setTxHash(hash);
        await saveTxNote(hash, {
          txHash: hash,
          privacyLevel: "private",
          timestamp: Date.now(),
          type: "fund",
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
      <Header title="Shield Funds" onBack={onBack} />

      <p className="text-cloak-text-dim text-xs mb-4">
        Move {w.selectedToken} from your public balance into a shielded account.
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
        {loading ? "Shielding..." : `Shield ${w.selectedToken}`}
      </button>

      <TxConfirmModal
        visible={showConfirm}
        action="shield"
        token={w.selectedToken}
        amount={amount}
        onConfirm={handleConfirmedSubmit}
        onCancel={() => setShowConfirm(false)}
      />

      {txHash && (
        <TxSuccessModal
          visible={showSuccess}
          title="Tokens Shielded!"
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

// ─── Shared sub-components ──────────────────────────────────────────

export function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <button onClick={onBack} className="text-cloak-text-dim hover:text-cloak-text transition-colors">
        <ArrowLeft className="w-[18px] h-[18px]" />
      </button>
      <h2 className="text-cloak-text font-semibold">{title}</h2>
    </div>
  );
}

function friendlyError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("invalid point") || lower.includes("expected length of 33"))
    return "Invalid recipient address. Please check and try again.";
  if (lower.includes("nonce too old") || lower.includes("invalid transaction nonce"))
    return "Transaction conflict. Please try again.";
  if (lower.includes("execution reverted"))
    return "Transaction was rejected by the network.";
  if (lower.includes("timeout"))
    return "Request timed out. Check your connection.";
  return msg;
}

export function ErrorBox({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="p-3 bg-red-900/30 border border-red-800/50 rounded-lg mb-4">
      <p className="text-red-400 text-xs">{friendlyError(message)}</p>
      <button onClick={onDismiss} className="text-red-500 text-xs underline mt-1">Dismiss</button>
    </div>
  );
}
