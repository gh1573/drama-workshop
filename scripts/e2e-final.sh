#!/usr/bin/env bash
# E2E 收尾：批量渲染验证 + 系列汇总 + 导出 3 集制作包
set -e
BASE=http://localhost:3000/api
OUT=/home/z/my-project/download/e2e_series
mkdir -p "$OUT"
SID=cmwatz8hu00wppzia3dpkby1z
P1=cmwatz8k800wqpzia68d9lgbt
P2=cmwaugjc40174pziah1kgzghx
P3=cmwaukdg001d4pzia5ecb4v12

echo "== F1. 三集终态校验 =="
for pair in "$P1:1" "$P2:2" "$P3:3"; do
  pid="${pair%%:*}"; ep="${pair##*:}"
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
print("  第%s集: 场=%d 镜头=%d 时长=%ss 资产=%d 定妆=%d 提示词=%d 轨道=%s" % (
  ep, len(d["storyBeats"]), len(clips), secs, len(assets),
  sum(1 for a in assets if a.get("portraitUrl")), len(fp), dict(tc)))
assert len(d["storyBeats"])==3 and len(clips)>=12 and 45<=secs<=85
assert len(fp)>=len(clips)*0.9 and len(assets)>=6'
done
echo "  三集全部 PASS"

echo "== F2. 系列级批量提交渲染（46+ 镜头，视频通道降级语义）=="
curl -s -X POST "$BASE/series/$SID/batch-render" -H 'Content-Type: application/json' -d '{"kind":"video"}' | python3 -c '
import sys,json
d=json.load(sys.stdin)["data"]
print("  批量渲染提交: %d 个镜头任务（跳过 %d）" % (d["submitted"], d["skipped"]))
for e in d["perEpisode"]:
    print("    第%d集: +%d" % (e["episodeNo"], e["submitted"]))'

echo "  等待任务流转至终态..."
for i in $(seq 1 40); do
  sleep 3
  STAT=$(curl -s "$BASE/tasks?projectId=$P1" | python3 -c '
import sys,json
from collections import Counter
d=json.load(sys.stdin)["data"]
c=Counter(t["status"] for t in d)
print(" ".join(k+"="+str(v) for k,v in c.items()) or "none")' 2>/dev/null || echo err)
  if [ $((i % 4)) -eq 0 ]; then echo "  [batch-video][$i] $STAT"; fi
  if [[ "$STAT" != *running* ]] && [[ "$STAT" != *queued* ]]; then break; fi
done

echo "== F3. 任务中心终态抽查（第 1 集）=="
curl -s "$BASE/tasks?projectId=$P1" | python3 -c '
import sys,json
from collections import Counter
d=json.load(sys.stdin)["data"]
c=Counter(t["status"] for t in d)
print("  第1集任务汇总: %s" % dict(c))
video=[t for t in d if t["kind"]=="video"]
for t in video[:2]:
    err=(t.get("error") or "")[:60]
    print("    %s %s attempts=%s %s" % (t["kind"], t["status"], t["attempts"], err))'

echo "== F4. 系列详情 =="
curl -s "$BASE/series/$SID" | python3 -c '
import sys,json
d=json.load(sys.stdin)["data"]
print("  系列《%s》 · %d 集 · 题材：%s" % (d["title"], len(d["episodes"]), d["genreName"]))
for e in d["episodes"]:
    print("    第%d集 %s: %d镜头 %ss 状态=%s" % (e["episodeNo"], e["title"], e["clipCount"], round(e["plannedMs"]/1000,1), e["status"]))'

echo "== F5. 导出 3 集制作包 =="
for i in 1 2 3; do
  pid_var="P$i"
  pid=$(eval echo "\$$pid_var")
  curl -s "$BASE/projects/$pid/export" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print(json.dumps(d,ensure_ascii=False,indent=2))' > "$OUT/龙王归来_第${i}集_制作包.json"
  echo "  已导出: 龙王归来_第${i}集_制作包.json ($(wc -c < "$OUT/龙王归来_第${i}集_制作包.json") bytes)"
done

echo ""
echo "====== E2E 收尾 PASS ======"
