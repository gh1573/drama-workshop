#!/usr/bin/env bash
# E2E 续跑：从 EP1 定妆开始（复用已有系列/第1集）
set -e
BASE=http://localhost:3000/api
OUT=/home/z/my-project/download/e2e_series
mkdir -p "$OUT"

SID=cmwatz8hu00wppzia3dpkby1z
P1=cmwatz8k800wqpzia68d9lgbt

py() { python3 -c "$1"; }

wait_run() {
  local rid=$1 label=$2 attempt=0
  while [ $attempt -le 2 ]; do
    local S=""
    for i in $(seq 1 150); do
      sleep 2
      S=$(curl -s "$BASE/runs/$rid" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print(d["status"],d["progress"],d["stage"])' 2>/dev/null || echo "poll-err 0 -")
      if [ $((i % 5)) -eq 0 ] || [[ "$S" == succeeded* ]] || [[ "$S" == failed* ]]; then echo "  [$label][$i] $S"; fi
      case "$S" in succeeded*|failed*) break;; esac
    done
    if [[ "$S" == succeeded* ]]; then return 0; fi
    attempt=$((attempt+1))
    if [ $attempt -le 2 ]; then
      echo "  [$label] 第${attempt}次断点重试"
      curl -s -X POST "$BASE/runs/$rid/retry" -o /dev/null
    else
      echo "  [$label] FAILED after retries"
      return 1
    fi
  done
}

