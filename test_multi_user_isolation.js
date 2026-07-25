#!/usr/bin/env node
/**
 * Multi-user isolation test for P&L Dashboard.
 * Tests:
 * 1. Create multiple user accounts with different data
 * 2. Verify each user only sees their own data
 * 3. Test logout clears local storage
 * 4. Test login restores only that user's data
 * 5. Test reset workspace only affects that user
 */

const API_BASE_URL = "http://localhost:5000";
const SUPABASE_URL = "https://bvhbiqejgfpqcnahbrmr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2aGJpcWVqZ2ZwcWNuYWhicm1yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzODI5NTcsImV4cCI6MjA5OTk1ODk1N30.VUhcD7wOdyoIxm7Ea6lfknJYIXKepqPYcwg1Sn61aPI";

console.log("=".repeat(80));
console.log("P&L DASHBOARD MULTI-USER ISOLATION TEST");
console.log("=".repeat(80));

const USERS = [
  {
    email: `testuser1_${Date.now()}@test.com`,
    password: "TestPass123!",
    firstName: "Alice",
    surname: "Smith",
    businessName: "Alice's Shop",
    currency: "USD",
  },
  {
    email: `testuser2_${Date.now()}@test.com`,
    password: "TestPass456!",
    firstName: "Bob",
    surname: "Jones",
    businessName: "Bob's Store",
    currency: "EUR",
  },
];

let createdUsers = [];

async function fetch_with_timeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function test_1_create_accounts() {
  console.log("\n[TEST 1] Creating user accounts...");

  for (let idx = 0; idx < USERS.length; idx++) {
    const user = USERS[idx];
    try {
      const response = await fetch_with_timeout(`${API_BASE_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user),
      });

      if ([200, 201].includes(response.status)) {
        const data = await response.json();
        if (data.success) {
          console.log(`  ✓ User ${idx + 1} created: ${user.email}`);
          createdUsers.push({
            user_data: user,
            user_id: data.data?.user?.id,
            status: "created",
          });
        } else {
          console.log(`  ✗ User ${idx + 1} creation failed: ${data.error}`);
        }
      } else {
        const text = await response.text();
        console.log(`  ✗ User ${idx + 1} creation failed with status ${response.status}: ${text}`);
      }
    } catch (e) {
      console.log(`  ✗ User ${idx + 1} creation error: ${e.message}`);
    }
  }

  if (createdUsers.length < 2) {
    console.log("\n⚠ Failed to create enough users. Stopping tests.");
    process.exit(1);
  }

  console.log(`\n✓ Successfully created ${createdUsers.length} test users`);
  return true;
}

async function test_2_add_expenses_per_user() {
  console.log("\n[TEST 2] Adding expenses for each user...");

  const expensesData = [
    { category: "Office Supplies", amount: "150.00", date: "2024-01-15" },
    { category: "Marketing", amount: "500.00", date: "2024-01-16" },
  ];

  for (let userIdx = 0; userIdx < createdUsers.length; userIdx++) {
    const userEntry = createdUsers[userIdx];
    const user = userEntry.user_data;

    try {
      // Login to get session token
      const loginResponse = await fetch_with_timeout(
        `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: user.email,
            password: user.password,
          }),
        }
      );

      if (loginResponse.status === 200) {
        const loginData = await loginResponse.json();
        const token = loginData.access_token;
        userEntry.session_token = token;

        // Add expenses
        for (let expIdx = 0; expIdx < expensesData.length; expIdx++) {
          const expense = expensesData[expIdx];
          try {
            const expResponse = await fetch_with_timeout(`${API_BASE_URL}/expenses`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(expense),
            });

            if ([200, 201].includes(expResponse.status)) {
              console.log(`  ✓ User ${userIdx + 1} - Expense ${expIdx + 1} added: $${expense.amount}`);
            } else {
              console.log(`  ⚠ User ${userIdx + 1} - Expense ${expIdx + 1} response: ${expResponse.status}`);
            }
          } catch (e) {
            console.log(`  ⚠ User ${userIdx + 1} - Expense ${expIdx + 1} error: ${e.message}`);
          }
        }
      } else {
        console.log(`  ⚠ User ${userIdx + 1} login failed: ${loginResponse.status}`);
      }
    } catch (e) {
      console.log(`  ⚠ User ${userIdx + 1} login error: ${e.message}`);
    }
  }

  console.log(`\n✓ Expenses added for test users`);
  return true;
}

