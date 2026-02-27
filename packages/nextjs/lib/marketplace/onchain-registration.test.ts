import { describe, expect, it, vi } from "vitest";
import {
  isOnchainRegistrationWriteEnabled,
  reconcilePendingAgentRegistrationWrite,
  submitAgentRegistrationOnchain,
} from "./onchain-registration";

describe("onchain registration write", () => {
  it("skips when write flag is disabled", async () => {
    const outcome = await submitAgentRegistrationOnchain(
      {
        agentId: "1",
        operatorWallet: "0xabc",
        serviceWallet: "0xdef",
      },
      {
        env: {
          ERC8004_WRITE_ENABLED: "false",
        },
      },
    );

    expect(outcome.status).toBe("skipped");
    expect(outcome.reason).toBe("write_disabled");
    expect(isOnchainRegistrationWriteEnabled({ ERC8004_WRITE_ENABLED: "false" })).toBe(false);
    expect(isOnchainRegistrationWriteEnabled({ ERC8004_WRITE_ENABLED: "true" })).toBe(true);
    expect(isOnchainRegistrationWriteEnabled({ ERC8004_WRITE_ENABLED: "true\\n" })).toBe(true);
  });

  it("fails closed when calldata cannot be derived", async () => {
    const outcome = await submitAgentRegistrationOnchain(
      {
        agentId: "staking_steward_v1",
        operatorWallet: "0xabc",
        serviceWallet: "0xdef",
      },
      {
        env: {
          ERC8004_WRITE_ENABLED: "true",
        },
      },
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.reason).toBe("calldata_unavailable");
  });

  it("submits write and marks pending when confirmation waiting is disabled", async () => {
    const registerAgentOnchain = vi.fn().mockResolvedValue({ transactionHash: "0x123" });
    const waitForTransaction = vi.fn();

    const outcome = await submitAgentRegistrationOnchain(
      {
        agentId: "1",
        operatorWallet: "0xabc",
        serviceWallet: "0xdef",
        onchainWrite: {
          wait_for_confirmation: false,
          calldata: ["1", "0xabc", "0xdef"],
        },
      },
      {
        env: {
          ERC8004_WRITE_ENABLED: "true",
        },
        client: {
          registerAgentOnchain,
          waitForTransaction,
        },
      },
    );

    expect(outcome.status).toBe("pending");
    expect(outcome.txHash).toBe("0x123");
    expect(waitForTransaction).not.toHaveBeenCalled();
  });

  it("marks confirmed and reconciles pending tx outcomes", async () => {
    const registerAgentOnchain = vi.fn().mockResolvedValue({ transactionHash: "0x999" });
    const waitForTransaction = vi.fn().mockResolvedValue({ execution_status: "SUCCEEDED" });

    const outcome = await submitAgentRegistrationOnchain(
      {
        agentId: "1",
        operatorWallet: "0xabc",
        serviceWallet: "0xdef",
        onchainWrite: {
          calldata: ["1", "0xabc", "0xdef"],
        },
      },
      {
        env: {
          ERC8004_WRITE_ENABLED: "true",
        },
        client: {
          registerAgentOnchain,
          waitForTransaction,
        },
      },
    );

    expect(outcome.status).toBe("confirmed");
    expect(outcome.txHash).toBe("0x999");

    const timeoutErr = new Error("timed out");
    (timeoutErr as Error & { code?: string }).code = "TX_TIMEOUT";
    waitForTransaction.mockRejectedValueOnce(timeoutErr);

    const reconciledPending = await reconcilePendingAgentRegistrationWrite(
      {
        status: "pending",
        txHash: "0x999",
      },
      {
        env: {
          ERC8004_WRITE_ENABLED: "true",
        },
        client: {
          waitForTransaction,
        },
      },
    );

    expect(reconciledPending?.status).toBe("pending");

    waitForTransaction.mockResolvedValueOnce({ execution_status: "SUCCEEDED" });

    const reconciledConfirmed = await reconcilePendingAgentRegistrationWrite(
      {
        status: "pending",
        txHash: "0x999",
      },
      {
        env: {
          ERC8004_WRITE_ENABLED: "true",
        },
        client: {
          waitForTransaction,
        },
      },
    );

    expect(reconciledConfirmed?.status).toBe("confirmed");
  });
});
