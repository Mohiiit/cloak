"use client";

import React, { useState, useEffect } from "react";
import {
  Settings,
  Shield,
  Key,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  AlertTriangle,
  Wallet,
  Globe,
  Users,
  Lock,
  Smartphone,
  Save,
  ShieldAlert,
  Snowflake,
} from "lucide-react";
import { useAccount } from "@starknet-react/core";
import { useTongo } from "~~/components/providers/TongoProvider";
import { getSettings, saveSettings, clearAllData } from "~~/lib/storage";
import { check2FAEnabled } from "~~/lib/two-factor";
import { getApiConfig, saveApiConfig } from "~~/lib/api-client";
import { useWard, type WardEntry } from "~~/hooks/useWard";
import toast from "react-hot-toast";

export default function SettingsPage() {
  const { status, address: starkAddress } = useAccount();
  const { tongoAddress, tongoPrivateKey } = useTongo();
  const [showKey, setShowKey] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const settings = getSettings();

  // 2FA state
  const apiConfig = typeof window !== "undefined" ? getApiConfig() : { url: "", key: "" };
  const [apiUrl, setApiUrl] = useState(apiConfig.url);
  const [apiKey, setApiKey] = useState(apiConfig.key);
  const [twoFAEnabled, setTwoFAEnabled] = useState<boolean | null>(null);
  const [checking2FA, setChecking2FA] = useState(false);
  const ward = useWard();

  // Check 2FA status on mount / address change
  useEffect(() => {
    if (!starkAddress) return;
    setChecking2FA(true);
    check2FAEnabled(starkAddress)
      .then(setTwoFAEnabled)
      .catch(() => setTwoFAEnabled(null))
      .finally(() => setChecking2FA(false));
  }, [starkAddress]);

  if (status !== "connected") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <Settings className="w-12 h-12 text-slate-600 mb-4" />
        <p className="text-slate-400">Connect your wallet to view settings</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-50">Settings</h1>

      {/* Cloak Address */}
      <div className="relative overflow-hidden bg-slate-800/50 rounded-xl p-4 border border-slate-700/30 border-l-4 border-l-blue-500/50">
        {/* Subtle glow accent */}
        <div className="absolute -top-8 -right-8 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-slate-200">
              Your Cloak Address
            </span>
          </div>
          <div className="flex items-center justify-between bg-slate-900 rounded-lg p-3">
            <p className="text-xs text-slate-300 font-mono truncate mr-2">
              {tongoAddress}
            </p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(tongoAddress);
                toast.success("Copied!");
              }}
              className="text-slate-400 hover:text-blue-400 shrink-0 transition-colors"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Starknet Address */}
      {starkAddress && (
        <div className="relative overflow-hidden bg-slate-800/50 rounded-xl p-4 border border-slate-700/30 border-l-4 border-l-violet-500/50">
          {/* Subtle glow accent */}
          <div className="absolute -top-8 -right-8 w-32 h-32 bg-violet-500/10 rounded-full blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-medium text-slate-200">
                Starknet Address
              </span>
            </div>
            <div className="flex items-center justify-between bg-slate-900 rounded-lg p-3">
              <p className="text-xs text-slate-300 font-mono truncate mr-2">
                {starkAddress}
              </p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(starkAddress);
                  toast.success("Copied!");
                }}
                className="text-slate-400 hover:text-blue-400 shrink-0 transition-colors"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ward Account Info (if ward) */}
      {ward.isWard && ward.wardInfo && (
        <div className="relative overflow-hidden bg-slate-800/50 rounded-xl p-4 border border-amber-700/30 border-l-4 border-l-amber-500/50">
          <div className="absolute -top-8 -right-8 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium text-amber-400">Ward Account</span>
            </div>
            <div className="space-y-2">
              {/* Tongo Address */}
              {tongoAddress && (
                <div className="flex items-center justify-between bg-slate-900 rounded-lg p-3">
                  <span className="text-xs text-slate-500">Tongo Address</span>
                  <div className="flex items-center gap-1.5 max-w-[60%]">
                    <span className="text-xs text-slate-300 font-mono truncate">
                      {tongoAddress.slice(0, 8)}...{tongoAddress.slice(-6)}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(tongoAddress);
                        toast.success("Tongo address copied!");
                      }}
                      className="text-slate-500 hover:text-blue-400 transition-colors shrink-0"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between bg-slate-900 rounded-lg p-3">
                <span className="text-xs text-slate-500">Guardian</span>
                <span className="text-xs text-slate-300 font-mono truncate max-w-[60%]">
                  {ward.wardInfo.guardianAddress.slice(0, 14)}...{ward.wardInfo.guardianAddress.slice(-6)}
                </span>
              </div>
              <div className="flex items-center justify-between bg-slate-900 rounded-lg p-3">
                <span className="text-xs text-slate-500">Status</span>
                <span className={`text-xs font-medium ${ward.wardInfo.isFrozen ? "text-red-400" : "text-emerald-400"}`}>
                  {ward.wardInfo.isFrozen ? "Frozen" : "Active"}
                </span>
              </div>
              <div className="flex items-center justify-between bg-slate-900 rounded-lg p-3">
                <span className="text-xs text-slate-500">Guardian Required</span>
                <span className="text-xs text-slate-300">
                  {ward.wardInfo.requireGuardianForAll ? "All transactions" : "Above limit only"}
                </span>
              </div>
              <div className="flex items-center justify-between bg-slate-900 rounded-lg p-3">
                <span className="text-xs text-slate-500">Guardian 2FA</span>
                <span className={`text-xs font-medium ${ward.wardInfo.isGuardian2faEnabled ? "text-emerald-400" : "text-slate-500"}`}>
                  {ward.wardInfo.isGuardian2faEnabled ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ward List (if guardian) */}
      {!ward.isWard && ward.wards.length > 0 && (
        <div className="relative overflow-hidden bg-slate-800/50 rounded-xl p-4 border border-amber-700/30 border-l-4 border-l-amber-500/50">
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium text-slate-200">Your Wards</span>
              {ward.isLoadingWards && (
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-amber-400" />
              )}
            </div>
            <div className="space-y-2">
              {ward.wards.map((w: WardEntry) => (
                <div key={w.wardAddress} className="flex items-center justify-between bg-slate-900 rounded-lg p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-2 h-2 rounded-full ${w.status === "frozen" ? "bg-red-400" : "bg-emerald-400"}`} />
                    <span className="text-xs text-slate-300 font-mono truncate">
                      {w.wardAddress.slice(0, 10)}...{w.wardAddress.slice(-6)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      w.status === "frozen"
                        ? "bg-red-600/20 text-red-400"
                        : "bg-emerald-600/20 text-emerald-400"
                    }`}>
                      {w.status === "frozen" ? "Frozen" : "Active"}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(w.wardAddress);
                        toast.success("Copied ward address!");
                      }}
                      className="text-slate-500 hover:text-blue-400 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Manage wards from the Cloak mobile app (guardian device).
            </p>
          </div>
        </div>
      )}

      {/* Network */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/30">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-medium text-slate-200">
            Network
          </span>
        </div>
        <div className="flex items-center justify-between bg-slate-900 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-sm text-slate-300">Sepolia Testnet</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 bg-blue-600/20 text-blue-400 rounded-full font-medium">Active</span>
        </div>
      </div>

      {/* Two-Factor Authentication */}
      <div className="relative overflow-hidden bg-slate-800/50 rounded-xl p-4 border border-slate-700/30 border-l-4 border-l-cyan-500/50">
        <div className="absolute -top-8 -right-8 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <Smartphone className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-medium text-slate-200">
              Two-Factor Authentication
            </span>
          </div>

          {/* 2FA Status */}
          <div className="flex items-center justify-between bg-slate-900 rounded-lg p-3 mb-3">
            <span className="text-sm text-slate-300">Status</span>
            {checking2FA ? (
              <span className="text-xs text-slate-500">Checking...</span>
            ) : twoFAEnabled === true ? (
              <span className="text-xs px-2 py-0.5 bg-green-600/20 text-green-400 rounded-full font-medium">
                Enabled
              </span>
            ) : twoFAEnabled === false ? (
              <span className="text-xs px-2 py-0.5 bg-slate-600/20 text-slate-400 rounded-full font-medium">
                Disabled
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 bg-yellow-600/20 text-yellow-400 rounded-full font-medium">
                Unknown
              </span>
            )}
          </div>

          <p className="text-xs text-slate-500 mb-3">
            Enable or disable 2FA from the Cloak mobile app. Transactions will require mobile approval when enabled.
          </p>

          {/* API config */}
          <div className="space-y-2">
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">
                API URL
              </label>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://your-server.com/api/v1"
                className="w-full bg-slate-900 rounded-lg border border-slate-700/50 px-3 py-2 text-xs text-slate-300 font-mono outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="your-api-key"
                className="w-full bg-slate-900 rounded-lg border border-slate-700/50 px-3 py-2 text-xs text-slate-300 font-mono outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>
            <button
              onClick={() => {
                saveApiConfig(apiUrl, apiKey);
                toast.success("API config saved");
                // Re-check 2FA status with new config
                if (starkAddress) {
                  setChecking2FA(true);
                  check2FAEnabled(starkAddress)
                    .then(setTwoFAEnabled)
                    .catch(() => setTwoFAEnabled(null))
                    .finally(() => setChecking2FA(false));
                }
              }}
              className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-xs font-medium bg-cyan-600/20 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-600/30 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              Save Config
            </button>
          </div>
        </div>
      </div>

      {/* Private Key */}
      <div className="relative overflow-hidden bg-slate-800/50 rounded-xl p-4 border border-amber-700/30 border-l-4 border-l-amber-500/50">
        {/* Subtle glow accent */}
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <Key className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-slate-200">
              Backup Private Key
            </span>
          </div>
          <p className="text-xs text-amber-400/70 mb-2">
            Keep this safe. Anyone with this key can access your shielded funds.
          </p>
          <div className="flex items-center justify-between bg-slate-900 rounded-lg p-3">
            <p className="text-xs text-slate-300 font-mono truncate mr-2">
              {showKey ? tongoPrivateKey : "•".repeat(40)}
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setShowKey(!showKey)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                {showKey ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
              {showKey && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(tongoPrivateKey);
                    toast.success("Copied!");
                  }}
                  className="text-slate-400 hover:text-blue-400 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Default Privacy */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/30">
        <span className="text-sm font-medium text-slate-200 mb-3 block">
          Default Privacy Level
        </span>
        <div className="flex gap-2">
          {(
            [
              { key: "public", label: "Public", Icon: Globe },
              { key: "friends", label: "Friends", Icon: Users },
              { key: "private", label: "Private", Icon: Lock },
            ] as const
          ).map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => {
                saveSettings({ ...settings, defaultPrivacy: key });
                toast.success(`Default privacy: ${label}`);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-sm font-medium transition-colors border ${
                settings.defaultPrivacy === key
                  ? "bg-blue-600/20 border-blue-500/50 text-blue-300"
                  : "bg-slate-800 border-slate-700/50 text-slate-400"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-red-900/30 border-l-4 border-l-red-500/50">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-sm font-medium text-red-400">
            Danger Zone
          </span>
        </div>
        {showClearConfirm ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-slate-400">
              This will delete all local data including contacts, notes, and
              your Tongo private key. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2 rounded-xl text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  clearAllData();
                  toast.success("All data cleared");
                  setShowClearConfirm(false);
                  window.location.reload();
                }}
                className="flex-1 py-2 rounded-xl text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                Delete Everything
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300"
          >
            <Trash2 className="w-4 h-4" />
            Clear All Local Data
          </button>
        )}
      </div>

      {/* About */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/30">
        <span className="text-sm font-medium text-slate-200 mb-2 block">
          About
        </span>
        <div className="text-xs text-slate-500 space-y-1">
          <p>Cloak v0.1.0</p>
          <p>Built for Re&#123;define&#125; Hackathon — Privacy Track</p>
          <p>Powered by Tongo SDK + Starknet</p>
        </div>
      </div>
    </div>
  );
}
