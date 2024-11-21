interface LocationData {
  city?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

class LocationService {
  private static instance: LocationService | null = null;
  private currentLocation: LocationData | null = null;
  private lastFetchTime: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000;
  private readonly API_TIMEOUT = 3000;

  private constructor() {}

  static getInstance(): LocationService {
    if (!LocationService.instance) {
      LocationService.instance = new LocationService();
    }
    return LocationService.instance;
  }

  async requestPermission(): Promise<boolean> {
    try {
      const permission = await navigator.permissions.query({
        name: "geolocation" as PermissionName,
      });
      return permission.state === "granted";
    } catch (error) {
      console.error("Error requesting location permission:", error);
      return false;
    }
  }

  private async reverseGeocode(
    latitude: number,
    longitude: number
  ): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.API_TIMEOUT);

    try {
      // Try OpenStreetMap first
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        {
          headers: {
            Accept: "application/json",
            "Accept-Language": "en",
            "User-Agent": "NextJSApp/1.0",
          },
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error("Failed to fetch from OpenStreetMap");
      }

      const data = await response.json();
      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      // Try alternative API (BigDataCloud's free reverse geocoding)
      try {
        const response = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
          {
            headers: {
              Accept: "application/json",
            },
          }
        );

        if (!response.ok) {
          throw new Error("Failed to fetch from backup service");
        }

        const data = await response.json();
        return {
          address: {
            city: data.city || data.locality,
            country: data.countryName,
          },
        };
      } catch (backupError) {
        console.log("Both geocoding services failed");
        return null;
      }
    }
  }

  async getCurrentLocation(): Promise<LocationData | null> {
    // Return cached location if available and recent
    if (
      this.currentLocation &&
      Date.now() - this.lastFetchTime < this.CACHE_DURATION
    ) {
      return this.currentLocation;
    }

    if (!navigator.geolocation) {
      return null;
    }

    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 5000,
            maximumAge: 300000, // 5 minutes
            enableHighAccuracy: false,
          });
        }
      );

      const { latitude, longitude } = position.coords;

      // Always store coordinates first
      this.currentLocation = {
        city: "Unknown City",
        country: "Unknown Country",
        latitude,
        longitude,
      };

      // Try to get city and country
      const geoData = await this.reverseGeocode(latitude, longitude);

      if (geoData) {
        this.currentLocation = {
          city:
            geoData.address?.city ||
            geoData.address?.town ||
            geoData.address?.village ||
            geoData.address?.suburb ||
            "Unknown City",
          country: geoData.address?.country || "Unknown Country",
          latitude,
          longitude,
        };
      }

      this.lastFetchTime = Date.now();
      return this.currentLocation;
    } catch (error) {
      console.log("Location service error:", error);
      return null;
    }
  }
}

export const locationService = LocationService.getInstance();
