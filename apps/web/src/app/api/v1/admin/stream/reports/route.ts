import { NextRequest, NextResponse } from 'next/server';
import { sseBroadcaster } from '@/server/services/sse.service';
import { redisManager } from '@/server/lib/redis';
import {
  requireAdminActor,
  matchesAssignedClusters,
  handleAdminRouteError,
} from '@/server/lib/admin-auth';
import { ERROR_CODES, PERMISSIONS, SSE_HEADERS } from '@repo/shared';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  let actor;
  try {
    actor = await requireAdminActor(request, [
      PERMISSIONS.TICKET_READ,
      PERMISSIONS.NETWORK_READ,
    ]);
  } catch (error: unknown) {
    return handleAdminRouteError(
      error,
      ERROR_CODES.UNAUTHORIZED,
      'Sesi tidak diizinkan mengakses stream SSE',
    );
  }

  if (!sseBroadcaster.acquireConnection(actor.userId)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODES.RATE_LIMITED,
          message: 'Terlalu banyak koneksi SSE aktif untuk akun Anda.',
        },
      },
      { status: 429 },
    );
  }

  const encoder = new TextEncoder();
  let cleanupRef: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const intervals: Array<ReturnType<typeof setInterval>> = [];
      let unsubscribe = () => {};

      const cleanup = () => {
        if (closed) return;
        closed = true;
        for (const t of intervals) {
          clearInterval(t);
        }
        unsubscribe();
        sseBroadcaster.releaseConnection(actor.userId);
        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      };
      cleanupRef = cleanup;

      controller.enqueue(
        encoder.encode(
          `event: connected\ndata: ${JSON.stringify({ message: 'Connected to FiberOps SSE Stream' })}\n\n`,
        ),
      );

      unsubscribe = sseBroadcaster.subscribe((item) => {
        if (closed) return;
        try {
          if (!matchesAssignedClusters(actor, item.clusterName)) {
            return;
          }
          const payload = `event: report\ndata: ${JSON.stringify(item)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch (err) {
          console.error('Failed to enqueue SSE payload:', err);
        }
      });

      intervals.push(
        setInterval(() => {
          if (closed) return;
          void (async () => {
            try {
              const jtiRevoked = actor.jti
                ? (await redisManager.isJwtRevoked(actor.jti)) ||
                  (await redisManager.isSessionBlacklisted(actor.jti))
                : false;
              const sessionRevoked = actor.sessionId
                ? await redisManager.isSessionBlacklisted(actor.sessionId)
                : false;
              const deviceRevoked =
                actor.deviceId && actor.deviceId !== 'web-browser'
                  ? await redisManager.isSessionBlacklisted(actor.deviceId)
                  : false;

              if ((jtiRevoked || sessionRevoked || deviceRevoked) && !closed) {
                try {
                  controller.enqueue(
                    encoder.encode(
                      `event: revoked\ndata: ${JSON.stringify({ code: ERROR_CODES.SESSION_REVOKED })}\n\n`,
                    ),
                  );
                } catch {
                  // Ignore enqueue error if stream closed concurrently
                }
                cleanup();
                return;
              }

              if (!closed) {
                try {
                  controller.enqueue(encoder.encode(`event: ping\ndata: ${Date.now()}\n\n`));
                } catch {
                  cleanup();
                }
              }
            } catch {
              // Keep stream alive on transient check error
            }
          })();
        }, 15_000),
      );

      request.signal.addEventListener('abort', cleanup, { once: true });
    },
    cancel() {
      cleanupRef?.();
    },
  });

  return new Response(stream, {
    headers: SSE_HEADERS,
  });
}
