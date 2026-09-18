#!/bin/sh
# IRAGT DB backup with 7-day retention (v1.14.0)
# Crontab (3x daily at 00:00, 08:00, 16:00 UTC): 0 0,8,16 * * * /opt/iragt/scripts/backup_db.sh >> /var/log/iragt-backup.log 2>&1
set -e
BACKUP_DIR="${IRAGT_BACKUP_DIR:-./backups}"
KEEP_DAYS="${IRAGT_BACKUP_KEEP_DAYS:-7}"
DB_URL="${IRAGT_DB_URL:-postgresql://postgres:root@localhost:5432/iragt}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/iragt-$STAMP.sql.gz"
pg_dump "$DB_URL" | gzip > "$OUT"
echo "[$(date)] backup written: $OUT ($(du -h "$OUT" | cut -f1))"
find "$BACKUP_DIR" -name "iragt-*.sql.gz" -mtime +"$KEEP_DAYS" -delete
echo "[$(date)] retention: removed backups older than $KEEP_DAYS days"
