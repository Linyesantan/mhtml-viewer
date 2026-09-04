#!/data/data/com.termux/files/usr/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-8080}"
URL="http://127.0.0.1:$PORT/"
SERVER="$DIR/server.js"
PIDFILE="$DIR/.server.pid"
LOG="$DIR/.server.log"

is_running() {
  [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null
}

start_server() {
  if is_running; then
    echo "已在运行 (pid $(cat "$PIDFILE")): $URL"
    return 0
  fi
  rm -f "$PIDFILE"
  command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock
  nohup node "$SERVER" "$PORT" >"$LOG" 2>&1 &
  echo $! > "$PIDFILE"
  i=0
  while [ $i -lt 10 ]; do
    if curl -s --max-time 1 -o /dev/null "http://127.0.0.1:$PORT/"; then
      echo "服务已启动 (pid $(cat "$PIDFILE")): $URL"
      return 0
    fi
    sleep 1
    i=$((i+1))
  done
  echo "服务启动可能失败，日志: $LOG"
  return 1
}

stop_server() {
  if is_running; then
    kill "$(cat "$PIDFILE")" 2>/dev/null
    rm -f "$PIDFILE"
    command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock
    echo "服务已停止"
  else
    echo "未在运行"
  fi
}

open_browser() {
  if command -v termux-open >/dev/null 2>&1 && termux-open "$URL" >/dev/null 2>&1; then
    return 0
  fi
  if command -v termux-open-url >/dev/null 2>&1 && termux-open-url "$URL" >/dev/null 2>&1; then
    return 0
  fi
  am start --user 0 -a android.intent.action.VIEW -d "$URL" >/dev/null 2>&1 || echo "请手动在浏览器打开: $URL"
}

case "${1:-start}" in
  start)   start_server && open_browser ;;
  stop)    stop_server ;;
  restart) stop_server; sleep 1; start_server && open_browser ;;
  open)    open_browser ;;
  status)  if is_running; then echo "运行中 (pid $(cat "$PIDFILE")): $URL"; else echo "未运行"; fi ;;
  *)       echo "用法: $0 [start|stop|restart|open|status]" ;;
esac
