import { NextRequest, NextResponse } from 'next/server';
import { NetworkService } from '@/services/network.service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const cluster = searchParams.get('cluster') || 'Semua cluster';

    const clusters = await NetworkService.listClusters(search, cluster);
    const stats = await NetworkService.getNetworkStats();

    return NextResponse.json({
      success: true,
      data: {
        clusters,
        stats,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'CLUSTER_FETCH_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
