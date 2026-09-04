import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import type { OAuthStatus } from '@shared/model/oauth';

export type IntegrationOAuthEvent =
  | typeof NORDLY_EVENTS.googleCalendarOAuth
  | typeof NORDLY_EVENTS.zoomOAuth;

export interface IntegrationOAuthResult {
  status: OAuthStatus;
  detail: string | null;
}

type OAuthResultHandler = (result: IntegrationOAuthResult) => void;

export interface IntegrationOAuthMailbox {
  publish: (event: IntegrationOAuthEvent, result: IntegrationOAuthResult) => void;
  subscribe: (event: IntegrationOAuthEvent, handler: OAuthResultHandler) => () => void;
}

/** Durable for the renderer lifetime: late Settings mounts drain queued OAuth results. */
export function createIntegrationOAuthMailbox(): IntegrationOAuthMailbox {
  const queued = new Map<IntegrationOAuthEvent, IntegrationOAuthResult[]>();
  const subscribers = new Map<IntegrationOAuthEvent, Set<OAuthResultHandler>>();

  return {
    publish(event, result) {
      const handlers = subscribers.get(event);
      if (!handlers?.size) {
        const pending = queued.get(event) ?? [];
        pending.push(result);
        queued.set(event, pending);
        return;
      }
      for (const handler of handlers) handler(result);
    },
    subscribe(event, handler) {
      const handlers = subscribers.get(event) ?? new Set<OAuthResultHandler>();
      handlers.add(handler);
      subscribers.set(event, handlers);

      const pending = queued.get(event);
      if (pending) {
        queued.delete(event);
        for (const result of pending) handler(result);
      }

      return () => {
        handlers.delete(handler);
        if (handlers.size === 0) subscribers.delete(event);
      };
    },
  };
}

export const integrationOAuthMailbox = createIntegrationOAuthMailbox();
