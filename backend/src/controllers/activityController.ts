import type { Request, Response } from 'express';
import { supabase } from '../supabase.js';

function normalizeActivityType(value: unknown) {
  const normalized = String(value ?? '').toLowerCase();
  return normalized === 'restock' ? 'restock' : 'sale';
}

export async function updateActivityEntry(req: Request<{ id: string }>, res: Response) {
  const activityId = Number(req.params.id);
  const userId = (req as any).userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  if (!Number.isInteger(activityId) || activityId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid activity id' });
  }

  const { type, amount, date, quantity } = req.body ?? {};
  const normalizedAmount = Number(amount);

  if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
    return res.status(400).json({ success: false, error: 'amount must be a non-negative number' });
  }

  const activityType = normalizeActivityType(type);

  try {
    if (activityType === 'sale') {
      const { data: entry, error: fetchError } = await supabase
        .from('sales_logs')
        .select('*')
        .eq('id', activityId)
        .eq('user_id', userId)
        .maybeSingle();

      if (fetchError || !entry) {
        return res.status(404).json({ success: false, error: 'Sale entry not found' });
      }

      const originalQuantity = Number(entry.quantity_sold || 0);
      const parsedQuantity = Number(quantity);
      const hasQuantity = quantity !== undefined && quantity !== null && quantity !== '';

      if (hasQuantity && (!Number.isFinite(parsedQuantity) || parsedQuantity < 1)) {
        return res.status(400).json({ success: false, error: 'Quantity must be a positive number' });
      }

      const quantityToUse = hasQuantity
        ? parsedQuantity
        : originalQuantity;
      const nextRevenue = Math.abs(normalizedAmount);
      const perUnitPrice = quantityToUse > 0 ? nextRevenue / quantityToUse : 0;
      const updates: Record<string, unknown> = {
        selling_price_at_time_of_sale: perUnitPrice,
        total_revenue: nextRevenue,
      };

      if (hasQuantity) {
        updates.quantity_sold = quantityToUse;
      }

      const productId = Number(entry.product_id);
      if (Number.isInteger(productId) && productId > 0) {
        const { data: productData, error: productError } = await supabase.from('products').select('current_stock').eq('id', productId).maybeSingle();
        if (productError) {
          throw productError;
        }

        const currentStock = Number(productData?.current_stock || 0);
        const availableStock = currentStock + originalQuantity;
        if (quantity !== undefined && quantityToUse > availableStock) {
          return res.status(400).json({ success: false, error: 'Quantity is more than available for this product' });
        }

        if (quantity !== undefined) {
          const stockDelta = originalQuantity - quantityToUse;
          await supabase.from('products').update({ current_stock: Math.max(0, currentStock + stockDelta), selling_price: perUnitPrice }).eq('id', productId);
        } else {
          await supabase.from('products').update({ selling_price: perUnitPrice }).eq('id', productId);
        }
      }

      if (date) {
        const parsedDate = new Date(date);
        if (!Number.isNaN(parsedDate.getTime())) {
          updates.timestamp = parsedDate.toISOString();
        }
      }

      const { error: updateError } = await supabase.from('sales_logs').update(updates).eq('id', activityId).eq('user_id', userId);

      if (updateError) {
        throw updateError;
      }

      return res.status(200).json({ success: true, message: 'Sale updated successfully' });
    }

    const { data: entry, error: fetchError } = await supabase
      .from('restock_logs')
      .select('*')
      .eq('id', activityId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError || !entry) {
      return res.status(404).json({ success: false, error: 'Restock entry not found' });
    }

    const restockQuantity = Number(entry.quantity || 0);
    const nextCost = Math.abs(normalizedAmount);
    const perUnitCost = restockQuantity > 0 ? nextCost / restockQuantity : 0;
    const updates: Record<string, unknown> = {
      cost_per_unit: perUnitCost,
    };

    if (date) {
      const parsedDate = new Date(date);
      if (!Number.isNaN(parsedDate.getTime())) {
        updates.timestamp = parsedDate.toISOString();
      }
    }

    const { error: updateError } = await supabase.from('restock_logs').update(updates).eq('id', activityId).eq('user_id', userId);

    if (updateError) {
      throw updateError;
    }

    const productId = Number(entry.product_id);
    if (Number.isInteger(productId) && productId > 0) {
      await supabase.from('products').update({ cost_price: perUnitCost }).eq('id', productId).eq('user_id', userId);
    }

    return res.status(200).json({ success: true, message: 'Restock updated successfully' });
  } catch (error) {
    console.error('Failed to update activity entry:', error);
    return res.status(500).json({ success: false, error: 'Unable to update activity entry' });
  }
}

export async function deleteAllActivities(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { error: salesError } = await supabase.from('sales_logs').delete().eq('user_id', userId);
    if (salesError) {
      throw salesError;
    }

    const { error: restockError } = await supabase.from('restock_logs').delete().eq('user_id', userId);
    if (restockError) {
      throw restockError;
    }

    return res.status(200).json({ success: true, message: 'All activities cleared successfully' });
  } catch (error) {
    console.error('Failed to clear activities:', error);
    return res.status(500).json({ success: false, error: 'Unable to clear activities' });
  }
}

