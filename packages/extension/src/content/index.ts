/**
 * Content script — bridge between page context (injected.js) and
 * the extension background service worker.
 *
 * Page (injected) ──postMessage──▶ Content Script ──chrome.runtime──▶ Background SW
 * Page (injected) ◀──postMessage── Content Script ◀──response──────── Background SW
 */

// ─── Inject the provider script into the page ────────────────────────

function injectScript() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("injected.js");
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

injectScript();

// ─── Bridge: page ↔ extension ────────────────────────────────────────

window.addEventListener("message", async (event) => {
  // Only accept messages from this window
  if (event.source !== window) return;
  if (event.data?.source !== "cloak-injected") return;

  const { id, method, params } = event.data;

  // Guard against invalidated extension context (e.g. after extension reload)
  if (!chrome.runtime?.id) {
    window.postMessage({
      source: "cloak-content",
      id,
      error: "Cloak extension was reloaded. Please refresh this page.",
    }, "*");
    return;
  }

  try {
    const result = await chrome.runtime.sendMessage({
      type: "WALLET_RPC",
      method,
      params,
    });

    if (result?.success) {
      window.postMessage({ source: "cloak-content", id, result: result.data }, "*");
    } else {
      window.postMessage({ source: "cloak-content", id, error: result?.error || "Unknown error" }, "*");
    }
  } catch (err: any) {
    window.postMessage({
      source: "cloak-content",
      id,
      error: err.message || "Extension communication failed",
    }, "*");
  }
});

console.log("[Cloak] Content script loaded");
