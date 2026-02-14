import { useSyncExternalStore } from "react";

export type TransactionRouterPath = "idle" | "ward" | "2fa" | "direct" | "ward+2fa";

let currentPath: TransactionRouterPath = "idle";
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function setTransactionRouterPath(path: TransactionRouterPath) {
  if (currentPath === path) return;
  currentPath = path;
  emit();
}

export function getTransactionRouterPath() {
  return currentPath;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTransactionRouterPath() {
  return useSyncExternalStore(
    subscribe,
    getTransactionRouterPath,
    getTransactionRouterPath,
  );
}
