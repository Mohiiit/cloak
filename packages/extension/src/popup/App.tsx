import React, { useState } from "react";
import { useExtensionWallet } from "./hooks/useExtensionWallet";
import { Onboarding } from "./components/Onboarding";
import { DeployScreen } from "./components/DeployScreen";
import { BalanceCard } from "./components/BalanceCard";
import { TokenSelector } from "./components/TokenSelector";
import { ShieldForm } from "./components/ShieldForm";
import { SendForm } from "./components/SendForm";
import { WithdrawForm } from "./components/WithdrawForm";
import { ReceiveScreen } from "./components/ReceiveScreen";
import { Settings } from "./components/Settings";

type Screen = "main" | "shield" | "send" | "withdraw" | "receive" | "settings";

export default function App() {
  const w = useExtensionWallet();
  const [screen, setScreen] = useState<Screen>("main");

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

  // Main dashboard
  return (
    <div className="flex flex-col h-[580px] bg-cloak-bg animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cloak-primary to-purple-400 flex items-center justify-center">
            <span className="text-white text-xs font-bold">C</span>
          </div>
          <span className="text-cloak-text font-semibold text-sm">Cloak</span>
        </div>
        <button
          onClick={() => setScreen("settings")}
          className="text-cloak-text-dim hover:text-cloak-text transition-colors p-1"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* Token selector */}
      <div className="px-4 pb-3">
        <TokenSelector selected={w.selectedToken} onSelect={w.setSelectedToken} />
      </div>

      {/* Balance card */}
      <div className="px-4 pb-4">
        <BalanceCard
          balances={w.balances}
          erc20Balance={w.erc20Balance}
          selectedToken={w.selectedToken}
          onRefresh={w.refreshBalances}
          onRollover={w.rollover}
        />
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-4 gap-2 px-4 pb-4">
        <ActionButton label="Shield" icon="shield" onClick={() => setScreen("shield")} />
        <ActionButton label="Send" icon="send" onClick={() => setScreen("send")} />
        <ActionButton label="Unshield" icon="unlock" onClick={() => setScreen("withdraw")} />
        <ActionButton label="Receive" icon="qr" onClick={() => setScreen("receive")} />
      </div>

      {/* Error toast */}
      {w.error && (
        <div className="mx-4 p-3 bg-red-900/30 border border-red-800/50 rounded-lg">
          <p className="text-red-400 text-xs">{w.error}</p>
          <button onClick={() => w.setError(null)} className="text-red-500 text-xs underline mt-1">
            Dismiss
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto px-4 py-3 border-t border-cloak-border">
        <p className="text-[10px] text-cloak-muted text-center">Sepolia Testnet</p>
      </div>
    </div>
  );
}

function ActionButton({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  const icons: Record<string, React.ReactNode> = {
    shield: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    send: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    ),
    unlock: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 9.9-1" />
      </svg>
    ),
    qr: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="3" height="3" />
        <rect x="18" y="14" width="3" height="3" />
        <rect x="14" y="18" width="3" height="3" />
        <rect x="18" y="18" width="3" height="3" />
      </svg>
    ),
  };

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-cloak-card border border-cloak-border hover:border-cloak-primary/50 transition-all group"
    >
      <span className="text-cloak-text-dim group-hover:text-cloak-primary transition-colors">{icons[icon]}</span>
      <span className="text-[11px] text-cloak-text-dim group-hover:text-cloak-text transition-colors">{label}</span>
    </button>
  );
}
