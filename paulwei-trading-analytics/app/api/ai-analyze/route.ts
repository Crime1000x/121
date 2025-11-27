import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// 初始化 Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    const { position } = await req.json();

    // 构建超强提示词
    const prompt = `
    作为一位拥有20年经验的顶级加密货币主观交易员，请用中文犀利地点评这笔历史交易。
    
    【交易数据】
    - 标的: ${position.symbol} (${position.side === 'Long' ? '做多' : '做空'})
    - 盈亏: $${position.pnl}
    - 最大回撤(MAE): ${position.mae}% (持有期间最大浮亏幅度)
    - 最大浮盈(MFE): ${position.mfe}% (持有期间最大浮盈幅度)
    - 进场评分: ${position.efficiency ? Math.round(position.efficiency * 100) : '未知'}/100

    【回答要求】
    1. **一针见血**：这笔交易是"神级操作"、"运气单"还是"韭菜行为"？
    2. **风险分析**：重点看MAE。如果MAE很大但最后赚钱了，请严厉批评这种"扛单"行为。
    3. **策略定性**：这是趋势单、突破单还是左侧摸底？
    4. **总结**：给出一个简短的改进建议。
    
    请使用Markdown格式，语气专业、幽默且带有指导性。不要讲废话。
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    return NextResponse.json({ analysis: response.text() });

  } catch (error) {
    console.error("Gemini Error:", error);
    return NextResponse.json({ error: "AI Service Unavailable" }, { status: 500 });
  }
}