// app/api/ai-predict/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60; 

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contextData } = body;

    console.log("🔹 [API Start] 收到预测请求");

    // 1. 检查 API Key (关键步骤)
    const apiKey = process.env.ZENMUX_API_KEY;
    if (!apiKey) {
      console.error("❌ [Server Error] 环境变量 ZENMUX_API_KEY 未找到！");
      return NextResponse.json({ 
        error: '配置错误: 服务器未读取到 ZENMUX_API_KEY，请检查 .env.local 文件并重启服务器。' 
      }, { status: 500 });
    }

    // 2. 准备请求数据
    const systemPrompt = `你是一位专业的 NBA 赛事分析师。
请基于用户提供的客观数据，并主动结合你所掌握的以往比赛历史以及网络上的最新资讯，运用你的篮球知识（球队风格、球星对位、战术克制等）进行分析。

任务要求：
1. 分析双方的关键胜负手。
2. 预测获胜方。
3. 给出一个 0-100 的获胜概率信心值。

请用简洁、专业的中文回答，严格遵守以下输出格式：
- 核心观点（100字以内）
- 关键因素（列出3点）
- 最终预测：[球队名] (信心: [xx]%)`;

    // ⚠️ 如果 "x-ai/grok-4.1-fast" 报错 404，请尝试改回 "grok-beta"
    const modelId = "x-ai/grok-4.1-fast"; 

    console.log(`🔹 [API Request] 正在请求 Zenmux, 模型: ${modelId}`);

    const response = await fetch('https://zenmux.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelId, 
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contextData }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    // 3. 捕获 Zenmux 的错误响应
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [Zenmux API Error] Status: ${response.status}, Body: ${errorText}`);
      
      // 将上游的错误直接返回给前端，方便在浏览器控制台看到
      return NextResponse.json({ 
        error: `AI 服务商报错 (${response.status}): ${errorText}` 
      }, { status: 500 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error("❌ [Response Error] 返回数据格式异常:", JSON.stringify(data));
      return NextResponse.json({ error: 'AI 返回了空内容' }, { status: 500 });
    }

    console.log("✅ [Success] 成功获取预测结果");
    return NextResponse.json({ result: content });

  } catch (error: any) {
    console.error('❌ [Critical Error] 代码执行崩溃:', error);
    return NextResponse.json({ 
      error: `服务器内部错误: ${error.message}` 
    }, { status: 500 });
  }
}