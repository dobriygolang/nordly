import { create } from 'zustand';

export interface DeviceRegistrationState {
  deviceId: string;
  devicesRegistered: number;
  deviceLimit: number;
  cloudSyncEnabled: boolean;
}

interface DeviceRegistrationStore {
  deviceRegistration: DeviceRegistrationState | null;
  setDeviceRegistration: (state: DeviceRegistrationState | null) => void;
}

export const useDeviceRegistrationStore = create<DeviceRegistrationStore>((set) => ({
  deviceRegistration: null,
  setDeviceRegistration: (deviceRegistration) => set({ deviceRegistration }),
}));
