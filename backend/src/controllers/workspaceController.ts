import type { Request, Response } from 'express';
import { supabase } from '../supabase.js';

export async function resetWorkspace(req: Request, res: Response) {
  try {
    const { userId } = req.body ?? {};
    if (typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ success: false, error: 'Missing userId' });
    }

    const targetUserId = userId.trim();

    const deletionOrder = [
      { table: 'sales_logs', key: 'user_id' },
      { table: 'restock_logs', key: 'user_id' },
      { table: 'expenses', key: 'user_id' },
      { table: 'products', key: 'user_id' },
    ];

    for (const { table, key } of deletionOrder) {
      const { data, error, count } = await supabase.from(table).delete().eq(key, targetUserId);
      console.log(`Deleting from ${table} where ${key}=${targetUserId}:`, { count, error: error?.message || 'none', data });
      if (error) {
        throw error;
      }
    }

    const { data: workspaceData, error: workspaceError } = await supabase
      .from('workspace_snapshots')
      .update({ expenses: [], inventory_meta: {} })
      .eq('user_id', targetUserId);

    console.log('Reset workspace snapshot for user:', { data: workspaceData, error: workspaceError });
    if (workspaceError) {
      throw workspaceError;
    }

    return res.status(200).json({ success: true, message: 'Workspace reset for user completed successfully' });
  } catch (error) {
    console.error('Failed to reset user workspace:', error);
    return res.status(500).json({ success: false, error: 'Unable to reset workspace for user' });
  }
}
