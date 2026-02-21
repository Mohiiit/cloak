import type { NavigatorScreenParams } from "@react-navigation/native";

export type AppTabParamList = {
  Home: undefined;
  Send: undefined;
  Wallet: { mode?: "shield" | "unshield" } | undefined;
  Swap: undefined;
  Activity: undefined;
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
  SwapDetail: undefined;
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
