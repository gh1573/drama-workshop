#!/usr/bin/env bash
# 轮询第一集渲染收尾：video 全 ready 或全部终态即退出；每 20s 一次
set -u
cd /home/z/my-project
PID=$(cat /tmp/e2e_ep1_project_id)
BASE=http://localhost:3000/api

for i in $(seq 1 28); do
  J=$(curl -s -m 20 "$BASE/projects/$PID/tasks")
  S=$(echo "$J" | python3 -c "
import sys, json
d = json.load(sys.stdin)
tasks = d['data']
from collections import Counter
c = Counter(f\"{t['kind']}:{t['status']}\" for t in tasks)
clips = json.load(sys.stdin) if False else None
ready = sum(1 for t in tasks if t['kind']=='video' and t['status']=='succeeded')
total = sum(1 for t in tasks if t['kind']=='video')
fail = sum(1 for t in tasks if t['kind']=='video' and t['status']=='failed')
active = sum(1 for t in tasks if t['kind']=='video' and t['status'] in ('queued','running'))
print(f\"video ready={ready}/{total} active={active} failed={fail} | \" + ' '.join(f'{k}={v}' for k,v in sorted(c.items())))" 2>/dev/null)
  echo "[$(date +%H:%M:%S)] $S"
  READY=$(echo "$S" | sed -n 's/.*video ready=\([0-9]*\)\/\([0-9]*\).*/\1 \2/p')
  FAILED=$(echo "$S" | sed -n 's/.*failed=\([0-9]*\).*/\1/p')
  ACTIVE=$(echo "$S" | sed -n 's/.*active=\([0-9]*\).*/\1/p')
  [ "$READY" = "$READY" ] && [ -n "$READY" ] && R=${READY%% *} && T=${READY##* } && {
    if [ "$R" -eq "$T" ]; then echo "[poll] 全部视频就绪"; exit 0; fi
  }
  [ "${ACTIVE:-1}" = "0" ] && [ "${FAILED:-0}" != "0" ] && { echo "[poll] 存在失败且无在途任务"; exit 2; }
  sleep 20
done
echo "[poll] 超时（本轮 9 分钟）"
exit 3
