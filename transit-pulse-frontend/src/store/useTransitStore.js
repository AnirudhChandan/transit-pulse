import { create } from "zustand";

export const useTransitStore = create((set) => ({
  buses: [],
  selectedBus: null,
  routePath: null,
  setBuses: (newBuses) => set({ buses: newBuses }),
  setSelectedBus: (bus) => set({ selectedBus: bus }),
  setRoutePath: (path) => set({ routePath: path }),
  clearSelection: () => set({ selectedBus: null, routePath: null }),
}));
