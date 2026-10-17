import { NextRequest } from 'next/server';
import { eventBus } from '@/lib/services/event-bus';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ status: 'connected', time: new Date().toISOString() })}\n\n`));

      // Event listener
      const onOpsEvent = (event: any) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch (e) {
          // Stream might be closed
        }
      };

      eventBus.on('ops_event', onOpsEvent);

      // Heartbeat ping every 15s to keep connection open through proxies
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch (e) {
          clearInterval(heartbeat);
        }
      }, 15000);

      // Clean up on disconnect
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        eventBus.off('ops_event', onOpsEvent);
        try {
          controller.close();
        } catch (e) {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
