export function hasSupabaseEnv(): boolean {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2)}`;
}

export function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item));
  return [];
}

export function parseJsonObject(
  value: unknown,
  fallback: Record<string, unknown> = {},
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  return value as Record<string, unknown>;
}
