import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import https from 'https';

// ============ 配置 ============

const BITMEX_API_HOST = 'www.bitmex.com';

// Symbol 映射
const SYMBOL_MAP: Record<string, string> = {
    'BTCUSD': 'XBTUSD',
    'ETHUSD': 'ETHUSD',
    'XBTUSD': 'XBTUSD',
};

// 时间周期（分钟）
const TIMEFRAME_MINUTES: Record<string, number> = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '30m': 30,
    '1h': 60,
    '4h': 240,
    '1d': 1440,
    '1w': 10080,
};

// 本地数据源映射
const TIMEFRAME_SOURCE: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '5m',
    '30m': '5m',
    '1h': '1h',
    '4h': '1h',
    '1d': '1d',
    '1w': '1d',
};

// BitMEX 支持的时间周期
const BITMEX_SUPPORTED = ['1m', '5m', '1h', '1d'];

// ============ 类型 ============

interface OHLCVCandle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

// ============ 缓存 ============

const dataCache = new Map<string, { candles: OHLCVCandle[]; loadedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

// ============ 本地数据加载 ============

function loadLocalOHLCV(symbol: string, sourceTimeframe: string): OHLCVCandle[] | null {
    const cacheKey = `local_${symbol}_${sourceTimeframe}`;
    const cached = dataCache.get(cacheKey);

    if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
        return cached.candles;
    }

    const dataDir = path.join(process.cwd(), 'data', 'ohlcv');
    const filename = path.join(dataDir, `${symbol}_${sourceTimeframe}.csv`);

    if (!fs.existsSync(filename)) {
        console.log(`[OHLCV] Local file not found: ${filename}`);
        return null;
    }

    try {
        const content = fs.readFileSync(filename, 'utf-8');
        const records = parse(content, {
            columns: true,
            skip_empty_lines: true,
        });

        const candles: OHLCVCandle[] = [];

        for (const r of records) {
            const time = Math.floor(new Date(r.timestamp).getTime() / 1000);
            const open = parseFloat(r.open);
            const high = parseFloat(r.high);
            const low = parseFloat(r.low);
            const close = parseFloat(r.close);
            const volume = parseFloat(r.volume) || 0;

            if (!isNaN(open) && !isNaN(close) && !isNaN(time)) {
                candles.push({ time, open, high, low, close, volume });
            }
        }

        candles.sort((a, b) => a.time - b.time);
        dataCache.set(cacheKey, { candles, loadedAt: Date.now() });

        console.log(`[OHLCV] Loaded ${candles.length} local candles for ${symbol} ${sourceTimeframe}`);
        return candles;
    } catch (error) {
        console.error(`[OHLCV] Error loading local file:`, error);
        return null;
    }
}

// ============ BitMEX 实时数据 ============

async function fetchBitmexOHLCV(
    symbol: string,
    binSize: string,
    count: number = 500,
    startTime?: string
): Promise<OHLCVCandle[]> {
    return new Promise((resolve, reject) => {
        const params: Record<string, string> = {
            symbol,
            binSize,
            count: count.toString(),
            partial: 'true',
            reverse: 'true', // 最新的在前
        };

        if (startTime) params.startTime = startTime;

        const query = new URLSearchParams(params).toString();
        const reqPath = `/api/v1/trade/bucketed?${query}`;

        const options = {
            hostname: BITMEX_API_HOST,
            port: 443,
            path: reqPath,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    if (res.statusCode && res.statusCode >= 400) {
                        console.error(`[BitMEX] API Error ${res.statusCode}:`, data);
                        resolve([]); // 返回空数组，不中断服务
                        return;
                    }
                    const json = JSON.parse(data);
                    const candles: OHLCVCandle[] = json
                        .filter((d: any) => d.open && d.high && d.low && d.close)
                        .map((d: any) => ({
                            time: Math.floor(new Date(d.timestamp).getTime() / 1000),
                            open: d.open,
                            high: d.high,
                            low: d.low,
                            close: d.close,
                            volume: d.volume || 0,
                        }));
                    resolve(candles);
                } catch (e) {
                    console.error(`[BitMEX] Parse error:`, e);
                    resolve([]);
                }
            });
        });

        req.on('error', (e) => {
            console.error(`[BitMEX] Request error:`, e);
            resolve([]);
        });
        req.end();
    });
}

// ============ K 线聚合 ============

function aggregateCandles(
    candles: OHLCVCandle[],
    targetMinutes: number,
    sourceMinutes: number
): OHLCVCandle[] {
    if (candles.length === 0) return [];

    const ratio = Math.round(targetMinutes / sourceMinutes);
    if (ratio <= 1) return candles;

    const bucketSeconds = targetMinutes * 60;
    const buckets = new Map<number, OHLCVCandle[]>();

    for (const candle of candles) {
        const bucketTime = Math.floor(candle.time / bucketSeconds) * bucketSeconds;
        if (!buckets.has(bucketTime)) {
            buckets.set(bucketTime, []);
        }
        buckets.get(bucketTime)!.push(candle);
    }

    const result: OHLCVCandle[] = [];

    for (const [bucketTime, candlesInBucket] of buckets) {
        if (candlesInBucket.length === 0) continue;

        candlesInBucket.sort((a, b) => a.time - b.time);

        result.push({
            time: bucketTime,
            open: candlesInBucket[0].open,
            high: Math.max(...candlesInBucket.map((c) => c.high)),
            low: Math.min(...candlesInBucket.map((c) => c.low)),
            close: candlesInBucket[candlesInBucket.length - 1].close,
            volume: candlesInBucket.reduce((sum, c) => sum + c.volume, 0),
        });
    }

    result.sort((a, b) => a.time - b.time);
    return result;
}

