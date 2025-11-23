#!/bin/bash

echo "修复 prediction-engine-v3.ts..."

# 备份
cp src/lib/utils/prediction-engine-v3.ts src/lib/utils/prediction-engine-v3.ts.backup2

# 检查 src/types/index.ts 是否有必要的接口
if ! grep -q "export interface PredictionFactor" src/types/index.ts; then
  echo "添加缺失的接口到 src/types/index.ts..."
  
  cat >> src/types/index.ts << 'TYPEEOF'

// 预测引擎接口
export interface PredictionFactor {
  name: string;
  score: number;
  weight: number;
  description: string;
  icon: string;
}

export interface PredictionResult {
  teamAProbability: number;
  teamBProbability: number;
  confidence: number;
  factors: PredictionFactor[];
  recommendation: 'STRONG_A' | 'LEAN_A' | 'NEUTRAL' | 'LEAN_B' | 'STRONG_B';
  marketValue: 'OVERVALUED_A' | 'FAIR' | 'OVERVALUED_B' | 'VALUE_A' | 'VALUE_B';
  reasoning: string[];
  modelVersion: string;
}
TYPEEOF

  echo "✅ 接口已添加到 types/index.ts"
fi

# 修改 prediction-engine-v3.ts 的导入
# 删除 interface 定义，改为从 @/types 导入
python3 << 'PYEOF'
import re

with open('src/lib/utils/prediction-engine-v3.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 修改导入语句，添加 PredictionFactor 和 PredictionResult
content = re.sub(
    r"import \{ H2HStats, AdvancedTeamStats, TeamInjuries \} from '@/types';",
    "import { H2HStats, AdvancedTeamStats, TeamInjuries, PredictionFactor, PredictionResult } from '@/types';",
    content
)

# 删除 export interface PredictionFactor 定义
content = re.sub(
    r'export interface PredictionFactor \{[^}]+\}\s*',
    '',
    content,
    flags=re.DOTALL
)

# 删除 export interface PredictionResult 定义
content = re.sub(
    r'export interface PredictionResult \{[^}]+\}\s*',
    '',
    content,
    flags=re.DOTALL
)

with open('src/lib/utils/prediction-engine-v3.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ prediction-engine-v3.ts 已修复")
PYEOF

echo ""
echo "验证修改..."
head -20 src/lib/utils/prediction-engine-v3.ts | grep "^import"

echo ""
echo "重启应用..."
pm2 restart polynba

echo ""
echo "等待 5 秒..."
sleep 5

echo ""
echo "测试 API..."
curl -s http://127.0.0.1:3000/api/cron/update-predictions \
  -H "Authorization: Bearer poly_secret_8888" | python3 -m json.tool 2>/dev/null || echo "测试失败，查看错误日志"

