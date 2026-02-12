"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield } from "lucide-react";
import { CloakIcon } from "~~/components/CloakIcon";
import { CustomConnectButton } from "~~/components/scaffold-stark/CustomConnectButton";
import { useTongo } from "~~/components/providers/TongoProvider";
import { useTongoBalance } from "~~/hooks/useTongoBalance";
import { truncateTongoAddress } from "~~/lib/address";
import { useAccount } from "@starknet-react/core";

export const Header = () => {
  const pathname = usePathname();
  const { isInitialized, tongoAddress, selectedToken } = useTongo();
  const { shieldedDisplay } = useTongoBalance();
  const { status } = useAccount();
  const isConnected = status === "connected";

  return (
    <header className="sticky top-0 z-30 w-full backdrop-blur-xl bg-slate-900/80 border-b border-slate-700/50">
      <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-14">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <CloakIcon size={24} />
          <span className="font-bold text-lg text-slate-50">Cloak</span>
        </Link>

        {/* Balance pill + Connect */}
        <div className="flex items-center gap-3">
          {isConnected && isInitialized && (
            <Link
              href="/wallet"
              className="flex items-center gap-1.5 bg-slate-800 rounded-full px-3 py-1.5 text-sm border border-slate-700/50 hover:border-blue-500/50 transition-colors"
            >
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-slate-200 font-medium">
                {shieldedDisplay} {selectedToken}
              </span>
            </Link>
          )}
          <CustomConnectButton />
        </div>
      </div>
    </header>
  );
};
