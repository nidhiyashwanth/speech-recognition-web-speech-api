# Activity and Error Tracking System

A comprehensive tracking system that monitors user interactions, page views, and errors in Next.js applications, with data storage in Google Sheets.

## Features

### 1. User Activity Tracking

- Click events across all pages
- Page view tracking
- Navigation tracking (including browser history changes)
- Device and browser information
- User location data
- Timestamp for all events

### 2. Error Tracking

- Runtime errors
- Unhandled promise rejections
- Console errors
- Detailed error information including:
  - Stack traces
  - Line numbers
  - File sources
  - Error messages

### 3. Data Storage

- Google Sheets integration
- Automatic sheet headers creation
- Structured data storage with columns for:
  - Timestamp
  - Page URL
  - User ID
  - User Name
  - Location
  - Device OS
  - Browser
  - Error Details

## Setup Instructions

1. Create a Google Cloud Project and enable Google Sheets API

2. Get required credentials:

   ```env
   NEXT_PUBLIC_GOOGLE_SHEET_ID=your_sheet_id
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id
   NEXT_PUBLIC_GOOGLE_API_KEY=your_api_key
   ```

3. Wrap your application with TrackerProvider:

   ```tsx
   import { TrackerProvider } from "./context/TrackerContext";

   function App({ children }) {
     return <TrackerProvider>{children}</TrackerProvider>;
   }
   ```

4. Use the tracker in components:

   ```tsx
   import { useTracker } from "../context/TrackerContext";

   function YourComponent() {
     const { tracker } = useTracker();
     // Your component code
   }
   ```

## How It Works

### Activity Tracking

The system automatically tracks:

- Page loads and navigation
- Click events with element details
- User session information
- Device and browser metadata

### Error Tracking

Captures errors through:

- Global error event listener
- Unhandled promise rejection handler
- Console.error interceptor

### Authentication

- Uses Google Identity Services for authentication
- Implements token caching to prevent multiple sign-in prompts
- Handles token refresh automatically

## Data Structure

Each tracked event is stored with:

```typescript
{
    timestamp: string;
    page: string;
    userId: string;
    userName: string;
    location: string;
    deviceInfo: {
    os: string;
    mobile?: boolean;
    userAgent?: string;
    };
    browserInfo: {
        name: string;
        version: string;
    };
    eventType: "click" | "pageview" | "error";
    additionalData?: any;
}
```

## Best Practices

1. Initialize the tracker at the application root level
2. Clean up event listeners when components unmount
3. Handle authentication state properly
4. Monitor sheet size and implement data rotation if needed
5. Respect user privacy and comply with data protection regulations

## Limitations

- Requires Google Sheets API access
- Needs user consent for Google authentication
- Sheet size limitations based on Google Sheets quotas
