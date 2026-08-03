import * as Location from "expo-location";
import { useEffect, useState } from "react";

export interface RegionInfo {
  city: string | null;
  region: string | null;
  country: string | null;
  label: string;
}

const UNKNOWN_REGION: RegionInfo = {
  city: null,
  region: null,
  country: null,
  label: "Unknown region",
};

/**
 * Silently detects the device's region in the background. Not surfaced in the
 * UI yet - this is groundwork for region-based customization added later.
 */
export function useRegion() {
  const [region, setRegion] = useState<RegionInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function detect() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const [place] = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        if (cancelled || !place) return;

        const city = place.city ?? place.subregion ?? null;
        const regionName = place.region ?? null;
        const country = place.country ?? null;
        const label = [city, regionName, country].filter(Boolean).join(", ") || UNKNOWN_REGION.label;

        setRegion({ city, region: regionName, country, label });
      } catch {
        // Region detection is best-effort background groundwork - failures are silent.
      }
    }

    void detect();
    return () => {
      cancelled = true;
    };
  }, []);

  return region;
}
