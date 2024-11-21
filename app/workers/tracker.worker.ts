// Interfaces
interface TrackerMessage {
  type:
    | "INIT"
    | "PAGE_VIEW"
    | "CLICK"
    | "ERROR"
    | "AUTH"
    | "REQUEST_AUTH"
    | "AUTH_TOKEN"
    | "LOCATION_UPDATE";
  payload: any;
}

interface DeviceInfo {
  os: string;
  mobile?: boolean;
  userAgent?: string;
}

interface BrowserInfo {
  name: string;
  version: string;
}

interface TrackerConfig {
  sheetId: string;
  clientId: string;
  apiKey: string;
}

interface LocationData {
  city?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

// Worker context
const ctx: Worker = self as any;

// State management
let accessToken: string | null = null;
let sheetConfig: TrackerConfig | null = null;
let isInitialized = false;
let lastEventTime = 0;
const EVENT_THROTTLE = 1000;
let currentLocation: LocationData | null = null;

// Google Auth initialization
async function initializeGoogleAuth(): Promise<void> {
  try {
    console.log("Starting Google Auth initialization");

    // Check for stored token in IndexedDB
    const token = await getStoredToken();
    console.log("Stored token check:", token ? "Found" : "Not found");

    if (token) {
      accessToken = token;
      isInitialized = true;
      console.log("Using stored token");
      return;
    }

    console.log("Requesting new auth token from main thread");
    ctx.postMessage({ type: "REQUEST_AUTH" });

    // Wait for token response with timeout
    const tokenResponse = await Promise.race([
      new Promise((resolve) => {
        const authListener = (event: MessageEvent) => {
          if (event.data.type === "AUTH_TOKEN") {
            ctx.removeEventListener("message", authListener);
            resolve(event.data.payload);
          }
        };
        ctx.addEventListener("message", authListener);
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Auth timeout")), 30000)
      ),
    ]);

    console.log("Received token response");
    accessToken = tokenResponse as string;
    await storeToken(accessToken);
    isInitialized = true;
  } catch (error) {
    console.error("Auth initialization failed:", error);
    ctx.postMessage({
      type: "ERROR",
      payload: `Authentication failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    });
    throw error; // Re-throw to handle in the message handler
  }
}
// IndexedDB functions for token storage
async function getStoredToken(): Promise<string | null> {
  try {
    const db = await openDB();
    const transaction = db.transaction("tokens", "readonly");
    const store = transaction.objectStore("tokens");
    const request = store.get("auth_token");

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as string | null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Error reading token:", error);
    return null;
  }
}

async function storeToken(token: string): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction("tokens", "readwrite");
    const store = transaction.objectStore("tokens");

    return new Promise((resolve, reject) => {
      const request = store.put(token, "auth_token");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Error storing token:", error);
  }
}

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("TrackerDB", 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("tokens")) {
        db.createObjectStore("tokens");
      }
    };
  });
}

// Message handler
ctx.addEventListener("message", async (event: MessageEvent<TrackerMessage>) => {
  const { type, payload } = event.data;
  console.log("Worker received message:", type);

  try {
    switch (type) {
      case "INIT":
        sheetConfig = payload;
        if (payload.location) {
          currentLocation = payload.location;
        }
        await initializeGoogleAuth();
        ctx.postMessage({ type: "INITIALIZED" });
        break;

      case "PAGE_VIEW":
      case "CLICK":
        await storeEvent({
          ...payload,
          type,
        });
        break;

      case "ERROR":
        await storeEvent({
          ...payload,
          type,
          error: formatError(payload.error),
        });
        break;

      case "LOCATION_UPDATE":
        currentLocation = payload.location;
        break;

      case "AUTH_TOKEN":
        if (payload) {
          accessToken = payload;
          await storeToken(payload);
          isInitialized = true;
        }
        break;
    }
  } catch (error) {
    console.error("Error processing message:", error);
    ctx.postMessage({
      type: "ERROR",
      payload: `Worker error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    });
  }
});

async function storeEvent(data: any) {
  try {
    const now = Date.now();
    if (now - lastEventTime < EVENT_THROTTLE) {
      return;
    }
    lastEventTime = now;

    if (!accessToken || !sheetConfig) {
      await initializeGoogleAuth();
    }

    // Use current location if not provided in event data
    const location = data.location || currentLocation;

    // Format error message if present
    let errorMessage = "";
    if (data.error) {
      errorMessage =
        data.error instanceof Error
          ? data.error.message
          : typeof data.error === "object"
          ? data.error.message || JSON.stringify(data.error)
          : String(data.error);

      // Truncate error message if too long
      errorMessage = errorMessage.substring(0, 150);
    }

    // Format data
    const formattedData = {
      timestamp: new Date().toISOString(),
      page: data.page || "",
      userId: data.user?.id || "",
      userName: data.user?.name || "",
      location: formatLocation(location),
      deviceInfo: formatDeviceInfo(data.device),
      browserInfo: formatBrowserInfo(data.browser),
      error: errorMessage,
    };

    await sendToSheet(formattedData);
  } catch (error) {
    console.error("Error in storeEvent:", error);
    if (
      error instanceof Error &&
      (error.message.includes("401") || error.message.includes("403"))
    ) {
      accessToken = null;
      await storeEvent(data);
    }
  }
}

// Helper functions for formatting data
function formatLocation(location: LocationData | null): string {
  if (!location && currentLocation) {
    location = currentLocation; // Use cached location if provided location is null
  }
  if (!location) return "Unknown";

  const city = location.city || "Unknown City";
  const country = location.country || "Unknown Country";
  return `${city}, ${country}`;
}

function formatDeviceInfo(device: DeviceInfo | null): string {
  if (!device) return "Unknown";
  return device.os || "Unknown OS";
}

function formatBrowserInfo(browser: BrowserInfo | null): string {
  if (!browser) return "Unknown";
  return `${browser.name || "Unknown"} ${browser.version || ""}`.trim();
}

function formatError(error: any): string {
  if (!error) return "";
  if (typeof error === "string") return error.substring(0, 150);
  return (error.message || "Unknown error").substring(0, 150);
}

async function sendToSheet(data: any) {
  if (!accessToken || !sheetConfig) {
    throw new Error("Not initialized");
  }

  // First, check if headers exist
  const checkResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetConfig.sheetId}/values/A1:H1`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const checkResult = await checkResponse.json();

  // Add headers if they don't exist
  if (!checkResult.values || checkResult.values.length === 0) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetConfig.sheetId}/values/A1:H1?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: [
            [
              "Timestamp",
              "Page",
              "User ID",
              "User Name",
              "Location",
              "Device OS",
              "Browser",
              "Error",
            ],
          ],
        }),
      }
    );
  }

  // Append data
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetConfig.sheetId}/values/A1:H1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        range: "A1:H1",
        majorDimension: "ROWS",
        values: [
          [
            data.timestamp,
            data.page,
            data.userId,
            data.userName,
            data.location,
            data.deviceInfo,
            data.browserInfo,
            data.error,
          ],
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
}
