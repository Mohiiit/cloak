import type { NavigatorScreenParams } from "@react-navigation/native";

export type AppTabParamList = {
  Home: undefined;
  Send: undefined;
  Wallet: { mode?: "shield" | "unshield" } | undefined;
  Activity: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  AppTabs: NavigatorScreenParams<AppTabParamList>;
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
  };
  TransactionDetail: {
    txHash: string;
    type?: string;
    amount?: string;
    note?: string;
    recipientName?: string;
    timestamp?: string | number;
  };
};
