import { useSyncExternalStore } from "react";

export type AgentTabVoiceEventType = "start" | "stop";

export interface AgentTabVoiceEvent {
  id: number;
  type: AgentTabVoiceEventType;
  createdAt: number;
}

const MAX_EVENTS = 64;
const listeners = new Set<() => void>();

let nextEventId = 0;
let events: AgentTabVoiceEvent[] = [];

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getVersion() {
  return nextEventId;
}

export function emitAgentTabVoiceEvent(type: AgentTabVoiceEventType): AgentTabVoiceEvent {
  const event: AgentTabVoiceEvent = {
    id: ++nextEventId,
    type,
    createdAt: Date.now(),
  };
  events.push(event);
  if (events.length > MAX_EVENTS) {
    events = events.slice(events.length - MAX_EVENTS);
  }
  notify();
  return event;
}

export function consumeAgentTabVoiceEvents(afterId: number): AgentTabVoiceEvent[] {
  return events.filter((event) => event.id > afterId);
}

export function useAgentTabVoiceEventVersion() {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}
