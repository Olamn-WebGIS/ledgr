import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateOperatingExpenseEntries, aggregateSalesPnlEntries, calculatePnlMetrics, calculateSaleEntryMetrics } from './dashboardController.js';

test('return entries reduce revenue and COGS instead of inflating them', () => {
  const metrics = calculateSaleEntryMetrics({
    quantity_sold: -2,
    selling_price_at_time_of_sale: 10,
    cost_price_at_time_of_sale: 5,
    total_revenue: -20,
  });

  assert.equal(metrics.itemRevenue, -20);
  assert.equal(metrics.itemCogs, -10);
  assert.equal(metrics.itemGrossProfit, -10);
});

test('restocks are excluded from revenue and gross profit aggregation', () => {
  const pnl = aggregateSalesPnlEntries([
    { itemRevenue: 100, itemCogs: 40, itemGrossProfit: 60 },
    { itemRevenue: 50, itemCogs: 20, itemGrossProfit: 30 },
  ]);

  assert.equal(pnl.totalRevenue, 150);
  assert.equal(pnl.totalCogs, 60);
  assert.equal(pnl.totalGrossProfit, 90);
});

test('net profit subtracts operating expenses from gross profit', () => {
  const metrics = calculatePnlMetrics({
    revenue: 1000,
    cogs: 300,
    operatingExpenses: 120,
  });

  assert.equal(metrics.grossProfit, 700);
  assert.equal(metrics.operatingExpenses, 120);
  assert.equal(metrics.netProfit, 580);
  assert.equal(metrics.profitMargin, 58);
});

test('operating expenses are aggregated by category and month', () => {
  const summary = aggregateOperatingExpenseEntries([
    { amount: 1200, category: 'Rent', date: '2026-01-10' },
    { amount: 300, category: 'Marketing', date: '2026-01-12' },
    { amount: 450, category: 'Rent', date: '2026-02-03' },
  ]);

  assert.equal(summary.total, 1950);
  assert.deepEqual(summary.byCategory, [
    { category: 'Rent', total: 1650 },
    { category: 'Marketing', total: 300 },
  ]);
  assert.deepEqual(summary.byMonth, [
    { month: '2026-01', total: 1500 },
    { month: '2026-02', total: 450 },
  ]);
});
