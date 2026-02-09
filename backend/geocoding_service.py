"""
Free Geocoding Service using Photon API (OpenStreetMap)
No API key required, no rate limits on public instance
Provides geocoding, reverse geocoding, and autocomplete functionality
"""
import httpx
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

@dataclass
class GeocodedLocation:
    """Structured geocoded location data"""
    city: str
    country: str
    display_name: str
    lat: float
    lng: float
    state: Optional[str] = None
    county: Optional[str] = None

class GeocodingService:
    def __init__(self):
        self.photon_base = "https://photon.komoot.io/api"
        # LocationIQ as fallback (5k/day free, requires API key)
        self.locationiq_base = "https://us1.locationiq.com/v1"
        self.locationiq_key = None  # Optional fallback
        self.headers = {
            "User-Agent": "AuraAIInfluencerStudio/1.0 (Contact: aura-ai@example.com)"
        }
        
    async def geocode(self, location: str) -> Optional[GeocodedLocation]:
        """
        Geocode a location string to lat/lng and structured address.
        Returns None if location cannot be found.
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Use Photon API (free, no key required)
                response = await client.get(
                    f"{self.photon_base}/",
                    params={"q": location, "limit": 1},
                    headers=self.headers
                )
                
                if response.status_code != 200:
                    print(f"[Geocoding] Photon error: {response.status_code}")
                    return None
                
                data = response.json()
                features = data.get("features", [])
                
                if not features:
                    print(f"[Geocoding] No results for: {location}")
                    return None
                
                feature = features[0]
                geometry = feature.get("geometry", {})
                properties = feature.get("properties", {})
                
                coords = geometry.get("coordinates", [])
                if len(coords) < 2:
                    return None
                
                # Photon returns [lng, lat] format
                lng, lat = coords[0], coords[1]
                
                # Extract structured address components
                city = (
                    properties.get("city") or 
                    properties.get("town") or 
                    properties.get("village") or
                    properties.get("municipality") or
                    "Unknown City"
                )
                
                country = properties.get("country", "Unknown Country")
                display_name = properties.get("name", location)
                state = properties.get("state")
                county = properties.get("county")
                
                return GeocodedLocation(
                    city=city,
                    country=country,
                    display_name=display_name,
                    lat=lat,
                    lng=lng,
                    state=state,
                    county=county
                )
                
        except Exception as e:
            print(f"[Geocoding] Error: {e}")
            return None
    
    async def autocomplete(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Search-as-you-type autocomplete for location queries.
        Returns list of location suggestions with basic info.
        """
        if not query or len(query) < 2:
            return []
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.photon_base}/",
                    params={"q": query, "limit": limit},
                    headers=self.headers
                )
                
                if response.status_code != 200:
                    return []
                
                data = response.json()
                features = data.get("features", [])
                
                results = []
                for feature in features:
                    geometry = feature.get("geometry", {})
                    properties = feature.get("properties", {})
                    coords = geometry.get("coordinates", [])
                    
                    if len(coords) < 2:
                        continue
                    
                    lng, lat = coords[0], coords[1]
                    
                    # Build display name
                    city = (
                        properties.get("city") or 
                        properties.get("town") or 
                        properties.get("village") or
                        properties.get("name") or
                        "Unknown"
                    )
                    
                    country = properties.get("country", "")
                    state = properties.get("state", "")
                    
                    # Create readable display name
                    parts = [city]
                    if state and state != city:
                        parts.append(state)
                    if country:
                        parts.append(country)
                    
                    display_name = ", ".join(parts)
                    
                    results.append({
                        "display_name": display_name,
                        "city": city,
                        "country": country,
                        "state": state,
                        "lat": lat,
                        "lng": lng,
                        "type": properties.get("type", "unknown")
                    })
                
                return results
                
        except Exception as e:
            print(f"[Autocomplete] Error: {e}")
            return []
    
    async def reverse_geocode(self, lat: float, lng: float) -> Optional[GeocodedLocation]:
        """
        Reverse geocode coordinates to location name.
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.photon_base}/reverse",
                    params={"lon": lng, "lat": lat},
                    headers=self.headers
                )
                
                if response.status_code != 200:
                    return None
                
                data = response.json()
                features = data.get("features", [])
                
                if not features:
                    return None
                
                feature = features[0]
                properties = feature.get("properties", {})
                
                city = (
                    properties.get("city") or 
                    properties.get("town") or 
                    properties.get("village") or
                    "Unknown City"
                )
                
                country = properties.get("country", "Unknown Country")
                display_name = properties.get("name", f"{city}, {country}")
                
                return GeocodedLocation(
                    city=city,
                    country=country,
                    display_name=display_name,
                    lat=lat,
                    lng=lng,
                    state=properties.get("state"),
                    county=properties.get("county")
                )
                
        except Exception as e:
            print(f"[Reverse Geocoding] Error: {e}")
            return None

# Singleton instance
geocoding_service = GeocodingService()
