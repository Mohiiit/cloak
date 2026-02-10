import { braavos, InjectedConnector, ready } from "@starknet-react/core";
import { getTargetNetworks } from "~~/utils/scaffold-stark";
import { BurnerConnector } from "@scaffold-stark/stark-burner";
import scaffoldConfig from "~~/scaffold.config";
import { LAST_CONNECTED_TIME_LOCALSTORAGE_KEY } from "~~/utils/Constants";
import { KeplrConnector } from "./keplr";
import { TestConnector, testWalletId } from "./test-connector";

const targetNetworks = getTargetNetworks();

export const connectors = getConnectors();

// workaround helper function to properly disconnect with removing local storage (prevent autoconnect infinite loop)
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
  const { targetNetworks } = scaffoldConfig;

  const isTestMode = process.env.NEXT_PUBLIC_TEST_MODE === "true";

  // In test mode, only provide the TestConnector (no wallet extension needed)
  if (isTestMode) {
    const testAddress = process.env.NEXT_PUBLIC_TEST_STARK_ADDRESS || "";
    const testPrivateKey = process.env.NEXT_PUBLIC_TEST_STARK_PRIVATE_KEY || "";

    if (testAddress && testPrivateKey) {
      const testConnector = new TestConnector(testAddress, testPrivateKey);
      return [testConnector as unknown as InjectedConnector].map(
        withDisconnectWrapper,
      );
    }
  }

  const connectors: InjectedConnector[] = [ready(), braavos()];
  const isDevnet = targetNetworks.some(
    (network) => (network.network as string) === "devnet",
  );

  if (!isDevnet) {
    connectors.push(new KeplrConnector());
  } else {
    const burnerConnector = new BurnerConnector();
    // burnerConnector's should be initialized with dynamic network instead of hardcoded devnet to support mainnetFork
    burnerConnector.chain = targetNetworks[0];
    connectors.push(burnerConnector as unknown as InjectedConnector);
  }

  return connectors.sort(() => Math.random() - 0.5).map(withDisconnectWrapper);
}

export const appChains = targetNetworks;
