import { NextResponse } from 'next/server';
import https from 'https';

// BitMEX 公开 API - 不需要认证
const BITMEX_API_HOST = 'www.bitmex.com';

// 时间周期映射
const TIMEFRAME_MAP: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '1h': '1h',
    '1d': '1d',
};

// 从 BitMEX 获取 K 线数据
async function fetchBitmexOHLCV(
    symbol: string,
    binSize: string,
    count: number = 500,
    startTime?: string,
    endTime?: string
): Promise<any[]> {
    return new Promise((resolve, reject) => {
        const params: Record<string, string> = {
            symbol,
            binSize,
            count: count.toString(),
            partial: 'true', // 包含未完成的当前 K 线
        };

        if (startTime) params.startTime = startTime;
        if (endTime) params.endTime = endTime;

        const query = new URLSearchParams(params).toString();
        const path = `/api/v1/trade/bucketed?${query}`;

        const options = {
            hostname: BITMEX_API_HOST,
            port: 443,
            path,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(`BitMEX API Error ${res.statusCode}: ${data}`));
                        return;
                    }
                    const json = JSON.parse(data);
                    resolve(json);
                } catch (e) {
                    reject(new Error(`Parse error: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

// 转换 BitMEX 数据为前端格式
function convertCandles(bitmexData: any[]): any[] {
    return bitmexData
        .filter((d) => d.open && d.high && d.low && d.close)
        .map((d) => ({
            time: Math.floor(new Date(d.timestamp).getTime() / 1000),
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            volume: d.volume || 0,
        }))
        .sort((a, b) => a.time - b.time);
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const displaySymbol = searchParams.get('symbol') || 'BTCUSD';
    const timeframe = searchParams.get('timeframe') || '1d';
    const count = parseInt(searchParams.get('count') || '500');
    const startTime = searchParams.get('start') || undefined;
    const endTime = searchParams.get('end') || undefined;

    try {
        // 转换 symbol: BTCUSD -> XBTUSD
        const bitmexSymbol = displaySymbol.replace('BTC', 'XBT');
        const binSize = TIMEFRAME_MAP[timeframe] || '1d';

        // 检查是否是 BitMEX 支持的时间周期
        if (!['1m', '5m', '1h', '1d'].includes(binSize)) {
            return NextResponse.json(
                { error: `Timeframe ${timeframe} not supported by BitMEX API. Use 1m, 5m, 1h, or 1d.` },
                { status: 400 }
            );
        }

        console.log(`[OHLCV-Live] Fetching ${bitmexSymbol} ${binSize} from BitMEX...`);

        // 从 BitMEX 获取数据
        const bitmexData = await fetchBitmexOHLCV(
            bitmexSymbol,
            binSize,
            Math.min(count, 1000), // BitMEX 最多返回 1000 条
            startTime,
            endTime
        );

        const candles = convertCandles(bitmexData);

        console.log(`[OHLCV-Live] Got ${candles.length} candles`);

        return NextResponse.json({
            candles,
            symbol: displaySymbol,
            timeframe,
            count: candles.length,
            source: 'bitmex-live',
            range: candles.length > 0
                ? {
                      start: new Date(candles[0].time * 1000).toISOString(),
                      end: new Date(candles[candles.length - 1].time * 1000).toISOString(),
                  }
                : null,
        });
    } catch (error) {
        console.error('[OHLCV-Live] Error:', error);
        return NextResponse.json(
            {
                error: 'Failed to fetch OHLCV data from BitMEX',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}
