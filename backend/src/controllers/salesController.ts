import type { Request, Response } from 'express';
import { supabase } from '../supabase.js';
import type { SalePayload } from '../types.js';

export async function deleteAllSales(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { error } = await supabase.from('sales_logs').delete().eq('user_id', userId);
    if (error) {
      throw error;
    }

    return res.status(200).json({ success: true, message: 'All sales cleared successfully' });
  } catch (error) {
    console.error('Failed to clear sales:', error);
    return res.status(500).json({ success: false, error: 'Unable to clear sales' });
  }
}

export async function createSale(req: Request<{}, {}, SalePayload>, res: Response) {
  const { product_id, quantity, selling_price } = req.body;

  if (!Number.isInteger(product_id) || product_id <= 0) {
    return res.status(400).json({ success: false, error: 'product_id must be a positive integer' });
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ success: false, error: 'quantity must be a positive integer' });
  }

  if (typeof selling_price !== 'number' || selling_price < 0) {
    return res.status(400).json({ success: false, error: 'selling_price must be a non-negative number' });
  }

  try {
    const { data: productData, error: productError } = await supabase.from('products').select('id, user_id, cost_price, current_stock').eq('id', product_id).maybeSingle();

    if (productError || !productData) {
      console.error('Product lookup failed for sale', { product_id, productError });
      return res.status(404).json({ success: false, error: productError?.message || 'Product not found' });
    }

    if (Number(productData.current_stock || 0) < quantity) {
      return res.status(409).json({ success: false, error: 'Insufficient stock' });
    }

    const costPricePerUnit = Number(productData.cost_price || 0);
    const totalRevenue = selling_price * quantity;
    const transactionCost = costPricePerUnit * quantity;
    const profit = totalRevenue - transactionCost;

    const { error: saleError } = await supabase.from('sales_logs').insert({
      product_id,
      user_id: productData.user_id,
      quantity_sold: quantity,
      selling_price_at_time_of_sale: selling_price,
      cost_price_at_time_of_sale: costPricePerUnit,
      total_revenue: totalRevenue,
      timestamp: new Date().toISOString(),
    });

    if (saleError) {
      throw saleError;
    }

    const { error: updateError } = await supabase.from('products').update({
      current_stock: Number(productData.current_stock || 0) - quantity,
      selling_price,
    }).eq('id', product_id);

    if (updateError) {
      throw updateError;
    }

    return res.status(201).json({
      success: true,
      message: 'Sale recorded successfully',
      data: {
        product_id,
        quantity,
        selling_price,
        cost_price_per_unit: costPricePerUnit,
        total_revenue: totalRevenue,
        cost_of_goods_sold: transactionCost,
        profit,
        remaining_stock: Number(productData.current_stock || 0) - quantity,
      },
    });
  } catch (error) {
    console.error('Failed to create sale:', error);
    return res.status(500).json({ success: false, error: 'Unable to record sale' });
  }
}
