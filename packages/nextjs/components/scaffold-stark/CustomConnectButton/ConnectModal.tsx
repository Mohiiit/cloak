import { useState } from "react";

interface Props {
  onConnected: (address: string) => void;
}

const ConnectModal = ({ onConnected }: Props) => {
  const [isConnecting, setIsConnecting] = useState(false);

  const isCloakInstalled =
    typeof window !== "undefined" && !!(window as any).starknet_cloak;

  async function handleConnect() {
    const provider = (window as any).starknet_cloak;
    if (!provider) {
      window.open("https://github.com/mohiiit/cloak", "_blank");
      return;
    }

    // Already authorized
    if (provider.selectedAddress) {
      onConnected(provider.selectedAddress);
      return;
    }

    setIsConnecting(true);
    try {
      const accounts = await provider.enable();
      if (accounts?.[0]) {
        onConnected(accounts[0]);
      }
    } catch (err) {
      console.warn("Cloak connect failed:", err);
    } finally {
      setIsConnecting(false);
    }
  }

  if (!isCloakInstalled) {
    return (
      <a
        href="https://github.com/mohiiit/cloak"
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-[18px] btn-sm font-bold px-8 bg-btn-wallet py-3 cursor-pointer inline-flex items-center gap-2 text-sm"
      >
        Install Cloak
      </a>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={isConnecting}
      className="rounded-[18px] btn-sm font-bold px-8 bg-btn-wallet py-3 cursor-pointer disabled:opacity-50 text-sm"
    >
      {isConnecting ? "Connecting..." : "Connect"}
    </button>
  );
};

export default ConnectModal;
