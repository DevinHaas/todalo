"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { RambleModal } from "@/components/ramble/ramble-modal";

export interface RambleProject { id: string; name: string; color: string | null }
export interface RambleDefaults { defaultDueDate?: string | null; projectId?: string | null }
const RambleContext = createContext<((defaults?: RambleDefaults) => void) | null>(null);

export function RambleProvider({ children, projects = [] }: { children: React.ReactNode; projects?: RambleProject[] }) {
  const [request, setRequest] = useState<{ key: number; defaults: RambleDefaults } | null>(null);
  const openRamble = useCallback((defaults: RambleDefaults = {}) => {
    setRequest((current) => current ?? { key: Date.now(), defaults });
  }, []);

  return <RambleContext.Provider value={openRamble}>
    {children}
    {request && <RambleModal key={request.key} defaults={request.defaults} projects={projects} onClose={() => setRequest(null)} />}
  </RambleContext.Provider>;
}

export function useRamble() {
  const open = useContext(RambleContext);
  if (!open) throw new Error("useRamble must be used within RambleProvider");
  return open;
}