wait_tasks() {
  local pid=$1 label=$2
  for i in $(seq 1 90); do
    sleep 3
    STAT=$(curl -s "$BASE/tasks?projectId=$pid" | python3 -c '
import sys,json
from collections import Counter
d=json.load(sys.stdin)["data"]
c=Counter(t["status"] for t in d)
print(" ".join(k+"="+str(v) for k,v in c.items()) or "none")' 2>/dev/null || echo err)
    echo "  [$label tasks][$i] $STAT"
    if [[ "$STAT" != *running* ]] && [[ "$STAT" != *queued* ]]; then break; fi
  done
}

verify_episode() {
  local pid=$1 ep=$2
  curl -s "$BASE/projects/$pid" | EPISODE=$ep python3 -c '
import sys,json,os
d=json.load(sys.stdin)["data"]
ep=os.environ["EPISODE"]
clips=d["timelineClips"]
total_ms=sum(c.get("plannedMs") or 0 for c in clips)
secs=round(total_ms/1000,1)
assets=d["assets"]
fp=[c for c in clips if c.get("finalPrompt")]
from collections import Counter
tc=Counter(t["kind"] for t in d["tracks"])
print("  第%s集校验: 场=%d 镜头=%d 时长=%ss 资产=%d 定妆图=%d 提示词=%d 轨道=%s 状态=%s" % (
  ep, len(d["storyBeats"]), len(clips), secs, len(assets),
  sum(1 for a in assets if a.get("portraitUrl")), len(fp), dict(tc), d["status"]))
assert 3 <= len(d["storyBeats"]) <= 6, "场次弹性丿6：第%s集 %d 场" % (ep, len(d["storyBeats"]))
assert d["storyBeats"][0]["narrativeFunction"] == "hook", "首场非 hook"
assert d["storyBeats"][-1]["narrativeFunction"] == "cliffhanger", "末场非 cliffhanger"
assert len(clips)>=12, "镜头数不足: %d" % len(clips)
assert 45<=secs<=85, "时长偏离60s: %ss" % secs
assert len(assets)>=6, "资产库不足"
assert len(fp)>=len(clips)*0.9, "finalPrompt 不全"
assert tc.get("subtitle",0)>=3 and tc.get("sfx",0)>=3, "轨道缺失"
print("  第%s集 PASS" % ep)
'
}

portrait_pass() {
  local sid=$1 pid=$2 ep=$3
  echo "  -- 第${ep}集批量定妆（真实图像通道） --"
  curl -s -X POST "$BASE/series/$sid/batch-render" -H 'Content-Type: application/json' -d '{"kind":"portrait"}' | python3 -c '
import sys,json
d=json.load(sys.stdin)["data"]
print("  提交定妆任务: %d 个（跳过 %d）" % (d["submitted"], d["skipped"]))'
  wait_tasks "$pid" "EP${ep}-portrait"
  curl -s "$BASE/projects/$pid" | python3 -c '
import sys,json
d=json.load(sys.stdin)["data"]
a=d["assets"]
print("  %s 定妆完成: %d/%d" % (d["title"], sum(1 for x in a if x.get("portraitUrl")), len(a)))'
}

echo "== R1. 第 1 集校验 + 批量定妆 =="
verify_episode "$P1" 1
portrait_pass "$SID" "$P1" 1

echo "== R2. 第 2 集：北境惊雷（资产克隆继承 + 开机）=="
EP2=$(curl -s -X POST "$BASE/series/$SID/episodes" -H 'Content-Type: application/json' -d '{
  "synopsis": "叶凡连夜飞赴北境，发现袭击军资车队的主谋竟是当年把他推下悬崖的师兄赵擎。雪原对峙，赵擎亮出禁卫军符狂笑：这次没人救得了你。叶凡平静抬手，雪山之巅忽然浮现黑影军团轮廓。",
  "cloneAssets": true
}')
P2=$(echo "$EP2" | py 'import sys,json;d=json.load(sys.stdin)["data"];print(d["id"])')
echo "episode2 projectId=$P2 clonedAssets=$(echo "$EP2" | py 'import sys,json;print(json.load(sys.stdin)["data"]["clonedAssets"])')"
RUN2=$(curl -s -X POST "$BASE/projects/$P2/runs" | py 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
wait_run "$RUN2" "EP2"
verify_episode "$P2" 2
portrait_pass "$SID" "$P2" 2

echo "== R3. 第 3 集：雪原清算（资产克隆继承 + 开机）=="
EP3=$(curl -s -X POST "$BASE/series/$SID/episodes" -H 'Content-Type: application/json' -d '{
  "synopsis": "黑影军团正是叶凡暗中训练五年的影卫，雪原决战一触即发。赵擎的禁卫军临阵反水跪降，他孤身跪在雪地里求饶。叶凡携苏晚返京，机场被记者围堵追问真实身份，他搂住妻子微笑：我只是个上门女婿。远处黑色轿车里，一双眼睛死死盯住了他们。",
  "cloneAssets": true
}')
P3=$(echo "$EP3" | py 'import sys,json;d=json.load(sys.stdin)["data"];print(d["id"])')
echo "episode3 projectId=$P3 clonedAssets=$(echo "$EP3" | py 'import sys,json;print(json.load(sys.stdin)["data"]["clonedAssets"])')"
RUN3=$(curl -s -X POST "$BASE/projects/$P3/runs" | py 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
wait_run "$RUN3" "EP3"
verify_episode "$P3" 3
portrait_pass "$SID" "$P3" 3

echo "== R4. 跨集一致性验证（资产锚点 + 定妆图继承）=="
for p in "$P1" "$P2" "$P3"; do
  curl -s "$BASE/projects/$p" | python3 -c '
import sys,json
d=json.load(sys.stdin)["data"]
a=d["assets"]
chars=sorted(x["name"] for x in a if x["kind"]=="character")
print("  %s: 角色=%s 定妆=%d/%d" % (d["title"], chars, sum(1 for x in a if x.get("portraitUrl")), len(a)))'
done

echo "== R5. 系列级批量提交渲染（视频通道降级语义验证）=="
curl -s -X POST "$BASE/series/$SID/batch-render" -H 'Content-Type: application/json' -d '{"kind":"video"}' | python3 -c '
import sys,json
d=json.load(sys.stdin)["data"]
print("  批量渲染提交: %d 个镜头任务（跳过 %d）" % (d["submitted"], d["skipped"]))
for e in d["perEpisode"]:
    print("    第%d集: +%d" % (e["episodeNo"], e["submitted"]))'
wait_tasks "$P1" "batch-video"

echo "== R6. 系列详情汇总 + 导出 3 集制作包 =="
curl -s "$BASE/series/$SID" | python3 -c '
import sys,json
d=json.load(sys.stdin)["data"]
print("  系列《%s》 · %d 集" % (d["title"], len(d["episodes"])))
for e in d["episodes"]:
    print("    第%d集 %s: %d镜头 %ss 状态=%s" % (e["episodeNo"], e["title"], e["clipCount"], round(e["plannedMs"]/1000,1), e["status"]))'
for i in 1 2 3; do
  pid_var="P$i"
  pid=$(eval echo "\$$pid_var")
  curl -s "$BASE/projects/$pid/export" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print(json.dumps(d,ensure_ascii=False,indent=2))' > "$OUT/龙王归来_第${i}集_制作包.json"
  echo "  已导出: 龙王归来_第${i}集_制作包.json ($(wc -c < "$OUT/龙王归来_第${i}集_制作包.json") bytes)"
done

echo "== R7. 任务中心终态抽查 =="
curl -s "$BASE/tasks?projectId=$P1" | python3 -c '
import sys,json
from collections import Counter
d=json.load(sys.stdin)["data"]
c=Counter(t["status"] for t in d)
print("  第1集任务汇总: %s" % dict(c))
for t in d[:3]:
    err=(t.get("error") or "")[:50]
    print("    %s %s attempts=%s %s" % (t["kind"], t["status"], t["attempts"], err))'

echo ""
echo "====== E2E 续跑 PASS ======"
echo "P1=$P1"; echo "P2=$P2"; echo "P3=$P3"; echo "SID=$SID"
