"use client";

import React, { useState } from "react";
import {
  Shield,
  Eye,
  EyeOff,
  ArrowDownToLine,
  ArrowUpFromLine,
  RotateCw,
  Clock,
} from "lucide-react";
import { useAccount } from "@starknet-react/core";
import { useTongo } from "~~/components/providers/TongoProvider";
import { useTongoBalance } from "~~/hooks/useTongoBalance";
import { useTongoFund } from "~~/hooks/useTongoFund";
import { useTongoWithdraw } from "~~/hooks/useTongoWithdraw";
import { useTongoRollover } from "~~/hooks/useTongoRollover";
import {
  TOKENS,
  type TokenKey,
  parseTokenAmount,
} from "~~/lib/tokens";
import toast from "react-hot-toast";

function TokenSelector({
  selected,
  onSelect,
}: {
  selected: TokenKey;
  onSelect: (t: TokenKey) => void;
}) {
  const tokens: TokenKey[] = ["STRK", "ETH", "USDC"];
  return (
    <div className="flex gap-1 bg-slate-800 rounded-xl p-1">
      {tokens.map((t) => (
        <button
          key={t}
          onClick={() => onSelect(t)}
          className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-medium transition-colors ${
            selected === t
              ? "bg-blue-600 text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function AmountModal({
  title,
  maxLabel,
  maxAmount,
  token,
  onConfirm,
  onClose,
  isPending,
}: {
  title: string;
  maxLabel: string;
  maxAmount: string;
  token: TokenKey;
  onConfirm: (amount: string) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [amount, setAmount] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-sm border border-slate-700/50">
        <h3 className="text-lg font-semibold text-slate-50 mb-4">{title}</h3>

        <div className="mb-3">
          <label className="text-xs text-slate-500 mb-1 block">
            {maxLabel}: {maxAmount} {token}
          </label>
          <div className="flex items-center bg-slate-900 rounded-xl border border-slate-700/50 px-4 py-3">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                const v = e.target.value;
                if (/^\d*\.?\d*$/.test(v)) setAmount(v);
              }}
              className="flex-1 bg-transparent text-xl text-slate-50 outline-none"
              autoFocus
            />
            <span className="text-slate-400 font-medium ml-2">{token}</span>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          {["25%", "50%", "MAX"].map((pct) => (
            <button
              key={pct}
              onClick={() => {
                if (maxAmount === "—" || maxAmount === "0") return;
                const mult =
                  pct === "MAX" ? 1 : pct === "50%" ? 0.5 : 0.25;
                const val = parseFloat(maxAmount) * mult;
                setAmount(val.toString());
              }}
              className="flex-1 py-1.5 text-xs font-medium bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 transition-colors"
            >
              {pct}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!amount || parseFloat(amount) <= 0) {
                toast.error("Enter a valid amount");
                return;
              }
              onConfirm(amount);
            }}
            disabled={isPending || !amount}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Processing
              </span>
            ) : (
              "Confirm"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WalletPage() {
  const { status } = useAccount();
  const {
    selectedToken,
    setSelectedToken,
    tongoAccount,
    isInitialized,
  } = useTongo();
  const {
    shieldedDisplay,
    pendingDisplay,
    pending,
    isLoading,
    refresh,
  } = useTongoBalance();
  const { fund, isPending: fundPending } = useTongoFund();
  const { withdraw, isPending: withdrawPending } = useTongoWithdraw();
  const { rollover, isPending: rolloverPending } = useTongoRollover();

  const [showBalance, setShowBalance] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);

  const isConnected = status === "connected";
  const tokenConfig = TOKENS[selectedToken];

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <Shield className="w-12 h-12 text-slate-600 mb-4" />
        <p className="text-slate-400">
          Connect your wallet to view your shielded balance
        </p>
      </div>
    );
  }

  const handleFund = async (amountStr: string) => {
    if (!tongoAccount) return;
    try {
      const erc20Amount = parseTokenAmount(amountStr, tokenConfig.decimals);
      const tongoAmount = await tongoAccount.erc20ToTongo(erc20Amount);
      const txHash = await fund(tongoAmount);
      if (txHash) {
        toast.success("Funds shielded!");
        setShowFundModal(false);
        setTimeout(refresh, 3000);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to shield funds");
    }
  };

  const handleWithdraw = async (amountStr: string) => {
    if (!tongoAccount) return;
    try {
      const erc20Amount = parseTokenAmount(amountStr, tokenConfig.decimals);
      const tongoAmount = await tongoAccount.erc20ToTongo(erc20Amount);
      const txHash = await withdraw(tongoAmount);
      if (txHash) {
        toast.success("Funds unshielded!");
        setShowWithdrawModal(false);
        setTimeout(refresh, 3000);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to unshield funds");
    }
  };

  const handleRollover = async () => {
    const txHash = await rollover();
    if (txHash) {
      toast.success("Pending funds claimed!");
      setTimeout(refresh, 3000);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Token selector */}
      <TokenSelector selected={selectedToken} onSelect={setSelectedToken} />

      {/* Balance card */}
      <div className="relative overflow-hidden rounded-2xl p-6 bg-gradient-to-br from-blue-600/15 via-slate-800 to-violet-600/15 border border-blue-500/20">
        <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/8 rounded-full blur-3xl -translate-y-10 translate-x-10" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-violet-500/8 rounded-full blur-2xl translate-y-8 -translate-x-8" />
        <div className="relative">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-medium flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-blue-400" />
              Shielded Balance
            </span>
            <button
              onClick={() => setShowBalance(!showBalance)}
              className="text-slate-500 hover:text-slate-300 transition-colors"
            >
              {showBalance ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
          <div className="text-3xl font-bold text-slate-50 mb-4">
            {isLoading ? (
              <div className="animate-pulse bg-slate-700 rounded h-9 w-32" />
            ) : showBalance ? (
              <>
                {shieldedDisplay}{" "}
                <span className="text-lg text-slate-400">{selectedToken}</span>
              </>
            ) : (
              "••••••"
            )}
          </div>

        {/* Pending */}
        {pending > 0n && (
          <div className="flex items-center justify-between bg-slate-900/50 rounded-xl p-3 mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="text-sm text-slate-300">
                Pending: {pendingDisplay} {selectedToken}
              </span>
            </div>
            <button
              onClick={handleRollover}
              disabled={rolloverPending}
              className="flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 disabled:opacity-50"
            >
              <RotateCw
                className={`w-3.5 h-3.5 ${rolloverPending ? "animate-spin" : ""}`}
              />
              Claim
            </button>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => setShowFundModal(true)}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-medium transition-colors"
          >
            <ArrowDownToLine className="w-4 h-4" />
            Shield
          </button>
          <button
            onClick={() => setShowWithdrawModal(true)}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl py-3 font-medium transition-colors"
          >
            <ArrowUpFromLine className="w-4 h-4" />
            Unshield
          </button>
        </div>
        </div>
      </div>

      {/* Modals */}
      {showFundModal && (
        <AmountModal
          title="Shield Funds"
          maxLabel="Public balance"
          maxAmount="—"
          token={selectedToken}
          onConfirm={handleFund}
          onClose={() => setShowFundModal(false)}
          isPending={fundPending}
        />
      )}

      {showWithdrawModal && (
        <AmountModal
          title="Unshield Funds"
          maxLabel="Shielded balance"
          maxAmount={shieldedDisplay}
          token={selectedToken}
          onConfirm={handleWithdraw}
          onClose={() => setShowWithdrawModal(false)}
          isPending={withdrawPending}
        />
      )}
    </div>
  );
}
