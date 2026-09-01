#!/bin/sh
# IRAGT DB backup with retention (v1.11.0)
# Crontab (daily 3am):  0 3 * * * /opt/iragt/scripts/backup_db.sh >> /var/log/iragt-backup.log 2>&1
set -e
BACKUP_DIR="${IRAGT_BACKUP_DIR:-./backups}"
KEEP_DAYS="${IRAGT_BACKUP_KEEP_DAYS:-14}"
DB_URL="${IRAGT_DB_URL:-postgresql://postgres:root@localhost:5432/pinggy}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/pinggy-$STAMP.sql.gz"
pg_dump "$DB_URL" | gzip > "$OUT"
echo "[$(date)] backup written: $OUT ($(du -h "$OUT" | cut -f1))"
find "$BACKUP_DIR" -name "pinggy-*.sql.gz" -mtime +"$KEEP_DAYS" -delete
echo "[$(date)] retention: removed backups older than $KEEP_DAYS days"
