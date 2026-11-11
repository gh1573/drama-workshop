#!/usr/bin/env bash
# 端到端第一集（v2.4 精简档 + 一键成片）—— 幂等可续跑
# 用法：e2e-ep1.sh [stage]  stage ∈ create|pipeline|wait|render|waitrender|compose|status
set -u
cd /home/z/my-project
source scripts/srv.sh
ensure_server >/dev/null 2>&1 || { echo "[e2e] server failed"; exit 1; }

PID_FILE=/tmp/e2e_ep1_project_id

api() { # method path [body]
  local m=$1 p=$2 b=${3:-}
  if [ -n "$b" ]; then
    curl -s -m 30 -X "$m" -H 'Content-Type: application/json' -d "$b" "$BASE$p"
  else
    curl -s -m 30 -X "$m" "$BASE$p"
  fi
}

case "${1:-status}" in
create)
  PID=$(api POST /projects '{"genre":{"id":"shuangwen","name":"战神逆袭 · 龙王归来","badge":"高燃打脸 · 爽感爆棚","hookTactic":"0~3s 冲突爆发：撕毁婚书当众羞辱，主角眼神冰冷，身份信物若隐若现","musicMood":"重低音震荡战鼓、霸气交响乐渐强、金属拔剑音效","tonePrompt":"high-contrast dramatic cinema, intense confrontation, low angle hero shot, cinematic lighting, gold and obsidian tones, high tension facial micro-expressions"},"synopsis":"赘婿隐忍三年受尽欺凌，反派当众撕碎婚书泼菜汤；主角冷笑亮出信物，顶级统帅带十万将士破门而入跪地齐呼龙王！","modelConfig":{"videoModel":"Omni 1.2 Flash","durationSeconds":5,"resolution":"720p","scriptThinkingLevel":"low","enablePromptEnhance":true}}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['data']['id'] if d.get('ok') else 'ERR:'+d.get('error',''))")
  if [[ "$PID" == ERR* ]]; then echo "[e2e] create failed: $PID"; exit 1; fi
  echo "$PID" > "$PID_FILE"
  echo "[e2e] project created: $PID"
  ;;
pipeline)
  PID=$(cat "$PID_FILE")
  R=$(api POST "/projects/$PID/runs" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['data']['id'] if d.get('ok') else 'ERR:'+d.get('error',''))")
  echo "[e2e] run: $R"
  ;;
wait)
  PID=$(cat "$PID_FILE")
  for i in $(seq 1 100); do
    S=$(api GET "/projects/$PID" | python3 -c "
import sys,json
d=json.load(sys.stdin)
r=d['data'].get('activeRun') or {}
print(r.get('status','none'), r.get('progress',0), r.get('stage',''), (r.get('error') or '')[:80])" 2>/dev/null)
    echo "[e2e] run: $S"
    [[ "$S" == succeeded* || "$S" == failed* ]] && break
    sleep 10
  done
  ;;
render)
  PID=$(cat "$PID_FILE")
  api POST "/projects/$PID/render-all" | python3 -c "import sys,json;d=json.load(sys.stdin);print('[e2e] render-all:', d.get('data') or d.get('error'))"
  ;;
waitrender)
  PID=$(cat "$PID_FILE")
  for i in $(seq 1 55); do
    S=$(python3 -c "
import sqlite3
con=sqlite3.connect('db/custom.db')
pid='$PID'
clips=con.execute('SELECT COUNT(*), SUM(CASE WHEN status=\"ready\" THEN 1 ELSE 0 END) FROM timeline_clips WHERE projectId=?',(pid,)).fetchone()
tasks=con.execute('SELECT kind,status,COUNT(*) FROM render_tasks WHERE projectId=? AND kind IN (\"video\",\"voiceover\") GROUP BY kind,status',(pid,)).fetchall()
print(f'clips {clips[1] or 0}/{clips[0]} ready; tasks', {f\"{a}:{b}\":c for a,b,c in tasks})")
    echo "[e2e] $S"
    READY=$(python3 -c "
import sqlite3
con=sqlite3.connect('db/custom.db')
t=con.execute('SELECT COUNT(*) FROM timeline_clips WHERE projectId=? AND status=\"ready\"',('$PID',)).fetchone()[0]
a=con.execute('SELECT COUNT(*) FROM render_tasks WHERE projectId=? AND kind=\"video\" AND status IN (\"queued\",\"running\")',('$PID',)).fetchone()[0]
print('YES' if t>0 and a==0 else 'NO')")
    [ "$READY" = "YES" ] && { echo "[e2e] all video ready"; break; }
    sleep 10
  done
  ;;
compose)
  PID=$(cat "$PID_FILE")
  api POST "/projects/$PID/compose" | python3 -c "import sys,json;d=json.load(sys.stdin);print('[e2e] compose:', d.get('data') or d.get('error'))"
  ;;
status)
  PID=$(cat "$PID_FILE" 2>/dev/null || echo none)
  echo "[e2e] project: $PID"
  python3 -c "
import sqlite3
con=sqlite3.connect('db/custom.db')
pid='$PID'
if pid!='none':
  p=con.execute('SELECT title,status,finalVideoUrl FROM projects WHERE id=?',(pid,)).fetchone()
  print('  project:', p)
  print('  clips:', con.execute('SELECT status,COUNT(*) FROM timeline_clips WHERE projectId=? GROUP BY status',(pid,)).fetchall())
  print('  tasks:', con.execute('SELECT kind,status,COUNT(*) FROM render_tasks WHERE projectId=? GROUP BY kind,status',(pid,)).fetchall())
  print('  assets:', con.execute('SELECT kind,COUNT(*),SUM(CASE WHEN portraitUrl IS NOT NULL THEN 1 ELSE 0 END) FROM assets WHERE projectId=? GROUP BY kind',(pid,)).fetchall())
"
  ;;
esac
