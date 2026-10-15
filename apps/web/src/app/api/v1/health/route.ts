import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    system: 'FiberOps On-Premise',
    timestamp: new Date().toISOString(),
  });
}
