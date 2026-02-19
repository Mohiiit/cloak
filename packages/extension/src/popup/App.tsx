import React, { useState } from "react";
import { Settings as SettingsIcon, ShieldPlus, ShieldOff, Clock, Users, ShieldAlert, ChevronDown, ChevronUp, ArrowUpRight, ArrowDownLeft, Copy, Check } from "lucide-react";
import { useExtensionWallet } from "./hooks/useExtensionWallet";
import { useWard } from "./hooks/useWard";
import { useTxHistory } from "./hooks/useTxHistory";
import { TOKENS, formatTokenAmount } from "@cloak-wallet/sdk";
import { CloakIcon } from "./components/CloakIcon";
import { Onboarding } from "./components/Onboarding";
import { DeployScreen } from "./components/DeployScreen";
import { BalanceCard } from "./components/BalanceCard";
import { ShieldForm } from "./components/ShieldForm";
import { SendForm } from "./components/SendForm";
import { WithdrawForm } from "./components/WithdrawForm";
import { ReceiveScreen } from "./components/ReceiveScreen";
import { Settings } from "./components/Settings";
import { ActivityScreen } from "./components/ActivityScreen";
import { ContactsScreen } from "./components/ContactsScreen";
import { ClaimSuccessScreen } from "./components/ClaimSuccessScreen";

type Screen = "main" | "shield" | "send" | "withdraw" | "receive" | "settings" | "activity" | "contacts" | "claim-success";

