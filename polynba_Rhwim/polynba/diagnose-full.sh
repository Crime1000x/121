#!/bin/bash

echo "==================================="
echo "完整诊断：Redis + Cron Job"
echo "==================================="
echo ""

# 获取端口
PORT=$(pm2 describe polynba | grep "PORT" | awk '{print $3}' | head -1)
if [ -z "$PORT" ]; then PORT=3000; fi
echo "🔌 项目端口: $PORT"
echo ""

# 1. 获取 marketIds
echo "1️⃣ Polymarket API 返回的 marketIds:"
MARKET_IDS=$(curl -s "http://127.0.0.1:${PORT}/api/polymarket?limit=5" | jq -r '.[] | .marketId')
echo "$MARKET_IDS"
FIRST_ID=$(echo "$MARKET_IDS" | head -1)
echo "📌 使用第一个 ID 进行测试: $FIRST_ID"
echo ""

# 2. 检查 Redis
echo "2️⃣ Redis 检查:"
echo "Redis 中的键总数:"
redis-cli -h 127.0.0.1 -p 6379 KEYS "prediction:*" | wc -l

echo "检查第一个 ID 是否在 Redis 中:"
redis-cli -h 127.0.0.1 -p 6379 GET "prediction:${FIRST_ID}"
echo ""

# 3. 测试批量读取
echo "3️⃣ 测试批量读取 API:"
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "{\"marketIds\":[\"$FIRST_ID\"]}" \
  "http://127.0.0.1:${PORT}/api/predictions/batch"
echo ""
echo ""

# 4. 检查 Cron Secret
echo "4️⃣ 检查 Cron Secret:"
if [ -z "$CRON_SECRET" ]; then
    echo "❌ CRON_SECRET 环境变量未设置"
    echo "   请运行: export CRON_SECRET='your-secret'"
else
    echo "✅ CRON_SECRET 已设置"
    
    # 5. 触发 Cron Job
    echo ""
    echo "5️⃣ 触发 Cron Job:"
    curl -s -X GET \
      -H "Authorization: Bearer $CRON_SECRET" \
      "http://127.0.0.1:${PORT}/api/cron/update-predictions" | jq '.'
fi
echo ""

echo "==================================="
echo "诊断完成"
echo "==================================="
echo ""
echo "📝 下一步："
echo "1. 如果 Redis 没有数据，运行: export CRON_SECRET='...' && ./diagnose-full.sh"
echo "2. 等待 30 秒后，再次检查 Redis"
echo "3. 刷新浏览器页面"
