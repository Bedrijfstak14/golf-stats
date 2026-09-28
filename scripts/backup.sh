#!/bin/sh
# Nachtelijke dump van database en afbeeldingen, KEEP_DAYS dagen bewaard.
set -eu
KEEP_DAYS="${KEEP_DAYS:-30}"

run_backup() {
  stamp=$(date +%Y-%m-%d_%H%M)
  pg_dump -Fc -f "/backups/golf-$stamp.dump"
  tar -czf "/backups/uploads-$stamp.tar.gz" -C /data uploads
  find /backups -type f \( -name 'golf-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
  echo "[backup] $stamp klaar"
}

run_backup
while true; do
  # wacht tot 03:00
  now=$(date +%s)
  next=$(date -d "$(date +%Y-%m-%d) 03:00" +%s 2>/dev/null || echo $((now + 86400)))
  [ "$next" -le "$now" ] && next=$((next + 86400))
  sleep $((next - now))
  run_backup || echo "[backup] mislukt"
done
