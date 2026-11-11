#!/usr/bin/env bash
# E2E 阶段B（v2.4.2 参考图注入验证）：以已入库定妆图的项目驱动剩余镜头渲染。
# 前置：项目定妆图已推送 GitHub（raw URL 公网可达）。
# 用法：bash scripts/e2e-refimg-drive.sh [项目ID] [最大分钟数，默认9]
set -u
cd /home/z/my-project
BASE=http://localhost:3000/api
PID=${1:-cmwbo7ds50000p3vd18pbufiu}
LIMIT_MIN=${2:-9}
DEADLINE=$(( $(date +%s) + LIMIT_MIN*60 ))
RETRIED=""

# —— 强制重启 server：带参考图注入环境（§7.1.4）+ E2E 限流调优 ——
pkill -f "next dev -p 3000" 2>/dev/null || true
sleep 2
ORPHAN_RECOVERY_WINDOW_MS=15000 \
RATE_LIMIT_BACKOFF_MS=60000 \
VIDEO_INFLIGHT_LIMIT=2 \
VIDEO_SUBMIT_INTERVAL_MS=30000 \
VIDEO_POLL_INTERVAL_MS=12000 \
PUBLIC_ASSETS_BASE_URL="https://raw.githubusercontent.com/gh1573/drama-workshop/main/public" \
setsid nohup node_modules/.bin/next dev -p 3000 >> dev.log 2>&1 < /dev/null &
for i in $(seq 1 40); do
  sleep 2
  curl -s -m 4 "$BASE/projects" -o /dev/null 2>/dev/null && break
done
echo "[drive] server 已就绪（PUBLIC_ASSETS_BASE_URL=raw.githubusercontent）"

# —— 提交渲染全片（幂等：跳过 ready 与在途）——
curl -s -m 15 -X POST "$BASE/projects/$PID/render-all" | head -c 200; echo

state() {
  curl -s -m 8 "$BASE/projects/$PID/tasks" | python3 -c "
import sys, json, collections
try:
    tasks = json.load(sys.stdin)['data']
except Exception:
    print('DEAD'); sys.exit(0)
c = collections.Counter(f\"{t['kind']}:{t['status']}\" for t in tasks)
v = [t for t in tasks if t['kind']=='video']
ok = sum(1 for t in v if t['status']=='succeeded')
act = sum(1 for t in v if t['status'] in ('queued','running'))
fail = [t['id'] for t in v if t['status']=='failed']
print(f\"ready={ok}/{len(v)} active={act} {' '.join(f'{k}={n}' for k,n in sorted(c.items()))} failed_ids={','.join(fail)}\")
" 2>/dev/null
}

while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  S=$(state)
  echo "[$(date +%H:%M:%S)] $S"
  case "$S" in
    DEAD) sleep 5; continue ;;
  esac
  READY=$(echo "$S" | sed -n 's/.*ready=\([0-9]*\)\/\([0-9]*\).*/\1 \2/p')
  R=${READY%% *}; T=${READY##* }
  if [ -n "$R" ] && [ "$R" = "$T" ] && [ "$T" != "0" ]; then
    echo "[drive] 全部镜头就绪 ✅ 触发合成"
    curl -s -m 240 -X POST "$BASE/projects/$PID/compose" | head -c 300; echo
    exit 0
  fi
  FIDS=$(echo "$S" | sed -n 's/.*failed_ids=\([a-z0-9,]*\).*/\1/p')
  if [ -n "$FIDS" ] && [ "$FIDS" != "$RETRIED" ]; then
    echo "[drive] 重试失败任务: $(echo "$FIDS" | tr ',' ' ' | wc -w) 个"
    for id in $(echo "$FIDS" | tr ',' ' '); do
      curl -s -m 8 -X POST "$BASE/tasks/$id/retry" -o /dev/null 2>/dev/null
    done
    RETRIED="$FIDS"
  fi
  sleep 25
done
echo "[drive] 本轮时限已到（配额墙未破则下轮继续）"
exit 3
