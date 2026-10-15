import { NextRequest, NextResponse } from 'next/server';
import { CustomerService } from '@/services/customer.service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const cluster = searchParams.get('cluster') || 'Semua cluster';
    const sia = searchParams.get('sia') || undefined;

    if (sia) {
      const detail = await CustomerService.getCustomerBySia(sia);
      return NextResponse.json({ success: true, data: detail });
    }

    const customers = await CustomerService.listCustomers(search, cluster);

    return NextResponse.json({
      success: true,
      data: customers,
      meta: { count: customers.length },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'CUSTOMER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
