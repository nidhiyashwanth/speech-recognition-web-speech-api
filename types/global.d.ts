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
}
