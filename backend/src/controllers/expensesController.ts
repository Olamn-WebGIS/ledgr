import type { Request, Response } from 'express';
import { supabase } from '../supabase.js';

function normalizeDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return new Date().toISOString().slice(0, 10);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return parsed.toISOString().slice(0, 10);
}

async function resolveUserId(providedId?: string) {
  if (providedId) {
    return providedId;
  }
  
  try {
    const { data, error } = await supabase.auth.admin.listUsers();
    if (!error && data?.users?.[0]?.id) {
      return data.users[0].id;
    }
  } catch {
    // Ignore lookup failures and fall back to configured user id.
  }

  return process.env.SUPABASE_USER_ID || '23c12067-9c45-4ec0-8173-f5858aaa60f9';
}

function normalizeExpense(entry: Record<string, unknown>) {
  return {
    id: entry.id,
    category: typeof entry.category === 'string' && entry.category.trim() ? entry.category.trim() : 'Operating Expenses',
    amount: Number(entry.amount || 0),
    date: normalizeDate(entry.date),
  };
}

async function syncWorkspaceSnapshotExpenses(userId: string) {
  const { data: expenses, error: expensesError } = await supabase
    .from('expenses')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('id', { ascending: false });

  if (expensesError) {
    throw expensesError;
  }

  const normalizedExpenses = (expenses ?? []).map((entry) => normalizeExpense(entry as Record<string, unknown>));
  const { error: snapshotError } = await supabase
    .from('workspace_snapshots')
    .upsert({ user_id: userId, expenses: normalizedExpenses }, { onConflict: 'user_id' });

  if (snapshotError) {
    throw snapshotError;
  }
}

export async function listExpenses(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .order('id', { ascending: false });

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      data: {
        expenses: (data ?? []).map((entry) => normalizeExpense(entry as Record<string, unknown>)),
      },
    });
  } catch (error) {
    console.error('Failed to list expenses:', error);
    return res.status(500).json({ success: false, error: 'Unable to load expenses' });
  }
}

export async function createExpense(req: Request, res: Response) {
  try {
    const body = req.body ?? {};
    const category = typeof body.category === 'string' && body.category.trim() ? body.category.trim() : 'Operating Expenses';
    const amount = Number(body.amount ?? 0);
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ success: false, error: 'amount must be a non-negative number' });
    }

    const date = typeof body.date === 'string' && body.date.trim() ? normalizeDate(body.date) : new Date().toISOString();
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        user_id: userId,
        category,
        amount,
        date,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    await syncWorkspaceSnapshotExpenses(userId);

    return res.status(201).json({ success: true, data: { expense: normalizeExpense(data as Record<string, unknown>) } });
  } catch (error) {
    console.error('Failed to create expense:', error);
    return res.status(500).json({ success: false, error: 'Unable to create expense' });
  }
}

export async function updateExpense(req: Request<{ id: string }>, res: Response) {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const expenseId = Number(req.params.id);
    if (!Number.isInteger(expenseId) || expenseId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid expense id' });
    }

    const body = req.body ?? {};
    const updates: Record<string, unknown> = {};

    if (typeof body.category === 'string' && body.category.trim()) {
      updates.category = body.category.trim();
    }

    if (Number.isFinite(Number(body.amount))) {
      updates.amount = Number(body.amount);
    }

    if (typeof body.date === 'string' && body.date.trim()) {
      updates.date = normalizeDate(body.date);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid expense updates supplied' });
    }

    const { data, error } = await supabase
      .from('expenses')
      .update(updates)
      .eq('id', expenseId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    await syncWorkspaceSnapshotExpenses(userId);

    return res.status(200).json({ success: true, data: { expense: normalizeExpense(data as Record<string, unknown>) } });
  } catch (error) {
    console.error('Failed to update expense:', error);
    return res.status(500).json({ success: false, error: 'Unable to update expense' });
  }
}

export async function deleteExpense(req: Request<{ id: string }>, res: Response) {
  try {
    const expenseId = Number(req.params.id);
    if (!Number.isInteger(expenseId) || expenseId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid expense id' });
    }

    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { data, error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      return res.status(404).json({ success: false, error: 'Expense not found' });
    }

    await syncWorkspaceSnapshotExpenses(userId);

    return res.status(200).json({ success: true, message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Failed to delete expense:', error);
    return res.status(500).json({ success: false, error: 'Unable to delete expense' });
  }
}

export async function deleteAllExpenses(_req: Request, res: Response) {
  try {
    const userId = (_req as any).userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { error } = await supabase.from('expenses').delete().eq('user_id', userId);
    if (error) {
      throw error;
    }

    await syncWorkspaceSnapshotExpenses(userId);

    return res.status(200).json({ success: true, message: 'All expenses cleared successfully' });
  } catch (error) {
    console.error('Failed to clear expenses:', error);
    return res.status(500).json({ success: false, error: 'Unable to clear expenses' });
  }
}
