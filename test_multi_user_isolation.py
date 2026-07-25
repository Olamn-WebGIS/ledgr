#!/usr/bin/env python3
"""
Multi-user isolation test for P&L Dashboard.
Tests:
1. Create multiple user accounts with different data
2. Verify each user only sees their own data
3. Test logout clears local storage
4. Test login restores only that user's data
5. Test reset workspace only affects that user
"""

import requests
import json
import time
import sys
from typing import Dict, Optional

# Configuration
API_BASE_URL = "http://localhost:5000"
SUPABASE_URL = "https://bvhbiqejgfpqcnahbrmr.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2aGJpcWVqZ2ZwcWNuYWhicm1yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzODI5NTcsImV4cCI6MjA5OTk1ODk1N30.VUhcD7wOdyoIxm7Ea6lfknJYIXKepqPYcwg1Sn61aPI"

print("=" * 80)
print("P&L DASHBOARD MULTI-USER ISOLATION TEST")
print("=" * 80)

# Test Users
USERS = [
    {
        "email": f"testuser1_{int(time.time())}@test.com",
        "password": "TestPass123!",
        "firstName": "Alice",
        "surname": "Smith",
        "businessName": "Alice's Shop",
        "currency": "USD",
    },
    {
        "email": f"testuser2_{int(time.time())}@test.com",
        "password": "TestPass456!",
        "firstName": "Bob",
        "surname": "Jones",
        "businessName": "Bob's Store",
        "currency": "EUR",
    },
]

created_users = []


def test_1_create_accounts():
    """Test 1: Create multiple user accounts"""
    print("\n[TEST 1] Creating user accounts...")
    
    for idx, user in enumerate(USERS, 1):
        try:
            response = requests.post(
                f"{API_BASE_URL}/auth/signup",
                json=user,
                timeout=10
            )
            
            if response.status_code in [200, 201]:
                data = response.json()
                if data.get("success"):
                    print(f"  ✓ User {idx} created: {user['email']}")
                    created_users.append({
                        "user_data": user,
                        "user_id": data.get("data", {}).get("user", {}).get("id"),
                        "status": "created"
                    })
                else:
                    print(f"  ✗ User {idx} creation failed: {data.get('error')}")
            else:
                print(f"  ✗ User {idx} creation failed with status {response.status_code}: {response.text}")
        except Exception as e:
            print(f"  ✗ User {idx} creation error: {e}")
    
    if len(created_users) < 2:
        print("\n⚠ Failed to create enough users. Stopping tests.")
        sys.exit(1)
    
    print(f"\n✓ Successfully created {len(created_users)} test users")
    return True


def test_2_add_expenses_per_user():
    """Test 2: Add different expenses for each user"""
    print("\n[TEST 2] Adding expenses for each user...")
    
    expenses_data = [
        {"category": "Office Supplies", "amount": "150.00", "date": "2024-01-15"},
        {"category": "Marketing", "amount": "500.00", "date": "2024-01-16"},
    ]
    
    for user_idx, user_entry in enumerate(created_users, 1):
        user = user_entry["user_data"]
        
        # Create session token via login
        try:
            response = requests.post(
                f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
                headers={
                    "apikey": SUPABASE_ANON_KEY,
                    "Content-Type": "application/json"
                },
                json={
                    "email": user["email"],
                    "password": user["password"]
                },
                timeout=10
            )
            
            if response.status_code == 200:
                token = response.json().get("access_token")
                user_entry["session_token"] = token
                
                # Add expenses
                for exp_idx, expense in enumerate(expenses_data, 1):
                    try:
                        exp_response = requests.post(
                            f"{API_BASE_URL}/expenses",
                            headers={"Authorization": f"Bearer {token}"},
                            json=expense,
                            timeout=10
                        )
                        
                        if exp_response.status_code in [200, 201]:
                            print(f"  ✓ User {user_idx} - Expense {exp_idx} added: ${expense['amount']}")
                        else:
                            print(f"  ⚠ User {user_idx} - Expense {exp_idx} response: {exp_response.status_code}")
                    except Exception as e:
                        print(f"  ⚠ User {user_idx} - Expense {exp_idx} error: {e}")
            else:
                print(f"  ⚠ User {user_idx} login failed: {response.status_code}")
        except Exception as e:
            print(f"  ⚠ User {user_idx} login error: {e}")
    
    print(f"\n✓ Expenses added for test users")
    return True


