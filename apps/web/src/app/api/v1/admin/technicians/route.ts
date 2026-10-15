import { NextRequest, NextResponse } from 'next/server';
import { TechnicianService } from '@/services/technician.service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const cluster = searchParams.get('cluster') || 'Semua cluster';

    const techs = await TechnicianService.listTechnicians(search, cluster);

    return NextResponse.json({
      success: true,
      data: techs,
      meta: { count: techs.length },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'TECH_FETCH_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
