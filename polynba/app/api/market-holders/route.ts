import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

interface Holder {
  proxyWallet: string;
  pseudonym?: string;
  amount: number;
  outcomeIndex: number;
}

interface HolderGroup {
  token: string;
  holders: Holder[];
}

interface MarketHoldersData {
  yesHolders: Holder[];
  noHolders: Holder[];
  yesTotalAmount: number;
  noTotalAmount: number;
  whaleConcentration: number;
  smartMoneyDirection: 'YES' | 'NO' | 'NEUTRAL';
  top10Concentration: number;
}

/**
 * GET /api/market-holders?conditionId=xxx&limit=20
 * 获取市场大户持仓数据
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const conditionId = searchParams.get('conditionId');
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!conditionId) {
      return NextResponse.json(
        { error: 'conditionId is required' },
        { status: 400 }
      );
    }

    logger.info(`Fetching holders for condition ${conditionId}`);

    // 调用 Polymarket Data API
    const holdersUrl = `https://data-api.polymarket.com/holders`;
    const response = await fetch(`${holdersUrl}?market=${conditionId}&limit=${Math.min(limit, 500)}&minBalance=1`, {
      headers: {
        'User-Agent': 'PolyNBA/1.0',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      logger.error(`Polymarket API error: ${response.status}`);
      return NextResponse.json(
        { error: 'Failed to fetch holders data' },
        { status: response.status }
      );
    }

    const holderGroups: HolderGroup[] = await response.json();

    // 解析数据：分离 Yes 和 No 持仓
    let yesHolders: Holder[] = [];
    let noHolders: Holder[] = [];

    holderGroups.forEach(group => {
      const holders = group.holders || [];
      
      holders.forEach(holder => {
        // outcomeIndex 0 通常是 Yes/Team A，1 是 No/Team B
        if (holder.outcomeIndex === 0) {
          yesHolders.push(holder);
        } else if (holder.outcomeIndex === 1) {
          noHolders.push(holder);
        }
      });
    });

    // 排序（按持仓量降序）
    yesHolders.sort((a, b) => b.amount - a.amount);
    noHolders.sort((a, b) => b.amount - a.amount);

    // 计算总持仓
    const yesTotalAmount = yesHolders.reduce((sum, h) => sum + h.amount, 0);
    const noTotalAmount = noHolders.reduce((sum, h) => sum + h.amount, 0);

    // 计算前10名集中度（占总持仓的百分比）
    const top10YesAmount = yesHolders.slice(0, 10).reduce((sum, h) => sum + h.amount, 0);
    const top10NoAmount = noHolders.slice(0, 10).reduce((sum, h) => sum + h.amount, 0);
    const totalAmount = yesTotalAmount + noTotalAmount;
    const top10Concentration = totalAmount > 0 
      ? ((top10YesAmount + top10NoAmount) / totalAmount) * 100 
      : 0;

    // 计算大户集中度（前3名）
    const top3YesAmount = yesHolders.slice(0, 3).reduce((sum, h) => sum + h.amount, 0);
    const top3NoAmount = noHolders.slice(0, 3).reduce((sum, h) => sum + h.amount, 0);
    const whaleConcentration = totalAmount > 0
      ? ((top3YesAmount + top3NoAmount) / totalAmount) * 100
      : 0;

    // 判断聪明钱方向（前10名大户的偏好）
    let smartMoneyDirection: 'YES' | 'NO' | 'NEUTRAL' = 'NEUTRAL';
    if (top10YesAmount > top10NoAmount * 1.3) {
      smartMoneyDirection = 'YES';
    } else if (top10NoAmount > top10YesAmount * 1.3) {
      smartMoneyDirection = 'NO';
    }

    const result: MarketHoldersData = {
      yesHolders: yesHolders.slice(0, limit),
      noHolders: noHolders.slice(0, limit),
      yesTotalAmount,
      noTotalAmount,
      whaleConcentration,
      smartMoneyDirection,
      top10Concentration,
    };

    logger.success(`Holders data fetched`, {
      yesHolders: yesHolders.length,
      noHolders: noHolders.length,
      smartMoney: smartMoneyDirection,
    });

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: Date.now(),
    });

  } catch (error) {
    logger.error('Market holders API error', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch market holders',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}