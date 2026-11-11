#!/usr/bin/env bash
# 系列渲染推进器 v2 —— 每条命令内：保活 → 重试失败任务 → 监控
# 提交节流（12s/create）在 server 内生效；命令结束后由下一条命令接力
set -u
source /home/z/my-project/scripts/srv.sh

DUR="${1:-500}"   # 本命令监控时长（秒）
SID="${2:-cmwatz8hu00wppzia3dpkby1z}"
EPS="${3:-1,2,3}"   # 优先处理的剧集（逗号分隔）

ensure_server || exit 1
export SID EPS   # 供窗口内 auto-retry 读取

# 1) 重试可重试的失败任务（目标镜头仍非 ready，且无活跃同类任务）
echo "== 重试失败任务 =="
python3 -c "
import sqlite3, json
con = sqlite3.connect('$PROJ/db/custom.db')
cur = con.cursor()
# 最新失败的每 clip 一个任务（跳过已 ready 的镜头）
rows = cur.execute('''
  SELECT t.id FROM render_tasks t
  JOIN timeline_clips c ON json_extract(t.payload,'\$.clipId') = c.id
  JOIN projects p ON t.projectId = p.id
  WHERE t.projectId IN (SELECT id FROM projects WHERE seriesId='$SID')
    AND p.episodeNo IN ($EPS)
    AND t.kind='video' AND t.status IN ('failed','cancelled') AND c.status != 'ready'
    AND NOT EXISTS (SELECT 1 FROM render_tasks a WHERE a.projectId=t.projectId
        AND a.kind='video' AND a.payload=t.payload AND a.status IN ('queued','running'))
  ORDER BY t.updatedAt''').fetchall()
print(json.dumps([r[0] for r in rows]))" > /tmp/retry-ids.json
COUNT=$(python3 -c "import json;print(len(json.load(open('/tmp/retry-ids.json'))))")
echo "  待重试: $COUNT 个"
if [ "$COUNT" -gt 0 ]; then
  python3 -c "
import json, subprocess
ids = json.load(open('/tmp/retry-ids.json'))
ok = skip = fail = 0
for tid in ids:
    r = subprocess.run(['curl','-s','-m','20','-X','POST',
        f'http://localhost:3000/api/tasks/{tid}/retry'], capture_output=True, text=True)
    if '\"ok\":true' in r.stdout: ok += 1
    elif '409' in r.stdout: skip += 1
    else: fail += 1
print(f'  retry 提交: ok={ok} skip(进行中)={skip} fail={fail}')"
fi

# 2) 监控
echo "== 监控 ${DUR}s =="
START=$(date +%s)
LAST=""
while [ $(( $(date +%s) - START )) -lt "$DUR" ]; do
  sleep 25
  ensure_server >/dev/null 2>&1 || true
  STATS=$(python3 -c "
import sqlite3, collections
con = sqlite3.connect('$PROJ/db/custom.db')
c = collections.Counter()
for st, in con.execute('''SELECT status FROM render_tasks
  WHERE projectId IN (SELECT id FROM projects WHERE seriesId='$SID') AND kind='video' '''):
    c[st]+=1
con.close()
print(' '.join(f'{k}={v}' for k,v in sorted(c.items())) or 'none')")
  if [ "$STATS" != "$LAST" ]; then echo "[$(( $(date +%s) - START ))s] $STATS"; LAST="$STATS"; fi
  # 窗口内自动复活 failed（429 退避耗尽的任务立即重新排队，幂等跳过活跃任务）
  ELAPSED=$(( $(date +%s) - START ))
  if [ $(( ELAPSED % 100 )) -lt 26 ]; then
    python3 - <<'PYINSIDE'
import sqlite3, json, subprocess, os
PROJ = "/home/z/my-project"
SID = os.environ["SID"]; EPS = os.environ["EPS"]
con = sqlite3.connect(f"{PROJ}/db/custom.db")
rows = con.execute("""
  SELECT t.id FROM render_tasks t
  JOIN timeline_clips c ON json_extract(t.payload,'$.clipId') = c.id
  JOIN projects p ON t.projectId = p.id
  WHERE p.seriesId=? AND p.episodeNo IN (""" + EPS + """)
    AND t.kind='video' AND t.status='failed' AND c.status != 'ready'
    AND NOT EXISTS (SELECT 1 FROM render_tasks a WHERE a.projectId=t.projectId
        AND a.kind='video' AND a.payload=t.payload AND a.status IN ('queued','running'))""",
  (SID,)).fetchall()
for (tid,) in rows:
    subprocess.run(['curl','-s','-m','20','-X','POST',
        f'http://localhost:3000/api/tasks/{tid}/retry'], capture_output=True)
print(f'    [auto-retry] revived {len(rows)}')
PYINSIDE
  fi
  if ! echo "$STATS" | grep -q 'queued=\|running='; then
    echo "== 队列清空（全部终态）=="; break
  fi
done

echo "== 当前各集 ready 镜头 =="
python3 -c "
import sqlite3
con = sqlite3.connect('$PROJ/db/custom.db')
for ep, n, ready in con.execute('''SELECT p.episodeNo, count(*),
    sum(CASE WHEN c.status='ready' THEN 1 ELSE 0 END)
  FROM timeline_clips c JOIN projects p ON c.projectId=p.id
  WHERE p.seriesId='$SID' GROUP BY p.episodeNo ORDER BY p.episodeNo'''):
    print(f'  第{ep}集: {ready}/{n} ready')
con.close()"
