import React, { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { CloakIcon } from "./CloakIcon";

interface Props {
  onCreateWallet: () => Promise<any>;
  onImportWallet: (pk: string, address?: string) => Promise<any>;
  error: string | null;
}

export function Onboarding({ onCreateWallet, onImportWallet, error }: Props) {
  const [mode, setMode] = useState<"choose" | "import" | "ward">("choose");
  const [importKey, setImportKey] = useState("");
  const [wardInvite, setWardInvite] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    await onCreateWallet();
    setLoading(false);
  };

  const handleImport = async () => {
    if (!importKey.trim()) return;
    setLoading(true);
    await onImportWallet(importKey.trim());
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-[580px] bg-cloak-bg p-6 animate-fade-in">
      {/* Logo */}
      <div className="flex flex-col items-center mt-8 mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cloak-primary to-blue-400 flex items-center justify-center mb-4 animate-pulse-glow">
          <CloakIcon size={32} color="#ffffff" />
        </div>
        <h1 className="text-xl font-bold text-cloak-text">Cloak Wallet</h1>
        <p className="text-cloak-text-dim text-sm mt-1">Privacy on Starknet</p>
      </div>

      {mode === "choose" ? (
        <div className="flex flex-col gap-3 mt-auto mb-8">
          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-cloak-primary hover:bg-cloak-primary-hover text-white font-medium transition-colors disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create New Wallet"}
          </button>
          <button
            onClick={() => setMode("import")}
            className="w-full py-3 rounded-xl bg-cloak-card border border-cloak-border text-cloak-text hover:border-cloak-primary/50 transition-colors"
          >
            Import Existing Key
          </button>
          <button
            onClick={() => setMode("ward")}
            className="w-full py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:border-amber-500/50 transition-colors flex items-center justify-center gap-2"
          >
            <ShieldAlert className="w-4 h-4" />
            Import Ward Account
          </button>
        </div>
      ) : mode === "ward" ? (
        <div className="flex flex-col gap-3 mt-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <label className="text-sm text-amber-400 font-medium">Ward Invite JSON</label>
          </div>
          <p className="text-[11px] text-cloak-text-dim mb-1">
            Paste the QR invite JSON from your guardian.
          </p>
          <textarea
            value={wardInvite}
            onChange={(e) => setWardInvite(e.target.value)}
            placeholder='{"type":"cloak_ward_invite","wardAddress":"0x...","wardPrivateKey":"0x..."}'
            rows={4}
            className="w-full px-4 py-3 rounded-xl bg-cloak-card border border-amber-500/20 text-cloak-text text-xs placeholder:text-cloak-muted focus:outline-none focus:border-amber-500/40 font-mono resize-none"
          />
          <button
            onClick={async () => {
              if (!wardInvite.trim()) return;
              setLoading(true);
              try {
                const invite = JSON.parse(wardInvite.trim());
                if (invite.type !== "cloak_ward_invite" || !invite.wardPrivateKey || !invite.wardAddress) {
                  throw new Error("Invalid ward invite: must include wardPrivateKey and wardAddress");
                }
                await onImportWallet(invite.wardPrivateKey, invite.wardAddress);
              } catch {
                // Error handled by parent
              }
              setLoading(false);
            }}
            disabled={loading || !wardInvite.trim()}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors disabled:opacity-50 mt-1"
          >
            {loading ? "Importing..." : "Import Ward"}
          </button>
          <button
            onClick={() => setMode("choose")}
            className="text-cloak-text-dim text-sm hover:text-cloak-text transition-colors"
          >
            Back
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mt-4">
          <label className="text-sm text-cloak-text-dim">Private Key</label>
          <input
            type="password"
            value={importKey}
            onChange={(e) => setImportKey(e.target.value)}
            placeholder="0x..."
            className="w-full px-4 py-3 rounded-xl bg-cloak-card border border-cloak-border text-cloak-text text-sm placeholder:text-cloak-muted focus:outline-none focus:border-cloak-primary/50"
          />
          <button
            onClick={handleImport}
            disabled={loading || !importKey.trim()}
            className="w-full py-3 rounded-xl bg-cloak-primary hover:bg-cloak-primary-hover text-white font-medium transition-colors disabled:opacity-50 mt-2"
          >
            {loading ? "Importing..." : "Import Wallet"}
          </button>
          <button
            onClick={() => setMode("choose")}
            className="text-cloak-text-dim text-sm hover:text-cloak-text transition-colors"
          >
            Back
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-900/30 border border-red-800/50 rounded-lg">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}

      <p className="text-[10px] text-cloak-muted text-center mt-auto">Sepolia Testnet</p>
    </div>
  );
}
