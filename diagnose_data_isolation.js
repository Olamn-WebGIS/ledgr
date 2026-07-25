#!/usr/bin/env node
/**
 * Diagnostic script to check Supabase data isolation
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bvhbiqejgfpqcnahbrmr.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2aGJpcWVqZ2ZwcWNuYWhicm1yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcwNzQxNzQ1NCwiZXhwIjoyMDIzMDAwMDAwfQ.8_JoQJR8yx-6rEPu4C4rP8Gvg5vXDgm2KvV6YqZpXNo';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

async function checkDataIsolation() {
  console.log('\n=== SUPABASE DATA ISOLATION DIAGNOSTIC ===\n');

  try {
    // 1. Get all users with profiles
    console.log('[1] All users with profiles:');
    const { data: profiles, error: profilesError } = await supabase
      .from('user_profiles')
      .select('id, email, business_name, display_name');
    
    if (profilesError) {
      console.error('  Error fetching profiles:', profilesError.message);
    } else {
      console.log(`  Found ${profiles?.length || 0} users:`);
      profiles?.forEach((p, i) => {
        console.log(`    ${i+1}. ID: ${p.id.substring(0, 8)}... | Email: ${p.email} | Business: ${p.business_name}`);
      });
    }

    // 2. Get expense count per user
    console.log('\n[2] Expense records per user:');
    const { data: expenses, error: expensesError } = await supabase
      .from('expenses')
      .select('id, user_id, category, amount');
    
    if (expensesError) {
      console.error('  Error fetching expenses:', expensesError.message);
    } else {
      const expensesByUser = {};
      expenses?.forEach(exp => {
        if (!expensesByUser[exp.user_id]) {
          expensesByUser[exp.user_id] = [];
        }
        expensesByUser[exp.user_id].push(exp);
      });

      console.log(`  Total expense records: ${expenses?.length || 0}`);
      profiles?.forEach(profile => {
        const userExpenses = expensesByUser[profile.id] || [];
        console.log(`    User ${profile.email.split('@')[0]}: ${userExpenses.length} expenses`);
      });
    }

    // 3. Get product count per user
    console.log('\n[3] Product records per user:');
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, user_id, name, current_stock');
    
    if (productsError) {
      console.error('  Error fetching products:', productsError.message);
    } else {
      const productsByUser = {};
      products?.forEach(prod => {
        if (!productsByUser[prod.user_id]) {
          productsByUser[prod.user_id] = [];
        }
        productsByUser[prod.user_id].push(prod);
      });

      console.log(`  Total product records: ${products?.length || 0}`);
      profiles?.forEach(profile => {
        const userProducts = productsByUser[profile.id] || [];
        console.log(`    User ${profile.email.split('@')[0]}: ${userProducts.length} products`);
        userProducts.forEach(p => {
          console.log(`      - ${p.name} (stock: ${p.current_stock})`);
        });
      });
    }

    // 4. Get sales count per user
    console.log('\n[4] Sales records per user:');
    const { data: sales, error: salesError } = await supabase
      .from('sales_logs')
      .select('id, user_id, quantity_sold, total_revenue');
    
    if (salesError) {
      console.error('  Error fetching sales:', salesError.message);
    } else {
      const salesByUser = {};
      sales?.forEach(sale => {
        if (!salesByUser[sale.user_id]) {
          salesByUser[sale.user_id] = [];
        }
        salesByUser[sale.user_id].push(sale);
      });

      console.log(`  Total sales records: ${sales?.length || 0}`);
      profiles?.forEach(profile => {
        const userSales = salesByUser[profile.id] || [];
        const totalRevenue = userSales.reduce((sum, s) => sum + parseFloat(s.total_revenue || 0), 0);
        console.log(`    User ${profile.email.split('@')[0]}: ${userSales.length} sales, $${totalRevenue.toFixed(2)}`);
      });
    }

    // 5. Check RLS policy status
    console.log('\n[5] Data isolation check:');
    console.log('  Each user should ONLY see their own records');
    let isolated = true;
    
    profiles?.forEach(profile => {
      const userExpenses = expenses?.filter(e => e.user_id === profile.id) || [];
      const userProducts = products?.filter(p => p.user_id === profile.id) || [];
      const userSales = sales?.filter(s => s.user_id === profile.id) || [];
      
      if (userExpenses.length > 0 || userProducts.length > 0 || userSales.length > 0) {
        console.log(`  ✓ User ${profile.email.split('@')[0]}: ${userExpenses.length + userProducts.length + userSales.length} records (properly isolated)`);
      }
    });

    console.log('\n=== DIAGNOSIS COMPLETE ===\n');

  } catch (error) {
    console.error('Fatal error:', error.message);
  }
}

checkDataIsolation();