// ============ 合并本地和实时数据 ============

function mergeCandles(localCandles: OHLCVCandle[], liveCandles: OHLCVCandle[]): OHLCVCandle[] {
    if (localCandles.length === 0) return liveCandles;
    if (liveCandles.length === 0) return localCandles;

    // 找到本地数据的最后时间
    const lastLocalTime = localCandles[localCandles.length - 1].time;

    // 过滤出比本地数据更新的实时数据
    const newCandles = liveCandles.filter((c) => c.time > lastLocalTime);

    // 更新本地数据的最后一根 K 线（如果实时数据有相同时间的）
    const lastLocalCandle = localCandles[localCandles.length - 1];
    const matchingLiveCandle = liveCandles.find((c) => c.time === lastLocalTime);

    if (matchingLiveCandle) {
        // 用实时数据更新最后一根 K 线
        lastLocalCandle.high = Math.max(lastLocalCandle.high, matchingLiveCandle.high);
        lastLocalCandle.low = Math.min(lastLocalCandle.low, matchingLiveCandle.low);
        lastLocalCandle.close = matchingLiveCandle.close;
        lastLocalCandle.volume = matchingLiveCandle.volume;
    }

    // 合并
    const merged = [...localCandles, ...newCandles];
    merged.sort((a, b) => a.time - b.time);

    return merged;
}

// ============ 主 API ============

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const displaySymbol = searchParams.get('symbol') || 'BTCUSD';
    const timeframe = searchParams.get('timeframe') || '1d';
    const mode = searchParams.get('mode') || 'hybrid'; // 'local', 'live', 'hybrid'

    try {
        const bitmexSymbol = SYMBOL_MAP[displaySymbol] || displaySymbol;
        const sourceTimeframe = TIMEFRAME_SOURCE[timeframe] || timeframe;
        const targetMinutes = TIMEFRAME_MINUTES[timeframe] || 1440;
        const sourceMinutes = TIMEFRAME_MINUTES[sourceTimeframe] || targetMinutes;

        let candles: OHLCVCandle[] = [];
        let source = 'unknown';

        // 模式 1: 纯本地数据
        if (mode === 'local') {
            const localCandles = loadLocalOHLCV(bitmexSymbol, sourceTimeframe);
            if (localCandles) {
                candles = localCandles;
                source = 'local';
            }
        }
        // 模式 2: 纯实时数据
        else if (mode === 'live') {
            if (BITMEX_SUPPORTED.includes(sourceTimeframe)) {
                candles = await fetchBitmexOHLCV(bitmexSymbol, sourceTimeframe, 1000);
                candles.sort((a, b) => a.time - b.time);
                source = 'bitmex-live';
            } else {
                return NextResponse.json(
                    { error: `Live mode not supported for ${timeframe}. Use 1m, 5m, 1h, or 1d.` },
                    { status: 400 }
                );
            }
        }
        // 模式 3: 混合模式（默认）- 本地历史 + 实时最新
        else {
            // 加载本地数据
            const localCandles = loadLocalOHLCV(bitmexSymbol, sourceTimeframe) || [];

            // 如果 BitMEX 支持该时间周期，获取最新数据
            if (BITMEX_SUPPORTED.includes(sourceTimeframe)) {
                const liveCandles = await fetchBitmexOHLCV(bitmexSymbol, sourceTimeframe, 100);
                candles = mergeCandles(localCandles, liveCandles);
                source = localCandles.length > 0 ? 'hybrid' : 'bitmex-live';
                console.log(`[OHLCV] Merged: ${localCandles.length} local + ${liveCandles.length} live = ${candles.length} total`);
            } else {
                candles = localCandles;
                source = 'local';
            }
        }

        // 聚合到目标时间周期
        if (targetMinutes !== sourceMinutes && candles.length > 0) {
            candles = aggregateCandles(candles, targetMinutes, sourceMinutes);
        }

        // 限制返回数量
        const maxCandles: Record<string, number> = {
            '1m': 10000,
            '5m': 10000,
            '15m': 10000,
            '30m': 10000,
            '1h': 50000,
            '4h': 50000,
            '1d': 50000,
            '1w': 50000,
        };

        const limit = maxCandles[timeframe] || 10000;
        const totalCandles = candles.length;

        if (candles.length > limit) {
            candles = candles.slice(-limit);
        }

        console.log(`[OHLCV] Returning ${candles.length} candles for ${displaySymbol} ${timeframe} (source: ${source})`);

        return NextResponse.json({
            candles,
            symbol: displaySymbol,
            timeframe,
            count: candles.length,
            totalAvailable: totalCandles,
            limited: totalCandles > limit,
            source,
            range: candles.length > 0
                ? {
                      start: new Date(candles[0].time * 1000).toISOString(),
                      end: new Date(candles[candles.length - 1].time * 1000).toISOString(),
                  }
                : null,
        });
    } catch (error) {
        console.error('[OHLCV] Error:', error);
        return NextResponse.json(
            {
                error: 'Failed to fetch OHLCV data',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}
