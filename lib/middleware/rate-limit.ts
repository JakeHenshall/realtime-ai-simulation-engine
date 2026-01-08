import { NextRequest, NextResponse } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class InMemoryRateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store.entries()) {
        if (entry.resetAt < now) {
          this.store.delete(key);
        }
      }
    }, 60000);
  }

  consume(key: string, points: number, duration: number): { allowed: boolean; msBeforeNext?: number } {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || entry.resetAt < now) {
      // Create new entry
      this.store.set(key, {
        count: 1,
        resetAt: now + duration * 1000,
      });
      return { allowed: true };
    }

    if (entry.count >= points) {
      return {
        allowed: false,
        msBeforeNext: entry.resetAt - now,
      };
    }

    entry.count++;
    return { allowed: true };
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

// IP-based rate limiter: 100 requests per minute
const ipLimiter = new InMemoryRateLimiter();

// Session-based rate limiter: 50 requests per minute
const sessionLimiter = new InMemoryRateLimiter();

export function getClientIP(request: NextRequest): string {
  // In production, trust X-Forwarded-For only if behind a known proxy
  // For security, only trust the first IP (closest to client) if configured
  const trustProxy = process.env.TRUST_PROXY === 'true';
  
  if (trustProxy) {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
      // Take the first IP in the chain (client IP)
      return forwarded.split(',')[0].trim();
    }
    const realIP = request.headers.get('x-real-ip');
    if (realIP) {
      return realIP.trim();
    }
  }
  
  // Fallback to a constant for local/unknown scenarios
  // Using 'unknown' ensures rate limiting still works but isn't tied to IP
  return 'unknown';
}

export async function checkRateLimit(
  request: NextRequest,
  sessionId?: string
): Promise<{ allowed: boolean; msBeforeNext?: number }> {
  const ip = getClientIP(request);
  
  // Check IP-based limit
  const ipResult = ipLimiter.consume(`ip:${ip}`, 100, 60);
  if (!ipResult.allowed) {
    return ipResult;
  }

  // Check session-based limit if sessionId provided
  if (sessionId) {
    const sessionResult = sessionLimiter.consume(`session:${sessionId}`, 50, 60);
    if (!sessionResult.allowed) {
      return sessionResult;
    }
  }

  return { allowed: true };
}

export function createRateLimitResponse(msBeforeNext?: number): NextResponse {
  const retryAfter = msBeforeNext ? Math.ceil(msBeforeNext / 1000) : 60;
  return NextResponse.json(
    {
      error: 'Rate limit exceeded',
      retryAfter,
    },
    {
      status: 429,
      headers: {
        'Retry-After': retryAfter.toString(),
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '0',
      },
    }
  );
}

