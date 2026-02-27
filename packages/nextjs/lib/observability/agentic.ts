import { randomUUID, createHash } from "crypto";

export type AgenticEventLevel = "debug" | "info" | "warn" | "error";

export interface AgenticEvent {
  level: AgenticEventLevel;
  event: string;
  traceId: string;
  span?: string;
  actor?: string;
  metadata?: Record<string, unknown>;
}

export type MarketplaceFunnelStage =
  | "discover_loaded"
  | "hire_created"
  | "run_requested"
  | "run_executing"
  | "run_completed"
  | "run_failed";

const LOG_LEVELS: Record<AgenticEventLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentLogLevel(): AgenticEventLevel {
  const raw = (process.env.AGENTIC_LOG_LEVEL || "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

export function createTraceId(seed?: string): string {
  const base = seed || randomUUID();
  const salt = process.env.AGENTIC_TRACE_SALT || "cloak-agentic";
  const hash = createHash("sha256").update(`${salt}:${base}`).digest("hex");
  return hash.slice(0, 24);
}

export function shouldLog(level: AgenticEventLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel()];
}

export function logAgenticEvent(event: AgenticEvent): void {
  if (!shouldLog(event.level)) return;
  const payload = {
    ts: new Date().toISOString(),
    level: event.level,
    event: event.event,
    traceId: event.traceId,
    span: event.span,
    actor: event.actor,
    metadata: event.metadata,
  };

  const line = `[agentic] ${JSON.stringify(payload)}`;
  if (event.level === "error") {
    console.error(line);
  } else if (event.level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logMarketplaceFunnelEvent(input: {
  stage: MarketplaceFunnelStage;
  traceId: string;
  actor?: string;
  metadata?: Record<string, unknown>;
  level?: AgenticEventLevel;
}): void {
  logAgenticEvent({
    level: input.level ?? "info",
    event: `marketplace.funnel.${input.stage}`,
    traceId: input.traceId,
    actor: input.actor,
    metadata: input.metadata,
  });
}
