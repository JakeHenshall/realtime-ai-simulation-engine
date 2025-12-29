import { NextRequest, NextResponse } from 'next/server';
import { ZodError, ZodSchema } from 'zod';
import { getRequestId } from './request-id';
import { checkRateLimit, createRateLimitResponse } from './rate-limit';
import { createRequestLogger } from '../logger';

export interface ApiHandlerOptions {
  validateBody?: ZodSchema;
  validateQuery?: ZodSchema;
  requireSessionId?: boolean;
  rateLimitSessionId?: (request: NextRequest, routeContext?: any) => string | undefined | Promise<string | undefined>;
}

export function withApiWrapper(
  handler: (
    request: NextRequest,
    context: { requestId: string; logger: ReturnType<typeof createRequestLogger>; validatedBody?: any },
    routeContext?: any
  ) => Promise<NextResponse>,
  options: ApiHandlerOptions = {}
) {
  return async (request: NextRequest, routeContext?: any): Promise<NextResponse> => {
    const requestId = getRequestId(request);
    const logger = createRequestLogger(requestId, {
      method: request.method,
      path: request.nextUrl.pathname,
    });

    const startTime = Date.now();

    try {
      // Rate limiting
      const sessionId = options.rateLimitSessionId
        ? await (options.rateLimitSessionId(request, routeContext) || Promise.resolve(undefined))
        : undefined;
      const rateLimitResult = await checkRateLimit(request, sessionId);
      
      if (!rateLimitResult.allowed) {
        logger.warn({ sessionId }, 'Rate limit exceeded');
        return createRateLimitResponse(rateLimitResult.msBeforeNext);
      }

      // Body validation - store validated body for handler access
      let validatedBody: any = undefined;
      if (options.validateBody) {
        try {
          const body = await request.json().catch(() => ({}));
          validatedBody = options.validateBody.parse(body);
        } catch (error) {
          if (error instanceof ZodError) {
            logger.warn({ errors: error.issues }, 'Validation error');
            return NextResponse.json(
              {
                error: 'Validation failed',
                details: error.issues,
                requestId,
              },
              { status: 400 }
            );
          }
          throw error;
        }
      }

      // Query validation
      if (options.validateQuery) {
        try {
          const query = Object.fromEntries(request.nextUrl.searchParams);
          const validated = options.validateQuery.parse(query);
          // Could create new URL with validated params if needed
        } catch (error) {
          if (error instanceof ZodError) {
            logger.warn({ errors: error.issues }, 'Query validation error');
            return NextResponse.json(
              {
                error: 'Query validation failed',
                details: error.issues,
                requestId,
              },
              { status: 400 }
            );
          }
          throw error;
        }
      }

      // Session ID requirement
      if (options.requireSessionId && !sessionId) {
        logger.warn('Session ID required but not provided');
        return NextResponse.json(
          {
            error: 'Session ID is required',
            requestId,
          },
          { status: 400 }
        );
      }

      // Execute handler with validated body if available
      const handlerContext = {
        requestId,
        logger,
        validatedBody,
      };
      const response = await handler(request, handlerContext, routeContext);

      // Add request ID to response headers
      response.headers.set('x-request-id', requestId);

      const duration = Date.now() - startTime;
      logger.info(
        {
          status: response.status,
          duration,
        },
        'Request completed'
      );

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          duration,
        },
        'Request failed'
      );

      return NextResponse.json(
        {
          error: 'Internal server error',
          requestId,
        },
        { status: 500 }
      );
    }
  };
}

