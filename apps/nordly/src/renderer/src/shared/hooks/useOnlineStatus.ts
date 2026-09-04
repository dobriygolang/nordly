import { useEffect, useState } from 'react';

import { canReachNetwork } from '@shared/lib/network';

/**
 * Reactive browser connectivity hint. `navigator.onLine` detects a down
 * interface, not captive portals or server reachability.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(canReachNetwork);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);
  return online;
}
