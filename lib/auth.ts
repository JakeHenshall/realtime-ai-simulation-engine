import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

export interface AuthToken {
  userId: string;
  iat?: number;
  exp?: number;
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): AuthToken {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthToken;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

export function getAuthToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

export function getUserId(request: NextRequest): string {
  const token = getAuthToken(request);
  if (!token) {
    throw new Error('Authentication required');
  }
  const decoded = verifyToken(token);
  return decoded.userId;
}

// For demo purposes, we'll use a simple user ID
// In production, this would come from your auth system
export function getOrCreateUserId(request: NextRequest): string {
  const token = getAuthToken(request);
  if (token) {
    try {
      const decoded = verifyToken(token);
      return decoded.userId;
    } catch {
      // Token invalid, create new one
    }
  }

  // Generate a demo user ID
  const userId = `user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  return userId;
}