export async function deleteActivityEntry(req: Request<{ id: string }>, res: Response) {
  const activityId = Number(req.params.id);
  const userId = (req as any).userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  if (!Number.isInteger(activityId) || activityId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid activity id' });
  }

  const { type } = req.body ?? {};
  const activityType = normalizeActivityType(type);

  try {
    if (activityType === 'sale') {
      const { data: entry, error: fetchError } = await supabase
        .from('sales_logs')
        .select('*')
        .eq('id', activityId)
        .eq('user_id', userId)
        .maybeSingle();

      if (fetchError || !entry) {
        return res.status(404).json({ success: false, error: 'Sale entry not found' });
      }

      const { error: deleteError } = await supabase.from('sales_logs').delete().eq('id', activityId).eq('user_id', userId);

      if (deleteError) {
        throw deleteError;
      }

      const productId = Number(entry.product_id);
      const quantity = Number(entry.quantity_sold || 0);
      if (Number.isInteger(productId) && productId > 0) {
        const { data: productData, error: productError } = await supabase.from('products').select('current_stock').eq('id', productId).maybeSingle();

        if (!productError && productData) {
          const currentStock = Number(productData.current_stock || 0);
          const adjustedStock = Number.isFinite(quantity) ? currentStock + quantity : currentStock;

          await supabase
            .from('products')
            .update({ current_stock: Math.max(0, adjustedStock) })
            .eq('id', productId);
        }
      }

      return res.status(200).json({ success: true, message: 'Sale deleted successfully' });
    }

    const { data: entry, error: fetchError } = await supabase
      .from('restock_logs')
      .select('*')
      .eq('id', activityId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError || !entry) {
      return res.status(404).json({ success: false, error: 'Restock entry not found' });
    }

    const { error: deleteError } = await supabase.from('restock_logs').delete().eq('id', activityId).eq('user_id', userId);

    if (deleteError) {
      throw deleteError;
    }

    const productId = Number(entry.product_id);
    const quantity = Number(entry.quantity || 0);
    if (Number.isInteger(productId) && productId > 0) {
      const { data: productData, error: productError } = await supabase.from('products').select('current_stock').eq('id', productId).maybeSingle();

      if (!productError && productData) {
        await supabase
          .from('products')
          .update({ current_stock: Math.max(0, Number(productData.current_stock || 0) - quantity) })
          .eq('id', productId);
      }
    }

    return res.status(200).json({ success: true, message: 'Restock deleted successfully' });
  } catch (error) {
    console.error('Failed to delete activity entry:', error);
    return res.status(500).json({ success: false, error: 'Unable to delete activity entry' });
  }
}

export async function refundActivityEntry(req: Request<{ id: string }>, res: Response) {
  const activityId = Number(req.params.id);
  const userId = (req as any).userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  if (!Number.isInteger(activityId) || activityId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid activity id' });
  }

  const { type } = req.body ?? {};
  const activityType = normalizeActivityType(type);

  if (activityType !== 'sale') {
    return res.status(400).json({ success: false, error: 'Only sale entries can be refunded' });
  }

  try {
    const { data: entry, error: fetchError } = await supabase
      .from('sales_logs')
      .select('*')
      .eq('id', activityId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError || !entry) {
      return res.status(404).json({ success: false, error: 'Sale entry not found' });
    }

    if (Number(entry.quantity_sold || 0) < 0) {
      return res.status(409).json({ success: false, error: 'Sale entry has already been returned' });
    }

    const quantity = Number(entry.quantity_sold || 0);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid sale quantity for refund' });
    }

    const originalRevenue = Number(entry.total_revenue || 0);
    const sellingPricePerUnit = Number(entry.selling_price_at_time_of_sale || 0);
    const costPricePerUnit = Number(entry.cost_price_at_time_of_sale || 0);
    const normalizedRevenue = Number.isFinite(originalRevenue) && originalRevenue !== 0
      ? Math.abs(originalRevenue)
      : sellingPricePerUnit * quantity;

    const refundRecord = {
      product_id: entry.product_id,
      user_id: entry.user_id,
      quantity_sold: -quantity,
      selling_price_at_time_of_sale: sellingPricePerUnit,
      cost_price_at_time_of_sale: costPricePerUnit,
      total_revenue: -normalizedRevenue,
      timestamp: new Date().toISOString(),
    };

    const { error: insertError } = await supabase.from('sales_logs').insert(refundRecord);
    if (insertError) {
      throw insertError;
    }

    const productId = Number(entry.product_id);
    if (Number.isInteger(productId) && productId > 0) {
      const { data: productData, error: productError } = await supabase.from('products').select('current_stock').eq('id', productId).maybeSingle();

      if (!productError && productData) {
        await supabase
          .from('products')
          .update({ current_stock: Number(productData.current_stock || 0) + quantity })
          .eq('id', productId);
      }
    }

    return res.status(200).json({ success: true, message: 'Sale returned successfully' });
  } catch (error) {
    console.error('Failed to refund activity entry:', error);
    return res.status(500).json({ success: false, error: 'Unable to refund activity entry' });
  }
}
