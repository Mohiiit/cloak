"use client";

import React, { useState } from "react";
import {
  Shield,
  Eye,
  EyeOff,
  ArrowDownToLine,
  ShieldOff,
  RotateCw,
  Clock,
} from "lucide-react";
import { useAccount } from "@starknet-react/core";
import { useTongo } from "~~/components/providers/TongoProvider";
import { useTongoBalance } from "~~/hooks/useTongoBalance";
import { useTongoFund } from "~~/hooks/useTongoFund";
import { useTongoWithdraw } from "~~/hooks/useTongoWithdraw";
import { useTongoRollover } from "~~/hooks/useTongoRollover";
import { use2FA } from "~~/hooks/use2FA";
import { check2FAEnabled } from "~~/lib/two-factor";
import { TwoFactorWaiting } from "~~/components/TwoFactorWaiting";
import { padAddress } from "~~/lib/address";
import {
  TOKENS,
  type TokenKey,
  parseTokenAmount,
} from "~~/lib/tokens";
import toast from "react-hot-toast";

function friendlyError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("invalid point") || lower.includes("expected length of 33"))
    return "Invalid recipient address. Please check and try again.";
  if (lower.includes("nonce too old") || lower.includes("invalid transaction nonce"))
    return "Transaction conflict. Please try again.";
  if (lower.includes("execution reverted"))
    return "Transaction was rejected by the network.";
  if (lower.includes("timeout"))
    return "Request timed out. Check your connection.";
  return msg;
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
  const { status, address } = useAccount();
  const {
    selectedToken,
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
  const { gate, isWaiting: is2FAWaiting, status: twoFAStatus, cancel: cancel2FA } = use2FA();

  const [showBalance, setShowBalance] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [claimTxHash, setClaimTxHash] = useState<string | null>(null);

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
    if (!tongoAccount || !address) return;
    try {
      const erc20Amount = parseTokenAmount(amountStr, tokenConfig.decimals);
      const tongoAmount = await tongoAccount.erc20ToTongo(erc20Amount);

      // Check if 2FA is enabled for this wallet
      const is2FA = await check2FAEnabled(address);
      if (is2FA) {
        // Prepare calls to serialize for mobile approval
        const fundOp = await tongoAccount.fund({
          amount: tongoAmount,
          sender: padAddress(address),
        });
        const calls: any[] = [];
        if (fundOp.approve) calls.push(fundOp.approve);
        calls.push(fundOp.toCalldata());
        const callsJson = JSON.stringify(calls, (_k, v) =>
          typeof v === "bigint" ? v.toString() : v,
        );

        setShowFundModal(false);

        const result = await gate({
          walletAddress: address,
          action: "shield",
          token: selectedToken,
          amount: amountStr,
          callsJson,
          sig1Json: "[]", // web cannot sign — mobile handles both keys
          nonce: Date.now().toString(),
          resourceBoundsJson: "{}",
          txHash: "",
        });

        if (result.approved) {
          toast.success("Funds shielded (approved via mobile)!");
          setTimeout(refresh, 3000);
        } else {
          toast.error(result.error || "2FA approval failed");
        }
        return;
      }

      const txHash = await fund(tongoAmount);
      if (txHash) {
        toast.success("Funds shielded!");
        setShowFundModal(false);
        setTimeout(refresh, 3000);
      }
    } catch (err: any) {
      toast.error(friendlyError(err?.message || "Failed to shield funds"));
    }
  };

  const handleWithdraw = async (amountStr: string) => {
    if (!tongoAccount || !address) return;
    try {
      const erc20Amount = parseTokenAmount(amountStr, tokenConfig.decimals);
      const tongoAmount = await tongoAccount.erc20ToTongo(erc20Amount);

      // Check if 2FA is enabled for this wallet
      const is2FA = await check2FAEnabled(address);
      if (is2FA) {
        // Prepare calls to serialize for mobile approval
        const withdrawOp = await tongoAccount.withdraw({
          amount: tongoAmount,
          to: padAddress(address),
          sender: padAddress(address),
        });
        const calls = [withdrawOp.toCalldata()];
        const callsJson = JSON.stringify(calls, (_k, v) =>
          typeof v === "bigint" ? v.toString() : v,
        );

        setShowWithdrawModal(false);

        const result = await gate({
          walletAddress: address,
          action: "unshield",
          token: selectedToken,
          amount: amountStr,
          callsJson,
          sig1Json: "[]", // web cannot sign — mobile handles both keys
          nonce: Date.now().toString(),
          resourceBoundsJson: "{}",
          txHash: "",
        });

        if (result.approved) {
          toast.success("Funds unshielded (approved via mobile)!");
          setTimeout(refresh, 3000);
        } else {
          toast.error(result.error || "2FA approval failed");
        }
        return;
      }

      const txHash = await withdraw(tongoAmount);
      if (txHash) {
        toast.success("Funds unshielded!");
        setShowWithdrawModal(false);
        setTimeout(refresh, 3000);
      }
    } catch (err: any) {
      toast.error(friendlyError(err?.message || "Failed to unshield funds"));
    }
  };

  const handleRollover = async () => {
    const txHash = await rollover();
    if (txHash) {
      setClaimTxHash(txHash);
      toast.success("Pending funds claimed!");
      setTimeout(() => {
        refresh();
        setClaimTxHash(null);
      }, 5000);
    }
  };

  return (
    <div className="flex flex-col gap-4">
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

          {/* Claim Success - Show tx hash */}
          {claimTxHash && (
            <div className="bg-green-900/20 border border-green-800/30 rounded-xl p-3 mb-4">
              <p className="text-green-400 text-xs font-medium mb-1">Claim successful!</p>
              <p className="text-green-400/70 text-[11px] font-mono break-all mb-2">{claimTxHash}</p>
              <a
                href={`https://sepolia.starkscan.co/tx/${claimTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-400 text-xs hover:underline"
              >
                View on Explorer →
              </a>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-slate-700/50 my-4" />

          {/* Unshielded (On-chain) */}
          <span className="text-xs text-slate-500 uppercase tracking-wider font-medium">
            Unshielded (On-chain)
          </span>
          <p className="text-lg text-slate-300 mt-1">
            {showBalance ? (
              <>— <span className="text-sm text-slate-500">{selectedToken}</span></>
            ) : (
              "••••••"
            )}
          </p>
        </div>
      </div>

      {/* Action cards — Shield and Unshield */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setShowFundModal(true)}
          className="flex flex-col items-center gap-2 p-5 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:border-blue-500/40 transition-all"
        >
          <ArrowDownToLine className="w-6 h-6 text-blue-400" />
          <span className="text-sm font-medium text-slate-200">Shield</span>
          <span className="text-[11px] text-slate-500">Deposit to private pool</span>
        </button>

        <button
          onClick={() => setShowWithdrawModal(true)}
          className="flex flex-col items-center gap-2 p-5 rounded-xl bg-violet-500/10 border border-violet-500/20 hover:border-violet-500/40 transition-all"
        >
          <ShieldOff className="w-6 h-6 text-violet-400" />
          <span className="text-sm font-medium text-slate-200">Unshield</span>
          <span className="text-[11px] text-slate-500">Withdraw to public</span>
        </button>
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

      {/* 2FA Waiting Modal */}
      <TwoFactorWaiting
        isOpen={is2FAWaiting}
        status={twoFAStatus}
        onCancel={cancel2FA}
      />
    </div>
  );
}
