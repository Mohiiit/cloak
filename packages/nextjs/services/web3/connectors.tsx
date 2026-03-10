import { InjectedConnector } from "@starknet-react/core";
import { getTargetNetworks } from "~~/utils/scaffold-stark";
import { LAST_CONNECTED_TIME_LOCALSTORAGE_KEY } from "~~/utils/Constants";
import { TestConnector } from "./test-connector";

function withDisconnectWrapper(connector: InjectedConnector) {
  const connectorDisconnect = connector.disconnect;
  const _disconnect = (): Promise<void> => {
    localStorage.removeItem("lastUsedConnector");
    localStorage.removeItem(LAST_CONNECTED_TIME_LOCALSTORAGE_KEY);
    return connectorDisconnect();
  };
  connector.disconnect = _disconnect.bind(connector);
  return connector;
}

function getConnectors() {
  const isTestMode = process.env.NEXT_PUBLIC_TEST_MODE === "true";
  if (isTestMode) {
    const testAddress = process.env.NEXT_PUBLIC_TEST_STARK_ADDRESS || "";
    const testPrivateKey = process.env.NEXT_PUBLIC_TEST_STARK_PRIVATE_KEY || "";
    if (testAddress && testPrivateKey) {
      const testConnector = new TestConnector(testAddress, testPrivateKey);
      return [testConnector as unknown as InjectedConnector].map(withDisconnectWrapper);
    }
  }

  return [
    new InjectedConnector({ options: { id: "cloak", name: "Cloak Wallet" } }),
  ].map(withDisconnectWrapper);
}

export const connectors = getConnectors();
export const appChains = getTargetNetworks();
