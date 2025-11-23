// app/api/telegram-webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import redis from '@/lib/db/redis'; // 确保你复用了之前的 Redis 实例

// 你的机器人 Token
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
// 你的 VIP 群组 ID
const GROUP_ID = process.env.TELEGRAM_GROUP_ID!;

export async function POST(request: NextRequest) {
  try {
    const update = await request.json();

    // 1. 检查是否是消息
    if (!update.message || !update.message.text) {
      return NextResponse.json({ ok: true });
    }

    const message = update.message;
    const text = message.text;
    const chatId = message.chat.id;
    const userId = message.from.id;
    const username = message.from.username || message.from.first_name;

    // 2. 检查是否是登录指令: /start <login_token>
    if (text.startsWith('/start ')) {
      const loginToken = text.split(' ')[1]; // 获取 token

      if (loginToken) {
        // 3. 验证用户是否在群组内
        const isMember = await checkGroupMembership(userId);

        if (isMember) {
          // A. 验证通过：将用户信息存入 Redis，键名为 login_token，有效期 5 分钟
          const userData = {
            id: userId,
            username: username,
            valid: true
          };
          
          // 存入 Redis: key="login:xyz...", value=user_data, ex=300s
          await redis.set(`login:${loginToken}`, JSON.stringify(userData), 'EX', 300);

          // B. 回复用户
          await sendMessage(chatId, "✅ 验证成功！网页即将自动跳转...");
        } else {
          // C. 验证失败
          await sendMessage(chatId, "🚫 验证失败：你不在指定的 VIP 群组内。");
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}

// 辅助函数：检查群成员资格
async function checkGroupMembership(userId: number): Promise<boolean> {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${GROUP_ID}&user_id=${userId}`;
    const res = await fetch(url);
    const data = await res.json();
    
    if (!data.ok) return false;
    
    const status = data.result.status;
    // 有效状态
    return ['creator', 'administrator', 'member', 'restricted'].includes(status);
  } catch (e) {
    console.error('Group Check Error:', e);
    return false;
  }
}

// 辅助函数：发送消息
async function sendMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text }),
  });
}