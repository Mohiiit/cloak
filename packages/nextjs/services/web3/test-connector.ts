/**
 * TestConnector — A starknet-react connector that uses a raw private key
 * for automated testing on Sepolia without a browser wallet extension.
 *
 * Activated by NEXT_PUBLIC_TEST_MODE=true + env vars for address/key.
 * Remove or disable before production.
 */

import { InjectedConnector, starknetChainId } from "@starknet-react/core";
import { Account, RpcProvider, CallData } from "starknet";
import scaffoldConfig from "~~/scaffold.config";
import { getRpcUrl } from "./provider";

const TEST_WALLET_ID = "test-wallet";
const TEST_WALLET_NAME = "Test Wallet";

// Simple shield icon for the connector
const TEST_WALLET_ICON =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMzYjgyZjYiIHN0cm9rZS13aWR0aD0iMiI+PHBhdGggZD0iTTEyIDIybDgtNC0uMDEtOS43MkwxMiAybC04IDYuMjhWMTgiLz48L3N2Zz4=";

export class TestConnector extends InjectedConnector {
  private _chain = scaffoldConfig.targetNetworks[0];
  private _address: string;
  private _privateKey: string;

  constructor(address: string, privateKey: string) {
    super({
      options: {
        id: TEST_WALLET_ID,
        name: TEST_WALLET_NAME,
        icon: { dark: TEST_WALLET_ICON, light: TEST_WALLET_ICON },
      },
    });
    this._address = address;
    this._privateKey = privateKey;
  }

  get id() {
    return TEST_WALLET_ID;
  }

  get name() {
    return TEST_WALLET_NAME;
  }

  get icon() {
    return { dark: TEST_WALLET_ICON, light: TEST_WALLET_ICON } as {
      dark: string;
      light: string;
    };
  }

  available(): boolean {
    return true;
  }

  async ready(): Promise<boolean> {
    return true;
  }

  async account() {
    const networkName = this._chain.network as string;
    const rpcUrl = getRpcUrl(networkName);

    return new Account({
      provider: new RpcProvider({
        nodeUrl: rpcUrl,
        chainId: starknetChainId(this._chain.id),
      }),
      address: this._address,
      signer: this._privateKey,
    });
  }

  async chainId(): Promise<bigint> {
    return this._chain.id;
  }

  async connect() {
    const account = await this.account();
    const chainId = this._chain.id;
    this.emit("connect", { account: account.address, chainId });
    return {
      account: account.address,
      chainId,
    };
  }

  async disconnect(): Promise<void> {
    this.emit("disconnect");
  }

  async request(call: any): Promise<any> {
    if (call.params && "calls" in call.params) {
      const compiledCalls = call.params.calls;
      compiledCalls.forEach((element: any) => {
        element.calldata = CallData.compile(element.calldata);
        element.contractAddress = element.contract_address;
        element.entrypoint = element.entry_point;
      });
      const account = await this.account();
      return await account.execute(compiledCalls);
    }
    return await super.request(call);
  }
}

export const testWalletId = TEST_WALLET_ID;
