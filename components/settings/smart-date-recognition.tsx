"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { setSmartDateRecognitionEnabled } from "@/app/(app)/settings/actions";

interface SmartDateRecognitionContextValue {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  isPending: boolean;
}

const SmartDateRecognitionContext = createContext<SmartDateRecognitionContextValue | null>(null);

// Lives in the (app) layout, above both the Settings page and every
// TaskQuickAdd/TaskComposer instance, so toggling it in Settings updates
// live parsing everywhere immediately — no page reload or navigation
// needed, since it's the same client tree throughout (app).
export function SmartDateRecognitionProvider({
  initialEnabled,
  children,
}: {
  initialEnabled: boolean;
  children: React.ReactNode;
}) {
  const [enabled, setEnabledState] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  function setEnabled(value: boolean) {
    setEnabledState(value);
    startTransition(async () => {
      try {
        await setSmartDateRecognitionEnabled(value);
      } catch {
        // Persisting failed — roll back so the UI doesn't drift from the DB.
        setEnabledState(!value);
      }
    });
  }

  return (
    <SmartDateRecognitionContext.Provider value={{ enabled, setEnabled, isPending }}>
      {children}
    </SmartDateRecognitionContext.Provider>
  );
}

export function useSmartDateRecognition() {
  const ctx = useContext(SmartDateRecognitionContext);
  if (!ctx) throw new Error("useSmartDateRecognition must be used within SmartDateRecognitionProvider");
  return ctx;
}
