#!/usr/bin/env python3
"""
Quick test to investigate the intersection detection logic
"""
import requests
import json

def test_intersection_logic():
    api_url = "https://cotos-check.preview.emergentagent.com/api"
    
    print("Testing different route geometries for intersection types...")
    
    test_routes = [
        {
            "name": "Route 1: Very short inside",
            "geometry": {
                "type": "LineString",
                "coordinates": [[-3.7, 40.45], [-3.69, 40.44]]
            }
        },
        {
            "name": "Route 2: Long crossing route", 
            "geometry": {
                "type": "LineString",
                "coordinates": [[-4.0, 40.2], [-3.5, 40.8]]  # Much longer line crossing through
            }
        },
        {
            "name": "Route 3: Edge crossing",
            "geometry": {
                "type": "LineString", 
                "coordinates": [[-3.85, 40.5], [-3.55, 40.3]]  # Starts outside, ends inside
            }
        }
    ]
    
    for test_route in test_routes:
        print(f"\n{'='*60}")
        print(f"Testing: {test_route['name']}")
        print(f"Coordinates: {test_route['geometry']['coordinates']}")
        
        payload = {"route_geometry": test_route['geometry']}
        
        try:
            response = requests.post(f"{api_url}/check-intersection", json=payload, timeout=30)
            if response.status_code == 200:
                data = response.json()
                zones = data.get('zones', [])
                intersects = data.get('intersects', False)
                message = data.get('safe_message', '')
                
                print(f"Intersects: {intersects}")
                print(f"Message: {message}")
                print(f"Zones found: {len(zones)}")
                
                for i, zone in enumerate(zones):
                    conflict_type = zone.get('conflict_type', 'unknown')
                    overlap_pct = zone.get('overlap_percentage', 0)
                    zone_name = zone.get('zone_name', 'Unknown')
                    
                    print(f"  Zone {i+1}: {zone_name}")
                    print(f"    Conflict Type: {conflict_type}")
                    print(f"    Overlap: {overlap_pct}%")
            else:
                print(f"API Error: {response.status_code} - {response.text}")
                
        except Exception as e:
            print(f"Exception: {str(e)}")
    
    print(f"\n{'='*60}")

if __name__ == "__main__":
    test_intersection_logic()