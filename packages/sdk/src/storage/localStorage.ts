import type { StorageAdapter } from "../types";

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private prefix = "cloak_") {}

  async get(key: string): Promise<string | null> {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(this.prefix + key);
  }

  async set(key: string, value: string): Promise<void> {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(this.prefix + key, value);
  }

  async remove(key: string): Promise<void> {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(this.prefix + key);
  }
}
