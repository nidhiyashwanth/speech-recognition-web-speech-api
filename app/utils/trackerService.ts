import { locationService } from "./locationService";
import { errorTracker } from "./errorTracker";

interface WorkerMessage {
  type:
    | "INIT"
    | "PAGE_VIEW"
    | "CLICK"
    | "ERROR"
    | "AUTH"
    | "REQUEST_AUTH"
    | "AUTH_TOKEN"
    | "INITIALIZED"
    | "LOCATION_UPDATE";
  payload: any;
}

export class TrackerService {
  private worker: Worker;
  private static instance: TrackerService | null = null;
  private config: any;
  private tokenClient: any = null;
  private locationService: typeof locationService;
  private errorTracker: typeof errorTracker;

  private constructor() {
    if (typeof window === "undefined") {
      throw new Error(
        "TrackerService can only be instantiated in browser environment"
      );
    }

    this.worker = new Worker(
      new URL("../workers/tracker.worker.ts", import.meta.url)
    );
    this.locationService = locationService;
    this.errorTracker = errorTracker;
    this.setupWorkerListeners();
    this.setupErrorTracking();
    this.setupLocationTracking();
    this.setupClickTracking();
  }

  static getInstance(): TrackerService {
    if (!TrackerService.instance) {
      TrackerService.instance = new TrackerService();
    }
    return TrackerService.instance;
  }

  private setupWorkerListeners() {
    this.worker.addEventListener(
      "message",
      async (event: MessageEvent<WorkerMessage>) => {
        const { type, payload } = event.data;
        switch (type) {
          case "ERROR":
            console.error("Worker error:", payload);
            break;
          case "INITIALIZED":
            console.log("Tracker worker initialized");
            break;
          case "REQUEST_AUTH":
            const token = await this.getGoogleAuthToken();
            this.worker.postMessage({ type: "AUTH_TOKEN", payload: token });
            break;
        }
      }
    );
  }

  private setupErrorTracking() {
    this.errorTracker.addHandler(async (error: Error, errorInfo: any) => {
      const commonData = await this.getCommonData();
      this.worker.postMessage({
        type: "ERROR",
        payload: {
          page: window.location.pathname,
          error: {
            message: error.message,
            type: errorInfo?.type || "unknown",
            stack: error.stack?.split("\n")[0] || "", // Only keep first line of stack
          },
          ...commonData,
        },
      });
    });
  }

  private setupLocationTracking() {
    setInterval(async () => {
      const location = await this.locationService.getCurrentLocation();
      if (location) {
        this.worker.postMessage({
          type: "LOCATION_UPDATE",
          payload: { location },
        });
      }
    }, 5 * 60 * 1000); // Update every 5 minutes
  }

  private setupClickTracking() {
    if (typeof window === "undefined") return;

    window.addEventListener("click", async (event) => {
      const element = event.target as HTMLElement;
      if (!element) return;

      const commonData = await this.getCommonData();
      this.worker.postMessage({
        type: "CLICK",
        payload: {
          page: window.location.pathname,
          timestamp: new Date().toISOString(),
          element: {
            tag: element.tagName.toLowerCase(),
            id: element.id,
            class: element.className,
            text: element.textContent?.trim().substring(0, 50),
          },
          ...commonData,
        },
      });
    });
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

  private async getGoogleAuthToken(): Promise<string> {
    await this.loadGoogleIdentityServices();

    return new Promise((resolve, reject) => {
      this.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: this.config.clientId,
        scope: "https://www.googleapis.com/auth/spreadsheets",
        callback: (tokenResponse: any) => {
          if (tokenResponse.error !== undefined) {
            reject(new Error(tokenResponse.error));
          } else {
            resolve(tokenResponse.access_token);
          }
        },
      });

      this.tokenClient.requestAccessToken({ prompt: "consent" });
    });
  }

  async initialize(config: any) {
    this.config = config;

    // Request location permission early
    const location = await this.locationService.getCurrentLocation();

    this.worker.postMessage({
      type: "INIT",
      payload: {
        ...config,
        location,
      },
    });

    // Track initial page view
    await this.trackPageView();

    // Setup page navigation tracking
    if (typeof window !== "undefined") {
      // Track client-side navigation in Next.js
      window.addEventListener("popstate", () => this.trackPageView());
      // For Next.js route changes
      const pushState = history.pushState;
      history.pushState = (...args) => {
        pushState.apply(history, args);
        this.trackPageView();
      };
    }
  }

  async trackPageView() {
    const commonData = await this.getCommonData();
    this.worker.postMessage({
      type: "PAGE_VIEW",
      payload: {
        page: window.location.pathname,
        timestamp: new Date().toISOString(),
        ...commonData,
      },
    });
  }

  private async getCommonData() {
    const location = await this.locationService.getCurrentLocation();
    return {
      user: { id: "user123", name: "John Doe" }, // Replace with actual user data
      device: this.getDeviceInfo(),
      browser: this.getBrowserInfo(),
      location,
    };
  }

  // Copy device and browser info methods from original tracker
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
}
