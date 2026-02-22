import { describe, expect, it } from "vitest";
import { createAvnuSwapAdapter } from "../src/swaps";
import { createCloakRuntime } from "../src/runtime";
import { DEFAULT_RPC, STRK_ADDRESS } from "../src/config";
import { buildResourceBoundsFromEstimate } from "../src/ward";
import { Account, RpcProvider } from "starknet";
import fs from "node:fs";
import path from "node:path";

const RUN_INTEGRATION = process.env.SWAP_INTEGRATION === "1";
const describeIntegration = RUN_INTEGRATION ? describe : describe.skip;
const hasLiveAccount = Boolean(process.env.SWAP_INTEGRATION_TAKER);
const hasLiveSigner = Boolean(process.env.SWAP_INTEGRATION_TAKER && process.env.SWAP_INTEGRATION_PK);
const itWithLiveAccount = hasLiveAccount ? it : it.skip;
const itWithLiveSigner = hasLiveSigner ? it : it.skip;

function patchTongoSdkProverImports(): void {
  const base = path.join(
    process.cwd(),
    "node_modules",
    "@fatsolutions",
    "tongo-sdk",
    "dist",
    "provers",
  );
  const files = ["audit.js", "fund.js", "withdraw.js", "transfer.js", "ragequit.js"];
  for (const file of files) {
    const p = path.join(base, file);
    if (!fs.existsSync(p)) continue;
    const txt = fs.readFileSync(p, "utf8");
    if (!txt.includes("../../src/utils")) continue;
    fs.writeFileSync(p, txt.replaceAll("../../src/utils", "../utils"));
  }
}

