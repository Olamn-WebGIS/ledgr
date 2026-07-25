import type { Request, Response } from 'express';
import { supabase } from '../supabase.js';

export async function deleteAllRestocks(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { error } = await supabase.from('restock_logs').delete().eq('user_id', userId);
    if (error) {
      throw error;
    }

    return res.status(200).json({ success: true, message: 'All restocks cleared successfully' });
  } catch (error) {
    console.error('Failed to clear restocks:', error);
    return res.status(500).json({ success: false, error: 'Unable to clear restocks' });
  }
}

export async function createRestock(req: Request, res: Response) {
  try {
    const { product_id, quantity, cost_per_unit } = req.body;

    if (!Number.isInteger(product_id) || product_id <= 0) {
      return res.status(400).json({ success: false, error: 'product_id must be a positive integer' });
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ success: false, error: 'quantity must be a positive integer' });
    }

    if (typeof cost_per_unit !== 'number' || cost_per_unit < 0) {
      return res.status(400).json({ success: false, error: 'cost_per_unit must be a non-negative number' });
    }

    const { data: productData, error: productError } = await supabase.from('products').select('id, user_id, current_stock').eq('id', product_id).maybeSingle();

    if (productError || !productData) {
      console.error('Product lookup failed for restock', { product_id, productError });
      return res.status(404).json({ success: false, error: productError?.message || 'Product not found' });
    }

    const { error: restockError } = await supabase.from('restock_logs').insert({
      product_id,
      user_id: productData.user_id,
      quantity,
      cost_per_unit,
      timestamp: new Date().toISOString(),
    });

    if (restockError) {
      throw restockError;
    }

    const { error: updateError } = await supabase.from('products').update({
      current_stock: Number(productData.current_stock || 0) + quantity,
      cost_price: cost_per_unit,
    }).eq('id', product_id);

    if (updateError) {
      throw updateError;
    }

    return res.status(201).json({
      success: true,
      message: 'Restock recorded successfully',
      data: {
        product_id,
        quantity,
        cost_per_unit,
        remaining_stock: Number(productData.current_stock || 0) + quantity,
      },
    });
  } catch (error) {
    console.error('Failed to create restock:', error);
    return res.status(500).json({ success: false, error: 'Unable to record restock' });
  }
}
