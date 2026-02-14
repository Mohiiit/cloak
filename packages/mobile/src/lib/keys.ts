/**
 * Key management — generate, store, and retrieve wallet keys.
 *
 * Keys are stored in AsyncStorage for now.
 * TODO: Move to Keychain/Keystore for production security.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ec } from "starknet";

const STORAGE_KEYS = {
  STARK_PRIVATE_KEY: "cloak_stark_pk",
  STARK_PUBLIC_KEY: "cloak_stark_pubkey",
  STARK_ADDRESS: "cloak_stark_address",
  TONGO_PRIVATE_KEY: "cloak_tongo_pk",
  TONGO_ADDRESS: "cloak_tongo_address",
  HAS_WALLET: "cloak_has_wallet",
};

export type WalletKeys = {
  starkPrivateKey: string;
  starkAddress: string;
  starkPublicKey: string;
  tongoPrivateKey: string;
  tongoAddress: string;
};

/** Check if a wallet has been created */
export async function hasWallet(): Promise<boolean> {
  const val = await AsyncStorage.getItem(STORAGE_KEYS.HAS_WALLET);
  return val === "true";
}

/** Save wallet keys to storage */
export async function saveWalletKeys(keys: WalletKeys): Promise<void> {
  await AsyncStorage.multiSet([
    [STORAGE_KEYS.STARK_PRIVATE_KEY, keys.starkPrivateKey],
    [STORAGE_KEYS.STARK_PUBLIC_KEY, keys.starkPublicKey],
    [STORAGE_KEYS.STARK_ADDRESS, keys.starkAddress],
    [STORAGE_KEYS.TONGO_PRIVATE_KEY, keys.tongoPrivateKey],
    [STORAGE_KEYS.TONGO_ADDRESS, keys.tongoAddress],
    [STORAGE_KEYS.HAS_WALLET, "true"],
  ]);
}

/** Load wallet keys from storage */
export async function loadWalletKeys(): Promise<WalletKeys | null> {
  const results = await AsyncStorage.multiGet([
    STORAGE_KEYS.STARK_PRIVATE_KEY,
    STORAGE_KEYS.STARK_PUBLIC_KEY,
    STORAGE_KEYS.STARK_ADDRESS,
    STORAGE_KEYS.TONGO_PRIVATE_KEY,
    STORAGE_KEYS.TONGO_ADDRESS,
  ]);

  const starkPrivateKey = results[0][1];
  const starkPublicKeyStored = results[1][1];
  const starkAddress = results[2][1];
  const tongoPrivateKey = results[3][1];
  const tongoAddress = results[4][1];

  if (!starkPrivateKey || !starkAddress || !tongoPrivateKey || !tongoAddress) {
    return null;
  }

  // Derive public key if not stored (backwards compat with older installs)
  const starkPublicKey = starkPublicKeyStored || ec.starkCurve.getStarkKey(starkPrivateKey);

  return {
    starkPrivateKey,
    starkAddress,
    starkPublicKey,
    tongoPrivateKey,
    tongoAddress,
  };
}

/** Clear all wallet data */
export async function clearWallet(): Promise<void> {
  await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
}
