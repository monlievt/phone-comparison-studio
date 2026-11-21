// packages/core/src/glossary.ts
// Standardized units, formatting conventions, and labels for phone specifications.
// Specification: DATA_MODEL.md §4 and VERDICT_RULES.md

export const UNITS = {
  REFRESH_RATE: 'Hz',
  BRIGHTNESS: 'nits',
  BATTERY: 'mAh',
  CHARGING: 'W',
  CAMERA: 'MP',
  MEMORY: 'GB',
  STORAGE: 'GB',
  WEIGHT: 'g',
  SCREEN: '″',
  PRICE: 'USD',
} as const;

export const CATEGORY_LABELS: Record<string, string> = {
  display_type: 'Display Type',
  resolution: 'Resolution',
  refresh_rate: 'Refresh Rate',
  peak_brightness: 'Peak Brightness',
  chipset: 'Chipset (SoC)',
  ram: 'RAM',
  storage: 'Storage',
  battery: 'Battery Capacity',
  charging: 'Fast Charging',
  main_camera: 'Main Camera (MP)',
  selfie_camera: 'Selfie Camera',
  video_recording: 'Max Video Mode',
  weight: 'Weight',
  ip_rating: 'Water & Dust Resistance',
  software_support: 'Software Updates',
  price: 'Launch Price',
};

/**
 * Formats launch price into clean display string:
 * e.g. 349 -> "$349", isApprox -> "≈$349"
 */
export function formatPriceUSD(price: number | null | undefined, isApprox = false): string {
  if (price === null || price === undefined) return 'N/A';
  const prefix = isApprox ? '≈$' : '$';
  return `${prefix}${Math.round(price)}`;
}

/**
 * Formats numbers with thousands separator: e.g. 2150000 -> "2,150,000"
 */
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'N/A';
  return Math.round(score).toLocaleString('en-US');
}

/**
 * Formats battery capacity: e.g. 5000 -> "5,000 mAh"
 */
export function formatBattery(mah: number | null | undefined): string {
  if (!mah) return 'N/A';
  return `${Math.round(mah).toLocaleString('en-US')} ${UNITS.BATTERY}`;
}

/**
 * Formats refresh rate: e.g. 120 -> "120 Hz"
 */
export function formatRefreshRate(hz: number | null | undefined): string {
  if (!hz) return 'N/A';
  return `${hz} ${UNITS.REFRESH_RATE}`;
}

/**
 * Formats wattage: e.g. 120 -> "120 W"
 */
export function formatCharging(watts: number | null | undefined): string {
  if (!watts) return 'N/A';
  return `${watts} ${UNITS.CHARGING}`;
}

/**
 * Formats weight: e.g. 185 -> "185 g"
 */
export function formatWeight(grams: number | null | undefined): string {
  if (!grams) return 'N/A';
  return `${Math.round(grams)} ${UNITS.WEIGHT}`;
}
