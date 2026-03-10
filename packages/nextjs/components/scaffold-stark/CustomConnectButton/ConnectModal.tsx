import { useConnect } from "@starknet-react/core";
import { useState } from "react";

const ConnectModal = () => {
  const { connectors, connect } = useConnect();
  const [isConnecting, setIsConnecting] = useState(false);

  const isCloakInstalled =
    typeof window !== "undefined" && !!(window as any).starknet_cloak;

  async function handleConnect() {
    const provider = (window as any).starknet_cloak;
    if (!provider) {
      window.open("https://github.com/mohiiit/cloak", "_blank");
      return;
    }
    setIsConnecting(true);
    try {
      // Open extension approval popup (same as coffee app)
      await provider.enable();
      // Sync with starknet-react (extension is now authorized)
      const cloakConnector = connectors.find((c) => c.id === "cloak");
      if (cloakConnector) connect({ connector: cloakConnector });
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
        className="rounded-[18px] btn-sm font-bold px-8 bg-btn-wallet py-3 cursor-pointer inline-flex items-center gap-2"
      >
        Install Cloak
      </a>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={isConnecting}
      className="rounded-[18px] btn-sm font-bold px-8 bg-btn-wallet py-3 cursor-pointer disabled:opacity-50"
    >
      {isConnecting ? "Connecting..." : "Connect"}
    </button>
  );
};

export default ConnectModal;
