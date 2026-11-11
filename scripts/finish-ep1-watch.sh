#!/usr/bin/env bash
# 续监控：等待最后 1 镜出片 → 合成 → 校验
set -u
source /home/z/my-project/scripts/srv.sh
PID=cmwbgvcwp000cphteapnd8uaf
TASK=cmwbgx2sq004sphteagn7wbk2

ensure_server || exit 1
echo "== 继续监控（最长 8 分钟）=="
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
con.close(); print(r)")
echo "clips (total, ready) = $READY"

if [ "${READY#*,}" != "${READY%%,*}" ]; then
  echo "!! 尚有镜头未就绪"; exit 1
fi

echo "== 合成成片 =="
C=$(curl -s -m 300 -X POST "$BASE/projects/$PID/compose")
echo "$C" | head -c 400; echo

echo "== 校验产物 =="
python3 -c "
import sqlite3, os
con = sqlite3.connect('$PROJ/db/custom.db')
r = con.execute('SELECT finalVideoUrl FROM projects WHERE id=\"$PID\"').fetchone()
con.close()
print('finalVideoUrl =', r[0])
if r[0]:
    p = os.path.join('$PROJ/public', r[0].lstrip('/'))
    ok = os.path.exists(p)
    print('文件存在:', ok, '大小:', os.path.getsize(p)//1024 if ok else 0, 'KB')
"
