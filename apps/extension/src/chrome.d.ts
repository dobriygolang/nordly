export {};

declare global {
  const chrome: {
    storage: {
      local: {
        get: (keys: string[]) => Promise<Record<string, unknown>>;
        set: (items: Record<string, unknown>) => Promise<void>;
      };
    };
    runtime: {
      onStartup: { addListener: (callback: () => void) => void };
    };
    alarms: {
      create: (name: string, info: { periodInMinutes: number }) => void;
      onAlarm: { addListener: (callback: () => void) => void };
    };
    sidePanel: {
      setPanelBehavior: (options: { openPanelOnActionClick: boolean }) => Promise<void>;
    };
  };
}
