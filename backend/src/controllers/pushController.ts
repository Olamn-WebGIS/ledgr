import type { Request, Response } from 'express';
import { supabase } from '../supabase.js';
import webpush from 'web-push';

export async function savePushSubscription(req: Request, res: Response) {
  try {
    const body = req.body ?? {};
    const userId = body.userId;
    const subscription = body.subscription;

    if (!userId || !subscription) {
      return res.status(400).json({ success: false, error: 'Missing userId or subscription.' });
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({ user_id: userId, subscription });

    if (error) {
      throw error;
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Failed to save push subscription:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unable to save subscription.' });
  }
}

export async function sendPushNotification(req: Request, res: Response) {
  try {
    const body = req.body ?? {};
    const title = body.title || 'P&L Dashboard';
    const message = body.message || '';
    const filters = body.filters || {};
    const notificationPayload = {
      title,
      body: message,
    };

    const query = supabase.from('push_subscriptions').select('subscription');
    if (filters.userId) {
      query.eq('user_id', filters.userId);
    }
    const { data, error } = await query;

    if (error) {
      throw error;
    }

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(200).json({ success: true, sent: 0 });
    }

    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

    if (!vapidPublicKey || !vapidPrivateKey) {
      return res.status(500).json({ success: false, error: 'VAPID keys are not configured.' });
    }

    webpush.setVapidDetails(
      `mailto:${process.env.VAPID_CONTACT_EMAIL || 'no-reply@example.com'}`,
      vapidPublicKey,
      vapidPrivateKey,
    );

    const sendResults = await Promise.all(
      data.map(async (row) => {
        try {
          await webpush.sendNotification(row.subscription, JSON.stringify(notificationPayload));
          return { success: true };
        } catch (sendError) {
          console.error('Push send error:', sendError);
          return { success: false };
        }
      }),
    );

    const sentCount = sendResults.filter((result) => result.success).length;
    return res.status(200).json({ success: true, sent: sentCount });
  } catch (error) {
    console.error('Failed to send push notification:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unable to send push notification.' });
  }
}
