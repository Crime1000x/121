// app/api/telegram-webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import redis from '@/lib/db/redis';

// 你的机器人 Token
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
// 获取所有群组 ID，并按逗号分割成数组，去除多余空格
const GROUP_IDS = (process.env.TELEGRAM_GROUP_ID || '')
  .split(',')
  .map(id => id.trim())
  .filter(id => id.length > 0);

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
        // 3. 验证用户是否在【任意一个】群组内
        const isMember = await checkAnyGroupMembership(userId);

        if (isMember) {
          // A. 验证通过：将用户信息存入 Redis
          const userData = {
            id: userId,
            username: username,
            valid: true
          };
          
          // 存入 Redis: 有效期 5 分钟
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

/**
 * 核心修改：检查用户是否在【任意一个】配置的群组中
 * 使用 Promise.all 并行查询，速度快
 */
async function checkAnyGroupMembership(userId: number): Promise<boolean> {
  if (GROUP_IDS.length === 0) {
    console.error("❌ 错误：未配置 TELEGRAM_GROUP_ID");
    return false;
  }

  try {
    // 并行发起所有群组的查询请求
    const checks = GROUP_IDS.map(async (groupId) => {
      try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${groupId}&user_id=${userId}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (!data.ok) return false;
        
        const status = data.result.status;
        // 有效状态: 群主、管理员、成员、受限成员(但在群里)
        return ['creator', 'administrator', 'member', 'restricted'].includes(status);
      } catch (e) {
        console.error(`Check group ${groupId} error:`, e);
        return false;
      }
    });

    // 等待所有查询结果
    const results = await Promise.all(checks);

    // 只要有一个结果是 true，就视为通过
    return results.some(isMember => isMember === true);
  } catch (e) {
    console.error('Group Check Error:', e);
    return false;
  }
}

// 辅助函数：发送消息
async function sendMessage(chatId: number, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text }),
    });
  } catch (e) {
    console.error('Send Message Error:', e);
  }
}