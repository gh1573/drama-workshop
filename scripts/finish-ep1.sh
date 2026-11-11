#!/usr/bin/env bash
# 补齐第一集最后 1 镜并合成成片：
# retry 失败任务 → 监控出片 → 全部 ready 后 compose → 校验产物
set -u
source /home/z/my-project/scripts/srv.sh
PID=cmwbgvcwp000cphteapnd8uaf
TASK=cmwbgx2sq004sphteagn7wbk2

ensure_server || exit 1

echo "== 重试失败任务 =="
RESP=$(curl -s -m 60 -X POST "$BASE/tasks/$TASK/retry")
echo "$RESP" | head -c 200; echo

echo "== 监控出片（最长 8 分钟）=="
START=$(date +%s)
while [ $(( $(date +%s) - START )) -lt 480 ]; do
  sleep 20
  ensure_server >/dev/null 2>&1 || true
  S=$(python3 -c "
import sqlite3
con = sqlite3.connect('$PROJ/db/custom.db')
r = con.execute('SELECT status, attempts, substr(remoteTaskId,1,14), substr(resultUrl,1,55), substr(error,1,60) FROM render_tasks WHERE id=\"$TASK\"').fetchone()
con.close(); print(r)")
  echo "[$(( $(date +%s) - START ))s] $S"
  case "$S" in succeeded*|failed*) break;; esac
done

READY=$(python3 -c "
import sqlite3
con = sqlite3.connect('$PROJ/db/custom.db')
r = con.execute(\"SELECT COUNT(*), SUM(status='ready') FROM timeline_clips WHERE projectId='$PID'\").fetchone()
con.close(); print(f'{r[0]}/{r[1]}')")
echo "镜头就绪: ready/total = $READY"

if [[ "$READY" != *"/"* ]] || [[ "${READY#*/}" != "${READY%%/*}" ]]; then
  echo "!! 尚有镜头未就绪，跳过合成"
  exit 1
fi

echo "== 合成成片 =="
C=$(curl -s -m 300 -X POST "$BASE/projects/$PID/compose")
echo "$C" | head -c 400; echo

echo "== 校验产物 =="
python3 -c "
import sqlite3, os, json
con = sqlite3.connect('$PROJ/db/custom.db')
r = con.execute('SELECT finalVideoUrl FROM projects WHERE id=\"$PID\"').fetchone()
con.close()
print('finalVideoUrl =', r[0])
if r[0]:
    p = os.path.join('$PROJ/public', r[0].lstrip('/'))
    print('文件存在:', os.path.exists(p), '大小:', os.path.getsize(p)//1024, 'KB' if os.path.exists(p) else '')
"
