import React, { useState, useRef } from "react";
import { TOKENS, parseTokenAmount, validateTongoAddress } from "@cloak/sdk";
import { Header, ErrorBox } from "./ShieldForm";
import type { useExtensionWallet } from "../hooks/useExtensionWallet";
import { saveTxNote, type TxMetadata } from "../lib/storage";
import { useContacts } from "../hooks/useContacts";
import { check2FAEnabled, request2FAApproval } from "@/shared/two-factor";
import { TxConfirmModal } from "./TxConfirmModal";
import { TxSuccessModal } from "./TxSuccessModal";
import { TwoFactorWaiting } from "./TwoFactorWaiting";

interface Props {
  wallet: ReturnType<typeof useExtensionWallet>;
  onBack: () => void;
}

export function SendForm({ wallet: w, onBack }: Props) {
  const { contacts } = useContacts();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [addressError, setAddressError] = useState("");
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [show2FAWaiting, setShow2FAWaiting] = useState(false);
  const [twoFAStatus, setTwoFAStatus] = useState("");
  const abortController = useRef<AbortController | null>(null);

  const token = TOKENS[w.selectedToken];

  const handleRequestConfirm = () => {
    if (!amount || !recipient) return;
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

        const prepResult = await chrome.runtime.sendMessage({
          type: "PREPARE_AND_SIGN",
          token: w.selectedToken,
          action: "transfer",
          amount: tongoAmount.toString(),
          recipient: recipient.trim(),
        });

        if (!prepResult.success) {
          setShow2FAWaiting(false);
          w.setError(prepResult.error || "Failed to prepare transaction");
          return;
        }

        const result = await request2FAApproval({
          walletAddress: w.wallet!.starkAddress,
          action: "transfer",
          token: w.selectedToken,
          amount: amount,
          recipient: recipient.trim(),
          callsJson: JSON.stringify(prepResult.data.calls),
          sig1Json: JSON.stringify(prepResult.data.sig1),
          nonce: prepResult.data.nonce,
          resourceBoundsJson: prepResult.data.resourceBoundsJson,
          txHash: prepResult.data.txHash,
          onStatusChange: setTwoFAStatus,
          signal: abortController.current.signal,
        });

        setShow2FAWaiting(false);
        if (result.approved && result.txHash) {
          setTxHash(result.txHash);
          await saveTxNote(result.txHash, {
            txHash: result.txHash,
            recipient: recipient.trim(),
            recipientName: undefined,
            note: undefined,
            privacyLevel: "private",
            timestamp: Date.now(),
            type: "send",
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
      const hash = await w.transfer(recipient.trim(), tongoAmount);
      if (hash) {
        setTxHash(hash);
        await saveTxNote(hash, {
          txHash: hash,
          recipient: recipient.trim(),
          recipientName: undefined,
          note: undefined,
          privacyLevel: "private",
          timestamp: Date.now(),
          type: "send",
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
    setRecipient("");
    setAmount("");
    onBack();
  };

  return (
    <div className="flex flex-col h-[580px] bg-cloak-bg p-6 animate-fade-in">
      <Header title="Private Send" onBack={onBack} />

      <p className="text-cloak-text-dim text-xs mb-4">
        Send shielded {w.selectedToken} to another Tongo address. The transfer is private.
      </p>

      {contacts.length > 0 && (
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
        <label className="text-xs text-cloak-text-dim mb-1.5 block">Recipient Tongo Address</label>
        <input
          type="text"
          value={recipient}
          onChange={(e) => { setRecipient(e.target.value); setAddressError(""); }}
          placeholder="Enter recipient's Cloak address"
          className={`w-full px-4 py-3 rounded-xl bg-cloak-card border text-cloak-text text-sm font-mono placeholder:text-cloak-muted focus:outline-none focus:border-cloak-primary/50 ${addressError ? "border-red-500/50" : "border-cloak-border"}`}
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
        {loading ? "Sending..." : `Send ${w.selectedToken}`}
      </button>

      <TxConfirmModal
        visible={showConfirm}
        action="send"
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
      />
    </div>
  );
}
