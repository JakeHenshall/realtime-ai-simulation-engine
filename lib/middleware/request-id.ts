import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

const REQUEST_ID_HEADER = 'x-request-id';

export function getRequestId(request: NextRequest): string {
  const existing = request.headers.get(REQUEST_ID_HEADER);
  if (existing) {
    return existing;
  }
  return randomBytes(16).toString('hex');
}

export function setRequestIdHeader(request: NextRequest, requestId: string): void {
  request.headers.set(REQUEST_ID_HEADER, requestId);
}

