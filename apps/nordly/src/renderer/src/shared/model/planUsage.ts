import { create } from 'zustand';

export interface DeviceRegistrationState {
  deviceId: string;
  devicesRegistered: number;
  deviceLimit: number;
  cloudSyncEnabled: boolean;
}

interface PlanUsageState {
  deviceRegistration: DeviceRegistrationState | null;
  publishedNotesCount: number;
  setDeviceRegistration: (state: DeviceRegistrationState | null) => void;
  setPublishedNotesCount: (count: number) => void;
  adjustPublishedNotesCount: (delta: number) => void;
}

export const usePlanUsageStore = create<PlanUsageState>((set) => ({
  deviceRegistration: null,
  publishedNotesCount: 0,
  setDeviceRegistration: (deviceRegistration) => set({ deviceRegistration }),
  setPublishedNotesCount: (publishedNotesCount) => set({ publishedNotesCount }),
  adjustPublishedNotesCount: (delta) =>
    set((s) => ({ publishedNotesCount: Math.max(0, s.publishedNotesCount + delta) })),
}));
