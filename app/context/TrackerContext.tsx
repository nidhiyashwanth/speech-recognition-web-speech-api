"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { TrackerService } from "../utils/trackerService";

const TrackerContext = createContext<{ tracker: TrackerService | null }>({
  tracker: null,
});

export function TrackerProvider({ children }: { children: React.ReactNode }) {
  const [tracker, setTracker] = useState<TrackerService | null>(null);

  useEffect(() => {
    const trackerService = TrackerService.getInstance();
    trackerService.initialize({
      sheetId: process.env.NEXT_PUBLIC_GOOGLE_SHEET_ID!,
      clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY!,
    });
    setTracker(trackerService);

    return () => {
      // Cleanup if needed
    };
  }, []);

  return (
    <TrackerContext.Provider value={{ tracker }}>
      {children}
    </TrackerContext.Provider>
  );
}

export const useTracker = () => useContext(TrackerContext);
