#!/usr/bin/env bash
# 批量配音：优先第 1 集（TTS 通道独立，不受视频限流影响）
set -u
source /home/z/my-project/scripts/srv.sh
PID=cmwatz8k800wqpzia68d9lgbt

ensure_server || exit 1

echo "== 批量提交第 1 集配音 =="
# 幂等：已有 succeeded 配音的镜头跳过（服务端 409 只挡活跃任务，成功的可重跑——脚本只提交无配音轨的镜头）
python3 - <<'PYINSIDE'
import sqlite3, subprocess, json
con = sqlite3.connect('/home/z/my-project/db/custom.db')
clips = [r[0] for r in con.execute('''
  SELECT c.id FROM timeline_clips c
  WHERE c.projectId='cmwatz8k800wqpzia68d9lgbt'
    AND c.subtitle IS NOT NULL AND TRIM(c.subtitle) != ''
    AND NOT EXISTS (SELECT 1 FROM track_items t
        WHERE t.clipId=c.id AND t.kind='voiceover')
  ORDER BY c."order" ''')]
con.close()
print(f'待配音镜头: {len(clips)}')
ok = skip = fail = 0
for cid in clips:
    r = subprocess.run(['curl','-s','-m','30','-X','POST',
        f'http://localhost:3000/api/projects/cmwatz8k800wqpzia68d9lgbt/tasks',
        '-H','Content-Type: application/json',
        '-d', json.dumps({"kind":"voiceover","clipId":cid})],
        capture_output=True, text=True)
    if '"ok":true' in r.stdout: ok += 1
    elif '409' in r.stdout or '已有进行中' in r.stdout: skip += 1
    else:
        fail += 1
        print('  fail:', r.stdout[:120])
print(f'提交: ok={ok} skip={skip} fail={fail}')
PYINSIDE

echo "== 监控配音任务 =="
START=$(date +%s)
while [ $(( $(date +%s) - START )) -lt 240 ]; do
  sleep 15
  ensure_server >/dev/null 2>&1 || true
  S=$(python3 -c "
import sqlite3, collections
con = sqlite3.connect('/home/z/my-project/db/custom.db')
c = collections.Counter()
for st, in con.execute('''SELECT status FROM render_tasks WHERE kind='voiceover' '''):
    c[st] += 1
con.close()
print(' '.join(f'{k}={v}' for k,v in sorted(c.items())) or 'none')")
  echo "[$(( $(date +%s) - START ))s] $S"
  if ! echo "$S" | grep -q 'queued=\|running='; then break; fi
done

echo "== 配音轨落库情况 =="
python3 -c "
import sqlite3
con = sqlite3.connect('/home/z/my-project/db/custom.db')
n = con.execute(\"SELECT count(*) FROM track_items WHERE kind='voiceover'\").fetchone()[0]
files = con.execute('''SELECT substr(style,1,60) FROM track_items WHERE kind='voiceover' LIMIT 3''').fetchall()
con.close()
print(f'voiceover 轨: {n} 条'); [print(' ', f) for f in files]"
ls -la public/assets/voice_*.mp3 2>/dev/null | head -3
