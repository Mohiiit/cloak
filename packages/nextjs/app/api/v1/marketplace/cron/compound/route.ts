import { NextRequest, NextResponse } from "next/server";
import { listHireRecords } from "~~/lib/marketplace/hires-repo";
import { listDelegationRecords } from "~~/lib/marketplace/delegation-repo";
import { getAgentProfileRecord } from "~~/lib/marketplace/agents-repo";
import { createRunRecord, updateRunRecord } from "~~/lib/marketplace/runs-repo";
import { executeAgentRuntime } from "~~/lib/marketplace/agents/runtime";
import type { DelegationResponse } from "@cloak-wallet/sdk";

export const runtime = "nodejs";
export const maxDuration = 120; // 2-minute timeout for processing multiple hires

/**
 * POST /api/v1/marketplace/cron/compound
 *
 * Server-side cron endpoint that auto-compounds staking rewards for all
 * active staking_steward hires with valid delegations.
 *
 * Protected by CRON_SECRET bearer token.
 * Designed to be triggered by Vercel Cron, GitHub Actions, or any external scheduler.
 *
 * Example cURL:
 *   curl -X POST https://your-app/api/v1/marketplace/cron/compound \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(req: NextRequest) {
  // ── Auth: CRON_SECRET bearer token ──
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Find all active staking_steward hires ──
  const hires = await listHireRecords({
    agentId: "staking_steward",
    status: "active",
  });

  if (hires.length === 0) {
    return NextResponse.json({
      message: "No active staking_steward hires found",
      triggered: 0,
      skipped: 0,
      failed: 0,
    });
  }

  const results: {
    hire_id: string;
    operator_wallet: string;
    status: "triggered" | "skipped" | "failed";
    run_id?: string;
    error?: string;
    tx_hashes?: string[];
  }[] = [];

  for (const hire of hires) {
    try {
      // Find a valid delegation for compound
      const delegation = await findValidCompoundDelegation(
        hire.operator_wallet,
      );
      if (!delegation) {
        results.push({
          hire_id: hire.id,
          operator_wallet: hire.operator_wallet,
          status: "skipped",
          error: "No valid delegation with compound action and remaining allowance",
        });
        continue;
      }

      // Resolve service wallet from agent profile
      const agentProfile = await getAgentProfileRecord("staking_steward");
      const serviceWallet =
        agentProfile?.service_wallet ||
        process.env.CLOAK_AGENT_SERVICE_ADDRESS ||
        hire.operator_wallet;

      // Create run record (non-billable — cron doesn't pay x402)
      const run = await createRunRecord({
        hireId: hire.id,
        agentId: "staking_steward",
        hireOperatorWallet: hire.operator_wallet,
        action: "compound",
        params: { token: "STRK", cron: true },
        billable: false,
        initialStatus: "running",
      });

      // Execute compound
      const output = await executeAgentRuntime({
        agentType: "staking_steward",
        action: "compound",
        params: { token: "STRK" },
        operatorWallet: hire.operator_wallet,
        serviceWallet,
      });

      // Update run record with result
      await updateRunRecord(run.id, {
        status: output.status,
        execution_tx_hashes: output.executionTxHashes,
        result: output.result,
      });

      results.push({
        hire_id: hire.id,
        operator_wallet: hire.operator_wallet,
        status: output.status === "completed" ? "triggered" : "failed",
        run_id: run.id,
        tx_hashes: output.executionTxHashes ?? undefined,
        error:
          output.status === "failed"
            ? (output.result?.error as string) || "execution failed"
            : undefined,
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "unexpected cron error";
      console.error(
        `[cron/compound] Failed for hire ${hire.id}:`,
        msg,
      );
      results.push({
        hire_id: hire.id,
        operator_wallet: hire.operator_wallet,
        status: "failed",
        error: msg,
      });
    }
  }

  const triggered = results.filter((r) => r.status === "triggered").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;

  console.log(
    `[cron/compound] Processed ${hires.length} hires: ${triggered} triggered, ${skipped} skipped, ${failed} failed`,
  );

  return NextResponse.json({
    message: `Processed ${hires.length} hires`,
    triggered,
    skipped,
    failed,
    results,
  });
}

// ── Also support GET for Vercel Cron (which sends GET requests) ──
export async function GET(req: NextRequest) {
  return POST(req);
}

// ── Helpers ──

async function findValidCompoundDelegation(
  operatorWallet: string,
): Promise<DelegationResponse | null> {
  const delegations = await listDelegationRecords(
    operatorWallet,
    "staking_steward",
  );
  const now = new Date();

  for (const dlg of delegations) {
    if (dlg.status !== "active") continue;
    if (now < new Date(dlg.valid_from)) continue;
    if (now >= new Date(dlg.valid_until)) continue;
    if (!dlg.allowed_actions.includes("compound")) continue;

    const remaining = BigInt(dlg.remaining_allowance);
    if (remaining <= 0n) continue;

    return dlg;
  }
  return null;
}
