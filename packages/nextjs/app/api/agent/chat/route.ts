import { handleAgentChat, loadAgentState } from "~~/lib/agent/service";
import { deleteSession, listSessionSummaries } from "~~/lib/agent/session-store";
import type { AgentChatRequest } from "~~/lib/agent/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AgentChatRequest;

    if (!body || typeof body.message !== "string") {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const result = await handleAgentChat(body);
    return Response.json(result);
  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Agent processing failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId");
    const walletAddress = url.searchParams.get("walletAddress") || undefined;
    const clientId = url.searchParams.get("clientId") || undefined;
    if (!sessionId) {
      return Response.json({ error: "Missing sessionId" }, { status: 400 });
    }
    const deleted = await deleteSession(sessionId, { walletAddress, clientId });
    if (!deleted) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }
    const sessions = await listSessionSummaries({ walletAddress, clientId });
    return Response.json({ sessions });
  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Failed to delete session" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId") || undefined;
    const walletAddress = url.searchParams.get("walletAddress") || undefined;
    const clientId = url.searchParams.get("clientId") || undefined;
    const result = await loadAgentState(sessionId, { walletAddress, clientId });
    return Response.json(result);
  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Failed to load agent state" },
      { status: 500 },
    );
  }
}
