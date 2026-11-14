import { MAX_GEOFENCE_RADIUS_METERS, ERROR_CODES } from '@repo/shared';

export interface GpsCoordinates {
  latitude: number;
  longitude: number;
}

export interface LocationGuardResult {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  isMockLocation: boolean;
  distanceToSplitterMeters?: number;
  isLocationFlagged: boolean;
  clientRecordedAt: string;
}

/**
 * Calculates great-circle distance between two GPS coordinates using Haversine formula (returns meters).
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth's mean radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const rLat1 = (lat1 * Math.PI) / 180;
  const rLat2 = (lat2 * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Expo Location mock interface for type-safe environment resolution.
 */
interface ExpoLocationObject {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
  };
  mocked?: boolean;
  timestamp: number;
}

/**
 * Captures technician current GPS location, detects Android mock location spoofing,
 * and calculates geofencing distance to target ODP splitter.
 */
export async function acquireVerifiedLocation(
  targetSplitterCoords?: GpsCoordinates,
  customLocationProvider?: () => Promise<ExpoLocationObject>,
): Promise<LocationGuardResult> {
  const recordedAt = new Date().toISOString();

  let locationData: ExpoLocationObject;

  if (customLocationProvider) {
    locationData = await customLocationProvider();
  } else {
    // Dynamically resolve expo-location in mobile runtime
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Location = require('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Izin akses lokasi GPS ditolak oleh pengguna.');
      }
      locationData = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
    } catch (err) {
      throw new Error(`Gagal membaca sinyal satelit GPS: ${(err as Error).message}`);
    }
  }

  // 1. Anti-Fake GPS Detection (Law 4 & AGENT.md Section 4)
  const isMock = Boolean(locationData.mocked);
  if (isMock) {
    throw new Error(
      `${ERROR_CODES.MOCK_LOCATION_DETECTED}: Perangkat Anda terdeteksi menggunakan aplikasi Fake GPS / Mock Location. Pengiriman tiket dibatalkan demi kepatuhan SOP.`,
    );
  }

  const { latitude, longitude, accuracy } = locationData.coords;
  let distanceMeters: number | undefined;
  let isFlagged = latitude === 0 && longitude === 0;

  // 2. Geofence Distance Calculation to target Splitter
  if (targetSplitterCoords) {
    const rawDistance = calculateHaversineDistance(
      latitude,
      longitude,
      targetSplitterCoords.latitude,
      targetSplitterCoords.longitude,
    );
    distanceMeters = Math.round(rawDistance);
    isFlagged =
      distanceMeters > MAX_GEOFENCE_RADIUS_METERS ||
      (latitude === 0 && longitude === 0);
  }

  return {
    latitude,
    longitude,
    accuracyMeters: accuracy ? Math.round(accuracy) : 5,
    isMockLocation: isMock,
    distanceToSplitterMeters: distanceMeters,
    isLocationFlagged: isFlagged,
    clientRecordedAt: recordedAt,
  };
}

export function validateCoordinates(coords?: Partial<GpsCoordinates> | null): { valid: boolean; error?: string } {
  if (!coords || typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number' || isNaN(coords.latitude) || isNaN(coords.longitude)) {
    return { valid: false, error: 'Koordinat GPS tidak lengkap atau tidak valid.' };
  }
  if (coords.latitude === 0 && coords.longitude === 0) {
    return { valid: false, error: 'Koordinat (0, 0) tidak valid (Null Island).' };
  }
  if (coords.latitude < -90 || coords.latitude > 90) {
    return { valid: false, error: 'Latitude di luar batas [-90, 90].' };
  }
  if (coords.longitude < -180 || coords.longitude > 180) {
    return { valid: false, error: 'Longitude di luar batas [-180, 180].' };
  }
  return { valid: true };
}

export function isValidLat(lat: number): boolean {
  return typeof lat === 'number' && !isNaN(lat) && lat >= -90 && lat <= 90;
}

export function isValidLon(lon: number): boolean {
  return typeof lon === 'number' && !isNaN(lon) && lon >= -180 && lon <= 180;
}

export function validateCoordinateInput(coords?: Partial<GpsCoordinates> | null): boolean {
  if (!coords || typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
    return false;
  }
  return !isNaN(coords.latitude) && !isNaN(coords.longitude);
}
