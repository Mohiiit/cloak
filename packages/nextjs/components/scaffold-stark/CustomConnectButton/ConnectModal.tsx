import { useConnect } from "@starknet-react/core";
import { useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import { LAST_CONNECTED_TIME_LOCALSTORAGE_KEY } from "~~/utils/Constants";

const ConnectModal = () => {
  const { connectors, connect } = useConnect();
  const [isConnecting, setIsConnecting] = useState(false);
  const [, setLastConnector] = useLocalStorage<{ id: string; ix?: number }>(
    "lastUsedConnector",
    { id: "" },
  );
  const [, setLastConnectionTime] = useLocalStorage<number>(
    LAST_CONNECTED_TIME_LOCALSTORAGE_KEY,
    0,
  );
  const [, setWasDisconnectedManually] = useLocalStorage<boolean>(
    "wasDisconnectedManually",
    false,
  );

  const isCloakInstalled =
    typeof window !== "undefined" && !!(window as any).starknet_cloak;

  async function handleConnect() {
    const cloakConnector = connectors.find((c) => c.id === "cloak");
    if (!cloakConnector) {
      window.open("https://github.com/mohiiit/cloak", "_blank");
      return;
    }
    setIsConnecting(true);
    try {
      setWasDisconnectedManually(false);
      connect({ connector: cloakConnector });
      setLastConnector({ id: cloakConnector.id });
      setLastConnectionTime(Date.now());
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
