"use client";

import { useSyncExternalStore } from "react";

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

let snapshot: UIState;
const listeners = new Set<() => void>();
const setState = (patch: Partial<UIState>) => {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
};

snapshot = {
  sidebarOpen: false,
  toggleSidebar: () => setState({ sidebarOpen: !snapshot.sidebarOpen }),
  setSidebarOpen: (open) => setState({ sidebarOpen: open }),
};

export function useUIStore<T = UIState>(selector?: (state: UIState) => T): T {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (selector ? selector(snapshot) : (snapshot as T)),
    () => (selector ? selector(snapshot) : (snapshot as T)),
  );
}
