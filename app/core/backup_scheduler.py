"""Automated Database Backup Scheduler with 7-Day Retention (v1.14.0).

Runs in the background every 8 hours (3 times daily):
1. Takes an automated database snapshot (pg_dump compressed with gzip).
2. Purges any backup archives older than 7 days to preserve disk space.
"""
import asyncio
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

from app.api.routers.backup import BACKUP_DIR, _ensure_backup_dir, _run_backup_job
from app.core.audit import log_audit
from app.core.db import get_conn

logger = logging.getLogger("backup_scheduler")

RETENTION_DAYS = 7
INTERVAL_SECONDS = 8 * 3600  # 8 hours = 3 times per day


def cleanup_old_backups(keep_days: int = RETENTION_DAYS) -> list[str]:
    """Scan the backup directory and delete files older than keep_days.
    
    Returns list of deleted filenames.
    """
    dir_path = _ensure_backup_dir()
    cutoff_time = time.time() - (keep_days * 86400)
    deleted_files = []

    for entry in dir_path.iterdir():
        if entry.is_file() and (entry.name.endswith(".sql.gz") or entry.name.endswith(".sql") or entry.name.endswith(".gz")):
            if entry.name == ".gitkeep":
                continue
            try:
                stat = entry.stat()
                if stat.st_mtime < cutoff_time:
                    entry.unlink()
                    deleted_files.append(entry.name)
                    logger.info("Retention cleanup: removed old backup %s (mtime: %s)", entry.name, stat.st_mtime)
            except Exception as e:
                logger.error("Failed to delete expired backup %s: %s", entry.name, e)

    return deleted_files


async def run_automated_backup_pass() -> None:
    """Execute one automated backup cycle and retention cleanup."""
    dir_path = _ensure_backup_dir()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    filename = f"iragt-auto-{stamp}.sql.gz"
    target = dir_path / filename

    logger.info("Starting scheduled 8-hour automated backup: %s", filename)
    
    # 1. Create the backup
    try:
        _run_backup_job(target)
        file_size = target.stat().st_size
        logger.info("Automated backup complete: %s (%d bytes)", filename, file_size)

        async with get_conn() as db:
            await log_audit(
                db,
                "system@iragt.internal",
                "db_auto_backup",
                target=filename,
                details=f"Automated 8-hour backup ({file_size} bytes)",
            )
    except Exception as e:
        logger.error("Automated backup failed: %s", e)
        if target.exists():
            target.unlink(missing_ok=True)

    # 2. Purge backups older than 7 days
    try:
        deleted = cleanup_old_backups(keep_days=RETENTION_DAYS)
        if deleted:
            logger.info("Retention cleanup removed %d backup(s) older than %d days: %s", len(deleted), RETENTION_DAYS, deleted)
            async with get_conn() as db:
                await log_audit(
                    db,
                    "system@iragt.internal",
                    "db_retention_purge",
                    target=", ".join(deleted[:5]),
                    details=f"Purged {len(deleted)} backup file(s) older than {RETENTION_DAYS} days",
                )
    except Exception as e:
        logger.error("Retention purge error: %s", e)


async def backup_scheduler_loop() -> None:
    """Background task loop: runs every 8 hours."""
    # Brief initial pause on boot so server startup finishes smoothly
    await asyncio.sleep(60)
    while True:
        try:
            await run_automated_backup_pass()
        except asyncio.CancelledError:
            logger.info("Backup scheduler loop cancelled")
            break
        except Exception as e:
            logger.error("Error in backup scheduler loop: %s", e)
        
        await asyncio.sleep(INTERVAL_SECONDS)


def start_backup_scheduler_task() -> asyncio.Task:
    """Start the background task for automated 3x daily backups."""
    logger.info("Starting automated backup scheduler (every 8h, 7d retention)")
    return asyncio.create_task(backup_scheduler_loop())
