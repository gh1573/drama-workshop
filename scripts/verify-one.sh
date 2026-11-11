#!/usr/bin/env bash
# 单镜视频任务全链路验证：提交 → create → 轮询池 → 成片落盘 → 回写镜头
set -u
source /home/z/my-project/scripts/srv.sh
PID=cmwatz8k800wqpzia68d9lgbt   # 第 1 集
CLIP=cmwau9ioo0125pziay0ljct6o  # 镜头 0 婚宴大厅全景

ensure_server || exit 1

echo "== 提交单镜任务 =="
RESP=$(curl -s -m 60 -X POST "$BASE/projects/$PID/tasks" \
  -H "Content-Type: application/json" \
  -d "{\"kind\":\"video\",\"clipId\":\"$CLIP\"}")
echo "$RESP" | head -c 300; echo
TASK_ID=$(echo "$RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])' 2>/dev/null || echo "")
[ -z "$TASK_ID" ] && { echo "!! 提交失败"; exit 1; }
echo "TASK_ID=$TASK_ID"

echo "== 监控（最长 4 分钟，server 保活接力）=="
START=$(date +%s)
while [ $(( $(date +%s) - START )) -lt 240 ]; do
  sleep 15
  ensure_server >/dev/null 2>&1 || true
  S=$(python3 -c "
import sqlite3
con = sqlite3.connect('$PROJ/db/custom.db')
r = con.execute('SELECT status, attempts, substr(remoteTaskId,1,12), substr(resultUrl,1,60), substr(error,1,80) FROM render_tasks WHERE id=\"$TASK_ID\"').fetchone()
con.close(); print(r)")
  echo "[$(( $(date +%s) - START ))s] $S"
  case "$S" in succeeded*|failed*) break;; esac
done

echo "== 镜头回写结果 =="
python3 -c "
import sqlite3
con = sqlite3.connect('$PROJ/db/custom.db')
r = con.execute('SELECT status, mediaUrl, durationMs FROM timeline_clips WHERE id=\"$CLIP\"').fetchone()
con.close(); print('clip:', r)"
ls -la public/assets/clip_*.mp4 2>/dev/null | tail -3
