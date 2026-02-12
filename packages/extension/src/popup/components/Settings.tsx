import React, { useState } from "react";
import { truncateAddress, truncateTongoAddress } from "@cloak/sdk";
import { Header } from "./ShieldForm";
import type { useExtensionWallet } from "../hooks/useExtensionWallet";

interface Props {
  wallet: ReturnType<typeof useExtensionWallet>;
  onBack: () => void;
}

export function Settings({ wallet: w, onBack }: Props) {
  const [showKey, setShowKey] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleClear = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    await w.clearWallet();
    window.location.reload();
  };

  if (!w.wallet) return null;

  return (
    <div className="flex flex-col h-[580px] bg-cloak-bg p-6 animate-fade-in overflow-y-auto">
      <Header title="Settings" onBack={onBack} />

      {/* Addresses */}
      <Section title="Addresses">
        <InfoRow
          label="Starknet"
          value={truncateAddress(w.wallet.starkAddress, 8)}
          onCopy={() => copy(w.wallet!.starkAddress, "stark")}
          copied={copied === "stark"}
        />
        <InfoRow
          label="Tongo"
          value={truncateTongoAddress(w.wallet.tongoAddress, 8)}
          onCopy={() => copy(w.wallet!.tongoAddress, "tongo")}
          copied={copied === "tongo"}
        />
      </Section>

      {/* Private key */}
      <Section title="Backup">
        <div className="bg-yellow-900/20 border border-yellow-800/30 rounded-lg p-3 mb-3">
          <p className="text-yellow-400 text-[11px]">
            Never share your private key. Anyone with this key can access all your funds.
          </p>
        </div>
        {showKey ? (
          <div className="bg-cloak-card border border-cloak-border rounded-lg p-3">
            <p className="text-xs font-mono text-cloak-text break-all">{w.wallet.privateKey}</p>
            <button
              onClick={() => copy(w.wallet!.privateKey, "key")}
              className="text-xs text-cloak-primary mt-2"
            >
              {copied === "key" ? "Copied!" : "Copy Key"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowKey(true)}
            className="w-full py-2 rounded-lg bg-cloak-card border border-cloak-border text-cloak-text-dim text-xs hover:border-yellow-800/50 transition-colors"
          >
            Reveal Private Key
          </button>
        )}
      </Section>

      {/* Network */}
      <Section title="Network">
        <div className="bg-cloak-card border border-cloak-border rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm text-cloak-text">Sepolia Testnet</span>
          <span className="text-[10px] px-2 py-0.5 bg-cloak-primary/20 text-cloak-primary rounded-full">Active</span>
        </div>
      </Section>

      {/* Danger zone */}
      <Section title="Danger Zone">
        <button
          onClick={handleClear}
          className={`w-full py-2.5 rounded-lg border text-xs font-medium transition-colors ${
            confirming
              ? "bg-red-600 border-red-600 text-white"
              : "bg-cloak-card border-red-800/50 text-red-400 hover:bg-red-900/20"
          }`}
        >
          {confirming ? "Tap again to confirm — this is irreversible" : "Clear Wallet"}
        </button>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-[10px] text-cloak-muted uppercase tracking-wider mb-2">{title}</h3>
      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-cloak-border/50 last:border-0">
      <span className="text-xs text-cloak-text-dim">{label}</span>
      <button onClick={onCopy} className="text-xs font-mono text-cloak-text hover:text-cloak-primary transition-colors">
        {copied ? "Copied!" : value}
      </button>
    </div>
  );
}
