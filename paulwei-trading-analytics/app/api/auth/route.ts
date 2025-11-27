import { NextResponse } from 'next/server';
import { getApiConfig, hasValidApiConfig, getSafeApiInfo } from '@/lib/api-config';
import crypto from 'crypto';

// GET: 获取 API 配置状态和 WebSocket 认证信息
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // 获取配置状态
    if (action === 'status') {
        return NextResponse.json(getSafeApiInfo());
    }

    // 获取 WebSocket 认证参数
    if (action === 'ws-auth') {
        if (!hasValidApiConfig()) {
            return NextResponse.json(
                { error: 'API credentials not configured on server' },
                { status: 401 }
            );
        }

        const config = getApiConfig();
        const expires = Math.floor(Date.now() / 1000) + 3600; // 1 hour
        const message = `GET/realtime${expires}`;
        const signature = crypto
            .createHmac('sha256', config.apiSecret)
            .update(message)
            .digest('hex');

        return NextResponse.json({
            apiKey: config.apiKey,
            expires,
            signature,
            wsUrl: config.wsUrl,
        });
    }

    // 获取 REST API 签名（用于 API 调用）
    if (action === 'sign') {
        if (!hasValidApiConfig()) {
            return NextResponse.json(
                { error: 'API credentials not configured on server' },
                { status: 401 }
            );
        }

        const method = searchParams.get('method') || 'GET';
        const path = searchParams.get('path') || '';
        const body = searchParams.get('body') || '';

        const config = getApiConfig();
        const expires = Math.floor(Date.now() / 1000) + 60;
        const message = method + path + expires + body;
        const signature = crypto
            .createHmac('sha256', config.apiSecret)
            .update(message)
            .digest('hex');

        return NextResponse.json({
            apiKey: config.apiKey,
            expires,
            signature,
        });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
