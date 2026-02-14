/**
 * Deploy a CloakWard account from a Guardian on Sepolia.
 *
 * Usage: node deploy-ward.cjs
 *
 * The guardian deploys a ward contract via UDC (Universal Deployer Contract),
 * generates ward credentials, and prints the QR payload.
 */
require("dotenv").config();

const { RpcProvider, Account, ec, hash, CallData, Contract } = require("starknet");

// ─── Env validation ─────────────────────────────────────────────────
const required = ["GUARDIAN_PK", "GUARDIAN_ADDRESS"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    console.error("Copy .env.example to .env and fill in your values.");
    process.exit(1);
  }
}

const RPC_URL = process.env.RPC_URL || "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/vH9MXIQ41pUGskqg5kTR8";
const GUARDIAN_PK = process.env.GUARDIAN_PK;
const GUARDIAN_ADDRESS = process.env.GUARDIAN_ADDRESS;

const CLOAK_WARD_CLASS_HASH =
  "0x3baf915f503ee7ce22d06d78c407dc2f26ee18d8fa8cf165886e682da5a1132";
const STRK_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

// Universal Deployer Contract on Sepolia
const UDC_ADDRESS =
  "0x041a78e741e5af2fec34b695679bc6891742439f7afb8484ecd7766661ad02bf";

const provider = new RpcProvider({ nodeUrl: RPC_URL });

function padAddress(addr) {
  const hex = addr.replace(/^0x/, "");
  return "0x" + hex.padStart(64, "0");
}

async function main() {
  console.log("=== CloakWard Deployment Script ===\n");

  // 1. Generate fresh ward keypair
  const wardPrivateKeyBytes = ec.starkCurve.utils.randomPrivateKey();
  const wardPrivateKey =
    "0x" +
    Array.from(wardPrivateKeyBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  const wardPublicKey = ec.starkCurve.getStarkKey(wardPrivateKey);

  // Guardian's public key
  const guardianPublicKey = ec.starkCurve.getStarkKey(GUARDIAN_PK);

  console.log("Ward keypair:");
  console.log("  Private Key:", wardPrivateKey);
  console.log("  Public Key: ", wardPublicKey);
  console.log("\nGuardian:");
  console.log("  Address:    ", GUARDIAN_ADDRESS);
  console.log("  Public Key: ", guardianPublicKey);

  // 2. Deploy via UDC
  console.log("\nDeploying CloakWard via UDC...");

  const guardianAccount = new Account({
    provider,
    address: GUARDIAN_ADDRESS,
    signer: GUARDIAN_PK,
  });

  // Constructor calldata: public_key, guardian_address, guardian_public_key
  const constructorCalldata = CallData.compile({
    public_key: wardPublicKey,
    guardian_address: GUARDIAN_ADDRESS,
    guardian_public_key: guardianPublicKey,
  });

  // Use a unique salt based on ward's public key
  const salt = wardPublicKey;

  // Deploy via UDC
  const deployResult = await guardianAccount.deploy({
    classHash: CLOAK_WARD_CLASS_HASH,
    constructorCalldata,
    salt,
    unique: true, // Unique per deployer
  });

  console.log("  Deploy tx:", deployResult.transaction_hash);
  console.log("  Waiting for confirmation...");
  await provider.waitForTransaction(deployResult.transaction_hash);

  // Get the deployed address from the deploy result
  const wardAddress =
    deployResult.contract_address && deployResult.contract_address.length > 0
      ? deployResult.contract_address[0]
      : null;

  if (!wardAddress) {
    // If contract_address isn't in the result, compute it
    console.log("  Computing deployed address from UDC...");
    // For UDC with unique=true, address = pedersen(deployer, salt, classHash, constructorCalldata)
    console.log("  Check deploy tx on Voyager for the contract address");
    console.log(
      `  https://sepolia.voyager.online/tx/${deployResult.transaction_hash}`
    );
  } else {
    console.log("  Ward deployed at:", padAddress(wardAddress));
  }

  // 3. Fund the ward with 1 STRK for gas
  const wardAddr = wardAddress || "CHECK_DEPLOY_TX";
  if (wardAddress) {
    console.log("\nFunding ward with 1 STRK for gas...");
    const fundingAmount = "0x" + (1n * 10n ** 18n).toString(16);
    const fundTx = await guardianAccount.execute([
      {
        contractAddress: STRK_ADDRESS,
        entrypoint: "transfer",
        calldata: [padAddress(wardAddress), fundingAmount, "0x0"],
      },
    ]);
    console.log("  Fund tx:", fundTx.transaction_hash);
    await provider.waitForTransaction(fundTx.transaction_hash);
    console.log("  Funded!");
  }

  // 4. Add STRK as a known token for spending limit parsing
  if (wardAddress) {
    console.log("\nAdding STRK as known token on ward contract...");
    const addTokenTx = await guardianAccount.execute([
      {
        contractAddress: padAddress(wardAddress),
        entrypoint: "add_known_token",
        calldata: [STRK_ADDRESS],
      },
    ]);
    console.log("  Add token tx:", addTokenTx.transaction_hash);
    await provider.waitForTransaction(addTokenTx.transaction_hash);
    console.log("  STRK added as known token!");
  }

  // 5. Print QR payload
  const qrPayload = {
    type: "cloak_ward_invite",
    wardAddress: wardAddress ? padAddress(wardAddress) : "CHECK_DEPLOY_TX",
    wardPrivateKey: wardPrivateKey,
    guardianAddress: GUARDIAN_ADDRESS,
    network: "sepolia",
  };

  console.log("\n=== Ward Credentials ===\n");
  console.log("Ward Address:     ", qrPayload.wardAddress);
  console.log("Ward Private Key: ", wardPrivateKey);
  console.log("Ward Public Key:  ", wardPublicKey);
  console.log("Guardian Address: ", GUARDIAN_ADDRESS);
  console.log("\n=== QR Code Payload (JSON) ===\n");
  console.log(JSON.stringify(qrPayload, null, 2));

  // 6. Verify deployment
  if (wardAddress) {
    console.log("\n=== Verifying deployment ===");
    try {
      const result = await provider.callContract({
        contractAddress: padAddress(wardAddress),
        entrypoint: "get_account_type",
        calldata: [],
      });
      const typeHex = result[0];
      // 'WARD' in felt252 = 0x57415244
      console.log("  Account type:", typeHex === "0x57415244" ? "WARD" : typeHex);

      const guardianResult = await provider.callContract({
        contractAddress: padAddress(wardAddress),
        entrypoint: "get_guardian_address",
        calldata: [],
      });
      console.log("  Guardian:", guardianResult[0]);

      const frozenResult = await provider.callContract({
        contractAddress: padAddress(wardAddress),
        entrypoint: "is_frozen",
        calldata: [],
      });
      console.log("  Frozen:", frozenResult[0] !== "0x0" ? "Yes" : "No");

      const reqGuardianResult = await provider.callContract({
        contractAddress: padAddress(wardAddress),
        entrypoint: "is_require_guardian_for_all",
        calldata: [],
      });
      console.log(
        "  Require guardian for all:",
        reqGuardianResult[0] !== "0x0" ? "Yes" : "No"
      );
    } catch (e) {
      console.log("  Verification error:", e.message);
    }
  }
}

main().catch((err) => {
  console.error("\nDeployment failed:", err.message || err);
  process.exit(1);
});
