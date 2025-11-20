import { NextRequest, NextResponse } from 'next/server';
import { getTopMarkets } from '@/lib/api/polymarket';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '20', 10);

  try {
    // Use the new implementation that fetches from ESPN + Polymarket events
    const markets = await getTopMarkets(limit);
    return NextResponse.json(markets);
  } catch (error) {
    console.error('Polymarket API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch markets' },
      { status: 500 }
    );
  }
}
