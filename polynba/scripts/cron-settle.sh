#!/bin/bash

# PolyNBA 结算比赛脚本
CRON_SECRET="poly_secret_8888"
API_URL="http://127.0.0.1:3000/api/cron/settle-predictions"
LOG_FILE="/www/wwwroot/polynba/logs/cron-settle.log"

# 确保日志目录存在
mkdir -p /www/wwwroot/polynba/logs

# 发送请求
curl -X GET "$API_URL" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  --max-time 300 \
  -s -o /tmp/polynba-settle.log

# 记录时间
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Settle predictions executed" >> $LOG_FILE

# 检查结果
if [ $? -eq 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Success" >> $LOG_FILE
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Failed" >> $LOG_FILE
fi
