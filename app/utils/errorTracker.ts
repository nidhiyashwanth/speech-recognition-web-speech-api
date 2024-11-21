type ErrorHandler = (error: Error, errorInfo?: Record<string, any>) => void;

class ErrorTrackingService {
  private static instance: ErrorTrackingService;
  private errorHandlers: ErrorHandler[] = [];
  private isClient: boolean;
  private boundUnhandledRejectionHandler: (
    event: PromiseRejectionEvent
  ) => void;
  private boundErrorHandler: (event: ErrorEvent) => void;

  private constructor() {
    this.isClient = typeof window !== "undefined";
    // Bind the handlers
    this.boundUnhandledRejectionHandler =
      this.handleUnhandledRejection.bind(this);
    this.boundErrorHandler = this.handleError.bind(this);

    if (this.isClient) {
      this.setupGlobalHandlers();
    }
  }

  static getInstance(): ErrorTrackingService {
    if (!this.instance) {
      this.instance = new ErrorTrackingService();
    }
    return this.instance;
  }

  private handleUnhandledRejection(event: PromiseRejectionEvent) {
    this.handleErrorInternal(
      event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason)),
      {
        type: "unhandledRejection",
        message: event.reason?.message || "Unhandled Promise Rejection",
      }
    );
  }

  private handleError(event: ErrorEvent) {
    this.handleErrorInternal(event.error || new Error(event.message), {
      type: "runtime",
      filename: event.filename,
      lineNumber: event.lineno,
      columnNumber: event.colno,
    });
  }

  private handleErrorInternal(error: Error, errorInfo?: Record<string, any>) {
    this.errorHandlers.forEach((handler) => handler(error, errorInfo));
  }

  private setupGlobalHandlers() {
    if (!this.isClient) return;

    // Handle unhandled promise rejections
    window.addEventListener(
      "unhandledrejection",
      this.boundUnhandledRejectionHandler
    );

    // Handle runtime errors
    window.addEventListener("error", this.boundErrorHandler);

    // Handle console.error
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      const error =
        args[0] instanceof Error ? args[0] : new Error(args.join(" "));
      this.handleErrorInternal(error, { type: "console" });
      originalConsoleError.apply(console, args);
    };
  }

  addHandler(handler: ErrorHandler) {
    this.errorHandlers.push(handler);
  }

  public cleanup() {
    if (!this.isClient) return;

    // Restore original console.error
    if (console.error !== console.error) {
      console.error = console.error;
    }

    // Remove event listeners with properly bound handlers
    window.removeEventListener(
      "unhandledrejection",
      this.boundUnhandledRejectionHandler
    );
    window.removeEventListener("error", this.boundErrorHandler);
  }
}

export const errorTracker = ErrorTrackingService.getInstance();
