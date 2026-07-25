export function getInventoryStatus(quantity, reorderLevel) {
  const normalizedQuantity = Number(quantity || 0);
  const normalizedReorderLevel = Number(reorderLevel || 0);

  if (normalizedQuantity <= 0) {
    return { label: 'Out of stock', tone: 'danger' };
  }

  if (normalizedQuantity <= normalizedReorderLevel) {
    return { label: 'Low stock', tone: 'warning' };
  }

  return { label: 'Healthy', tone: 'success' };
}

export function getProfitMargin(costPrice, sellingPrice) {
  const normalizedCost = Number(costPrice || 0);
  const normalizedSelling = Number(sellingPrice || 0);

  if (!normalizedSelling || normalizedSelling <= 0) {
    return 0;
  }

  return ((normalizedSelling - normalizedCost) / normalizedSelling) * 100;
}

export function buildInventoryRows(products = [], inventoryMeta = {}) {
  return (products || []).map((product) => {
    const productKey = String(product?.id ?? product?.name ?? '');
    const meta = inventoryMeta?.[productKey] ?? {};
    const quantity = Number(product?.current_stock || 0);
    const costPrice = Number(product?.cost_price || 0);
    const sellingPrice = Number(product?.selling_price || 0);
    const reorderLevel = Number(meta.reorderLevel ?? 5);
    const category = meta.category || 'General';
    const sku = meta.sku || `SKU-${productKey || '000'}`;
    const totalValue = costPrice * quantity;
    const profitMargin = getProfitMargin(costPrice, sellingPrice);
    const status = getInventoryStatus(quantity, reorderLevel);

    return {
      id: product?.id,
      key: productKey,
      sku,
      name: product?.name || 'Unnamed product',
      category,
      costPrice,
      sellingPrice,
      quantity,
      reorderLevel,
      totalValue,
      profitMargin,
      status,
    };
  });
}
