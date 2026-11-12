import { NextRequest } from 'next/server';
import { sseBroadcaster } from '@/server/services/sse.service';
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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `event: connected\ndata: ${JSON.stringify({ message: 'Connected to FiberOps SSE Stream' })}\n\n`,
        ),
      );

      const unsubscribe = sseBroadcaster.subscribe((item) => {
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

      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`event: ping\ndata: ${Date.now()}\n\n`));
        } catch {
          clearInterval(interval);
        }
      }, 15000);

      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // ignore
        }
      });
    },
  });

  return new Response(stream, {
    headers: SSE_HEADERS,
  });
}
