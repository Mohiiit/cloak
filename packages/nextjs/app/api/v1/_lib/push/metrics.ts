type PushMetricName =
  | "outbox_enqueued"
  | "dispatch_cycles"
  | "events_claimed"
  | "events_sent"
  | "events_retry"
  | "events_dead_letter"
  | "deliveries_sent"
  | "deliveries_failed";

const counters: Record<PushMetricName, number> = {
  outbox_enqueued: 0,
  dispatch_cycles: 0,
  events_claimed: 0,
  events_sent: 0,
  events_retry: 0,
  events_dead_letter: 0,
  deliveries_sent: 0,
  deliveries_failed: 0,
};

export function incrementPushMetric(name: PushMetricName, by = 1): void {
  counters[name] = (counters[name] || 0) + by;
}

export function getPushMetricSnapshot(): Record<PushMetricName, number> {
  return { ...counters };
}

export function resetPushMetricSnapshot(): void {
  for (const key of Object.keys(counters) as PushMetricName[]) {
    counters[key] = 0;
  }
}

