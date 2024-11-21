interface Window {
  gapi: {
    load: (api: string, callback: () => void) => void;
    client: {
      init: (config: any) => Promise<void>;
    };
    auth2: {
      getAuthInstance: () => {
        isSignedIn: {
          get: () => boolean;
        };
        signIn: () => Promise<void>;
        currentUser: {
          get: () => {
            getAuthResponse: () => {
              access_token: string;
            };
          };
        };
      };
    };
  };
  google: {
    accounts: {
      oauth2: {
        initTokenClient: (config: any) => any;
      };
    };
  };
}

interface ErrorEventInit {
  error?: Error;
  message?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
}

interface PromiseRejectionEvent extends Event {
  reason?: any;
  promise: Promise<any>;
}