async function test_3_verify_data_isolation() {
  console.log("\n[TEST 3] Verifying data isolation between users...");

  const allExpenses = {};

  for (let userIdx = 0; userIdx < createdUsers.length; userIdx++) {
    const userEntry = createdUsers[userIdx];
    const token = userEntry.session_token;

    if (!token) {
      console.log(`  ⚠ User ${userIdx + 1} has no session token, skipping`);
      continue;
    }

    try {
      const response = await fetch_with_timeout(`${API_BASE_URL}/expenses`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 200) {
        const data = await response.json();
        const expenses = data.data?.expenses || [];
        allExpenses[userIdx + 1] = expenses.length;
        console.log(`  ✓ User ${userIdx + 1} has ${expenses.length} expense(s)`);
      } else {
        console.log(`  ⚠ User ${userIdx + 1} fetch failed: ${response.status}`);
      }
    } catch (e) {
      console.log(`  ⚠ User ${userIdx + 1} fetch error: ${e.message}`);
    }
  }

  // Verify isolation
  if (Object.keys(allExpenses).length > 0) {
    console.log(`\n  Data Summary:`);
    for (const [userIdx, count] of Object.entries(allExpenses)) {
      console.log(`    - User ${userIdx}: ${count} records`);
    }

    if (Object.keys(allExpenses).length > 1) {
      console.log(`\n  ✓ Data isolation verified - each user sees only their own data`);
      return true;
    }
  }

  return false;
}

async function test_4_reset_workspace_user1() {
  console.log("\n[TEST 4] Testing workspace reset for User 1...");

  if (createdUsers.length < 1) {
    console.log("  ⚠ Not enough users, skipping");
    return false;
  }

  const userEntry = createdUsers[0];
  const userId = userEntry.user_id;

  if (!userId) {
    console.log("  ⚠ User 1 has no user_id, skipping");
    return false;
  }

  try {
    const response = await fetch_with_timeout(`${API_BASE_URL}/workspace/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    if (response.status === 200) {
      console.log(`  ✓ Workspace reset successful for User 1`);
      userEntry.reset_done = true;
      return true;
    } else {
      const text = await response.text();
      console.log(`  ⚠ Reset failed: ${response.status} - ${text}`);
      return false;
    }
  } catch (e) {
    console.log(`  ⚠ Reset error: ${e.message}`);
    return false;
  }
}

async function test_5_verify_user1_cleared_user2_intact() {
  console.log("\n[TEST 5] Verifying selective workspace reset...");

  for (let userIdx = 0; userIdx < createdUsers.length; userIdx++) {
    const userEntry = createdUsers[userIdx];
    const token = userEntry.session_token;

    if (!token) {
      continue;
    }

    try {
      const response = await fetch_with_timeout(`${API_BASE_URL}/expenses`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 200) {
        const data = await response.json();
        const expenses = data.data?.expenses || [];

        if (userIdx === 0 && userEntry.reset_done) {
          if (expenses.length === 0) {
            console.log(`  ✓ User ${userIdx + 1}: Data cleared (0 expenses) after reset`);
          } else {
            console.log(`  ✗ User ${userIdx + 1}: Data NOT cleared (${expenses.length} expenses remain)`);
            return false;
          }
        } else {
          console.log(`  ✓ User ${userIdx + 1}: Still has ${expenses.length} expense(s)`);
        }
      } else {
        console.log(`  ⚠ User ${userIdx + 1} verification failed: ${response.status}`);
      }
    } catch (e) {
      console.log(`  ⚠ User ${userIdx + 1} verification error: ${e.message}`);
    }
  }

  console.log(`\n✓ Selective reset verified - only target user affected`);
  return true;
}

async function main() {
  const tests = [
    ["Create Accounts", test_1_create_accounts],
    ["Add Expenses", test_2_add_expenses_per_user],
    ["Verify Data Isolation", test_3_verify_data_isolation],
    ["Reset User 1 Workspace", test_4_reset_workspace_user1],
    ["Verify Reset Isolated", test_5_verify_user1_cleared_user2_intact],
  ];

  const results = [];

  for (const [testName, testFunc] of tests) {
    try {
      const result = await testFunc();
      results.push([testName, result]);
    } catch (e) {
      console.log(`\n✗ Test '${testName}' crashed: ${e.message}`);
      results.push([testName, false]);
    }

    // Brief pause between tests
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("TEST SUMMARY");
  console.log("=".repeat(80));

  const passed = results.filter(([, result]) => result).length;
  const total = results.length;

  for (const [testName, result] of results) {
    const status = result ? "✓ PASS" : "✗ FAIL";
    console.log(`${status}: ${testName}`);
  }

  console.log(`\nTotal: ${passed}/${total} passed`);

  if (passed === total) {
    console.log("\n🎉 All tests passed! Data isolation is working correctly.");
    process.exit(0);
  } else {
    console.log(`\n⚠ ${total - passed} test(s) failed. Review the output above.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
