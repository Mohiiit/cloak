import React, { useState } from "react";
import { Shield } from "lucide-react";

interface Props {
  onCreateWallet: () => Promise<any>;
  onImportWallet: (pk: string) => Promise<any>;
  error: string | null;
}

export function Onboarding({ onCreateWallet, onImportWallet, error }: Props) {
  const [mode, setMode] = useState<"choose" | "import">("choose");
  const [importKey, setImportKey] = useState("");
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
          <Shield className="w-8 h-8 text-white" />
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
