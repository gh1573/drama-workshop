#!/usr/bin/env bash
# 「AI 剧组流水线」端到端实测：立项 → 开机 → 轮询 → 制作包校验
set -e
BASE=http://localhost:3000/api

echo "== 1. 立项草稿 =="
DRAFT=$(curl -s -X POST "$BASE/projects" -H 'Content-Type: application/json' -d '{
  "genre": {"id":"zhanshen","name":"战神逆袭","badge":"战神归来","hookTactic":"婚礼受辱当晚战神身份曝光","musicMood":"鼓点密集","tonePrompt":"cinematic urban fantasy, neon night, high contrast"},
  "synopsis": "赘婿叶凡在婚礼现场被岳家当众羞辱，一块钱离婚协议甩在脸上；当晚战神令出，五大战区统领齐跪门外，岳家全员腿软。",
  "modelConfig": {"videoModel":"Omni 1.2 Flash","durationSeconds":5,"resolution":"720p","scriptThinkingLevel":"low","enablePromptEnhance":true}
}')
PID=$(echo "$DRAFT" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["data"]["id"] if d.get("ok") else "ERR:"+str(d))')
echo "projectId=$PID"

echo "== 2. 全组开机 =="
RUN=$(curl -s -X POST "$BASE/projects/$PID/runs")
RID=$(echo "$RUN" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["data"]["id"] if d.get("ok") else "ERR:"+str(d))')
echo "runId=$RID"

echo "== 3. 轮询流水线（最长 240s） =="
for i in $(seq 1 120); do
  sleep 2
  S=$(curl -s "$BASE/runs/$RID" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print(d["status"], d["progress"], d["stage"])')
  echo "  [$i] $S"
  case "$S" in succeeded*|failed*) break;; esac
done

echo "== 4. 制作包校验 =="
curl -s "$BASE/projects/$PID" | python3 -c '
import sys, json
d = json.load(sys.stdin)["data"]
print("status:", d["status"])
print("beats:", [(b["index"], b["narrativeFunction"], b["cameraMovement"]) for b in d["storyBeats"]])
print("clips:", len(d["timelineClips"]), "| energy:", [c["energy"] for c in d["timelineClips"]])
print("assets:", [(a["kind"], a["name"], a["refCount"]) for a in d["assets"]])
print("shotRefs:", len(d["shotRefs"]), "| tracks:", {k: sum(1 for t in d["tracks"] if t["kind"]==k) for k in ("subtitle","sfx","bgm")})
print("anchorStale:", len(d["anchorStaleClipIds"]), "| activeRun:", d["activeRun"]["status"] if d["activeRun"] else None)
fp = [c["finalPrompt"] for c in d["timelineClips"] if c["finalPrompt"]]
print("finalPrompt 示例:", (fp[0][:180] + "…") if fp else "无")
assert d["storyBeats"], "缺三幕"
assert len(d["timelineClips"]) >= 6, "镜头数不足"
assert d["assets"], "缺资产库"
assert fp, "缺 finalPrompt"
print("== PASS ==")
'
echo "== 5. 旧接口回归（项目列表） =="
curl -s -o /dev/null -w "GET /api/projects -> %{http_code}\n" "$BASE/projects"
