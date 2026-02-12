import React, { useState } from "react";
import { TOKENS, parseTokenAmount } from "@cloak/sdk";
import { Header, TxSuccess, ErrorBox } from "./ShieldForm";
import type { useExtensionWallet } from "../hooks/useExtensionWallet";
import { saveTxNote, type TxMetadata } from "../lib/storage";
import { useContacts } from "../hooks/useContacts";

interface Props {
  wallet: ReturnType<typeof useExtensionWallet>;
  onBack: () => void;
}

export function SendForm({ wallet: w, onBack }: Props) {
  const { contacts } = useContacts();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const token = TOKENS[w.selectedToken];

  const handleSubmit = async () => {
    if (!amount || !recipient) return;
    setLoading(true);
    try {
      const erc20Amount = parseTokenAmount(amount, token.decimals);
      const tongoAmount = erc20Amount / token.rate;
      if (tongoAmount <= 0n) {
        w.setError("Amount too small");
        return;
      }
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
      }
    } finally {
      setLoading(false);
    }
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
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="Base58 address..."
          className="w-full px-4 py-3 rounded-xl bg-cloak-card border border-cloak-border text-cloak-text text-sm font-mono placeholder:text-cloak-muted focus:outline-none focus:border-cloak-primary/50"
        />
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

      {txHash && <TxSuccess hash={txHash} />}
      {w.error && <ErrorBox message={w.error} onDismiss={() => w.setError(null)} />}

      <button
        onClick={handleSubmit}
        disabled={loading || !amount || !recipient}
        className="mt-auto w-full py-3 rounded-xl bg-cloak-primary hover:bg-cloak-primary-hover text-white font-medium transition-colors disabled:opacity-50"
      >
        {loading ? "Sending..." : `Send ${w.selectedToken}`}
      </button>
    </div>
  );
}
