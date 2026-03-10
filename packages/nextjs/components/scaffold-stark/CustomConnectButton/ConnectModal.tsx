import { useConnect } from "@starknet-react/core";
import { useEffect, useRef, useState } from "react";

const ConnectModal = () => {
  const { connectors, connect } = useConnect();
  const [isConnecting, setIsConnecting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-detect if extension is already connected (e.g. page reload)
  useEffect(() => {
    const provider = (window as any).starknet_cloak;
    if (provider?.isConnected && provider.selectedAddress) {
      const cloakConnector = connectors.find((c) => c.id === "cloak");
      if (cloakConnector) connect({ connector: cloakConnector });
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCloakInstalled =
    typeof window !== "undefined" && !!(window as any).starknet_cloak;

  function handleConnect() {
    const provider = (window as any).starknet_cloak;
    if (!provider) {
      window.open("https://github.com/mohiiit/cloak", "_blank");
      return;
    }

    // If already authorized skip the popup
    if (provider.selectedAddress) {
      const cloakConnector = connectors.find((c) => c.id === "cloak");
      if (cloakConnector) connect({ connector: cloakConnector });
      return;
    }

    setIsConnecting(true);

    // Fire enable() without blocking — it opens the extension popup.
    // Poll selectedAddress so we're not stuck waiting on the promise.
    provider.enable().catch(() => {});

    const start = Date.now();
    pollRef.current = setInterval(() => {
      if (provider.selectedAddress) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        const cloakConnector = connectors.find((c) => c.id === "cloak");
        if (cloakConnector) connect({ connector: cloakConnector });
        setIsConnecting(false);
      } else if (Date.now() - start > 60_000) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setIsConnecting(false);
      }
    }, 300);
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
