#!/usr/bin/env bash
# E2E 阶段A（v2.4.2 回归验证）：全新项目全流水线 —— 编剧→选角→定妆→拆镜→锚定→后期成包
# 不含视频渲染（视频通道配额受限时先验证流水线本体零回归）。
# 用法：bash scripts/e2e-fresh-pipeline.sh
set -u
cd /home/z/my-project
source scripts/srv.sh
ensure_server || { echo "[e2e] server 无法启动"; exit 1; }
BASE=http://localhost:3000/api

# —— 1. 立项：战神逆袭 + 赘婿龙王梗概 ——
BODY=$(python3 /dev/stdin <<'PYEOF'
import json
print(json.dumps({
  "genre": {"id":"warlord-return","name":"战神逆袭","badge":"战","hookTactic":"黄金3秒冲突前置","musicMood":"史诗战鼓","tonePrompt":"cinematic epic tone, dramatic lighting, ancient chinese palace"},
  "synopsis": "赘婿叶凡隐忍三年受尽欺凌，反派当众撕碎婚书泼他一身菜汤；叶凡冷笑亮出龙王信物，十万将士破门而入跪地齐呼龙王，全场震惊跪求原谅。",
  "modelConfig": {"videoModel":"default","durationSeconds":5,"resolution":"720p","scriptThinkingLevel":"low","enablePromptEnhance":False},
}))
PYEOF
)
CREATE=$(curl -s -m 15 -X POST "$BASE/projects" -H 'Content-Type: application/json' -d "$BODY")
PID=$(echo "$CREATE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
if [ -z "$PID" ]; then echo "[e2e] 立项失败: $(echo "$CREATE" | head -c 200)"; exit 1; fi
echo "[e2e] 项目已立项: $PID"
echo "$PID" > /tmp/e2e_fresh_pid

# —— 2. 开机：启动流水线 ——
RUN=$(curl -s -m 15 -X POST "$BASE/projects/$PID/runs")
echo "[e2e] 流水线已提交: $(echo "$RUN" | head -c 160)"

# —— 3. 轮询直至终态（上限12分钟）——
DEADLINE=$(( $(date +%s) + 720 ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  ensure_server >/dev/null 2>&1
  S=$(curl -s -m 8 "$BASE/projects/$PID" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)['data']
except Exception:
    print('DEAD'); raise SystemExit
run = d.get('activeRun') or {}
clips = d.get('timelineClips', [])
assets = d.get('assets', [])
portraits = sum(1 for a in assets if a.get('portraitUrl'))
anchored = sum(1 for c in clips if c.get('finalPrompt'))
print(f\"run={run.get('status')} stage={run.get('currentStage')} progress={run.get('progress')} assets={len(assets)} portraits={portraits} clips={len(clips)} anchored={anchored}\")
" 2>/dev/null)
  echo "[$(date +%H:%M:%S)] $S"
  case "$S" in
    DEAD) sleep 5; continue ;;
    run=succeeded*) echo "[e2e] 流水线成功 ✅"; break ;;
    run=failed*) echo "[e2e] 流水线失败 ❌"; exit 2 ;;
  esac
  sleep 20
done

# —— 4. 断言：面孔统一防线（visualAnchor 含华人特征）+ 锚定完成 ——
curl -s -m 8 "$BASE/projects/$PID" | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
assets, clips = d.get('assets', []), d.get('timelineClips', [])
chars = [a for a in assets if a['kind']=='character']
missing_eth = [a['name'] for a in chars if 'chinese' not in (a.get('visualAnchor') or '').lower()]
no_anchor = [c['name'] for c in clips if not c.get('finalPrompt')]
tracks = d.get('tracks', [])
print(f'角色 {len(chars)} | 缺ethnicity: {missing_eth or \"无\"}')
print(f'镜头 {len(clips)} | 未锚定: {no_anchor or \"无\"} | 轨道项: {len(tracks)}')
ok = not missing_eth and not no_anchor and len(clips) > 0
print('ASSERT', 'PASS ✅' if ok else 'FAIL ❌')
sys.exit(0 if ok else 3)
"
