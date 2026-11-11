#!/usr/bin/env bash
# server 保活库 —— 沙箱会回收跨命令的后台进程，
# 每条命令开头 source 本文件并调用 ensure_server。
#
# 恢复语义（dispatcher.recoverOrphanTasks）：
# - running + remoteTaskId → 直接转回轮询池（不重复提交，幂等）
# - running 无句柄 → 回置 queued 重新入队
# 窗口调小（15s）：dev 单 worker 场景，进程被沙箱回收后尽快接力。
BASE=http://localhost:3000/api
PROJ=/home/z/my-project

ensure_server() {
  if curl -s -m 4 "$BASE/projects" -o /dev/null 2>/dev/null; then
    return 0
  fi
  cd "$PROJ" || return 1
  # L2 运行参数（§7.8）按当前通道实测限流特征覆盖：
  # - 慢退避（60/120/240s）：通道全局限流窗口长，快退避只会持续撞墙
  # - 在途 2 / 提交间隔 30s：通道并行生成配额极紧
  # - 孤儿回收 15s：沙箱每条命令回收 server，需快速接力
  ORPHAN_RECOVERY_WINDOW_MS=15000 \
  RATE_LIMIT_BACKOFF_MS=60000 \
  VIDEO_INFLIGHT_LIMIT=2 \
  VIDEO_SUBMIT_INTERVAL_MS=30000 \
  VIDEO_POLL_INTERVAL_MS=12000 \
  setsid nohup node_modules/.bin/next dev -p 3000 \
    >> "$PROJ/dev.log" 2>&1 < /dev/null &
  for i in $(seq 1 40); do
    sleep 2
    if curl -s -m 4 "$BASE/projects" -o /dev/null 2>/dev/null; then
      echo "[srv] ready after $((i*2))s"
      return 0
    fi
  done
  echo "[srv] FAILED to start" >&2
  return 1
}

# DB 直查任务统计（不依赖 server）
task_stat() {
  python3 -c "
import sqlite3, collections
con = sqlite3.connect('$PROJ/db/custom.db')
cur = con.cursor()
rows = list(cur.execute('''SELECT substr(projectId,1,8), kind, status, count(*) FROM render_tasks
  WHERE projectId IN (SELECT id FROM projects WHERE seriesId IS NOT NULL)
  GROUP BY projectId, kind, status ORDER BY projectId, kind, status'''))
for r in rows: print(' ', r)
con.close()"
}
