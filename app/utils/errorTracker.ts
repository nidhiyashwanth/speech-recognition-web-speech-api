type ErrorHandler = (error: Error, errorInfo?: Record<string, any>) => void;

class ErrorTrackingService {
  private static instance: ErrorTrackingService;
  private errorHandlers: ErrorHandler[] = [];

  private constructor() {
    this.setupGlobalHandlers();
  }

  static getInstance(): ErrorTrackingService {
    if (!this.instance) {
      this.instance = new ErrorTrackingService();
    }
    return this.instance;
  }

  private setupGlobalHandlers() {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(event.reason, {
        type: 'unhandledRejection',
        message: event.reason?.message || 'Unhandled Promise Rejection'
      });
    });

    // Handle runtime errors
    window.addEventListener('error', (event) => {
      this.handleError(event.error || new Error(event.message), {
        type: 'runtime',
        filename: event.filename,
        lineNumber: event.lineno,
        columnNumber: event.colno
      });
    });

    // Handle console.error
    const originalConsoleError = console.error;
    console.error = (...args) => {
      const error = args[0] instanceof Error ? args[0] : new Error(args.join(' '));
      this.handleError(error, { type: 'console' });
      originalConsoleError.apply(console, args);
    };
  }

  addHandler(handler: ErrorHandler) {
    this.errorHandlers.push(handler);
  }

  private handleError(error: Error, errorInfo?: Record<string, any>) {
    this.errorHandlers.forEach(handler => handler(error, errorInfo));
  }
}

export const errorTracker = ErrorTrackingService.getInstance();
