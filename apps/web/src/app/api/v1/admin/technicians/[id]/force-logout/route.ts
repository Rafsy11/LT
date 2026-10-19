import { NextRequest, NextResponse } from 'next/server';
import { TechnicianService } from '@/services/technician.service';

/**
 * POST /api/v1/admin/technicians/[id]/force-logout
 * Instant Session Revocation (PRD Section 2.2 & agent.md Law 4).
 * Revokes mobile user tokens and clears active session state in Redis/PostgreSQL.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const reason = body?.reason || 'Admin Force Logout (Sesi Dicabut)';

    const updated = await TechnicianService.forceLogoutTechnician(id, reason);

    return NextResponse.json({
      success: true,
      data: updated,
      message: `Sesi perangkat mobile untuk teknisi ${updated.fullName} (@${updated.username}) berhasil dicabut seketika (Force Logout).`,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORCE_LOGOUT_ERROR',
          message: error?.message || 'Gagal mencabut sesi perangkat teknisi',
        },
      },
      { status: 400 }
    );
  }
}
