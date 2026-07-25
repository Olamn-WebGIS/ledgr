import type { Request, Response } from 'express';
import { supabase } from '../supabase.js';

export function calculateSaleEntryMetrics(entry: {
  quantity_sold?: number;
  selling_price_at_time_of_sale?: number;
  cost_price_at_time_of_sale?: number;
  total_revenue?: number;
}) {
  const quantity = Number(entry.quantity_sold || 0);
  const sellingPriceAtSale = Number(entry.selling_price_at_time_of_sale || 0);
  const costPriceAtSale = Number(entry.cost_price_at_time_of_sale || 0);
  const storedRevenue = Number(entry.total_revenue ?? 0);
  const grossRevenue = sellingPriceAtSale * quantity;
  const grossCogs = costPriceAtSale * quantity;
  const itemRevenue = Number.isFinite(storedRevenue) && storedRevenue !== 0
    ? storedRevenue
    : grossRevenue;
  const itemCogs = grossCogs;
  const itemGrossProfit = itemRevenue - itemCogs;

  return {
    itemRevenue: Number(itemRevenue.toFixed(2)),
    itemCogs: Number(itemCogs.toFixed(2)),
    itemGrossProfit: Number(itemGrossProfit.toFixed(2)),
  };
}

export function aggregateSalesPnlEntries(entries: Array<{ itemRevenue: number; itemCogs: number; itemGrossProfit: number }>) {
  const totalRevenue = entries.reduce((sum, entry) => sum + (entry.itemRevenue || 0), 0);
  const totalCogs = entries.reduce((sum, entry) => sum + (entry.itemCogs || 0), 0);
  const totalGrossProfit = entries.reduce((sum, entry) => sum + (entry.itemGrossProfit || 0), 0);

  return {
    totalRevenue,
    totalCogs,
    totalGrossProfit,
  };
}

export function calculatePnlMetrics({
  revenue,
  cogs,
  operatingExpenses = 0,
}: {
  revenue: number;
  cogs: number;
  operatingExpenses?: number;
}) {
  const normalizedRevenue = Number(revenue.toFixed(2));
  const normalizedCogs = Number(cogs.toFixed(2));
  const normalizedExpenses = Number(Number(operatingExpenses || 0).toFixed(2));
  const grossProfit = Number((normalizedRevenue - normalizedCogs).toFixed(2));
  const netProfit = Number((grossProfit - normalizedExpenses).toFixed(2));
  const profitMargin = normalizedRevenue !== 0 ? Number(((netProfit / normalizedRevenue) * 100).toFixed(2)) : 0;

  return {
    grossProfit,
    operatingExpenses: normalizedExpenses,
    netProfit,
    profitMargin,
  };
}

export function aggregateOperatingExpenseEntries(entries: Array<{ amount: number; category: string; date: string }>) {
  const byCategory = entries.reduce<Map<string, number>>((acc, entry) => {
    const key = entry.category?.trim() || 'Uncategorized';
    acc.set(key, (acc.get(key) || 0) + Number(entry.amount || 0));
    return acc;
  }, new Map());

  const byMonth = entries.reduce<Map<string, number>>((acc, entry) => {
    const key = entry.date ? entry.date.slice(0, 7) : 'Unknown';
    acc.set(key, (acc.get(key) || 0) + Number(entry.amount || 0));
    return acc;
  }, new Map());

  return {
    total: Number(entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0).toFixed(2)),
    byCategory: Array.from(byCategory.entries()).map(([category, total]) => ({ category, total: Number(total.toFixed(2)) })).sort((a, b) => b.total - a.total),
    byMonth: Array.from(byMonth.entries()).map(([month, total]) => ({ month, total: Number(total.toFixed(2)) })).sort((a, b) => a.month.localeCompare(b.month)),
  };
}

