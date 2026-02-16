#!/usr/bin/env python3
"""
Focused Backend Tests for Hunting Safety Features
Tests the specific features mentioned in the review request
"""
import requests
import json
import time
from datetime import datetime, timezone

class HuntingSafetyTester:
    def __init__(self):
        self.base_url = "https://cotos-check.preview.emergentagent.com"
        self.api_url = f"{self.base_url}/api"
        self.hiker_token = None
        self.admin_token = None
        self.tests_run = 0
        self.tests_passed = 0
        
    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED")
            if details:
                print(f"   {details}")
        else:
            print(f"❌ {name} - FAILED")
            if details:
                print(f"   {details}")
        print()

    def login_hiker(self):
        """Login as hiker@test.com"""
        print("🔐 Logging in as hiker...")
        login_data = {"email": "hiker@test.com", "password": "test1234"}
        
        try:
            response = requests.post(f"{self.api_url}/auth/login", json=login_data, timeout=30)
            if response.status_code == 200:
                data = response.json()
                self.hiker_token = data.get('token')
                print(f"   ✅ Hiker login successful")
                return True
            else:
                print(f"   ❌ Login failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"   ❌ Login error: {str(e)}")
            return False

    def login_admin(self):
        """Login as admin@test.com"""
        print("🔐 Logging in as admin...")
        login_data = {"email": "admin@test.com", "password": "test1234"}
        
        try:
            response = requests.post(f"{self.api_url}/auth/login", json=login_data, timeout=30)
            if response.status_code == 200:
                data = response.json()
                self.admin_token = data.get('token')
                print(f"   ✅ Admin login successful")
                return True
            else:
                print(f"   ❌ Admin login failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"   ❌ Admin login error: {str(e)}")
            return False

    def test_intersection_route_inside_zone(self):
        """Test POST /api/check-intersection with route fully inside a zone"""
        print("🔍 Testing route INSIDE zone detection...")
        
        # Route completely within a hunting zone near Madrid
        route_inside = {
            "type": "LineString", 
            "coordinates": [
                [-3.7, 40.45],  # Both points inside potential hunting zone
                [-3.69, 40.44]
            ]
        }
        
        payload = {"route_geometry": route_inside}
        
        try:
            response = requests.post(f"{self.api_url}/check-intersection", json=payload, timeout=30)
            if response.status_code == 200:
                data = response.json()
                zones = data.get('zones', [])
                
                # Look for contained conflict type
                contained_zones = [z for z in zones if z.get('conflict_type') == 'contained']
                has_100_overlap = any(z.get('overlap_percentage') == 100.0 for z in contained_zones)
                
                if contained_zones and has_100_overlap:
                    self.log_test("Route Inside Zone Detection", True, 
                                f"Found {len(contained_zones)} contained zones with 100% overlap")
                    return True
                elif contained_zones:
                    self.log_test("Route Inside Zone Detection", True,
                                f"Found contained zones but overlap not 100%: {[z.get('overlap_percentage') for z in contained_zones]}")
                    return True
                elif zones:
                    self.log_test("Route Inside Zone Detection", False,
                                f"Route intersects zones but no 'contained' type found. Types: {[z.get('conflict_type') for z in zones]}")
                    return False
                else:
                    self.log_test("Route Inside Zone Detection", False, "No zones intersected")
                    return False
            else:
                self.log_test("Route Inside Zone Detection", False, f"API error: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Route Inside Zone Detection", False, f"Exception: {str(e)}")
            return False

    def test_intersection_route_crossing_zone(self):
        """Test POST /api/check-intersection with route crossing a zone"""
        print("🔍 Testing route CROSSING zone detection...")
        
        # Route that crosses through hunting zones
        route_crossing = {
            "type": "LineString",
            "coordinates": [
                [-3.8, 40.5],   # Start outside
                [-3.7, 40.45],  # Through zone  
                [-3.6, 40.4]    # End outside
            ]
        }
        
        payload = {"route_geometry": route_crossing}
        
        try:
            response = requests.post(f"{self.api_url}/check-intersection", json=payload, timeout=30)
            if response.status_code == 200:
                data = response.json()
                zones = data.get('zones', [])
                intersects = data.get('intersects', False)
                
                # Look for intersects conflict type
                intersect_zones = [z for z in zones if z.get('conflict_type') == 'intersects']
                
                if intersect_zones and intersects:
                    self.log_test("Route Crossing Zone Detection", True,
                                f"Found {len(intersect_zones)} intersecting zones")
                    return True
                elif zones:
                    self.log_test("Route Crossing Zone Detection", False,
                                f"Found zones but no 'intersects' type. Types: {[z.get('conflict_type') for z in zones]}")
                    return False
                else:
                    self.log_test("Route Crossing Zone Detection", False, "No zones intersected")
                    return False
            else:
                self.log_test("Route Crossing Zone Detection", False, f"API error: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Route Crossing Zone Detection", False, f"Exception: {str(e)}")
            return False

    def test_intersection_route_outside_zones(self):
        """Test POST /api/check-intersection with route outside all zones"""
        print("🔍 Testing route OUTSIDE zones detection...")
        
        # Route far from any hunting zones
        route_outside = {
            "type": "LineString",
            "coordinates": [
                [-4.5, 41.0],   # Far from Madrid zones
                [-4.4, 41.1]    
            ]
        }
        
        payload = {"route_geometry": route_outside}
        
        try:
            response = requests.post(f"{self.api_url}/check-intersection", json=payload, timeout=30)
            if response.status_code == 200:
                data = response.json()
                intersects = data.get('intersects', True)  # Should be False
                zones = data.get('zones', [])
                
                if not intersects and len(zones) == 0:
                    self.log_test("Route Outside Zones Detection", True, "Route correctly detected as safe")
                    return True
                else:
                    self.log_test("Route Outside Zones Detection", False,
                                f"Route should be safe but intersects={intersects}, zones={len(zones)}")
                    return False
            else:
                self.log_test("Route Outside Zones Detection", False, f"API error: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Route Outside Zones Detection", False, f"Exception: {str(e)}")
            return False

    def test_notifications_get(self):
        """Test GET /api/notifications for hiker user"""
        print("🔍 Testing GET notifications...")
        
        if not self.hiker_token:
            self.log_test("GET Notifications", False, "No hiker token available")
            return False
            
        headers = {"Authorization": f"Bearer {self.hiker_token}"}
        
        try:
            response = requests.get(f"{self.api_url}/notifications", headers=headers, timeout=30)
            if response.status_code == 200:
                notifications = response.json()
                if isinstance(notifications, list):
                    self.log_test("GET Notifications", True, 
                                f"Retrieved {len(notifications)} notifications")
                    
                    # Check notification structure
                    if notifications:
                        notif = notifications[0]
                        expected_keys = ['id', 'user_id', 'type', 'title', 'message', 'read', 'created_at']
                        missing_keys = [k for k in expected_keys if k not in notif]
                        if missing_keys:
                            print(f"   Warning: Missing keys in notification: {missing_keys}")
                        else:
                            print(f"   First notification: {notif.get('title')[:50]}...")
                    return True
                else:
                    self.log_test("GET Notifications", False, "Response is not a list")
                    return False
            else:
                self.log_test("GET Notifications", False, f"API error: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("GET Notifications", False, f"Exception: {str(e)}")
            return False

    def test_notifications_unread_count(self):
        """Test GET /api/notifications/unread-count"""
        print("🔍 Testing GET notifications unread count...")
        
        if not self.hiker_token:
            self.log_test("GET Unread Count", False, "No hiker token available")
            return False
            
        headers = {"Authorization": f"Bearer {self.hiker_token}"}
        
        try:
            response = requests.get(f"{self.api_url}/notifications/unread-count", headers=headers, timeout=30)
            if response.status_code == 200:
                data = response.json()
                if 'count' in data:
                    count = data['count']
                    self.log_test("GET Unread Count", True, f"Unread count: {count}")
                    return True
                else:
                    self.log_test("GET Unread Count", False, "Missing 'count' key in response")
                    return False
            else:
                self.log_test("GET Unread Count", False, f"API error: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("GET Unread Count", False, f"Exception: {str(e)}")
            return False

    def test_notifications_mark_read(self):
        """Test PUT /api/notifications/{id}/read"""
        print("🔍 Testing mark notification as read...")
        
        if not self.hiker_token:
            self.log_test("Mark Notification Read", False, "No hiker token available")
            return False
            
        headers = {"Authorization": f"Bearer {self.hiker_token}"}
        
        try:
            # First get notifications to find an unread one
            response = requests.get(f"{self.api_url}/notifications", headers=headers, timeout=30)
            if response.status_code == 200:
                notifications = response.json()
                unread_notifications = [n for n in notifications if not n.get('read', True)]
                
                if unread_notifications:
                    notif_id = unread_notifications[0]['id']
                    
                    # Mark as read
                    mark_response = requests.put(f"{self.api_url}/notifications/{notif_id}/read", 
                                               headers=headers, timeout=30)
                    if mark_response.status_code == 200:
                        self.log_test("Mark Notification Read", True, f"Marked notification {notif_id} as read")
                        return True
                    else:
                        self.log_test("Mark Notification Read", False, 
                                    f"Failed to mark as read: {mark_response.status_code}")
                        return False
                else:
                    self.log_test("Mark Notification Read", True, "No unread notifications to test with")
                    return True
            else:
                self.log_test("Mark Notification Read", False, "Failed to get notifications")
                return False
        except Exception as e:
            self.log_test("Mark Notification Read", False, f"Exception: {str(e)}")
            return False

    def test_notifications_mark_all_read(self):
        """Test PUT /api/notifications/read-all"""
        print("🔍 Testing mark all notifications as read...")
        
        if not self.hiker_token:
            self.log_test("Mark All Read", False, "No hiker token available")
            return False
            
        headers = {"Authorization": f"Bearer {self.hiker_token}"}
        
        try:
            response = requests.put(f"{self.api_url}/notifications/read-all", headers=headers, timeout=30)
            if response.status_code == 200:
                data = response.json()
                self.log_test("Mark All Read", True, "Successfully marked all notifications as read")
                return True
            else:
                self.log_test("Mark All Read", False, f"API error: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Mark All Read", False, f"Exception: {str(e)}")
            return False

    def run_focused_tests(self):
        """Run all focused tests for hunting safety features"""
        print("="*70)
        print("🎯 HUNTING SAFETY FOCUSED BACKEND TESTS")
        print("="*70)
        
        # Login first
        if not self.login_hiker():
            print("❌ Cannot proceed without hiker authentication")
            return False
            
        if not self.login_admin():
            print("⚠️  Proceeding without admin authentication")
        
        print("\n🔍 INTERSECTION DETECTION TESTS")
        print("-" * 50)
        self.test_intersection_route_inside_zone()
        self.test_intersection_route_crossing_zone() 
        self.test_intersection_route_outside_zones()
        
        print("\n📬 NOTIFICATION SYSTEM TESTS")
        print("-" * 50)
        self.test_notifications_get()
        self.test_notifications_unread_count()
        self.test_notifications_mark_read()
        self.test_notifications_mark_all_read()
        
        # Print final results
        print("\n" + "="*70)
        print("📊 FOCUSED TEST RESULTS")
        print("="*70)
        print(f"Tests run: {self.tests_run}")
        print(f"Tests passed: {self.tests_passed}")
        print(f"Tests failed: {self.tests_run - self.tests_passed}")
        print(f"Success rate: {(self.tests_passed / self.tests_run * 100):.1f}%")
        print("="*70)

        return self.tests_passed == self.tests_run

def main():
    tester = HuntingSafetyTester()
    success = tester.run_focused_tests()
    return 0 if success else 1

if __name__ == "__main__":
    import sys
    sys.exit(main())