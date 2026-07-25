type ProductRecord = {
  id: number;
  name: string;
  currentStock: number;
  costPrice: number;
  sellingPrice: number;
  createdAt: string;
};

type SalesEntry = {
  id: number;
  productId: number;
  quantity: number;
  sellingPrice: number;
  costPrice: number;
  totalRevenue: number;
  createdAt: string;
};

type RestockEntry = {
  id: number;
  productId: number;
  quantity: number;
  costPerUnit: number;
  createdAt: string;
};

const products = new Map<number, ProductRecord>();
const salesLogs: SalesEntry[] = [];
const restockLogs: RestockEntry[] = [];
let nextProductId = 1;
let nextSaleId = 1;
let nextRestockId = 1;

function seedProduct(id: number) {
  const product = {
    id,
    name: `Product ${id}`,
    currentStock: 10,
    costPrice: 25,
    sellingPrice: 40,
    createdAt: new Date().toISOString(),
  };

  products.set(id, product);
  return product;
}

function getOrCreateProduct(productId: number) {
  const existing = products.get(productId);
  if (existing) {
    return existing;
  }

  return seedProduct(productId);
}

export function getDashboardSnapshot() {
  const productList = Array.from(products.values());
  const revenue = salesLogs.reduce((sum, entry) => sum + entry.totalRevenue, 0);
  const cogs = salesLogs.reduce((sum, entry) => sum + entry.costPrice * entry.quantity, 0);
  const profit = revenue - cogs;
  const inventoryCount = productList.length;
  const stockUnits = productList.reduce((sum, product) => sum + product.currentStock, 0);

  const transactions = [
    ...salesLogs.map((entry) => ({
      id: entry.id,
      date: new Date(entry.createdAt).toISOString().slice(0, 10),
      type: 'Sale',
      description: `Product ${entry.productId}`,
      amount: `$${entry.totalRevenue.toFixed(2)}`,
    })),
    ...restockLogs.map((entry) => ({
      id: entry.id,
      date: new Date(entry.createdAt).toISOString().slice(0, 10),
      type: 'Restock',
      description: `Restock ${entry.productId}`,
      amount: `$${(entry.costPerUnit * entry.quantity).toFixed(2)}`,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const trend = [
    { day: 'Mon', revenue: 0, margin: 0 },
    { day: 'Tue', revenue: 0, margin: 0 },
    { day: 'Wed', revenue: 0, margin: 0 },
    { day: 'Thu', revenue: 0, margin: 0 },
    { day: 'Fri', revenue: 0, margin: 0 },
    { day: 'Sat', revenue: 0, margin: 0 },
    { day: 'Sun', revenue: 0, margin: 0 },
  ];

  salesLogs.forEach((entry) => {
    const index = Math.min(6, Math.max(0, new Date(entry.createdAt).getDay() - 1));
    trend[index].revenue += entry.totalRevenue;
    trend[index].margin += entry.totalRevenue - entry.costPrice * entry.quantity;
  });

  return {
    revenue,
    cogs,
    profit,
    inventoryCount,
    stockUnits,
    transactions: transactions.slice(0, 8),
    trend,
  };
}

export function recordSale(input: { product_id: number; quantity: number; selling_price: number }) {
  const product = getOrCreateProduct(input.product_id);

  if (product.currentStock < input.quantity) {
    throw new Error('Insufficient stock');
  }

  const saleId = nextSaleId++;
  const costPrice = product.costPrice;
  const totalRevenue = input.selling_price * input.quantity;

  product.currentStock -= input.quantity;
  product.sellingPrice = input.selling_price;

  salesLogs.push({
    id: saleId,
    productId: input.product_id,
    quantity: input.quantity,
    sellingPrice: input.selling_price,
    costPrice,
    totalRevenue,
    createdAt: new Date().toISOString(),
  });

  return {
    product_id: input.product_id,
    quantity: input.quantity,
    selling_price: input.selling_price,
    cost_price: costPrice,
    total_revenue: totalRevenue,
    cost_of_goods_sold: costPrice * input.quantity,
    profit: totalRevenue - costPrice * input.quantity,
    remaining_stock: product.currentStock,
  };
}

export function recordRestock(input: { product_id: number; quantity: number; cost_per_unit: number }) {
  const product = getOrCreateProduct(input.product_id);
  const restockId = nextRestockId++;

  product.currentStock += input.quantity;
  product.costPrice = input.cost_per_unit;

  restockLogs.push({
    id: restockId,
    productId: input.product_id,
    quantity: input.quantity,
    costPerUnit: input.cost_per_unit,
    createdAt: new Date().toISOString(),
  });

  return {
    product_id: input.product_id,
    quantity: input.quantity,
    cost_per_unit: input.cost_per_unit,
    remaining_stock: product.currentStock,
  };
}
