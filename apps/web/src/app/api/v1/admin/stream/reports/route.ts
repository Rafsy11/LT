import { sseBroadcaster } from '@/services/sse.service';
import { SSE_HEADERS } from '@isp/shared';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ message: 'Connected to FiberOps SSE Stream' })}\n\n`));

      // Subscribe to real-time broadcaster
      const unsubscribe = sseBroadcaster.subscribe((item) => {
        try {
          const payload = `event: report\ndata: ${JSON.stringify(item)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch (err) {
          console.error('Failed to enqueue SSE payload:', err);
        }
      });

      // Keepalive ping every 15s to prevent intermediate proxy timeout
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`event: ping\ndata: ${Date.now()}\n\n`));
        } catch {
          clearInterval(interval);
        }
      }, 15000);

      // Clean up when client disconnects
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
