#!/bin/bash

# PolyArena 综合测试脚本
# 测试所有关键功能并生成报告

echo "======================================"
echo "PolyArena 综合测试开始"
echo "时间: $(date)"
echo "======================================"
echo ""

# 测试计数
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试结果函数
pass_test() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    PASSED_TESTS=$((PASSED_TESTS + 1))
    echo -e "${GREEN}✅ 通过${NC}: $1"
}

fail_test() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    FAILED_TESTS=$((FAILED_TESTS + 1))
    echo -e "${RED}❌ 失败${NC}: $1"
    echo -e "   ${RED}原因${NC}: $2"
}

info_test() {
    echo -e "${YELLOW}ℹ️  信息${NC}: $1"
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 1: 服务器状态检查"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 检查端口 3004 是否有进程
if lsof -ti:3004 > /dev/null 2>&1; then
    pass_test "端口 3004 正在运行"
else
    fail_test "端口 3004 没有进程" "请运行 PORT=3004 npm run dev"
fi

# 检查服务器是否响应
if curl -s http://localhost:3004 > /dev/null; then
    pass_test "服务器响应正常"
else
    fail_test "服务器无响应" "无法访问 http://localhost:3004"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 2: API Endpoints"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 测试 NBA API
NBA_RESPONSE=$(curl -s "http://localhost:3004/api/polymarket?tag=NBA&limit=2")
NBA_COUNT=$(echo "$NBA_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(len(data))" 2>/dev/null)

if [ "$NBA_COUNT" -eq 2 ]; then
    pass_test "NBA API 返回正确数量的数据 (2个)"
else
    fail_test "NBA API 返回数量错误" "期望 2，实际 $NBA_COUNT"
fi

# 测试 NFL API
NFL_RESPONSE=$(curl -s "http://localhost:3004/api/polymarket?tag=NFL&limit=2")
NFL_COUNT=$(echo "$NFL_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(len(data))" 2>/dev/null)

if [ "$NFL_COUNT" -eq 2 ]; then
    pass_test "NFL API 返回正确数量的数据 (2个)"
else
    fail_test "NFL API 返回数量错误" "期望 2，实际 $NFL_COUNT"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 3: 数据结构验证"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 获取一个市场数据
TEST_DATA=$(curl -s "http://localhost:3004/api/polymarket?tag=NBA&limit=1")

# 测试 series 结构
SERIES_CHECK=$(echo "$TEST_DATA" | python3 << 'EOF'
import sys, json
try:
    data = json.load(sys.stdin)
    if not data:
        print("ERROR: 空数据")
        sys.exit(1)

    event = data[0]
    series = event.get('series', [])

    # 检查 series 是否为数组
    if not isinstance(series, list):
        print("ERROR: series 不是数组")
        sys.exit(1)

    if len(series) == 0:
        print("ERROR: series 数组为空")
        sys.exit(1)

    # 检查 series[0] 是否有 title
    if 'title' not in series[0]:
        print("ERROR: series[0] 没有 title")
        sys.exit(1)

    sport_name = series[0]['title']

    # 检查是否为字符串
    if not isinstance(sport_name, str):
        print(f"ERROR: sport 不是字符串，是 {type(sport_name)}")
        sys.exit(1)

    print(f"OK:{sport_name}")

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
EOF
)

if [[ "$SERIES_CHECK" == OK:* ]]; then
    SPORT_NAME="${SERIES_CHECK#OK:}"
    pass_test "series 结构正确，sport = \"$SPORT_NAME\""
else
    fail_test "series 结构错误" "$SERIES_CHECK"
fi

# 测试 markets 结构
MARKETS_CHECK=$(echo "$TEST_DATA" | python3 << 'EOF'
import sys, json
try:
    data = json.load(sys.stdin)
    event = data[0]

    if 'markets' not in event:
        print("ERROR: 没有 markets 字段")
        sys.exit(1)

    markets = event['markets']
    if not isinstance(markets, list):
        print("ERROR: markets 不是数组")
        sys.exit(1)

    if len(markets) == 0:
        print("ERROR: markets 数组为空")
        sys.exit(1)

    # 检查第一个 market 的结构
    market = markets[0]
    required_fields = ['id', 'question', 'outcomePrices']
    missing = [f for f in required_fields if f not in market]

    if missing:
        print(f"ERROR: market 缺少字段: {missing}")
        sys.exit(1)

    print(f"OK:{len(markets)}")

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
EOF
)

if [[ "$MARKETS_CHECK" == OK:* ]]; then
    MARKET_COUNT="${MARKETS_CHECK#OK:}"
    pass_test "markets 结构正确，包含 $MARKET_COUNT 个市场"
else
    fail_test "markets 结构错误" "$MARKETS_CHECK"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 4: 代码修复验证"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 检查 polymarket.ts 是否使用 API 代理
if grep -q "const API_BASE = '/api/polymarket'" "src/lib/api/polymarket.ts"; then
    pass_test "polymarket.ts 使用 API 代理"
else
    fail_test "polymarket.ts 未使用 API 代理" "应该使用 /api/polymarket"
fi

# 检查 sport 字段提取逻辑
if grep -q "sportName = event.series\[0\].title" "src/lib/api/polymarket.ts"; then
    pass_test "sport 字段提取逻辑正确"
else
    fail_test "sport 字段提取逻辑错误" "应该提取 series[0].title"
fi

# 检查 market detail page 是否移除了 use() hook
if grep -q "const { id } = use(params)" "app/market/[id]/page.tsx"; then
    fail_test "market detail page 仍使用 use() hook" "应该改为直接解构 params"
else
    pass_test "market detail page 已移除 use() hook"
fi

# 检查 params 类型是否正确
if grep -q "params: { id: string }" "app/market/[id]/page.tsx"; then
    pass_test "params 类型定义正确"
else
    fail_test "params 类型定义错误" "应该是 { id: string } 而不是 Promise"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 5: 文件完整性"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

REQUIRED_FILES=(
    "app/api/polymarket/route.ts"
    "src/lib/api/polymarket.ts"
    "app/page.tsx"
    "app/market/[id]/page.tsx"
    "src/lib/utils/cache.ts"
    "src/lib/utils/team-parser.ts"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        pass_test "文件存在: $file"
    else
        fail_test "文件缺失: $file" "请确认文件路径"
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 6: 缓存功能模拟"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 检查缓存逻辑是否包含非空验证
if grep -q "if (cached && cached.length > 0)" "app/page.tsx"; then
    pass_test "首页缓存包含非空验证"
else
    fail_test "首页缓存缺少非空验证" "应该检查 cached.length > 0"
fi

if grep -q "if (data && data.length > 0)" "app/page.tsx"; then
    pass_test "首页缓存写入包含非空验证"
else
    fail_test "首页缓存写入缺少非空验证" "应该检查 data.length > 0"
fi

echo ""
echo "======================================"
echo "测试总结"
echo "======================================"
echo -e "总测试数: ${TOTAL_TESTS}"
echo -e "${GREEN}通过: ${PASSED_TESTS}${NC}"
echo -e "${RED}失败: ${FAILED_TESTS}${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}🎉 所有测试通过！${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "✅ 服务器状态: 正常"
    echo "✅ API 功能: 正常"
    echo "✅ 数据结构: 正确"
    echo "✅ 代码修复: 完成"
    echo "✅ 文件完整性: 完整"
    echo "✅ 缓存逻辑: 正确"
    echo ""
    echo "现在可以安全地进行浏览器测试："
    echo "1. 打开 http://localhost:3004"
    echo "2. 按 F12 打开 DevTools"
    echo "3. 在 Console 执行: localStorage.clear()"
    echo "4. 刷新页面 (Cmd+R)"
    echo "5. 检查是否显示市场卡片"
    echo "6. 检查 Console 是否有错误"
    exit 0
else
    echo -e "\n${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}⚠️  有 $FAILED_TESTS 个测试失败${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "请检查上面的失败信息并修复问题。"
    exit 1
fi
