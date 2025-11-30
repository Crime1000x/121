import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

interface Holder {
  proxyWallet: string;
  pseudonym?: string;   // 用户名
  profileImage?: string; // 头像
  amount: number;
  outcomeIndex: number;
}

interface HolderGroup {
  token: string;
  holders: any[];
}

interface MarketHoldersData {
  yesHolders: Holder[];
  noHolders: Holder[];
  yesTotalAmount: number;
  noTotalAmount: number;
  whaleConcentration: number;
  smartMoneyDirection: 'YES' | 'NO' | 'NEUTRAL';
  top10Concentration: number;
}

/**
 * 辅助函数：通过 Data API Activity 接口获取用户信息
 * 方案来源：用户 Python 脚本验证有效
 * 接口：https://data-api.polymarket.com/activity?user={wallet}
 */
async function fetchUserProfiles(proxyWallets: string[]): Promise<Record<string, { name: string, image: string }>> {
  if (proxyWallets.length === 0) return {};

  const uniqueWallets = Array.from(new Set(proxyWallets)).filter(w => w && w !== '0x0');
  const profileMap: Record<string, { name: string, image: string }> = {};

  // 并行请求，限制并发数
  const BATCH_SIZE = 5;
  for (let i = 0; i < uniqueWallets.length; i += BATCH_SIZE) {
    const batch = uniqueWallets.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (wallet) => {
      try {
        // 🚨 核心修复：使用 Data API 的 Activity 接口
        // limit=1: 只需要最新一条活动记录即可提取用户信息
        const res = await fetch(`https://data-api.polymarket.com/activity?user=${wallet}&limit=1`, {
          headers: { 'User-Agent': 'PolyNBA/1.0' }, // 简单的 UA 即可
          next: { revalidate: 600 } // 缓存 10 分钟
        });
        
        if (res.ok) {
          const data = await res.json();
          // 响应是一个数组
          if (Array.isArray(data) && data.length > 0) {
            const userInfo = data[0];
            
            // 根据 Python 脚本逻辑提取字段
            // Python: username = user_info.get('name', '未知')
            // Python: avatar_url = user_info.get('profileImage', '无头像')
            const name = userInfo.name || userInfo.username || userInfo.displayUsername || '';
            const image = userInfo.profileImage || userInfo.profileImageOptimized || '';

            if (name || image) {
              profileMap[wallet] = { name, image };
            }
          }
        }
      } catch (e) {
        console.error(`Fetch profile failed for ${wallet}:`, e);
      }
    }));
  }

  return profileMap;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const conditionId = searchParams.get('conditionId');
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!conditionId) {
      return NextResponse.json({ error: 'conditionId is required' }, { status: 400 });
    }

    // 1. 确定映射 (0=Yes, 1=No) - 保持之前的正确逻辑
    const yesIndex = 0;
    const noIndex = 1;

    // 2. 获取持仓数据
    const holdersUrl = `https://data-api.polymarket.com/holders`;
    const response = await fetch(`${holdersUrl}?market=${conditionId}&limit=${limit}&minBalance=1`, {
      headers: { 'User-Agent': 'PolyNBA/1.0' },
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch holders data' }, { status: response.status });
    }

    const holderGroups: HolderGroup[] = await response.json();

    let yesHoldersRaw: Holder[] = [];
    let noHoldersRaw: Holder[] = [];

    // 3. 解析数据
    holderGroups.forEach(group => {
      const holders = group.holders || [];
      holders.forEach(rawHolder => {
        const holder: Holder = {
          proxyWallet: rawHolder.proxyWallet || rawHolder.address || '',
          amount: rawHolder.amount,
          outcomeIndex: rawHolder.outcomeIndex,
        };

        if (holder.outcomeIndex === yesIndex) yesHoldersRaw.push(holder);
        else if (holder.outcomeIndex === noIndex) noHoldersRaw.push(holder);
      });
    });

    // 4. 排序
    yesHoldersRaw.sort((a, b) => b.amount - a.amount);
    noHoldersRaw.sort((a, b) => b.amount - a.amount);

    // 5. 提取需要查询的 Proxy Wallet
    const topYes = yesHoldersRaw.slice(0, 10);
    const topNo = noHoldersRaw.slice(0, 10);
    const walletsToFetch = [...topYes.map(h => h.proxyWallet), ...topNo.map(h => h.proxyWallet)];

    // 6. 🚀 执行新的 API 查询用户信息
    const profiles = await fetchUserProfiles(walletsToFetch);

    // 7. 注入用户信息
    const enrichHolder = (h: Holder) => ({
      ...h,
      pseudonym: profiles[h.proxyWallet]?.name || undefined,
      profileImage: profiles[h.proxyWallet]?.image || undefined
    });

    const yesHolders = yesHoldersRaw.map(enrichHolder);
    const noHolders = noHoldersRaw.map(enrichHolder);

    // 8. 统计数据
    const yesTotalAmount = yesHolders.reduce((sum, h) => sum + h.amount, 0);
    const noTotalAmount = noHolders.reduce((sum, h) => sum + h.amount, 0);
    
    const top10Concentration = (yesTotalAmount + noTotalAmount) > 0 
      ? ((yesHolders.slice(0, 10).reduce((s, h) => s + h.amount, 0) + noHolders.slice(0, 10).reduce((s, h) => s + h.amount, 0)) / (yesTotalAmount + noTotalAmount)) * 100 
      : 0;
    
    const whaleConcentration = (yesTotalAmount + noTotalAmount) > 0
      ? ((yesHolders.slice(0, 3).reduce((s, h) => s + h.amount, 0) + noHolders.slice(0, 3).reduce((s, h) => s + h.amount, 0)) / (yesTotalAmount + noTotalAmount)) * 100
      : 0;

    let smartMoneyDirection: 'YES' | 'NO' | 'NEUTRAL' = 'NEUTRAL';
    // 简单数量判断 (前端会进行价值修正)
    const top10YesAmt = yesHolders.slice(0, 10).reduce((s, h) => s + h.amount, 0);
    const top10NoAmt = noHolders.slice(0, 10).reduce((s, h) => s + h.amount, 0);
    
    if (top10YesAmt > top10NoAmt * 1.3) smartMoneyDirection = 'YES';
    else if (top10NoAmt > top10YesAmt * 1.3) smartMoneyDirection = 'NO';

    const result: MarketHoldersData = {
      yesHolders: yesHolders.slice(0, limit),
      noHolders: noHolders.slice(0, limit),
      yesTotalAmount,
      noTotalAmount,
      whaleConcentration,
      smartMoneyDirection,
      top10Concentration,
    };

    return NextResponse.json({ success: true, data: result, timestamp: Date.now() });

  } catch (error) {
    logger.error('Market holders API error', error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}