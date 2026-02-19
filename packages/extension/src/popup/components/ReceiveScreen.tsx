import React, { useState } from "react";
import { Shield, Copy, Check } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { WalletInfo } from "@cloak-wallet/sdk";
import { Header } from "./ShieldForm";

interface Props {
  wallet: WalletInfo;
  onBack: () => void;
}

type Tab = "tongo" | "starknet";

export function ReceiveScreen({ wallet, onBack }: Props) {
  const [tab, setTab] = useState<Tab>("tongo");
  const [copied, setCopied] = useState(false);

  const address = tab === "tongo" ? wallet.tongoAddress : wallet.starkAddress;
  const label = tab === "tongo" ? "Tongo Address" : "Starknet Address";
  const sublabel = tab === "tongo" ? "For private transfers" : "For public transfers";

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-[580px] bg-cloak-bg p-6 animate-fade-in">
      <Header title="Receive" onBack={onBack} />

      {/* Tab selector */}
      <div className="flex bg-cloak-card border border-cloak-border rounded-xl p-1 mb-4">
        <button
          onClick={() => { setTab("tongo"); setCopied(false); }}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
            tab === "tongo"
              ? "bg-cloak-primary/20 text-cloak-primary border border-cloak-primary/30"
              : "text-cloak-muted hover:text-cloak-text"
          }`}
        >
          <div className="flex items-center justify-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            Private
          </div>
        </button>
        <button
          onClick={() => { setTab("starknet"); setCopied(false); }}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
            tab === "starknet"
              ? "bg-cloak-secondary/20 text-cloak-secondary border border-cloak-secondary/30"
              : "text-cloak-muted hover:text-cloak-text"
          }`}
        >
          Public
        </button>
      </div>

      {/* QR Code card */}
      <div className="bg-cloak-card border border-cloak-border rounded-xl p-4 flex flex-col items-center gap-3">
        <div className="flex items-center gap-1.5">
          {tab === "tongo" && <Shield className="w-3.5 h-3.5 text-cloak-primary" />}
          <span className="text-[11px] text-cloak-text-dim uppercase tracking-wider">{label}</span>
        </div>
        <span className="text-[10px] text-cloak-muted">{sublabel}</span>

        {/* QR */}
        <div className="bg-white rounded-xl p-3">
          <QRCodeSVG
            value={address}
            size={180}
            level="M"
            bgColor="#FFFFFF"
            fgColor="#0F172A"
          />
        </div>

        {/* Address text */}
        <p className={`text-[11px] font-mono text-cloak-text-dim break-all text-center px-2 leading-relaxed ${
          tab === "tongo" ? "max-h-[60px] overflow-y-auto" : ""
        }`}>
          {address}
        </p>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          className={`w-full py-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
            tab === "tongo"
              ? "bg-cloak-primary/10 border border-cloak-primary/30 text-cloak-primary hover:bg-cloak-primary/20"
              : "bg-cloak-secondary/10 border border-cloak-secondary/30 text-cloak-secondary hover:bg-cloak-secondary/20"
          }`}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              Copy {tab === "tongo" ? "Tongo" : "Starknet"} Address
            </>
          )}
        </button>
      </div>

      <div className="mt-3 bg-blue-900/20 border border-blue-800/30 rounded-xl p-3">
        <p className="text-blue-400 text-[11px]">
          {tab === "tongo"
            ? "Share this QR or address to receive shielded private transfers."
            : "Share this QR or address to receive public on-chain tokens."}
        </p>
      </div>
    </div>
  );
}
