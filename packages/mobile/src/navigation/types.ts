import type { NavigatorScreenParams } from "@react-navigation/native";

export type AppTabParamList = {
  Home: undefined;
  Send: { openScanner?: boolean } | undefined;
  Wallet: { mode?: "shield" | "unshield" } | undefined;
  Swap: undefined;
  Activity: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  AppTabs: NavigatorScreenParams<AppTabParamList>;
  SettingsHub: undefined;
  ImportAccount: undefined;
  ImportWard: undefined;
  KeyBackup: undefined;
  WardSetup: undefined;
  WardCreated: {
    wardAddress: string;
    wardPrivateKey: string;
    qrPayload: string;
    pseudoName?: string;
    initialFundingAmountWei?: string;
    dailyLimit?: string;
    maxPerTx?: string;
  };
  WardDetail: {
    wardAddress: string;
    wardName: string;
    isFrozen: boolean;
    spendingLimit: string;
    qrPayload?: string;
    maxPerTx?: string;
  };
  SwapDetail:
    | {
        pair: string;
        sentUnits: string;
        receivedUnits: string;
        sentDisplay: string;
        receivedDisplay: string;
        fromToken: string;
        toToken: string;
        rateDisplay: string;
        routeDisplay: string;
        txHash: string;
        txHashes?: string[];
        status: "Settled" | "Failed";
        executionId?: string;
        /** ERC-20 amounts for the breakdown section */
        sellAmountErc20?: string;
        estimatedBuyErc20?: string;
        minBuyErc20?: string;
        actualBuyErc20?: string;
        gasFee?: string;
        steps?: Array<{
          key: string;
          label: string;
          status: "pending" | "running" | "success" | "failed" | "skipped";
          txHash?: string | null;
          message?: string | null;
        }>;
      }
    | undefined;
  TransactionDetail: {
    txHash: string;
    type?: string;
    amount?: string;
    note?: string;
    recipientName?: string;
    timestamp?: string | number;
    amount_unit?: string;
  };
};