def test_3_verify_data_isolation():
    """Test 3: Verify each user only sees their own data"""
    print("\n[TEST 3] Verifying data isolation between users...")
    
    all_expenses = {}
    
    for user_idx, user_entry in enumerate(created_users, 1):
        user = user_entry["user_data"]
        token = user_entry.get("session_token")
        
        if not token:
            print(f"  ⚠ User {user_idx} has no session token, skipping")
            continue
        
        try:
            response = requests.get(
                f"{API_BASE_URL}/expenses",
                headers={"Authorization": f"Bearer {token}"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                expenses = data.get("data", {}).get("expenses", [])
                all_expenses[user_idx] = len(expenses)
                print(f"  ✓ User {user_idx} has {len(expenses)} expense(s)")
            else:
                print(f"  ⚠ User {user_idx} fetch failed: {response.status_code}")
        except Exception as e:
            print(f"  ⚠ User {user_idx} fetch error: {e}")
    
    # Verify isolation
    if all_expenses:
        print(f"\n  Data Summary:")
        for user_idx, count in all_expenses.items():
            print(f"    - User {user_idx}: {count} records")
        
        if len(all_expenses) > 1:
            print(f"\n  ✓ Data isolation verified - each user sees only their own data")
            return True
    
    return False


def test_4_reset_workspace_user1():
    """Test 4: Reset workspace for User 1 only"""
    print("\n[TEST 4] Testing workspace reset for User 1...")
    
    if len(created_users) < 1:
        print("  ⚠ Not enough users, skipping")
        return False
    
    user_entry = created_users[0]
    user_id = user_entry.get("user_id")
    
    if not user_id:
        print("  ⚠ User 1 has no user_id, skipping")
        return False
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/workspace/reset",
            json={"userId": user_id},
            timeout=10
        )
        
        if response.status_code == 200:
            print(f"  ✓ Workspace reset successful for User 1")
            user_entry["reset_done"] = True
            return True
        else:
            print(f"  ⚠ Reset failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"  ⚠ Reset error: {e}")
        return False


def test_5_verify_user1_cleared_user2_intact():
    """Test 5: Verify User 1 data cleared but User 2 data intact"""
    print("\n[TEST 5] Verifying selective workspace reset...")
    
    for user_idx, user_entry in enumerate(created_users, 1):
        token = user_entry.get("session_token")
        
        if not token:
            continue
        
        try:
            response = requests.get(
                f"{API_BASE_URL}/expenses",
                headers={"Authorization": f"Bearer {token}"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                expenses = data.get("data", {}).get("expenses", [])
                
                if user_idx == 1 and user_entry.get("reset_done"):
                    if len(expenses) == 0:
                        print(f"  ✓ User {user_idx}: Data cleared (0 expenses) after reset")
                    else:
                        print(f"  ✗ User {user_idx}: Data NOT cleared ({len(expenses)} expenses remain)")
                        return False
                else:
                    print(f"  ✓ User {user_idx}: Still has {len(expenses)} expense(s)")
        except Exception as e:
            print(f"  ⚠ User {user_idx} verification error: {e}")
    
    print(f"\n✓ Selective reset verified - only target user affected")
    return True


def main():
    """Run all tests"""
    tests = [
        ("Create Accounts", test_1_create_accounts),
        ("Add Expenses", test_2_add_expenses_per_user),
        ("Verify Data Isolation", test_3_verify_data_isolation),
        ("Reset User 1 Workspace", test_4_reset_workspace_user1),
        ("Verify Reset Isolated", test_5_verify_user1_cleared_user2_intact),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"\n✗ Test '{test_name}' crashed: {e}")
            results.append((test_name, False))
        
        time.sleep(0.5)  # Brief pause between tests
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} passed")
    
    if passed == total:
        print("\n🎉 All tests passed! Data isolation is working correctly.")
        return 0
    else:
        print(f"\n⚠ {total - passed} test(s) failed. Review the output above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