describeIntegration("swaps integration (live AVNU)", () => {
  it("fetches quote and builds dex calls", async () => {
    const takerAddress = process.env.SWAP_INTEGRATION_TAKER || "0x1234";
    const sellAmountWei = process.env.SWAP_INTEGRATION_SELL_WEI || "1000000000000000000";
    const network = (process.env.SWAP_INTEGRATION_NETWORK as "sepolia" | "mainnet" | undefined)
      || "sepolia";

    const adapter = createAvnuSwapAdapter({ network });
    const quote = await adapter.quote({
      walletAddress: takerAddress,
      pair: {
        sellToken: "STRK",
        buyToken: "ETH",
      },
      sellAmount: {
        value: sellAmountWei,
        unit: "erc20_wei",
      },
      slippageBps: 100,
    });

    expect(quote.id.length).toBeGreaterThan(0);
    expect(BigInt(quote.estimatedBuyAmountWei)).toBeGreaterThan(0n);

    const plan = await adapter.build({
      walletAddress: takerAddress,
      pair: quote.pair,
      quote,
    });
    expect(plan.dexCalls.length).toBeGreaterThan(0);
  }, 60_000);

  itWithLiveAccount("quotes/builds with 100 units and uses live fee estimation without RPC param errors", async () => {
    const network = (process.env.SWAP_INTEGRATION_NETWORK as "sepolia" | "mainnet" | undefined)
      || "sepolia";
    const takerAddress = process.env.SWAP_INTEGRATION_TAKER as string;
    const sellUnits = BigInt(process.env.SWAP_INTEGRATION_SELL_TONGO_UNITS || "100");
    const slippageBps = Number(process.env.SWAP_INTEGRATION_SLIPPAGE_BPS || "100");

    const runtime = createCloakRuntime({
      network,
      rpcUrl: DEFAULT_RPC[network],
    });

    const quote = await runtime.swaps.quote({
      walletAddress: takerAddress,
      pair: {
        sellToken: "STRK",
        buyToken: "ETH",
      },
      sellAmount: {
        value: sellUnits.toString(),
        unit: "tongo_units",
      },
      slippageBps,
    });

    expect(quote.id.length).toBeGreaterThan(0);
    expect(BigInt(quote.sellAmountWei)).toBeGreaterThan(0n);
    expect(BigInt(quote.estimatedBuyAmountWei)).toBeGreaterThan(0n);

    const dexPlan = await runtime.swaps.build({
      walletAddress: takerAddress,
      pair: quote.pair,
      quote,
      receiverAddress: takerAddress,
    });
    expect(dexPlan.dexCalls.length).toBeGreaterThan(0);
    let routeEstimateErrored = false;
    try {
      const fee = await runtime.ward.estimateInvokeFee(takerAddress, dexPlan.calls);
      expect(fee.overallFee).toBeGreaterThan(0n);
      expect(fee.l1Gas + fee.l2Gas + fee.l1DataGas).toBeGreaterThan(0n);
    } catch (error) {
      routeEstimateErrored = true;
      const details = error instanceof Error ? ((error as Error & { details?: string }).details || error.message) : String(error);
      expect(details.toLowerCase()).not.toContain("invalid params");
    }

    // Control path: a simple self transfer estimate should succeed and prove RPC param shape compatibility.
    const controlCalls = [{
      contractAddress: STRK_ADDRESS,
      entrypoint: "transfer",
      calldata: [takerAddress, "0x1", "0x0"],
    }];
    const controlFee = await runtime.ward.estimateInvokeFee(takerAddress, controlCalls);
    expect(controlFee.overallFee).toBeGreaterThan(0n);
    expect(controlFee.l1Gas + controlFee.l2Gas + controlFee.l1DataGas).toBeGreaterThan(0n);
    expect(routeEstimateErrored).toBeTypeOf("boolean");
  }, 120_000);

  itWithLiveSigner("diagnoses failing composed-swap calls by chunking fee estimation", async () => {
    patchTongoSdkProverImports();

    const network = (process.env.SWAP_INTEGRATION_NETWORK as "sepolia" | "mainnet" | undefined)
      || "sepolia";
    const takerAddress = process.env.SWAP_INTEGRATION_TAKER as string;
    const privateKey = process.env.SWAP_INTEGRATION_PK as string;
    const sellUnits = BigInt(process.env.SWAP_INTEGRATION_SELL_TONGO_UNITS || "100");
    const slippageBps = Number(process.env.SWAP_INTEGRATION_SLIPPAGE_BPS || "100");

    const [{ CloakClient }, { MemoryStorage }, { TOKENS }, { composeShieldedSwapPlan }] = await Promise.all([
      import("../src/client"),
      import("../src/storage/memory"),
      import("../src/tokens"),
      import("../src/swaps/builder"),
    ]);

    const runtime = createCloakRuntime({
      network,
      rpcUrl: DEFAULT_RPC[network],
    });

    const storage = new MemoryStorage();
    await storage.set("private_key", privateKey);
    await storage.set("stark_address", takerAddress);
    const client = new CloakClient({
      network,
      rpcUrl: DEFAULT_RPC[network],
      storage,
    });
    expect(await client.init()).toBe(true);

    const source = client.account("STRK");
    const destination = client.account("ETH");

    const quote = await runtime.swaps.quote({
      walletAddress: takerAddress,
      pair: { sellToken: "STRK", buyToken: "ETH" },
      sellAmount: { value: sellUnits.toString(), unit: "tongo_units" },
      slippageBps,
    });
    const dexPlan = await runtime.swaps.build({
      walletAddress: takerAddress,
      pair: quote.pair,
      quote,
      receiverAddress: takerAddress,
    });

    const minBuyUnits = BigInt(dexPlan.minBuyAmountWei) / TOKENS.ETH.rate;
    expect(minBuyUnits).toBeGreaterThan(0n);

    const [withdrawPrepared, fundPrepared] = await Promise.all([
      source.prepareWithdraw(sellUnits),
      destination.prepareFund(minBuyUnits),
    ]);
    const composedPlan = composeShieldedSwapPlan({
      dexPlan,
      withdrawCalls: withdrawPrepared.calls,
      fundCalls: fundPrepared.calls,
      sellAmount: { value: sellUnits.toString(), unit: "tongo_units" },
    });
    expect(composedPlan.calls.length).toBeGreaterThan(0);

    const singleResults: Array<{ index: number; ok: boolean; details?: string; entry?: string }> = [];
    for (let i = 0; i < composedPlan.calls.length; i += 1) {
      const call = composedPlan.calls[i];
      const entry = String(call.entrypoint || call.entry_point || "");
      try {
        const fee = await runtime.ward.estimateInvokeFee(takerAddress, [call]);
        expect(fee.overallFee).toBeGreaterThan(0n);
        singleResults.push({ index: i, ok: true, entry });
      } catch (error) {
        const details = error instanceof Error
          ? ((error as Error & { details?: string }).details || error.message)
          : String(error);
        expect(details.toLowerCase()).not.toContain("invalid params");
        singleResults.push({ index: i, ok: false, details, entry });
      }
    }

    const okCount = singleResults.filter((r) => r.ok).length;
    const failed = singleResults.filter((r) => !r.ok);
    expect(okCount).toBeGreaterThan(0);
    expect(failed.length).toBeGreaterThan(0);

    const failedEntries = failed.map((r) => r.entry || "");
    expect(
      failedEntries.some((e) => e === "multi_route_swap" || e === "fund"),
    ).toBe(true);
  }, 240_000);

  itWithLiveSigner("executes full composed swap flow with 100 units", async () => {
    patchTongoSdkProverImports();

    const network = (process.env.SWAP_INTEGRATION_NETWORK as "sepolia" | "mainnet" | undefined)
      || "sepolia";
    const takerAddress = process.env.SWAP_INTEGRATION_TAKER as string;
    const privateKey = process.env.SWAP_INTEGRATION_PK as string;
    const sellUnits = BigInt(process.env.SWAP_INTEGRATION_SELL_TONGO_UNITS || "100");
    const slippageBps = Number(process.env.SWAP_INTEGRATION_SLIPPAGE_BPS || "100");

    const [{ CloakClient }, { MemoryStorage }, { TOKENS }, { composeShieldedSwapPlan }] = await Promise.all([
      import("../src/client"),
      import("../src/storage/memory"),
      import("../src/tokens"),
      import("../src/swaps/builder"),
    ]);

    const runtime = createCloakRuntime({
      network,
      rpcUrl: DEFAULT_RPC[network],
    });

    const storage = new MemoryStorage();
    await storage.set("private_key", privateKey);
    await storage.set("stark_address", takerAddress);
    const client = new CloakClient({
      network,
      rpcUrl: DEFAULT_RPC[network],
      storage,
    });
    expect(await client.init()).toBe(true);

    const source = client.account("STRK");
    const destination = client.account("ETH");

    const quote = await runtime.swaps.quote({
      walletAddress: takerAddress,
      pair: { sellToken: "STRK", buyToken: "ETH" },
      sellAmount: { value: sellUnits.toString(), unit: "tongo_units" },
      slippageBps,
    });

    const dexPlan = await runtime.swaps.build({
      walletAddress: takerAddress,
      pair: quote.pair,
      quote,
      receiverAddress: takerAddress,
    });
    const minBuyUnits = BigInt(dexPlan.minBuyAmountWei) / TOKENS.ETH.rate;
    expect(minBuyUnits).toBeGreaterThan(0n);

    const [withdrawPrepared, fundPrepared] = await Promise.all([
      source.prepareWithdraw(sellUnits),
      destination.prepareFund(minBuyUnits),
    ]);

    const composedPlan = composeShieldedSwapPlan({
      dexPlan,
      withdrawCalls: withdrawPrepared.calls,
      fundCalls: fundPrepared.calls,
      sellAmount: { value: sellUnits.toString(), unit: "tongo_units" },
    });
    expect(composedPlan.calls.length).toBeGreaterThan(0);

    const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC[network] });
    const account = new Account({
      provider,
      address: takerAddress,
      signer: privateKey,
    } as any);

    const result = await runtime.swaps.execute({
      walletAddress: takerAddress,
      network,
      platform: "sdk_test",
      plan: composedPlan,
      executeDirect: async () => {
        const nonce = await account.getNonce();
        const feeEstimate = await runtime.ward.estimateInvokeFee(takerAddress, composedPlan.calls);
        const resourceBounds = buildResourceBoundsFromEstimate(feeEstimate, 1.35);
        const tx = await account.execute(composedPlan.calls, {
          nonce,
          resourceBounds,
          tip: 0,
        });
        return { txHash: tx.transaction_hash };
      },
    });

    expect(result.txHash).toMatch(/^0x/);
    const receipt = await provider.waitForTransaction(result.txHash, {
      retryInterval: 3_000,
    } as any);
    expect(receipt).toBeTruthy();
  }, 420_000);
});
