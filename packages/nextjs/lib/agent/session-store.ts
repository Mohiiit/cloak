import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentMessage, AgentSession } from "~~/lib/agent/types";

const STORE_VERSION = 2;
const DEFAULT_SCOPE_KEY = "wallet:anon|client:default";

interface LegacyAgentStoreFile {
  sessions: AgentSession[];
}

interface AgentStoreFile {
  version: number;
  sessionsByScope: Record<string, AgentSession[]>;
}

export interface SessionScope {
  walletAddress?: string | null;
  clientId?: string | null;
}

const EXPLICIT_STORE_PATH = process.env.CLOAK_AGENT_STORE_PATH?.trim();
const DEFAULT_STORE_PATH = path.join(process.cwd(), ".agent-data", "sessions.json");
const TMP_STORE_PATH = path.join(process.env.TMPDIR || os.tmpdir(), "cloak-agent", "sessions.json");
let activeStorePath = EXPLICIT_STORE_PATH
  ? path.resolve(EXPLICIT_STORE_PATH)
  : DEFAULT_STORE_PATH;
let warnedWritableFallback = false;

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}

function emptyStore(): AgentStoreFile {
  return { version: STORE_VERSION, sessionsByScope: {} };
}

function normalizeWalletAddress(value?: string | null): string {
  const raw = (value || "").trim().toLowerCase();
  if (!raw) return "anon";
  return raw.replace(/[^a-z0-9:_-]/g, "").slice(0, 96) || "anon";
}

function normalizeClientId(value?: string | null): string {
  const raw = (value || "").trim();
  if (!raw) return "default";
  const safe = raw.replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 96);
  return safe || "default";
}

function scopeKey(scope?: SessionScope): string {
  const wallet = normalizeWalletAddress(scope?.walletAddress);
  const client = normalizeClientId(scope?.clientId);
  return `wallet:${wallet}|client:${client}`;
}

function normalizeStore(raw: unknown): AgentStoreFile {
  const next = emptyStore();
  if (!raw || typeof raw !== "object") return next;

  const parsed = raw as Partial<AgentStoreFile> & Partial<LegacyAgentStoreFile>;
  const scoped = parsed.sessionsByScope;
  if (scoped && typeof scoped === "object") {
    for (const [key, value] of Object.entries(scoped)) {
      if (Array.isArray(value)) {
        next.sessionsByScope[key] = value;
      }
    }
  }

  if (Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
    const existing = next.sessionsByScope[DEFAULT_SCOPE_KEY] || [];
    next.sessionsByScope[DEFAULT_SCOPE_KEY] = [...parsed.sessions, ...existing];
  }

  return next;
}

function getScopeSessions(store: AgentStoreFile, scope?: SessionScope): AgentSession[] {
  return store.sessionsByScope[scopeKey(scope)] || [];
}

function setScopeSessions(
  store: AgentStoreFile,
  sessions: AgentSession[],
  scope?: SessionScope,
): void {
  store.sessionsByScope[scopeKey(scope)] = sessions;
}

async function ensureStore(): Promise<void> {
  try {
    await ensureStoreAt(activeStorePath);
  } catch (err) {
    if (!activateTmpFallback(err)) throw err;
    await ensureStoreAt(activeStorePath);
  }
}

function isReadonlyFsError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === "EROFS" || code === "EPERM" || code === "EACCES";
}

function activateTmpFallback(err: unknown): boolean {
  if (EXPLICIT_STORE_PATH) return false;
  if (!isReadonlyFsError(err)) return false;
  if (activeStorePath === TMP_STORE_PATH) return false;
  activeStorePath = TMP_STORE_PATH;
  if (!warnedWritableFallback) {
    console.warn(
      `[agent-session-store] Primary path is not writable, falling back to ${TMP_STORE_PATH}`,
    );
    warnedWritableFallback = true;
  }
  return true;
}

async function ensureStoreAt(storePath: string): Promise<void> {
  const storeDir = path.dirname(storePath);
  await fs.mkdir(storeDir, { recursive: true });
  try {
    await fs.access(storePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") {
      throw err;
    }
    const initial = emptyStore();
    await fs.writeFile(storePath, JSON.stringify(initial, null, 2), "utf-8");
  }
}

async function readStore(): Promise<AgentStoreFile> {
  await ensureStore();
  try {
    const raw = await fs.readFile(activeStorePath, "utf-8");
    return normalizeStore(JSON.parse(raw));
  } catch (err) {
    if (activateTmpFallback(err)) {
      try {
        await ensureStore();
        const raw = await fs.readFile(activeStorePath, "utf-8");
        return normalizeStore(JSON.parse(raw));
      } catch {
        // no-op: return an empty store when fallback read still fails
      }
    }
    return emptyStore();
  }
}

async function writeStore(store: AgentStoreFile): Promise<void> {
  try {
    await ensureStore();
    await fs.writeFile(activeStorePath, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    if (!activateTmpFallback(err)) throw err;
    await ensureStore();
    await fs.writeFile(activeStorePath, JSON.stringify(store, null, 2), "utf-8");
  }
}

export function createMessage(role: AgentMessage["role"], text: string): AgentMessage {
  return {
    id: makeId("msg"),
    role,
    text,
    createdAt: nowIso(),
  };
}

export async function listSessionSummaries(
  scope?: SessionScope,
): Promise<Array<{ id: string; title: string; updatedAt: string }>> {
  const store = await readStore();
  return getScopeSessions(store, scope)
    .map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getSessionById(
  id: string,
  scope?: SessionScope,
): Promise<AgentSession | null> {
  const store = await readStore();
  return getScopeSessions(store, scope).find((s) => s.id === id) || null;
}

export async function createSession(scope?: SessionScope, title?: string): Promise<AgentSession> {
  const store = await readStore();
  const sessions = [...getScopeSessions(store, scope)];
  const ts = nowIso();
  const session: AgentSession = {
    id: makeId("session"),
    title: (title || "New agent session").trim() || "New agent session",
    createdAt: ts,
    updatedAt: ts,
    messages: [],
  };
  sessions.unshift(session);
  setScopeSessions(store, sessions, scope);
  await writeStore(store);
  return session;
}

export async function deleteSession(
  sessionId: string,
  scope?: SessionScope,
): Promise<boolean> {
  const store = await readStore();
  const sessions = [...getScopeSessions(store, scope)];
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx < 0) return false;
  sessions.splice(idx, 1);
  setScopeSessions(store, sessions, scope);
  await writeStore(store);
  return true;
}

export async function appendMessages(
  sessionId: string,
  messages: AgentMessage[],
  scope?: SessionScope,
): Promise<AgentSession | null> {
  if (messages.length === 0) return getSessionById(sessionId, scope);
  const store = await readStore();
  const sessions = [...getScopeSessions(store, scope)];
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx < 0) return null;

  const next = { ...sessions[idx] };
  next.messages = [...next.messages, ...messages];
  next.updatedAt = nowIso();
  if (next.title === "New agent session") {
    const firstUserMsg = next.messages.find((m) => m.role === "user");
    if (firstUserMsg) {
      next.title = firstUserMsg.text.slice(0, 48);
    }
  }

  sessions[idx] = next;
  setScopeSessions(store, sessions, scope);
  await writeStore(store);
  return next;
}
