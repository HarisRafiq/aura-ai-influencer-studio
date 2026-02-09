/**
 * Location Service - API client for location services
 * Uses production-ready HTTP client with retry, caching, and error handling
 */

import { httpClient } from './http-client';
import { ENDPOINTS } from './config';
import type {
  LocationSuggestion,
  GeocodedLocation,
  LocationAutocompleteRequest,
  LocationGeocodeRequest,
  TravelRequest,
} from './api-types';

// Re-export types for backward compatibility
export type { LocationSuggestion, GeocodedLocation } from './api-types';

export const locationService = {
  /**
   * Autocomplete location search
   */
  async autocomplete(query: string, limit: number = 5): Promise<LocationSuggestion[]> {
    try {
      const data = await httpClient.post<{ results: LocationSuggestion[] }>(
        ENDPOINTS.LOCATIONS_AUTOCOMPLETE,
        { query, limit } as LocationAutocompleteRequest,
        { cacheTTL: 60000 } // Cache for 1 minute
      );
      return data.results || [];
    } catch (error) {
      console.error('Location autocomplete error:', error);
      return [];
    }
  },

  /**
   * Geocode a location string
   */
  async geocode(location: string): Promise<GeocodedLocation | null> {
    try {
      return await httpClient.post<GeocodedLocation>(
        ENDPOINTS.LOCATIONS_GEOCODE,
        { location } as LocationGeocodeRequest,
        { cacheTTL: 300000 } // Cache for 5 minutes
      );
    } catch (error) {
      console.error('Location geocoding error:', error);
      return null;
    }
  },

  /**
   * Update influencer location (travel)
   */
  async updateInfluencerLocation(
    influencerId: string,
    destination: string,
    mode: string = 'Plane',
    createStory: boolean = false
  ): Promise<any> {
    httpClient.clearCacheEntry(ENDPOINTS.INFLUENCER_BY_ID(influencerId));
    return httpClient.post(
      ENDPOINTS.INFLUENCER_TRAVEL(influencerId),
      {
        destination,
        mode,
        create_story: createStory,
      } as TravelRequest
    );
  },
};
