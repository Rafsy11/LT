import { NextRequest, NextResponse } from 'next/server';
import { TechnicianService } from '@/services/technician.service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const updated = await TechnicianService.toggleTechnicianStatus(id, body.isActive, body.reason);

    return NextResponse.json({
      success: true,
      data: updated,
      message: `Akun teknisi ${updated.fullName} berhasil ${updated.isActive ? 'diaktifkan' : 'dinonaktifkan (sesi dicabut)'}`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'TECH_TOGGLE_ERROR', message: error.message } },
      { status: 400 }
    );
  }
}
