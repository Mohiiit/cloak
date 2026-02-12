import { ec, hash, CallData, type Call } from "starknet";
import { generateKey, assertValidKey } from "./keys";
import { padAddress } from "./address";
import type { WalletInfo } from "./types";

/** OpenZeppelin Account v0.11.0 class hash (tested on Sepolia) */
export const OZ_ACCOUNT_CLASS_HASH =
  "0x04d07e40e93398ed3c76981e72dd1fd22557a78ce36c0515f679e27f0bb5bc5f";

/**
 * Compute the OZ account address from a public key.
 */
export function computeAddress(publicKey: string, classHash = OZ_ACCOUNT_CLASS_HASH): string {
  const constructorCalldata = CallData.compile({ publicKey });
  const address = hash.calculateContractAddressFromHash(
    publicKey, // salt = publicKey
    classHash,
    constructorCalldata,
    0, // deployer = 0 (counterfactual)
  );
  return padAddress(address);
}

/**
 * Generate a new wallet keypair and compute the account address.
 */
export function createWalletInfo(privateKey?: string): WalletInfo {
  const pk = privateKey ?? generateKey();
  assertValidKey(pk);

  const publicKey = "0x" + ec.starkCurve.getStarkKey(pk).replace(/^0x/, "");
  const starkAddress = computeAddress(publicKey);

  // Tongo address derived at runtime when TongoAccount is created
  return {
    privateKey: pk,
    publicKey,
    starkAddress,
    tongoAddress: "", // Filled in by CloakClient after TongoAccount init
  };
}

/**
 * Build the deployAccount transaction payload.
 * The account must have ETH/STRK for gas before this can succeed.
 */
export function buildDeployAccountPayload(publicKey: string, classHash = OZ_ACCOUNT_CLASS_HASH) {
  const constructorCalldata = CallData.compile({ publicKey });
  return {
    classHash,
    constructorCalldata,
    addressSalt: publicKey,
    contractAddress: computeAddress(publicKey, classHash),
  };
}
