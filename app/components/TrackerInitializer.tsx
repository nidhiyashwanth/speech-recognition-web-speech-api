'use client';

import { useEffect } from 'react';
import { TrackerService } from '../utils/trackerService';

export function TrackerInitializer() {
  useEffect(() => {
    const initTracker = async () => {
      try {
        const tracker = TrackerService.getInstance();
        await tracker.initialize({
          sheetId: process.env.NEXT_PUBLIC_GOOGLE_SHEET_ID!,
          clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
          apiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY!,
        });
      } catch (error) {
        console.error('Failed to initialize tracker:', error);
      }
    };

    initTracker();
  }, []);

  return null; // This component doesn't render anything
} 