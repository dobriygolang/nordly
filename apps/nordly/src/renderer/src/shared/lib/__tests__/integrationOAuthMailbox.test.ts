import { describe, expect, it, vi } from 'vitest';

import { NORDLY_EVENTS } from '../custom-events';
import { createIntegrationOAuthMailbox } from '../integrationOAuthMailbox';

describe('integration OAuth mailbox', () => {
  it('delivers a result published before the Settings subscriber mounts', () => {
    const mailbox = createIntegrationOAuthMailbox();
    const receive = vi.fn();
    const result = { status: 'connected' as const, detail: null };

    mailbox.publish(NORDLY_EVENTS.googleCalendarOAuth, result);
    const unsubscribe = mailbox.subscribe(NORDLY_EVENTS.googleCalendarOAuth, receive);

    expect(receive).toHaveBeenCalledTimes(1);
    expect(receive).toHaveBeenCalledWith(result);
    unsubscribe();
  });

  it('delivers active subscriptions without retaining a duplicate', () => {
    const mailbox = createIntegrationOAuthMailbox();
    const receive = vi.fn();
    const unsubscribe = mailbox.subscribe(NORDLY_EVENTS.zoomOAuth, receive);

    mailbox.publish(NORDLY_EVENTS.zoomOAuth, {
      status: 'error',
      detail: 'denied',
    });
    unsubscribe();
    const lateReceive = vi.fn();
    mailbox.subscribe(NORDLY_EVENTS.zoomOAuth, lateReceive);

    expect(receive).toHaveBeenCalledTimes(1);
    expect(lateReceive).not.toHaveBeenCalled();
  });
});
