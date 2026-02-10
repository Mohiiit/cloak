"use client";

import React, { useState } from "react";
import {
  Settings,
  Shield,
  Key,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { useAccount } from "@starknet-react/core";
import { useTongo } from "~~/components/providers/TongoProvider";
import { getSettings, saveSettings, clearAllData } from "~~/lib/storage";
import toast from "react-hot-toast";

export default function SettingsPage() {
  const { status } = useAccount();
  const { tongoAddress, tongoPrivateKey } = useTongo();
  const [showKey, setShowKey] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const settings = getSettings();

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
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/30">
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
            className="text-slate-400 hover:text-blue-400 shrink-0"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Private Key */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-amber-700/30">
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
              className="text-slate-400 hover:text-slate-200"
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
                className="text-slate-400 hover:text-blue-400"
              >
                <Copy className="w-4 h-4" />
              </button>
            )}
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
              { key: "public", label: "Public", icon: "🛡️" },
              { key: "friends", label: "Friends", icon: "👥" },
              { key: "private", label: "Private", icon: "🔒" },
            ] as const
          ).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => {
                saveSettings({ ...settings, defaultPrivacy: key });
                toast.success(`Default privacy: ${label}`);
              }}
              className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors border ${
                settings.defaultPrivacy === key
                  ? "bg-blue-600/20 border-blue-500/50 text-blue-300"
                  : "bg-slate-800 border-slate-700/50 text-slate-400"
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-red-900/30">
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
