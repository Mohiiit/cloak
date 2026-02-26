export type X402MetricName =
  | "challenge_issued"
  | "verify_accepted"
  | "verify_rejected"
  | "settle_settled"
  | "settle_pending"
  | "settle_failed"
  | "settle_rejected"
  | "paywall_required"
  | "paywall_paid"
  | "replay_pending"
  | "replay_settled"
  | "replay_rejected";

const counters: Record<X402MetricName, number> = {
  challenge_issued: 0,
  verify_accepted: 0,
  verify_rejected: 0,
  settle_settled: 0,
  settle_pending: 0,
  settle_failed: 0,
  settle_rejected: 0,
  paywall_required: 0,
  paywall_paid: 0,
  replay_pending: 0,
  replay_settled: 0,
  replay_rejected: 0,
};

export function incrementX402Metric(name: X402MetricName): void {
  counters[name] = (counters[name] || 0) + 1;
}

export function getX402MetricSnapshot(): Record<X402MetricName, number> {
  return { ...counters };
}

export function resetX402Metrics(): void {
  for (const key of Object.keys(counters) as X402MetricName[]) {
    counters[key] = 0;
  }
}
