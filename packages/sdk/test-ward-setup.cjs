/**
 * Test setup: Deploy a CloakWard using Account 2 as guardian.
 * Prints ward credentials for importing into mobile app.
 */
require("dotenv").config();

const { RpcProvider, Account, ec, CallData, hash, num } = require("starknet");

// ─── Env validation ─────────────────────────────────────────────────
const required = ["GUARDIAN_PK", "GUARDIAN_ADDRESS", "SUPABASE_URL", "SUPABASE_KEY"];
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
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const CLOAK_WARD_CLASS_HASH = "0x3baf915f503ee7ce22d06d78c407dc2f26ee18d8fa8cf165886e682da5a1132";
const STRK_ADDRESS = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

const provider = new RpcProvider({ nodeUrl: RPC_URL });

function padAddress(addr) {
  return "0x" + addr.replace(/^0x/, "").padStart(64, "0");
}

async function main() {
  console.log("=== Test Ward Setup ===\n");

  // 1. Generate ward keypair
  const wardPkBytes = ec.starkCurve.utils.randomPrivateKey();
  const wardPrivateKey = "0x" + Array.from(wardPkBytes).map(b => b.toString(16).padStart(2, "0")).join("");
  const wardPublicKey = ec.starkCurve.getStarkKey(wardPrivateKey);
  const guardianPublicKey = ec.starkCurve.getStarkKey(GUARDIAN_PK);

  console.log("Ward Private Key:", wardPrivateKey);
  console.log("Ward Public Key: ", wardPublicKey);
  console.log("Guardian Address:", GUARDIAN_ADDRESS);
  console.log("Guardian PubKey: ", guardianPublicKey);

  // 2. Deploy via UDC
  console.log("\nDeploying CloakWard via UDC...");
  const guardian = new Account({ provider, address: GUARDIAN_ADDRESS, signer: GUARDIAN_PK });

  const constructorCalldata = CallData.compile({
    public_key: wardPublicKey,
    guardian_address: GUARDIAN_ADDRESS,
    guardian_public_key: guardianPublicKey,
  });

  const deployResult = await guardian.deploy({
    classHash: CLOAK_WARD_CLASS_HASH,
    constructorCalldata,
    salt: wardPublicKey,
    unique: true,
  });

  console.log("Deploy tx:", deployResult.transaction_hash);
  await provider.waitForTransaction(deployResult.transaction_hash);

  const wardAddress = deployResult.contract_address?.[0];
  if (!wardAddress) throw new Error("No ward address in deploy result");

  const paddedWardAddress = padAddress(wardAddress);
  console.log("Ward Address:   ", paddedWardAddress);

  // 3. Fund ward with 1 STRK
  console.log("\nFunding ward with 1 STRK...");
  const fundTx = await guardian.execute([{
    contractAddress: STRK_ADDRESS,
    entrypoint: "transfer",
    calldata: [paddedWardAddress, "0x" + (1n * 10n ** 18n).toString(16), "0x0"],
  }]);
  await provider.waitForTransaction(fundTx.transaction_hash);
  console.log("Funded!");

  // 4. Add STRK as known token
  console.log("Adding STRK as known token...");
  const addTokenTx = await guardian.execute([{
    contractAddress: paddedWardAddress,
    entrypoint: "add_known_token",
    calldata: [STRK_ADDRESS],
  }]);
  await provider.waitForTransaction(addTokenTx.transaction_hash);
  console.log("STRK added!");

  // 5. Register in Supabase
  console.log("\nRegistering in Supabase...");
  const normalizeAddress = (addr) => {
    const stripped = addr.toLowerCase().replace(/^0x/, "").replace(/^0+/, "");
    return "0x" + (stripped || "0");
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/ward_configs`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      ward_address: normalizeAddress(paddedWardAddress),
      guardian_address: normalizeAddress(GUARDIAN_ADDRESS),
      ward_public_key: wardPublicKey,
      guardian_public_key: guardianPublicKey,
      status: "active",
      require_guardian_for_all: true,
    }),
  });
  if (res.ok) {
    console.log("Registered in ward_configs!");
  } else {
    console.log("Supabase error:", await res.text());
  }

  // 6. Verify
  console.log("\n=== Verification ===");
  const type = await provider.callContract({ contractAddress: paddedWardAddress, entrypoint: "get_account_type", calldata: [] });
  console.log("Account type:", type[0] === "0x57415244" ? "WARD" : type[0]);
  const guardianAddr = await provider.callContract({ contractAddress: paddedWardAddress, entrypoint: "get_guardian_address", calldata: [] });
  console.log("Guardian:    ", guardianAddr[0]);
  const reqGuardian = await provider.callContract({ contractAddress: paddedWardAddress, entrypoint: "is_require_guardian_for_all", calldata: [] });
  console.log("Req guardian:", reqGuardian[0] !== "0x0" ? "Yes" : "No");

  // 7. Output credentials
  console.log("\n=== CREDENTIALS FOR TESTING ===\n");
  console.log(`WARD_ADDRESS=${paddedWardAddress}`);
  console.log(`WARD_PRIVATE_KEY=${wardPrivateKey}`);
  console.log(`WARD_PUBLIC_KEY=${wardPublicKey}`);
  console.log(`GUARDIAN_ADDRESS=${GUARDIAN_ADDRESS}`);
  console.log(`GUARDIAN_PRIVATE_KEY=${GUARDIAN_PK}`);
  console.log(`\nQR Payload:`);
  console.log(JSON.stringify({
    type: "cloak_ward_invite",
    wardAddress: paddedWardAddress,
    wardPrivateKey,
    guardianAddress: GUARDIAN_ADDRESS,
    network: "sepolia",
  }, null, 2));
}

main().catch(err => { console.error("Failed:", err.message || err); process.exit(1); });
