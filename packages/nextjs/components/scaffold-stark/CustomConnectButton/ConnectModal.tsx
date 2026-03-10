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
    const provider = (window as any).starknet_cloak;
    if (!provider) {
      window.open("https://github.com/mohiiit/cloak", "_blank");
      return;
    }
    setIsConnecting(true);
    try {
      // Trigger extension approval popup directly (same as coffee app)
      await provider.enable();

      // Sync the now-authorized session with starknet-react
      const cloakConnector = connectors.find((c) => c.id === "cloak");
      if (cloakConnector) {
        setWasDisconnectedManually(false);
        connect({ connector: cloakConnector });
        setLastConnector({ id: cloakConnector.id });
        setLastConnectionTime(Date.now());
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
