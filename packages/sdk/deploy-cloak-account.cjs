/**
 * Deploy a fresh CloakAccount on Sepolia.
 *
 * Usage: node deploy-cloak-account.cjs
 *
 * Generates a new keypair, computes the CloakAccount address,
 * funds it from Account 1, then deploys via deployAccount().
 * Prints the new PRIVATE_KEY, ADDRESS, and PUBLIC_KEY for app config.
 */
require("dotenv").config();

const {
  RpcProvider,
  Account,
  ec,
  hash,
  CallData,
} = require("starknet");

// ─── Env validation ─────────────────────────────────────────────────
const required = ["FUNDER_PK", "FUNDER_ADDRESS"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    console.error("Copy .env.example to .env and fill in your values.");
    process.exit(1);
  }
}

const RPC_URL = process.env.RPC_URL || "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/vH9MXIQ41pUGskqg5kTR8";
const FUNDER_PK = process.env.FUNDER_PK;
const FUNDER_ADDRESS = process.env.FUNDER_ADDRESS;

const CLOAK_ACCOUNT_CLASS_HASH =
  "0x034549a00718c3158349268f26047a311019e8fd328e9819e31187467de71f00";
const STRK_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

const provider = new RpcProvider({ nodeUrl: RPC_URL });

function padAddress(addr) {
  const hex = addr.replace(/^0x/, "");
  return "0x" + hex.padStart(64, "0");
}

async function main() {
  console.log("=== CloakAccount Deployment Script ===\n");

  // 1. Generate fresh keypair
  const privateKeyBytes = ec.starkCurve.utils.randomPrivateKey();
  const privateKey =
    "0x" +
    Array.from(privateKeyBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  const publicKey = ec.starkCurve.getStarkKey(privateKey);
  console.log("Generated keypair:");
  console.log("  Private Key:", privateKey);
  console.log("  Public Key: ", publicKey);

  // 2. Compute CloakAccount address
  const constructorCalldata = CallData.compile({ publicKey });
  const address = hash.calculateContractAddressFromHash(
    publicKey, // salt
    CLOAK_ACCOUNT_CLASS_HASH,
    constructorCalldata,
    0, // deployer = 0 (counterfactual)
  );
  const paddedAddress = padAddress(address);
  console.log("  Address:    ", paddedAddress);

  // 3. Fund from Account 1 (2 STRK = 2e18)
  console.log("\nFunding from Account 1 (2 STRK)...");
  const funderAccount = new Account({
    provider,
    address: FUNDER_ADDRESS,
    signer: FUNDER_PK,
  });

  const fundingAmount = "0x" + (2n * 10n ** 18n).toString(16);
  const fundTx = await funderAccount.execute([
    {
      contractAddress: STRK_ADDRESS,
      entrypoint: "transfer",
      calldata: [paddedAddress, fundingAmount, "0x0"],
    },
  ]);
  console.log("  Funding tx:", fundTx.transaction_hash);
  console.log("  Waiting for confirmation...");
  await provider.waitForTransaction(fundTx.transaction_hash);
  console.log("  Funded!");

  // 4. Deploy via deployAccount
  console.log("\nDeploying CloakAccount...");
  const newAccount = new Account({
    provider,
    address: paddedAddress,
    signer: privateKey,
  });

  const { transaction_hash } = await newAccount.deployAccount({
    classHash: CLOAK_ACCOUNT_CLASS_HASH,
    constructorCalldata,
    addressSalt: publicKey,
  });
  console.log("  Deploy tx:", transaction_hash);
  console.log("  Waiting for confirmation...");
  await provider.waitForTransaction(transaction_hash);
  console.log("  Deployed!");

  // 5. Print config values
  console.log("\n=== Copy these to your .env files ===\n");
  console.log(`NEXT_PUBLIC_TEST_STARK_PRIVATE_KEY=${privateKey}`);
  console.log(`NEXT_PUBLIC_TEST_STARK_ADDRESS=${paddedAddress}`);
  console.log(`NEXT_PUBLIC_TEST_STARK_PUBLIC_KEY=${publicKey}`);
  console.log(
    "\nFor mobile: Settings → Import Wallet → enter private key + address",
  );
}

main().catch((err) => {
  console.error("Deployment failed:", err.message || err);
  process.exit(1);
});
