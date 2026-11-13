import { NextRequest, NextResponse } from 'next/server';
import { startTicketExecutionSchema } from '@repo/shared';
import { TicketService } from '@/server/services/ticket.service';
import { resolveTechActor, handleTechRouteError } from '@/server/lib/tech-auth';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveTechActor(request);
    const { id } = await params;

    let rawBody: Record<string, unknown> = {};
    try {
      const parsed: unknown = await request.json();
      if (parsed && typeof parsed === 'object') {
        rawBody = parsed as Record<string, unknown>;
      }
    } catch {
      // Allow empty POST body when vendor clicks quick "Mulai Eksekusi"
    }

    const validated = startTicketExecutionSchema.parse({
      channel: actor.channel,
      ...rawBody,
    });

    const updated = await TicketService.startExecutionByTechnician(id, validated, {
      id: actor.userId,
      username: actor.canonicalUsername,
    });

    return NextResponse.json({
      success: true,
      data: updated,
      meta: {
        message: 'Eksekusi lapangan dimulai. Status tiket diperbarui menjadi Dalam proses.',
      },
    });
  } catch (error: unknown) {
    return handleTechRouteError(error, 'START_EXECUTION_ERROR', 'Gagal memulai eksekusi tiket');
  }
}

