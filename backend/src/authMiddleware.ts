import type { Request, Response, NextFunction } from 'express';
import { supabase } from './supabase.js';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userError?: string;
    }
  }
}

/**
 * Middleware to extract and verify the authenticated user from JWT token
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided - continue without user ID
      // Controllers will handle guest requests if needed
      return next();
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix
    
    // Verify the token and get the user
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      req.userError = 'Invalid or expired token';
      return next();
    }

    req.userId = user.id;
    next();
  } catch (error) {
    req.userError = error instanceof Error ? error.message : 'Authentication error';
    next();
  }
}

/**
 * Middleware to enforce that user is authenticated
 * Use this for endpoints that require authentication
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.userId) {
    return res.status(401).json({
      success: false,
      error: req.userError || 'Authentication required',
    });
  }
  next();
}