export default function App() {
  const w = useExtensionWallet();
  const ward = useWard(w.wallet?.starkAddress);
  const [screen, setScreen] = useState<Screen>("main");
  const [claimTxHash, setClaimTxHash] = useState<string | null>(null);
  const [wardExpanded, setWardExpanded] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [copied, setCopied] = useState(false);
  const txHistory = useTxHistory(w.wallet?.starkAddress);

  // Loading state
  if (w.loading) {
    return (
      <div className="flex items-center justify-center h-[580px] bg-cloak-bg">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-cloak-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-cloak-text-dim text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // No wallet — show onboarding
  if (!w.wallet) {
    return <Onboarding onCreateWallet={w.createWallet} onImportWallet={w.importWallet} error={w.error} />;
  }

  // Wallet exists but not deployed
  if (!w.isDeployed) {
    return (
      <DeployScreen
        wallet={w.wallet}
        onDeploy={w.deployAccount}
        onRefresh={async () => {
          const deployed = await chrome.runtime.sendMessage({ type: "IS_DEPLOYED" });
          if (deployed?.data) window.location.reload();
        }}
        onBack={w.clearWallet}
        error={w.error}
      />
    );
  }

  // Sub-screens
  if (screen === "shield") {
    return <ShieldForm wallet={w} onBack={() => setScreen("main")} />;
  }
  if (screen === "send") {
    return <SendForm wallet={w} onBack={() => setScreen("main")} />;
  }
  if (screen === "withdraw") {
    return <WithdrawForm wallet={w} onBack={() => setScreen("main")} />;
  }
  if (screen === "receive") {
    return <ReceiveScreen wallet={w.wallet} onBack={() => setScreen("main")} />;
  }
  if (screen === "settings") {
    return <Settings wallet={w} onBack={() => setScreen("main")} />;
  }
  if (screen === "activity") {
    return <ActivityScreen onBack={() => setScreen("main")} walletAddress={w.wallet?.starkAddress} />;
  }
  if (screen === "contacts") {
    return <ContactsScreen onBack={() => setScreen("main")} />;
  }
  if (screen === "claim-success" && claimTxHash) {
    return <ClaimSuccessScreen txHash={claimTxHash} onBack={() => setScreen("main")} />;
  }

  // Derived balance values for inline display
  const token = TOKENS[w.selectedToken];
  const shieldedErc20 = w.balances.balance * token.rate;
  const pendingErc20 = w.balances.pending * token.rate;
  const shieldedDisplay = formatTokenAmount(shieldedErc20, token.decimals, 2);
  const publicDisplay = formatTokenAmount(w.erc20Balance, token.decimals, 2);

  const truncatedAddress = w.wallet.starkAddress
    ? `${w.wallet.starkAddress.slice(0, 8)}...${w.wallet.starkAddress.slice(-6)}`
    : "";

  const handleCopy = async () => {
    if (!w.wallet.starkAddress) return;
    await navigator.clipboard.writeText(w.wallet.starkAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Main dashboard
  return (
    <div className="flex flex-col h-[580px] bg-cloak-bg animate-fade-in">
      {/* Header — 48px, horizontal, space-between, bottom border */}
      <div className="flex items-center justify-between px-4 h-12 shrink-0 border-b border-cloak-border">
        <div className="flex items-center gap-2">
          <CloakIcon size={18} />
          <span className="text-cloak-text font-mono text-sm font-semibold">Cloak</span>
          {ward.isWard && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/15 border border-amber-500/30 rounded-full">
              <ShieldAlert className="w-3 h-3 text-amber-400" />
              <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider">Ward</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 bg-cloak-input-bg rounded-md px-2 py-[3px]">
          <div className="w-1.5 h-1.5 rounded-full bg-cloak-success" />
          <span className="text-[10px] font-medium text-cloak-muted">Sepolia</span>
        </div>
      </div>

      {/* Scrollable content area */}
      <div className="flex flex-col gap-3.5 px-4 py-3 flex-1 overflow-y-auto">
        {/* Ward info banner */}
        {ward.isWard && (
          <div>
            <button
              onClick={() => setWardExpanded(!wardExpanded)}
              className="w-full flex items-center justify-between p-2.5 rounded-lg bg-amber-500/8 border border-amber-500/15 hover:border-amber-500/25 transition-all"
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[11px] text-amber-400 font-medium">Managed by guardian</span>
              </div>
              {wardExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-cloak-muted" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-cloak-muted" />
              )}
            </button>
            {wardExpanded && (
              ward.wardInfo ? (
              <div className="mt-1.5 p-2.5 rounded-lg bg-cloak-card border border-amber-500/10 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[10px] text-cloak-muted">Guardian</span>
                  <span className="text-[10px] text-cloak-text-dim font-mono">
                    {ward.wardInfo.guardianAddress.slice(0, 8)}...{ward.wardInfo.guardianAddress.slice(-4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-cloak-muted">Status</span>
                  <span className={`text-[10px] font-medium ${ward.wardInfo.isFrozen ? "text-red-400" : "text-cloak-success"}`}>
                    {ward.wardInfo.isFrozen ? "Frozen" : "Active"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-cloak-muted">Guardian 2FA</span>
                  <span className={`text-[10px] ${ward.wardInfo.isGuardian2faEnabled ? "text-cloak-success" : "text-cloak-muted"}`}>
                    {ward.wardInfo.isGuardian2faEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </div>
              ) : (
              <div className="mt-1.5 p-3 rounded-lg bg-cloak-card border border-amber-500/10 flex items-center justify-center">
                <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mr-2" />
                <span className="text-[10px] text-cloak-muted">Loading ward info...</span>
              </div>
              )
            )}
          </div>
        )}

        {/* Balance Card — inline per design spec */}
        <div className="rounded-[14px] bg-cloak-card border border-cloak-border p-4 flex flex-col gap-2">
          <span className="text-[9px] font-semibold text-cloak-muted uppercase tracking-[1.5px]">
            Shielded Balance
          </span>
          <p className="text-[28px] font-bold text-cloak-text leading-tight">
            {w.balances.balance.toLocaleString()} <span className="text-lg font-semibold">units</span>
          </p>
          <p className="text-xs text-cloak-text-dim">
            ({shieldedDisplay} {w.selectedToken})
          </p>

          {/* Pending claim row */}
          {w.balances.pending > 0n && (
            <div className="flex items-center justify-between mt-1 bg-cloak-warning/10 border border-cloak-warning/25 rounded-lg p-2">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cloak-warning" />
                <span className="text-[11px] text-cloak-warning">
                  +{w.balances.pending.toString()} pending
                </span>
              </div>
              <button
                onClick={async () => {
                  setClaiming(true);
                  try {
                    const txHash = await w.rollover();
                    if (txHash) {
                      setClaimTxHash(txHash);
                      setScreen("claim-success");
                    }
                  } finally {
                    setClaiming(false);
                  }
                }}
                disabled={claiming}
                className="text-[11px] font-semibold text-cloak-warning hover:text-yellow-300 bg-cloak-warning/20 border border-cloak-warning/40 px-2.5 py-1 rounded-full transition-colors disabled:opacity-50"
              >
                {claiming ? "Claiming..." : "Claim"}
              </button>
            </div>
          )}

          {/* Unshielded row */}
          <div className="flex items-center justify-between pt-2 border-t border-cloak-border-light mt-1">
            <span className="text-[9px] font-medium text-cloak-muted uppercase tracking-[1px]">
              Unshielded
            </span>
            <span className="text-[13px] font-semibold text-cloak-success">
              {publicDisplay} {w.selectedToken}
            </span>
          </div>
        </div>

        {/* Action Buttons — 4 horizontal */}
        <div className="flex gap-2">
          <button
            onClick={() => setScreen("send")}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-cloak-card border border-cloak-border h-[68px] flex-1 hover:border-cloak-primary/50 transition-all"
          >
            <ArrowUpRight className="w-5 h-5 text-cloak-primary" />
            <span className="text-[11px] font-semibold text-cloak-text">Send</span>
          </button>
          <button
            onClick={() => setScreen("shield")}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-cloak-card border border-cloak-border h-[68px] flex-1 hover:border-cloak-success/50 transition-all"
          >
            <ShieldPlus className="w-5 h-5 text-cloak-success" />
            <span className="text-[11px] font-semibold text-cloak-text">Shield</span>
          </button>
          <button
            onClick={() => setScreen("withdraw")}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-cloak-card border border-cloak-border h-[68px] flex-1 hover:border-cloak-secondary/50 transition-all"
          >
            <ShieldOff className="w-5 h-5 text-cloak-secondary" />
            <span className="text-[11px] font-semibold text-cloak-text">Unshield</span>
          </button>
          <button
            onClick={() => setScreen("receive")}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-cloak-card border border-cloak-border h-[68px] flex-1 hover:border-cloak-muted/50 transition-all"
          >
            <ArrowDownLeft className="w-5 h-5 text-cloak-muted" />
            <span className="text-[11px] font-semibold text-cloak-text">Receive</span>
          </button>
        </div>

        {/* Address display */}
        <div className="flex items-center gap-2 rounded-[10px] bg-cloak-input-bg px-3 py-2">
          <span className="text-[11px] text-cloak-muted font-mono flex-1 truncate">
            {truncatedAddress}
          </span>
          <button
            onClick={handleCopy}
            className="text-[11px] font-semibold text-cloak-primary hover:text-blue-400 transition-colors shrink-0 flex items-center gap-1"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                Copy
              </>
            )}
          </button>
        </div>

        {/* Recent Activity section */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-semibold text-cloak-muted uppercase tracking-[1.5px]">
              Recent Activity
            </span>
            {txHistory.events.length > 0 && (
              <button
                onClick={() => setScreen("activity")}
                className="text-[10px] font-medium text-cloak-primary hover:text-blue-400 transition-colors"
              >
                View all &rarr;
              </button>
            )}
          </div>
          {txHistory.events.length === 0 ? (
            <div className="flex items-center justify-center py-3">
              <p className="text-[11px] text-cloak-muted">No recent activity</p>
            </div>
          ) : (
            <div className="flex flex-col gap-0">
              {txHistory.events.slice(0, 3).map((ev) => {
                const icon = ev.type === "fund" || ev.type === "shield"
                  ? <ShieldPlus className="w-4 h-4 text-cloak-success" />
                  : ev.type === "send" || ev.type === "transfer"
                  ? <ArrowUpRight className="w-4 h-4 text-cloak-primary" />
                  : ev.type === "withdraw"
                  ? <ArrowDownLeft className="w-4 h-4 text-cloak-secondary" />
                  : ev.type === "rollover"
                  ? <Clock className="w-4 h-4 text-cloak-warning" />
                  : <ShieldPlus className="w-4 h-4 text-cloak-muted" />;
                const label = ev.type === "fund" ? "Shield" : ev.type === "send" ? "Send" : ev.type === "withdraw" ? "Unshield" : ev.type === "rollover" ? "Claim" : ev.type;
                const isPublic = ev.type === "erc20_transfer";
                const amountStr = ev.amount && ev.amount !== "0"
                  ? isPublic ? `${ev.amount} ${ev.token || "STRK"}` : `${ev.amount} ${ev.amount === "1" ? "unit" : "units"}`
                  : "";
                return (
                  <div key={ev.txHash} className="flex items-center justify-between py-1.5 cursor-pointer hover:bg-cloak-card/50 rounded-md px-1 -mx-1 transition-colors"
                    onClick={() => {
                      if (ev.txHash) {
                        alert("Transaction details are available on the Cloak mobile app.\n\nTx: " + ev.txHash.slice(0, 12) + "..." + ev.txHash.slice(-6));
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {icon}
                      <div>
                        <p className="text-xs font-medium text-cloak-text capitalize">{label}</p>
                        {amountStr && (
                          <p className="text-[10px] text-cloak-muted">{amountStr}</p>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-cloak-muted">
                      {ev.timestamp ? new Date(ev.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "--"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Error toast */}
        {w.error && (
          <div className="p-3 bg-red-900/30 border border-red-800/50 rounded-lg">
            <p className="text-red-400 text-xs">{w.error}</p>
            <button onClick={() => w.setError(null)} className="text-red-500 text-xs underline mt-1">
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Footer — 40px, top border, space-between */}
      <div className="flex items-center justify-between px-4 h-10 shrink-0 border-t border-cloak-border">
        <span className="text-[10px] text-cloak-muted font-sans">
          Nonce: {w.balances.nonce.toString()}
        </span>
        <button
          onClick={() => setScreen("settings")}
          className="text-cloak-muted hover:text-cloak-text transition-colors"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
