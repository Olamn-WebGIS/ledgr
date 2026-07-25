import type { Request, Response } from 'express';
import { supabase } from '../supabase.js';

export async function getProductByName(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const name = typeof req.query.name === 'string' && req.query.name.trim() ? req.query.name.trim() : '';

    let query = supabase
      .from('products')
      .select('*')
      .eq('user_id', userId)
      .order('id', { ascending: true });

    if (name) {
      query = query.ilike('name', name).limit(1);
    }

    const { data, error } = name ? await query.maybeSingle() : await query;

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      data: {
        product: name ? data : undefined,
        products: name ? [data].filter(Boolean) : data ?? [],
      },
    });
  } catch (error) {
    console.error('Failed to lookup product:', error);
    return res.status(500).json({ success: false, error: 'Unable to lookup product' });
  }
}

export async function createProduct(req: Request, res: Response) {
  try {
    const body = req.body ?? {};
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Starter SKU';
    const currentStock = Number.isFinite(Number(body.current_stock)) ? Number(body.current_stock) : 0;
    const costPrice = Number.isFinite(Number(body.cost_price)) ? Number(body.cost_price) : 10;
    const sellingPrice = Number.isFinite(Number(body.selling_price)) ? Number(body.selling_price) : 25;

    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { data: existingProducts, error: existingError } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', userId)
      .ilike('name', name)
      .order('id', { ascending: true })
      .limit(1);

    if (existingError) {
      throw existingError;
    }

    if ((existingProducts ?? []).length > 0) {
      return res.status(200).json({
        success: true,
        message: 'Product already exists',
        data: {
          created: false,
          product: existingProducts?.[0],
        },
      });
    }

    const { data, error } = await supabase.from('products').insert({
      name,
      current_stock: currentStock,
      cost_price: costPrice,
      selling_price: sellingPrice,
      user_id: userId,
    }).select().single();

    if (error) {
      throw error;
    }

    return res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: {
        created: true,
        product: data,
      },
    });
  } catch (error) {
    console.error('Failed to create product:', error);
    return res.status(500).json({ success: false, error: 'Unable to create product' });
  }
}

export async function updateProduct(req: Request<{ id: string }>, res: Response) {
  try {
    const productId = Number(req.params.id);

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid product id' });
    }

    const body = req.body ?? {};
    const updates: Record<string, unknown> = {};

    if (typeof body.name === 'string' && body.name.trim()) {
      updates.name = body.name.trim();
    }

    if (Number.isFinite(Number(body.current_stock))) {
      updates.current_stock = Number(body.current_stock);
    }

    if (Number.isFinite(Number(body.cost_price))) {
      updates.cost_price = Number(body.cost_price);
    }

    if (Number.isFinite(Number(body.selling_price))) {
      updates.selling_price = Number(body.selling_price);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid product updates supplied' });
    }

    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', productId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: { product: data },
    });
  } catch (error) {
    console.error('Failed to update product:', error);
    return res.status(500).json({ success: false, error: 'Unable to update product' });
  }
}

export async function deleteProduct(req: Request<{ id: string }>, res: Response) {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const productId = Number(req.params.id);

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid product id' });
    }

    const { error: salesLogsError } = await supabase.from('sales_logs').delete().eq('product_id', productId).eq('user_id', userId);
    if (salesLogsError) {
      throw salesLogsError;
    }

    const { error: restockLogsError } = await supabase.from('restock_logs').delete().eq('product_id', productId).eq('user_id', userId);
    if (restockLogsError) {
      throw restockLogsError;
    }

    const { error } = await supabase.from('products').delete().eq('id', productId).eq('user_id', userId);
    if (error) {
      throw error;
    }

    return res.status(200).json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Failed to delete product:', error);
    return res.status(500).json({ success: false, error: 'Unable to delete product' });
  }
}

export async function deleteAllProducts(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { error: salesLogsError } = await supabase.from('sales_logs').delete().eq('user_id', userId);
    if (salesLogsError) {
      throw salesLogsError;
    }

    const { error: restockLogsError } = await supabase.from('restock_logs').delete().eq('user_id', userId);
    if (restockLogsError) {
      throw restockLogsError;
    }

    const { error } = await supabase.from('products').delete().eq('user_id', userId);
    if (error) {
      throw error;
    }

    return res.status(200).json({ success: true, message: 'All products and related activity cleared successfully' });
  } catch (error) {
    console.error('Failed to clear products:', error);
    return res.status(500).json({ success: false, error: 'Unable to clear products' });
  }
}
