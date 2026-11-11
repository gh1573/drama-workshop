#!/usr/bin/env python3
# 给 render-loop.sh 的监控循环加自动复活逻辑
p = 'scripts/render-loop.sh'
src = open(p).read()

OLD = '''  if [ "$STATS" != "$LAST" ]; then echo "[$(( $(date +%s) - START ))s] $STATS"; LAST="$STATS"; fi'''

NEW = '''  if [ "$STATS" != "$LAST" ]; then echo "[$(( $(date +%s) - START ))s] $STATS"; LAST="$STATS"; fi
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
  fi'''

if OLD not in src:
    print("OLD not found!"); exit(1)
src = src.replace(OLD, NEW)
open(p, 'w').write(src)
print("patched")
