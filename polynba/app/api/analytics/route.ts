import { NextRequest, NextResponse } from 'next/server';
import { analyticsService } from '@/lib/services/analytics-service';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analytics
 * 获取模型表现指标
 * 
 * Query params:
 *   - days: 统计天数 (默认 30)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '30');

    // 验证参数
    if (days < 1 || days > 365) {
      return NextResponse.json(
        { error: 'Days must be between 1 and 365' },
        { status: 400 }
      );
    }

    logger.info(`Fetching analytics for last ${days} days`);

    const performance = await analyticsService.getModelPerformance(days);

    return NextResponse.json({
      success: true,
      data: performance,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Analytics API error', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch analytics',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/analytics/stats
 * 获取统计摘要
 */
export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();

    if (action === 'calibration') {
      // 生成校准表
      const calibrationTable = await analyticsService.generateCalibrationTable();

      return NextResponse.json({
        success: true,
        data: calibrationTable,
        message: 'Calibration table generated. Update prediction-engine-v3.ts with this data.',
      });
    }

    if (action === 'stats') {
      // 获取基础统计
      const [pendingCount, settledCount] = await Promise.all([
        analyticsService.getPendingCount(),
        analyticsService.getSettledCount(30),
      ]);

      return NextResponse.json({
        success: true,
        data: {
          pending: pendingCount,
          settled: settledCount,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    logger.error('Analytics POST error', error);
    return NextResponse.json(
      {
        error: 'Failed to process request',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}