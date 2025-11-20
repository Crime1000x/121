import { NextResponse } from 'next/server';
import redis from '@/lib/db/redis';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { marketIds } = body;

    if (!Array.isArray(marketIds) || marketIds.length === 0) {
      return NextResponse.json({});
    }

    // 使用 Pipeline 批量读取，极大提高性能
    const pipeline = redis.pipeline();
    marketIds.forEach((id: string) => pipeline.get(`prediction:${id}`));
    const results = await pipeline.exec();
    
    const predictions: Record<string, number> = {};
    
    if (results) {
        results.forEach((res, idx) => {
            const [err, data] = res;
            // data 从 Redis 出来是 string，转成 number
            if (!err && data) {
               predictions[marketIds[idx]] = parseFloat(data as string);
            }
        });
    }

    return NextResponse.json(predictions);
  } catch (error) {
    console.error('Redis batch fetch error:', error);
    return NextResponse.json({}, { status: 500 });
  }
}