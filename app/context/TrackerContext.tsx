"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { UserActivityTracker } from "@/app/utils/tracker";
import { errorTracker } from "../utils/errorTracker";
import { locationService } from "@/app/utils/locationService";

interface TrackerContextType {
  tracker: UserActivityTracker | null;
}

const TrackerContext = createContext<TrackerContextType>({ tracker: null });

export function TrackerProvider({ children }: { children: React.ReactNode }) {
  const [tracker, setTracker] = useState<UserActivityTracker | null>(null);

  useEffect(() => {
    let mounted = true;

    const initTracker = async () => {
      try {
        await locationService.requestPermission();
        
        const newTracker = new UserActivityTracker("sheet", null, {
          sheetId: process.env.NEXT_PUBLIC_GOOGLE_SHEET_ID!,
          clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
          apiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY!,
        });

        await newTracker.waitForInitialization();
        if (mounted) {
          setTracker(newTracker);
        }

        errorTracker.addHandler(
          (error: Error, errorInfo?: Record<string, any>) => {
            if (mounted) {
              newTracker.trackError({
                message: error.message,
                stack: error.stack || "",
                source: errorInfo?.filename || window.location.pathname,
                lineno: errorInfo?.lineNumber || 0,
                colno: errorInfo?.columnNumber || 0,
                error: error.stack || null,
                timeStamp: new Date().toISOString(),
                url: window.location.href,
              });
            }
          }
        );
      } catch (error) {
        console.error("Failed to initialize tracker:", error);
      }
    };

    initTracker();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <TrackerContext.Provider value={{ tracker }}>
      {children}
    </TrackerContext.Provider>
  );
}

export const useTracker = () => useContext(TrackerContext);
