"""
Google Places API Service (Optimized)
Fetches POIs with photos, ratings, and categories using Google Places API (New)
Minimizes API calls by using Text Search for geocoding + nearby search in fewer requests.
"""
import os
import httpx
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

@dataclass
class POI:
    name: str
    category: str
    lat: float
    lng: float
    address: str
    place_id: str
    maps_url: str
    photo_url: Optional[str] = None
    rating: Optional[float] = None
    user_ratings_total: Optional[int] = None
    types: Optional[List[str]] = None

# Category mappings - primary type determines category
TYPE_TO_CATEGORY = {
    "restaurant": "eat",
    "cafe": "eat",
    "bakery": "eat",
    "bar": "party",
    "night_club": "party",
    "casino": "party",
    "clothing_store": "shop",
    "shopping_mall": "shop",
    "shoe_store": "shop",
    "jewelry_store": "shop",
    "store": "shop",
    "park": "relax",
    "spa": "relax",
    "beauty_salon": "relax",
    "gym": "workout",
    "fitness_center": "workout",
    "stadium": "workout",
}

# All types for each category (for single batch query)
ALL_POI_TYPES = [
    "restaurant", "cafe", "bar", "night_club",
    "clothing_store", "shopping_mall", "gym", "park", "spa"
]

class PlacesService:
    def __init__(self):
        self.api_key = os.getenv("GOOGLE_PLACES_API_KEY")
        if not self.api_key:
            raise ValueError("GOOGLE_PLACES_API_KEY not found in environment")
        self.base_url = "https://places.googleapis.com/v1"
    
    def _determine_category(self, types: List[str]) -> str:
        """Determine category from place types"""
        for t in types:
            if t in TYPE_TO_CATEGORY:
                return TYPE_TO_CATEGORY[t]
        return "relax"  # default fallback
    
    async def get_all_pois(self, location: str, radius: int = 1500) -> Dict[str, Any]:
        """
        Fetch all POIs for a location with MINIMAL API calls:
        1. One Text Search to get center coordinates
        2. One Nearby Search to get all POIs (with multiple types)
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            # STEP 1: Text Search to geocode the location (1 API call)
            print(f"[Places] Step 1: Geocoding {location}")
            
            geocode_url = f"{self.base_url}/places:searchText"
            geocode_headers = {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": self.api_key,
                "X-Goog-FieldMask": "places.location"
            }
            geocode_body = {
                "textQuery": location,
                "maxResultCount": 1
            }
            
            geocode_response = await client.post(geocode_url, json=geocode_body, headers=geocode_headers)
            
            if geocode_response.status_code != 200:
                print(f"[Places] Geocode error: {geocode_response.text[:200]}")
                return {"center": {"lat": 0, "lng": 0}, "pois": [], "location": location, "error": "Geocoding failed"}
            
            geocode_data = geocode_response.json()
            places = geocode_data.get("places", [])
            
            if not places:
                return {"center": {"lat": 0, "lng": 0}, "pois": [], "location": location, "error": "Location not found"}
            
            center_loc = places[0].get("location", {})
            center = {
                "lat": center_loc.get("latitude", 0),
                "lng": center_loc.get("longitude", 0)
            }
            
            print(f"[Places] Center: {center['lat']}, {center['lng']}")
            
            # STEP 2: Single Nearby Search with multiple types (1 API call)
            # Note: The new API supports up to 50 types, we use includedPrimaryTypes for broader results
            print(f"[Places] Step 2: Fetching nearby POIs")
            
            nearby_url = f"{self.base_url}/places:searchNearby"
            nearby_headers = {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": self.api_key,
                "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location,places.id,places.primaryType,places.types"
            }
            
            nearby_body = {
                "includedTypes": ALL_POI_TYPES,
                "maxResultCount": 20,  # Max allowed per request
                "locationRestriction": {
                    "circle": {
                        "center": {"latitude": center["lat"], "longitude": center["lng"]},
                        "radius": float(radius)
                    }
                }
            }
            
            nearby_response = await client.post(nearby_url, json=nearby_body, headers=nearby_headers)
            
            if nearby_response.status_code != 200:
                print(f"[Places] Nearby search error: {nearby_response.text[:300]}")
                return {"center": center, "pois": [], "location": location, "error": f"Nearby search failed: {nearby_response.status_code}"}
            
            nearby_data = nearby_response.json()
            raw_places = nearby_data.get("places", [])
            
            print(f"[Places] Found {len(raw_places)} places in single API call")
            
            # Convert to POI format
            pois = []
            for place in raw_places:
                loc = place.get("location", {})
                types = place.get("types", [])
                
                # Use primaryType if available, otherwise determine from types
                primary_type = place.get("primaryType", "")
                category = TYPE_TO_CATEGORY.get(primary_type) or self._determine_category(types)
                
                poi = {
                    "name": place.get("displayName", {}).get("text", "Unknown"),
                    "category": category,
                    "lat": loc.get("latitude", 0),
                    "lng": loc.get("longitude", 0),
                    "address": place.get("formattedAddress", ""),
                    "placeId": place.get("id", ""),
                    "types": types
                }
                
                if poi["lat"] and poi["lng"]:
                    pois.append(poi)
            
            print(f"[Places] Returning {len(pois)} POIs (2 API calls - no photos)")
            
            return {
                "center": center,
                "pois": pois,
                "location": location
            }


# Singleton instance
_places_service = None

def get_places_service() -> PlacesService:
    global _places_service
    if _places_service is None:
        _places_service = PlacesService()
    return _places_service
