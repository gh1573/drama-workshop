#!/usr/bin/env bash
# 驱动第一集渲染到收尾（单命令内闭环，含 server 自愈与失败重试）
# 用法：bash scripts/drive-ep1.sh [最大分钟数，默认9]
set -u
cd /home/z/my-project
source scripts/srv.sh
PID=$(cat /tmp/e2e_ep1_project_id)
BASE=http://localhost:3000/api
LIMIT_MIN=${1:-9}
DEADLINE=$(( $(date +%s) + LIMIT_MIN*60 ))
RETRIED=""

state() {
  curl -s -m 8 "$BASE/projects/$PID/tasks" | python3 -c "
import sys, json, collections
try:
    d = json.load(sys.stdin)
except Exception:
    print('DEAD'); sys.exit(0)
tasks = d['data']
c = collections.Counter(f\"{t['kind']}:{t['status']}\" for t in tasks)
v = [t for t in tasks if t['kind']=='video']
ok = sum(1 for t in v if t['status']=='succeeded')
act = sum(1 for t in v if t['status'] in ('queued','running'))
fail = [t['id'] for t in v if t['status']=='failed']
vfail = sum(1 for t in tasks if t['kind']=='voiceover' and t['status']=='failed')
print(f\"ready={ok}/{len(v)} active={act} vfailed={len(fail)} ofail={vfail} failed_ids={','.join(fail)}\")
" 2>/dev/null
}

while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  ensure_server >/dev/null 2>&1
  S=$(state)
  echo "[$(date +%H:%M:%S)] $S"
  case "$S" in
    DEAD) sleep 5; continue ;;
  esac
  READY=$(echo "$S" | sed -n 's/.*ready=\([0-9]*\)\/\([0-9]*\).*/\1 \2/p')
  R=${READY%% *}; T=${READY##* }
  if [ -n "$R" ] && [ "$R" -eq "$T" ]; then echo "[drive] 全部镜头就绪 ✅"; exit 0; fi
  # 重试失败任务（每轮最多一次，避免撞车在途回合）
  FIDS=$(echo "$S" | sed -n 's/.*failed_ids=\([a-z0-9,]*\).*/\1/p')
  if [ -n "$FIDS" ] && [ "$FIDS" != "$RETRIED" ]; then
    echo "[drive] 重试失败任务: $(echo "$FIDS" | tr ',' ' ' | wc -w) 个"
    for id in $(echo "$FIDS" | tr ',' ' '); do
      curl -s -m 8 -X POST "$BASE/tasks/$id/retry" -o /dev/null 2>/dev/null
    done
    RETRIED="$FIDS"
  fi
  ACT=$(echo "$S" | sed -n 's/.*active=\([0-9]*\).*/\1/p')
  [ "${ACT:-0}" = "0" ] && sleep 15
  sleep 25
done
echo "[drive] 本轮时限已到，下条命令继续"
exit 3
