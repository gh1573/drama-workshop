#!/usr/bin/env bash
# 单镜视频任务全链路验证
set -e
BASE=http://localhost:3000/api
PID=cmwatz8k800wqpzia68d9lgbt
CLIP=cmwau9ioo0125pziay0ljct6o

echo "== 提交 video 任务 =="
RESP=$(curl -s -m 60 -X POST "$BASE/projects/$PID/tasks" \
  -H "Content-Type: application/json" \
  -d "{\"kind\":\"video\",\"clipId\":\"$CLIP\"}")
echo "$RESP" | head -c 400; echo

TASK_ID=$(echo "$RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])' 2>/dev/null || echo "")
if [ -z "$TASK_ID" ]; then echo "!! 提交失败"; exit 1; fi
echo "TASK_ID=$TASK_ID"

echo "== 轮询任务状态（最长 6 分钟）=="
for i in $(seq 1 72); do
  sleep 5
  S=$(curl -s -m 10 "$BASE/tasks/$TASK_ID" | python3 -c '
import sys,json
d=json.load(sys.stdin)["data"]
print(d["status"], "| attempts:", d["attempts"], "| url:", (d.get("resultUrl") or "-")[:60], "| err:", (d.get("error") or "-")[:60])' 2>/dev/null || echo "poll-err")
  echo "[$i] $S"
  case "$S" in succeeded*|failed*|cancelled*) break;; esac
done

echo "== 镜头状态 =="
curl -s "$BASE/projects/$PID/clips" | python3 -c '
import sys,json
d=json.load(sys.stdin)["data"]
c=[x for x in d if x["id"]=="'"$CLIP"'"][0]
print("clip.status:", c["status"], "| mediaUrl:", c.get("mediaUrl"), "| durationMs:", c.get("durationMs"))'
