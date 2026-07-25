import type { Request, Response } from 'express';
import { supabase } from '../supabase.js';

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function createAccount(req: Request, res: Response) {
  try {
    const body = req.body ?? {};
    const email = normalizeText(body.email).toLowerCase();
    const password = normalizeText(body.password);
    const firstName = normalizeText(body.firstName);
    const surname = normalizeText(body.surname);
    const businessName = normalizeText(body.businessName);
    const currency = normalizeText(body.currency) || 'USD';

    if (!email || !password || !firstName || !surname) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, first name, and surname are required.',
      });
    }

    const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        firstName,
        surname,
        businessName,
        currency,
      },
    });

    if (createUserError) {
      throw createUserError;
    }

    const userId = createdUser?.user?.id;
    if (!userId) {
      return res.status(500).json({
        success: false,
        error: 'Supabase did not return a user id for the created account.',
      });
    }

    const profilePayload = {
      id: userId,
      display_name: `${firstName} ${surname}`.trim(),
      email,
      business_name: businessName,
      currency,
      language: normalizeText(body.language) || 'en',
      date_format: normalizeText(body.dateFormat) || 'MM/DD/YYYY',
      number_format: normalizeText(body.numberFormat) || 'commas',
      activity_tracking: body.activityTracking !== false,
      notification_preferences: body.notificationPreferences ?? {},
    };

    const workspacePayload = {
      user_id: userId,
      profile: {
        firstName,
        surname,
        email,
        businessName,
        currency,
        language: normalizeText(body.language) || 'en',
        dateFormat: normalizeText(body.dateFormat) || 'MM/DD/YYYY',
        numberFormat: normalizeText(body.numberFormat) || 'commas',
        activityTracking: body.activityTracking !== false,
        notificationPreferences: body.notificationPreferences ?? {},
        lastLoginAt: new Date().toISOString(),
      },
      expenses: Array.isArray(body.expenses) ? body.expenses : [],
      inventory_meta: body.inventoryMeta ?? {},
    };

    const [{ error: profileError }, { error: workspaceError }] = await Promise.all([
      supabase.from('user_profiles').upsert(profilePayload, { onConflict: 'id' }),
      supabase.from('workspace_snapshots').upsert(workspacePayload, { onConflict: 'user_id' }),
    ]);

    if (profileError || workspaceError) {
      throw profileError || workspaceError;
    }

    return res.status(201).json({
      success: true,
      data: {
        user: createdUser.user,
      },
    });
  } catch (error) {
    console.error('Failed to create account:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unable to create account.',
    });
  }
}
