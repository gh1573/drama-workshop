#!/usr/bin/env bash
# 系列批量渲染推进器 —— 单条命令内：保活 → 批量提交(未提交时) → 监控直至超时
# 沙箱回收后台进程：命令结束后 server 死亡，由下一条命令重启接力
# （remoteTaskId 已落库，recoverOrphanTasks 幂等恢复，不重复提交）
set -u
source /home/z/my-project/scripts/srv.sh

DUR="${1:-540}"   # 本命令监控时长（秒），默认 9 分钟
SID="${2:-cmwatz8hu00wppzia3dpkby1z}"

ensure_server || exit 1

# 未完成任务统计（DB 直查）
pending_count() {
  python3 -c "
import sqlite3
con = sqlite3.connect('$PROJ/db/custom.db')
row = con.execute('''SELECT count(*) FROM render_tasks
  WHERE projectId IN (SELECT id FROM projects WHERE seriesId='$SID')
    AND kind='video' AND status IN ('queued','running')''').fetchone()[0]
con.close()
print(row)"
}

TOTAL_DONE=$(python3 -c "
import sqlite3
con = sqlite3.connect('$PROJ/db/custom.db')
row = con.execute('''SELECT count(*) FROM render_tasks
  WHERE projectId IN (SELECT id FROM projects WHERE seriesId='$SID')
    AND kind='video' AND status='succeeded' ''').fetchone()[0]
con.close()
print(row)")

if [ "$(pending_count)" = "0" ]; then
  echo "== 批量提交系列渲染 =="
  curl -s -m 120 -X POST "$BASE/series/$SID/batch-render" \
    -H "Content-Type: application/json" -d '{"kind":"video"}' | head -c 500; echo
fi

echo "== 监控 ${DUR}s（已完成基线: $TOTAL_DONE）=="
START=$(date +%s)
LAST=0
while [ $(( $(date +%s) - START )) -lt "$DUR" ]; do
  sleep 20
  # server 每 20s 确认一次，死了立即拉起（接力轮询）
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
  DONE=$(echo "$STATS" | grep -o 'succeeded=[0-9]*' | cut -d= -f2)
  NOW=$(date +%s)
  if [ "$DONE" != "$LAST" ] || [ $(( NOW - START )) -gt 120 ]; then
    echo "[$(( NOW - START ))s] $STATS"
    LAST="$DONE"
  fi
  # 全部终态则提前结束
  if ! echo "$STATS" | grep -q 'queued=\|running='; then
    echo "== 全部任务到达终态 =="
    break
  fi
done

echo "== 最终统计 =="
task_stat
CLIPS=$(python3 -c "
import sqlite3
con = sqlite3.connect('$PROJ/db/custom.db')
for ep, n, ready in con.execute('''SELECT p.episodeNo, count(*),
    sum(CASE WHEN c.status='ready' THEN 1 ELSE 0 END)
  FROM timeline_clips c JOIN projects p ON c.projectId=p.id
  WHERE p.seriesId='$SID' GROUP BY p.episodeNo ORDER BY p.episodeNo'''):
    print(f'  第{ep}集: {ready}/{n} 镜头 ready')
con.close()")
echo "$CLIPS"
