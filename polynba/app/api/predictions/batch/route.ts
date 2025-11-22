import { NextResponse } from 'next/server';
import redis from '@/lib/db/redis';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { marketIds } = body;

    if (!Array.isArray(marketIds) || marketIds.length === 0) {
      return NextResponse.json({});
    }

    // 使用 Pipeline 批量读取
    const pipeline = redis.pipeline();
    marketIds.forEach((id: string) => pipeline.get(`prediction:${id}`));
    const results = await pipeline.exec();
    
    const predictions: Record<string, number> = {};
    
    if (results) {
        results.forEach((res, idx) => {
            const [err, data] = res;
            if (!err && data && typeof data === 'string') {
               try {
                   // 1. 尝试作为 JSON 解析 (AnalyticsService 写入的格式)
                   // 格式: { ..., predictedProbabilityA: 0.65, ... }
                   if (data.startsWith('{')) {
                       const record = JSON.parse(data);
                       if (record && typeof record.predictedProbabilityA === 'number') {
                           predictions[marketIds[idx]] = record.predictedProbabilityA;
                       }
                   } else {
                       // 2. 兼容旧格式 (纯数字字符串 "0.65")
                       const val = parseFloat(data);
                       if (!isNaN(val)) {
                           predictions[marketIds[idx]] = val;
                       }
                   }
               } catch (e) {
                   console.error(`Parse error for ${marketIds[idx]}:`, e);
                   // 解析失败时不设置值，让前端回退到基础算法
               }
            }
        });
    }

    return NextResponse.json(predictions);
  } catch (error) {
    console.error('Redis batch fetch error:', error);
    return NextResponse.json({}, { status: 500 });
  }
}