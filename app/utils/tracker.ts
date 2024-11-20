interface UserInfo {
  id: string;
  name: string;
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

interface ErrorData {
  message: string;
  stack?: string;
  source: string;
  lineno: number;
  colno: number;
  error: string | null;
  timeStamp: string;
  url: string;
}

interface TrackerConfig {
  sheetId: string;
  clientId: string;
  apiKey: string;
}

interface CustomErrorEvent extends Event {
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  error?: Error;
}

declare global {
  interface Window {
    google: any;
  }
}

export class UserActivityTracker {
  private static instance: UserActivityTracker | null = null;
  private static isAuthenticating: boolean = false;
  private static eventListenersInitialized: boolean = false;

  private storageMode: string = "sheet";
  private dbConfig: any = null;
  private sheetConfig!: TrackerConfig;
  private accessToken: string | null = null;
  private tokenClient: any = null;
  private isInitialized: boolean = false;
  private boundHandleClick!: (event: MouseEvent) => void;
  private authPromise: Promise<void> | null = null;

  constructor(storageMode: string, dbConfig: any, sheetConfig: TrackerConfig) {
    if (UserActivityTracker.instance) {
      return UserActivityTracker.instance;
    }

    this.storageMode = storageMode;
    this.dbConfig = dbConfig;
    this.sheetConfig = sheetConfig;
    this.boundHandleClick = this.handleClick.bind(this);

    UserActivityTracker.instance = this;
    this.init();
  }

  public async waitForInitialization(): Promise<void> {
    if (this.isInitialized) return;
    await this.init();
  }

  private async init(): Promise<void> {
    if (this.isInitialized) return;

    await this.loadGoogleIdentityServices();
    await this.initializeGoogleAuth();
    await this.initEventListeners();

    this.isInitialized = true;
  }

  public cleanup(): void {
    if (!UserActivityTracker.eventListenersInitialized) return;

    document.removeEventListener("click", this.handleClick);
    window.removeEventListener("error", this.handleError);
    UserActivityTracker.eventListenersInitialized = false;
  }

  private async initEventListeners(): Promise<void> {
    if (UserActivityTracker.eventListenersInitialized) return;

    document.addEventListener("click", this.handleClick);
    window.addEventListener("error", this.handleError);

    // Track navigation events
    if (typeof window !== "undefined") {
      window.addEventListener("popstate", () => this.trackPageView());
      const pushState = history.pushState;
      history.pushState = (...args) => {
        pushState.apply(history, args);
        this.trackPageView();
      };
    }

    this.trackPageView();
    UserActivityTracker.eventListenersInitialized = true;
  }

  private trackPageView(): void {
    const data = {
      page: window.location.pathname,
      user: this.getUserInfo(),
      timestamp: new Date().toISOString(),
      location: this.getUserLocation(),
      device: this.getDeviceInfo(),
      browser: this.getBrowserInfo(),
      type: "pageview",
    };
    this.storeData(data);
  }

  private handleClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const data = {
      page: window.location.pathname,
      user: this.getUserInfo(),
      timestamp: new Date().toISOString(),
      location: this.getUserLocation(),
      device: this.getDeviceInfo(),
      browser: this.getBrowserInfo(),
      type: "click",
      element: {
        tag: target.tagName.toLowerCase(),
        id: target.id,
        class: target.className,
        text: target.textContent?.trim().substring(0, 50),
      },
    };
    this.storeData(data);
  };

  private handleError = (event: Event): void => {
    const errorEvent = event as CustomErrorEvent;
    const errorData: ErrorData = {
      message: errorEvent.message || "Unknown error",
      source: errorEvent.filename || window.location.pathname,
      lineno: errorEvent.lineno || 0,
      colno: errorEvent.colno || 0,
      error: errorEvent.error?.stack || null,
      timeStamp: new Date().toISOString(),
      url: window.location.href,
    };

    this.storeData({
      type: "error",
      error: errorData,
    });
  };

  private getUserInfo(): UserInfo {
    // Implement user info retrieval logic
    return { id: "user123", name: "John Doe" };
  }

  private getUserLocation(): string {
    // Implement location retrieval logic
    return "New York, USA";
  }

  private getDeviceInfo(): DeviceInfo {
    // @ts-ignore
    const userAgentData = navigator.userAgentData;

    if (userAgentData) {
      // Modern approach
      return {
        os: userAgentData.platform,
        mobile: userAgentData.mobile,
      };
    }

    // Fallback for older browsers
    const userAgent = navigator.userAgent;
    const platform = (() => {
      if (userAgent.includes("Win")) return "Windows";
      if (userAgent.includes("Mac")) return "MacOS";
      if (userAgent.includes("Linux")) return "Linux";
      if (userAgent.includes("Android")) return "Android";
      if (userAgent.includes("iOS")) return "iOS";
      return "Unknown";
    })();

    return {
      os: platform,
      userAgent: userAgent,
    };
  }

  private getBrowserInfo(): BrowserInfo {
    const ua = navigator.userAgent;
    let browserName = "Unknown";
    let browserVersion = "Unknown";

    // Chrome
    if (ua.match(/chrome|chromium|crios/i)) {
      browserName = "Chrome";
      browserVersion =
        ua.match(/(?:chrome|chromium|crios)\/([0-9]+)/i)?.[1] || "";
    }
    // Firefox
    else if (ua.match(/firefox|fxios/i)) {
      browserName = "Firefox";
      browserVersion = ua.match(/(?:firefox|fxios)\/([0-9]+)/i)?.[1] || "";
    }
    // Safari
    else if (ua.match(/safari/i)) {
      browserName = "Safari";
      browserVersion = ua.match(/version\/([0-9]+)/i)?.[1] || "";
    }
    // Edge
    else if (ua.match(/edg/i)) {
      browserName = "Edge";
      browserVersion = ua.match(/edg\/([0-9]+)/i)?.[1] || "";
    }

    return {
      name: browserName,
      version: browserVersion,
    };
  }

  private storeData(data: any): void {
    if (this.storageMode === "database") {
      this.storeInDatabase(data);
    } else if (this.storageMode === "sheet") {
      this.storeInSheet(data);
    }
  }

  private storeInDatabase(data: any): void {
    // Implement database storage logic
    console.log("Storing in database:", data);
  }

  private async storeInSheet(data: any): Promise<void> {
    try {
      if (!this.accessToken) {
        await this.initializeGoogleAuth();
      }

      // First, check if headers exist
      const checkResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${this.sheetConfig.sheetId}/values/A1:H1`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      const checkResult = await checkResponse.json();

      // Add headers if they don't exist
      if (!checkResult.values || checkResult.values.length === 0) {
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${this.sheetConfig.sheetId}/values/A1:H1?valueInputOption=RAW`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
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

      // Format device and browser info
      const deviceInfo = typeof data.device === "object" ? data.device : {};
      const browserInfo = typeof data.browser === "object" ? data.browser : {};

      const deviceString = deviceInfo.os || "Unknown";
      const browserString = `${browserInfo.name || "Unknown"} ${
        browserInfo.version || ""
      }`.trim();

      const errorString = data.error
        ? `${data.error.type || "Unknown"}: ${data.error.message} (${
            data.error.url
          }:${data.error.lineNumber || "N/A"})`
        : "";

      // Append data
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${this.sheetConfig.sheetId}/values/A1:H1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            range: "A1:H1",
            majorDimension: "ROWS",
            values: [
              [
                new Date().toISOString(),
                data.page || "",
                data.user?.id || "",
                data.user?.name || "",
                data.location || "",
                deviceString,
                browserString,
                errorString,
              ],
            ],
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `HTTP error! status: ${response.status}, message: ${JSON.stringify(
            errorData
          )}`
        );
      }

      console.log("Data successfully stored in Google Sheet");
    } catch (error) {
      console.error("Error storing data in Google Sheet:", error);
      if (
        error instanceof Error &&
        (error.message.includes("401") || error.message.includes("403"))
      ) {
        this.accessToken = null;
        this.isInitialized = false;
        await this.storeInSheet(data);
      }
    }
  }

  private async loadGoogleIdentityServices(): Promise<void> {
    if (typeof window.google !== "undefined") return;

    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.onload = () => resolve();
      document.body.appendChild(script);
    });
  }

  private async initializeGoogleAuth(): Promise<void> {
    if (this.isInitialized) return;
    if (this.authPromise) return this.authPromise;

    // Check for stored token first
    const storedToken = localStorage.getItem("gauth_token");
    if (storedToken) {
      this.accessToken = storedToken;
      this.isInitialized = true;
      return;
    }

    if (UserActivityTracker.isAuthenticating) {
      await new Promise((resolve) => {
        const checkAuth = () => {
          if (!UserActivityTracker.isAuthenticating) {
            resolve(undefined);
          } else {
            setTimeout(checkAuth, 100);
          }
        };
        checkAuth();
      });
      return;
    }

    UserActivityTracker.isAuthenticating = true;
    this.authPromise = new Promise((resolve) => {
      this.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: this.sheetConfig.clientId,
        scope: "https://www.googleapis.com/auth/spreadsheets",
        callback: (tokenResponse: any) => {
          if (tokenResponse.error !== undefined) {
            console.error("Token error:", tokenResponse);
          } else {
            this.accessToken = tokenResponse.access_token;
            localStorage.setItem("gauth_token", tokenResponse.access_token);
            this.isInitialized = true;
          }
          UserActivityTracker.isAuthenticating = false;
          resolve();
        },
      });

      this.tokenClient.requestAccessToken({ prompt: "consent" });
    });

    return this.authPromise;
  }

  public trackError(errorData: ErrorData): void {
    const data = {
      page: window.location.pathname,
      user: this.getUserInfo(),
      timestamp: errorData.timeStamp,
      location: this.getUserLocation(),
      device: this.getDeviceInfo(),
      browser: this.getBrowserInfo(),
      type: "error",
      error: {
        message: errorData.message,
        stack: errorData.stack,
        source: errorData.source,
        lineno: errorData.lineno,
        colno: errorData.colno,
        url: errorData.url,
      },
    };

    this.storeData(data);
  }
}
