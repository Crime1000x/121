// app/api/auth/poll/route.ts
import { NextRequest, NextResponse } from 'next/server';
import redis from '@/lib/db/redis';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  // 1. 检查 Redis 中是否有这个 token 的数据
  const dataStr = await redis.get(`login:${token}`);

  if (dataStr) {
    const userData = JSON.parse(dataStr);

    // 2. 验证成功，设置 Cookie
    const response = NextResponse.json({ success: true });
    
    response.cookies.set({
      name: 'auth_session',
      value: JSON.stringify(userData),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7天
    });

    // 3. 登录成功后，删除 Redis 中的临时 key (防止重放)
    await redis.del(`login:${token}`);

    return response;
  }

  // 3. 还在等待验证
  return NextResponse.json({ success: false, status: 'pending' });
}