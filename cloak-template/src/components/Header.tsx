"use client";

import { useWallet } from "@/lib/providers";
import { LogOut } from "lucide-react";

export default function Header() {
  const { address, isConnected, isConnecting, connect, disconnect } =
    useWallet();

  return (
    <header className="w-full px-4 sm:px-6 py-4 flex items-center justify-between max-w-3xl mx-auto">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-lg">
          ☕
        </div>
        <span className="text-lg font-semibold text-cloak-text">
          Cloak Coffee
        </span>
      </div>

      {/* Wallet */}
      {isConnected ? (
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-cloak-text-dim bg-cloak-bg-light border border-cloak-border rounded-lg px-3 py-1.5">
            {address!.slice(0, 6)}...{address!.slice(-4)}
          </span>
          <button
            onClick={disconnect}
            className="p-1.5 rounded-lg text-cloak-muted hover:text-cloak-error hover:bg-cloak-bg-light transition-colors"
            title="Disconnect"
          >
            <LogOut size={16} />
          </button>
        </div>
      ) : (
        <button
          onClick={connect}
          disabled={isConnecting}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700 transition-all disabled:opacity-50"
        >
          {isConnecting ? "Connecting..." : "Connect Wallet"}
        </button>
      )}
    </header>
  );
}
