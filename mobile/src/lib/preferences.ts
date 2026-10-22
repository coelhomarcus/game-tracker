import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type PreferencesState = {
  hapticsEnabled: boolean;
  setHapticsEnabled(enabled: boolean): void;
};

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      hapticsEnabled: true,
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
    }),
    {
      name: 'preferences',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ hapticsEnabled: state.hapticsEnabled }),
      merge: (persisted, current) => {
        const stored = (persisted as { hapticsEnabled?: unknown } | undefined)?.hapticsEnabled;
        return { ...current, hapticsEnabled: typeof stored === 'boolean' ? stored : true };
      },
    },
  ),
);