export async function getDashboard(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { data: sales, error: salesError } = await supabase
      .from('sales_logs')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(8);
    
    const { data: restocks, error: restocksError } = await supabase
      .from('restock_logs')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(8);
    
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', userId);
    
    const { data: expensesData, error: expensesError } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (salesError || restocksError || productsError || expensesError) {
      throw new Error(salesError?.message || restocksError?.message || productsError?.message || expensesError?.message || 'Unable to load dashboard data');
    }

    const productsById = new Map((products ?? []).map((product) => [product.id, product]));
    const roundCurrency = (value: number) => Number(value.toFixed(2));
    const requestedOperatingExpenses = Number((typeof req.query.operatingExpenses === 'string' ? req.query.operatingExpenses : req.query.operatingExpenses ?? 0) || 0);
    const normalizedExpenseEntries = (expensesData ?? []).map((entry) => ({
      amount: Number(entry.amount || 0),
      category: typeof entry.category === 'string' && entry.category.trim() ? entry.category.trim() : 'Operating Expenses',
      date: entry.date ? String(entry.date) : new Date().toISOString().slice(0, 10),
    })).filter((entry) => Number(entry.amount || 0) > 0);
    const expenseEntries = normalizedExpenseEntries.length > 0
      ? normalizedExpenseEntries
      : (requestedOperatingExpenses > 0 ? [{ amount: requestedOperatingExpenses, category: 'Operating Expenses', date: new Date().toISOString().slice(0, 10) }] : []);
    const totalOperatingExpenses = Number(expenseEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0).toFixed(2));
    const expenseSummary = aggregateOperatingExpenseEntries(expenseEntries);

    const normalizedSales = (sales ?? []).map((entry) => {
      const { itemRevenue, itemCogs, itemGrossProfit } = calculateSaleEntryMetrics(entry);
      const orderKey = entry.timestamp ? new Date(entry.timestamp).toISOString().slice(0, 19) : String(entry.id);

      return {
        ...entry,
        itemRevenue: roundCurrency(itemRevenue),
        itemCogs: roundCurrency(itemCogs),
        itemGrossProfit: roundCurrency(itemGrossProfit),
        orderKey,
      };
    });

    const orders = new Map<string, { orderRevenue: number; orderCogs: number; orderGrossProfit: number; date: string; items: number }>();

    normalizedSales.forEach((entry) => {
      const existing = orders.get(entry.orderKey);
      const nextOrder = existing ?? { orderRevenue: 0, orderCogs: 0, orderGrossProfit: 0, date: entry.timestamp, items: 0 };

      nextOrder.orderRevenue += Number(entry.itemRevenue || 0);
      nextOrder.orderCogs += Number(entry.itemCogs || 0);
      nextOrder.orderGrossProfit += Number(entry.itemGrossProfit || 0);
      nextOrder.items += 1;

      orders.set(entry.orderKey, nextOrder);
    });

    const orderSummaries = Array.from(orders.values());
    const salesPnl = aggregateSalesPnlEntries(orderSummaries.map((order) => ({
      itemRevenue: order.orderRevenue,
      itemCogs: order.orderCogs,
      itemGrossProfit: order.orderGrossProfit,
    })));
    const totalRevenue = roundCurrency(salesPnl.totalRevenue);
    const totalCogs = roundCurrency(salesPnl.totalCogs);
    const { grossProfit, operatingExpenses, netProfit, profitMargin } = calculatePnlMetrics({
      revenue: totalRevenue,
      cogs: totalCogs,
      operatingExpenses: totalOperatingExpenses,
    });
    const inventoryCount = (products ?? []).length;
    const stockUnits = (products ?? []).reduce((sum, product) => sum + Number(product.current_stock || 0), 0);
    const productCostBreakdown = (products ?? []).map((product) => ({
      id: product.id,
      name: product.name || 'Unnamed product',
      costPerUnit: Number(product.cost_price || 0),
      currentStock: Number(product.current_stock || 0),
    }));

    const transactions = [
      ...(normalizedSales ?? []).map((entry) => {
        const isRefund = Number(entry.quantity_sold || 0) < 0 || Number(entry.total_revenue || 0) < 0;
        const signedAmount = Number(entry.itemRevenue || 0);

        return {
          id: entry.id,
          productId: entry.product_id,
          quantity: Number(entry.quantity_sold || 0),
          timestamp: entry.timestamp ? new Date(entry.timestamp).toISOString() : new Date().toISOString(),
          date: new Date(entry.timestamp).toISOString().slice(0, 10),
          type: isRefund ? 'Refund' : 'Sale',
          description: isRefund ? `Refund #${entry.id}` : `Sale #${entry.id}`,
          amount: `$${Math.abs(signedAmount).toFixed(2)}`,
          productName: productsById.get(entry.product_id)?.name || 'Unknown product',
        };
      }),
      ...(restocks ?? []).map((entry) => ({
        id: entry.id,
        productId: entry.product_id,
        quantity: Number(entry.quantity || 0),
        timestamp: entry.timestamp ? new Date(entry.timestamp).toISOString() : new Date().toISOString(),
        date: new Date(entry.timestamp).toISOString().slice(0, 10),
        type: 'Restock',
        description: `Restock #${entry.id}`,
        amount: `$${(Number(entry.cost_per_unit || 0) * Number(entry.quantity || 0)).toFixed(2)}`,
        productName: productsById.get(entry.product_id)?.name || 'Unknown product',
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 8);

    const trend = [
      { day: 'Mon', revenue: 0, cogs: 0, netProfit: 0, expenses: 0 },
      { day: 'Tue', revenue: 0, cogs: 0, netProfit: 0, expenses: 0 },
      { day: 'Wed', revenue: 0, cogs: 0, netProfit: 0, expenses: 0 },
      { day: 'Thu', revenue: 0, cogs: 0, netProfit: 0, expenses: 0 },
      { day: 'Fri', revenue: 0, cogs: 0, netProfit: 0, expenses: 0 },
      { day: 'Sat', revenue: 0, cogs: 0, netProfit: 0, expenses: 0 },
      { day: 'Sun', revenue: 0, cogs: 0, netProfit: 0, expenses: 0 },
    ];

    const dailyBuckets = new Map<string, { revenue: number; cogs: number; netProfit: number; expenses: number }>();
    orderSummaries.forEach((order) => {
      const orderDate = order.date ? new Date(order.date) : new Date();
      const bucketKey = orderDate.toISOString().slice(0, 10);
      const bucket = dailyBuckets.get(bucketKey) ?? { revenue: 0, cogs: 0, netProfit: 0, expenses: 0 };
      bucket.revenue += order.orderRevenue;
      bucket.cogs += order.orderCogs;
      bucket.netProfit += order.orderGrossProfit;
      dailyBuckets.set(bucketKey, bucket);
    });

    expenseEntries.forEach((entry) => {
      const entryDate = entry.date ? new Date(entry.date) : new Date();
      const bucketKey = entryDate.toISOString().slice(0, 10);
      const bucket = dailyBuckets.get(bucketKey) ?? { revenue: 0, cogs: 0, netProfit: 0, expenses: 0 };
      const amount = Number(entry.amount || 0);
      bucket.expenses += amount;
      bucket.netProfit -= amount;
      dailyBuckets.set(bucketKey, bucket);
    });

    Array.from(dailyBuckets.entries()).sort(([left], [right]) => left.localeCompare(right)).slice(-7).forEach(([bucketKey], index) => {
      const bucket = dailyBuckets.get(bucketKey);
      trend[index] = {
        day: new Date(bucketKey).toLocaleDateString('en-US', { weekday: 'short' }),
        revenue: roundCurrency(bucket?.revenue ?? 0),
        cogs: roundCurrency(bucket?.cogs ?? 0),
        netProfit: roundCurrency(bucket?.netProfit ?? 0),
        expenses: roundCurrency(bucket?.expenses ?? 0),
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        revenue: totalRevenue,
        cogs: totalCogs,
        profit: netProfit,
        grossProfit,
        netProfit,
        operatingExpenses,
        profitMargin,
        inventoryCount,
        stockUnits,
        productCostBreakdown,
        transactions,
        trend,
        expenseSummary,
      },
    });
  } catch (error) {
    console.error('Failed to fetch dashboard data:', error);

    return res.status(200).json({
      success: true,
      data: {
        revenue: 0,
        cogs: 0,
        profit: 0,
        inventoryCount: 0,
        stockUnits: 0,
        productCostBreakdown: [],
        transactions: [],
        trend: [
          { day: 'Mon', revenue: 0, cogs: 0, netProfit: 0, expenses: 0 },
          { day: 'Tue', revenue: 0, cogs: 0, netProfit: 0, expenses: 0 },
          { day: 'Wed', revenue: 0, cogs: 0, netProfit: 0, expenses: 0 },
          { day: 'Thu', revenue: 0, cogs: 0, netProfit: 0, expenses: 0 },
          { day: 'Fri', revenue: 0, cogs: 0, netProfit: 0, expenses: 0 },
          { day: 'Sat', revenue: 0, cogs: 0, netProfit: 0, expenses: 0 },
          { day: 'Sun', revenue: 0, cogs: 0, netProfit: 0, expenses: 0 },
        ],
        expenseSummary: {
          total: 0,
          byCategory: [],
          byMonth: [],
        },
      },
    });
  }
}
