import React, { useState } from "react";
import { Settings as SettingsIcon, Send, ShieldPlus, ArrowUpFromLine, Clock, Users } from "lucide-react";
import { useExtensionWallet } from "./hooks/useExtensionWallet";
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

type Screen = "main" | "shield" | "send" | "withdraw" | "receive" | "settings" | "activity" | "contacts";

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
  if (screen === "activity") {
    return <ActivityScreen onBack={() => setScreen("main")} />;
  }
  if (screen === "contacts") {
    return <ContactsScreen onBack={() => setScreen("main")} />;
  }

  // Main dashboard
  return (
    <div className="flex flex-col h-[580px] bg-cloak-bg animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <CloakIcon size={20} />
          <span className="text-cloak-text font-semibold text-sm">Cloak</span>
        </div>
        <button
          onClick={() => setScreen("settings")}
          className="text-cloak-text-dim hover:text-cloak-text transition-colors p-1"
        >
          <SettingsIcon className="w-[18px] h-[18px]" />
        </button>
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

      {/* Action buttons — row style with colored left borders */}
      <div className="flex flex-col gap-2 px-4 pb-4">
        <button
          onClick={() => setScreen("send")}
          className="flex items-center gap-3 p-3 rounded-xl bg-cloak-card border border-cloak-border-light border-l-[3px] border-l-cloak-primary hover:border-cloak-primary/50 transition-all"
        >
          <Send className="w-[18px] h-[18px] text-cloak-primary shrink-0" />
          <div className="text-left">
            <p className="text-sm font-medium text-cloak-text">Send</p>
            <p className="text-[11px] text-cloak-text-dim">Private shielded payment</p>
          </div>
        </button>

        <button
          onClick={() => setScreen("shield")}
          className="flex items-center gap-3 p-3 rounded-xl bg-cloak-card border border-cloak-border-light border-l-[3px] border-l-cloak-accent hover:border-cloak-accent/50 transition-all"
        >
          <ShieldPlus className="w-[18px] h-[18px] text-cloak-accent shrink-0" />
          <div className="text-left">
            <p className="text-sm font-medium text-cloak-text">Shield</p>
            <p className="text-[11px] text-cloak-text-dim">Deposit into private pool</p>
          </div>
        </button>

        <button
          onClick={() => setScreen("withdraw")}
          className="flex items-center gap-3 p-3 rounded-xl bg-cloak-card border border-cloak-border-light border-l-[3px] border-l-cloak-secondary hover:border-cloak-secondary/50 transition-all"
        >
          <ArrowUpFromLine className="w-[18px] h-[18px] text-cloak-secondary shrink-0" />
          <div className="text-left">
            <p className="text-sm font-medium text-cloak-text">Unshield</p>
            <p className="text-[11px] text-cloak-text-dim">Withdraw to public wallet</p>
          </div>
        </button>

        <button
          onClick={() => setScreen("activity")}
          className="flex items-center gap-3 p-3 rounded-xl bg-cloak-card border border-cloak-border-light border-l-[3px] border-l-yellow-500 hover:border-yellow-500/50 transition-all"
        >
          <Clock className="w-[18px] h-[18px] text-yellow-500 shrink-0" />
          <div className="text-left">
            <p className="text-sm font-medium text-cloak-text">Activity</p>
            <p className="text-[11px] text-cloak-text-dim">Transaction history</p>
          </div>
        </button>

        <button
          onClick={() => setScreen("contacts")}
          className="flex items-center gap-3 p-3 rounded-xl bg-cloak-card border border-cloak-border-light border-l-[3px] border-l-teal-500 hover:border-teal-500/50 transition-all"
        >
          <Users className="w-[18px] h-[18px] text-teal-500 shrink-0" />
          <div className="text-left">
            <p className="text-sm font-medium text-cloak-text">Contacts</p>
            <p className="text-[11px] text-cloak-text-dim">Manage saved addresses</p>
          </div>
        </button>
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

      {/* Footer — matches mobile compact status */}
      <div className="mt-auto px-4 py-3 border-t border-cloak-border-light">
        <div className="flex items-center justify-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cloak-success" />
          <span className="text-[10px] text-cloak-muted">Sepolia</span>
          <span className="text-[10px] text-cloak-muted opacity-50">|</span>
          <span className="text-[10px] text-cloak-muted">Nonce: {w.balances.nonce.toString()}</span>
        </div>
      </div>
    </div>
  );
}
