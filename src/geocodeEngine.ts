/**
 * GeoCode Engine v2.0
 * - geocodeAiRunner 연동
 */

import { detectGeocode as aiDetect } from './geocodeAiRunner';

export type GeocodeStatus = 'DETECTED' | 'NOT_DETECTED' | 'ERROR';

export interface GeocodeResult {
  status: GeocodeStatus;
  geocodeId: string | null;
  confidence: number | null;
  reason?: string;
}

/**
 * GeoCode 감지 (AI Runner 연동)
 */
export async function detectGeocode(imageUri: string): Promise<GeocodeResult> {
  return await aiDetect(imageUri);
}
