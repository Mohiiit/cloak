import React, { useState } from "react";
import { CloakIcon } from "./CloakIcon";
import { truncateAddress } from "@cloak-wallet/sdk";
import type { WalletInfo } from "@cloak-wallet/sdk";

interface Props {
  wallet: WalletInfo;
  onDeploy: () => Promise<string | null>;
  onRefresh: () => Promise<void>;
  error: string | null;
}

export function DeployScreen({ wallet, onDeploy, onRefresh, error }: Props) {
  const [deploying, setDeploying] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    navigator.clipboard.writeText(wallet.starkAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeploy = async () => {
    setDeploying(true);
    const hash = await onDeploy();
    if (hash) setTxHash(hash);
    setDeploying(false);
  };

  return (
    <div className="flex flex-col h-[580px] bg-cloak-bg p-6 animate-fade-in">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cloak-primary to-blue-400 flex items-center justify-center">
          <CloakIcon size={16} color="#ffffff" />
        </div>
        <span className="text-cloak-text font-semibold text-sm">Deploy Account</span>
      </div>

      <div className="bg-cloak-card border border-cloak-border rounded-xl p-4 mb-4">
        <p className="text-xs text-cloak-text-dim mb-2">Your Starknet Address</p>
        <button onClick={copyAddress} className="text-sm font-mono text-cloak-text hover:text-cloak-primary transition-colors break-all text-left">
          {wallet.starkAddress}
        </button>
        {copied && <p className="text-xs text-cloak-accent mt-1">Copied!</p>}
      </div>

      <div className="bg-yellow-900/20 border border-yellow-800/30 rounded-xl p-4 mb-4">
        <p className="text-yellow-400 text-xs font-medium mb-1">Fund your account first</p>
        <p className="text-yellow-400/70 text-[11px]">
          Send STRK or ETH to the address above to cover gas fees, then deploy your account on-chain.
        </p>
        <a
          href="https://starknet-faucet.vercel.app/"
          target="_blank"
          rel="noreferrer"
          className="text-cloak-primary text-[11px] underline mt-2 inline-block"
        >
          Get testnet tokens from faucet
        </a>
      </div>

      {txHash && (
        <div className="bg-green-900/20 border border-green-800/30 rounded-xl p-4 mb-4">
          <p className="text-green-400 text-xs font-medium">Deployment submitted!</p>
          <p className="text-green-400/70 text-[11px] font-mono mt-1">{truncateAddress(txHash, 8)}</p>
        </div>
      )}

      <div className="flex flex-col gap-3 mt-auto mb-4">
        <button
          onClick={handleDeploy}
          disabled={deploying}
          className="w-full py-3 rounded-xl bg-cloak-primary hover:bg-cloak-primary-hover text-white font-medium transition-colors disabled:opacity-50"
        >
          {deploying ? "Deploying..." : "Deploy Account"}
        </button>
        <button
          onClick={onRefresh}
          className="w-full py-2.5 rounded-xl bg-cloak-card border border-cloak-border text-cloak-text-dim text-sm hover:border-cloak-primary/50 transition-colors"
        >
          Check if deployed
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-800/50 rounded-lg">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}
    </div>
  );
}
