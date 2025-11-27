import { NextResponse } from 'next/server';
import { getApiConfig, hasValidApiConfig } from '@/lib/api-config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';

// BitMEX API 配置
const BITMEX_API_URL = 'www.bitmex.com';

interface SyncConfig {
    apiKey: string;
    apiSecret: string;
    symbol?: string;
}

// 生成 BitMEX API 签名
function generateSignature(
    method: string,
    endpoint: string,
    expires: number,
    body: string,
    apiSecret: string
): string {
    const message = method + endpoint + expires + body;
    return crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
}

// BitMEX API 请求
async function bitmexRequest(
    method: string,
    endpoint: string,
    params: Record<string, any>,
    config: SyncConfig
): Promise<any> {
    return new Promise((resolve, reject) => {
        const expires = Math.floor(Date.now() / 1000) + 60;
        
        let query = '';
        let body = '';
        
        if (method === 'GET' && Object.keys(params).length > 0) {
            query = '?' + new URLSearchParams(params as any).toString();
        } else if (method === 'POST') {
            body = JSON.stringify(params);
        }
        
        const fullPath = `/api/v1${endpoint}${query}`;
        const signature = generateSignature(method, fullPath, expires, body, config.apiSecret);
        
        const options = {
            hostname: BITMEX_API_URL,
            port: 443,
            path: fullPath,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'api-expires': expires.toString(),
                'api-key': config.apiKey,
                'api-signature': signature,
            },
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(`API Error ${res.statusCode}: ${JSON.stringify(json)}`));
                    } else {
                        resolve(json);
                    }
                } catch (e) {
                    reject(new Error(`Parse error: ${data}`));
                }
            });
        });
        
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

// 获取最新执行记录的时间戳
function getLastExecutionTime(): Date | null {
    const csvPath = path.join(process.cwd(), 'bitmex_executions.csv');
    
    if (!fs.existsSync(csvPath)) {
        return null;
    }
    
    try {
        const content = fs.readFileSync(csvPath, 'utf-8');
        const lines = content.trim().split('\n');
        
        if (lines.length < 2) {
            return null;
        }
        
        // 获取最后一行的时间戳
        const lastLine = lines[lines.length - 1];
        const fields = lastLine.split(',');
        const timestampField = fields[11]; // timestamp 字段
        
        if (timestampField) {
            return new Date(timestampField.replace(/"/g, ''));
        }
    } catch (e) {
        console.error('Error reading last execution time:', e);
    }
    
    return null;
}

// 追加新的执行记录到 CSV
function appendExecutions(executions: any[]): number {
    if (executions.length === 0) return 0;
    
    const csvPath = path.join(process.cwd(), 'bitmex_executions.csv');
    
    const csvRows = executions.map((e) => {
        return [
            e.execID,
            e.orderID,
            e.symbol,
            e.side,
            e.lastQty,
            e.lastPx,
            e.execType,
            e.ordType,
            e.ordStatus,
            e.execCost,
            e.execComm,
            e.timestamp,
            `"${(e.text || '').replace(/"/g, '""')}"`,
        ].join(',');
    }).join('\n');
    
    fs.appendFileSync(csvPath, csvRows + '\n');
    
    return executions.length;
}

// POST: 同步新数据
export async function POST(request: Request) {
    try {
        // 优先使用服务端配置
        const serverConfig = getApiConfig();
        let config: SyncConfig;
        
        if (hasValidApiConfig()) {
            // 使用服务端配置的 API 密钥
            config = {
                apiKey: serverConfig.apiKey,
                apiSecret: serverConfig.apiSecret,
            };
            console.log('[Sync] Using server-side API credentials');
        } else {
            // 回退到请求体中的凭据（向后兼容）
            const body = await request.json().catch(() => ({}));
            const { apiKey, apiSecret } = body;
            
            if (!apiKey || !apiSecret) {
                return NextResponse.json(
                    { error: 'API credentials not configured. Set BITMEX_API_KEY and BITMEX_API_SECRET in .env.local' },
                    { status: 400 }
                );
            }
            
            config = { apiKey, apiSecret };
            console.log('[Sync] Using request-provided API credentials');
        }
        
        // 获取上次同步的时间
        const lastSyncTime = getLastExecutionTime();
        const startTime = lastSyncTime 
            ? new Date(lastSyncTime.getTime() + 1) // 加 1 毫秒避免重复
            : new Date('2020-05-01');
        
        console.log(`[Sync] Starting sync from ${startTime.toISOString()}`);
        
        // 获取新的执行记录
        let allNewExecutions: any[] = [];
        let start = 0;
        const count = 500;
        
        while (true) {
            const executions = await bitmexRequest('GET', '/execution/tradeHistory', {
                count,
                start,
                reverse: false,
                startTime: startTime.toISOString(),
            }, config);
            
            if (!executions || executions.length === 0) {
                break;
            }
            
            allNewExecutions = allNewExecutions.concat(executions);
            
            if (executions.length < count) {
                break;
            }
            
            start += count;
            
            // 限制单次同步数量
            if (allNewExecutions.length >= 5000) {
                console.log('[Sync] Reached sync limit (5000 records)');
                break;
            }
            
            // 延迟避免 rate limit
            await new Promise(r => setTimeout(r, 500));
        }
        
        // 追加到 CSV
        const addedCount = appendExecutions(allNewExecutions);
        
        console.log(`[Sync] Added ${addedCount} new executions`);
        
        // 清除缓存 (触发重新加载)
        // 注意: 这需要重启服务器或使用更复杂的缓存失效机制
        
        return NextResponse.json({
            success: true,
            syncedFrom: startTime.toISOString(),
            newRecords: addedCount,
            message: `Successfully synced ${addedCount} new execution records`,
        });
        
    } catch (error) {
        console.error('[Sync] Error:', error);
        return NextResponse.json(
            { 
                error: 'Sync failed', 
                details: error instanceof Error ? error.message : 'Unknown error' 
            },
            { status: 500 }
        );
    }
}

// GET: 获取同步状态
export async function GET() {
    const lastSyncTime = getLastExecutionTime();
    const csvPath = path.join(process.cwd(), 'bitmex_executions.csv');
    
    let recordCount = 0;
    if (fs.existsSync(csvPath)) {
        const content = fs.readFileSync(csvPath, 'utf-8');
        recordCount = content.trim().split('\n').length - 1; // 减去 header
    }
    
    return NextResponse.json({
        lastSyncTime: lastSyncTime?.toISOString() || null,
        totalRecords: recordCount,
        dataFile: 'bitmex_executions.csv',
    });
}
