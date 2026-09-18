"""Database backup and restore endpoints for administrators."""
import gzip
import logging
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from fastapi.responses import FileResponse
from psycopg import AsyncConnection

from app.core.audit import log_audit
from app.core.config import settings
from app.core.deps import get_admin_user, get_db

logger = logging.getLogger("backup")

router = APIRouter(prefix="/admin/backups", tags=["admin-backups"])

BACKUP_DIR = Path(os.environ.get("IRAGT_BACKUP_DIR", "/opt/iragt/backups")).resolve()
SAFE_FILENAME_RE = re.compile(r"^[a-zA-Z0-9_.-]+$")


def _ensure_backup_dir() -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    return BACKUP_DIR


def _validate_safe_filename(filename: str) -> Path:
    if not filename or not SAFE_FILENAME_RE.match(filename):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid backup filename")
    if not (filename.endswith(".sql.gz") or filename.endswith(".sql") or filename.endswith(".gz")):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File must be a .sql or .sql.gz backup")
    
    dir_path = _ensure_backup_dir()
    target = (dir_path / filename).resolve()
    if target.parent != dir_path:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid file path traversal attempt")
    return target


def _get_pg_env() -> dict[str, str]:
    env = os.environ.copy()
    env["PGPASSWORD"] = settings.POSTGRES_PASSWORD
    env["PGUSER"] = settings.POSTGRES_USER
    env["PGHOST"] = settings.POSTGRES_HOST
    env["PGPORT"] = str(settings.POSTGRES_PORT)
    env["PGDATABASE"] = settings.POSTGRES_DB
    return env


def _run_backup_job(out_path: Path) -> int:
    """Execute pg_dump and write compressed gzip output."""
    env = _get_pg_env()
    cmd = [
        "pg_dump",
        "-h", settings.POSTGRES_HOST,
        "-p", str(settings.POSTGRES_PORT),
        "-U", settings.POSTGRES_USER,
        "-d", settings.POSTGRES_DB,
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-privileges",
    ]
    proc = subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    with gzip.open(out_path, "wb", compresslevel=6) as gz_out:
        if proc.stdout is not None:
            shutil.copyfileobj(proc.stdout, gz_out)
    
    proc.wait()
    if proc.returncode != 0:
        err_msg = proc.stderr.read().decode("utf-8", errors="replace") if proc.stderr else "Unknown error"
        if out_path.exists():
            out_path.unlink(missing_ok=True)
        raise RuntimeError(f"pg_dump failed (code {proc.returncode}): {err_msg}")
    return proc.returncode


def _run_restore_job(src_path: Path) -> None:
    """Restore database from .sql or .sql.gz using psql."""
    env = _get_pg_env()
    cmd = [
        "psql",
        "-h", settings.POSTGRES_HOST,
        "-p", str(settings.POSTGRES_PORT),
        "-U", settings.POSTGRES_USER,
        "-d", settings.POSTGRES_DB,
        "-v", "ON_ERROR_STOP=0",
    ]
    
    is_gz = src_path.name.endswith(".gz") or src_path.name.endswith(".sql.gz")
    
    if is_gz:
        with gzip.open(src_path, "rb") as gz_in:
            proc = subprocess.run(cmd, env=env, input=gz_in.read(), capture_output=True)
    else:
        with open(src_path, "rb") as sql_in:
            proc = subprocess.run(cmd, env=env, input=sql_in.read(), capture_output=True)
            
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace")
        raise RuntimeError(f"psql restore failed (code {proc.returncode}): {err[:1000]}")


@router.get("")
async def list_backups(
    admin: dict = Depends(get_admin_user),
) -> dict[str, Any]:
    """List all available database backup files and summary statistics."""
    dir_path = _ensure_backup_dir()
    items = []
    total_bytes = 0

    for entry in dir_path.iterdir():
        if entry.is_file() and (entry.name.endswith(".sql.gz") or entry.name.endswith(".sql")):
            if entry.name == ".gitkeep":
                continue
            stat = entry.stat()
            size = stat.st_size
            total_bytes += size
            mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
            items.append({
                "filename": entry.name,
                "size_bytes": size,
                "size_formatted": f"{size / (1024 * 1024):.2f} MB" if size >= 1024 * 1024 else f"{size / 1024:.1f} KB",
                "created_at": mtime,
                "is_compressed": entry.name.endswith(".gz"),
            })

    # Newest backups first
    items.sort(key=lambda x: x["created_at"], reverse=True)
    return {
        "backups": items,
        "total_count": len(items),
        "total_size_bytes": total_bytes,
        "total_size_formatted": f"{total_bytes / (1024 * 1024):.2f} MB" if total_bytes >= 1024 * 1024 else f"{total_bytes / 1024:.1f} KB",
        "backup_directory": str(dir_path),
        "auto_backup_schedule": "3 times daily (every 8 hours)",
        "retention_days": 7,
    }


@router.post("/cleanup")
async def trigger_cleanup(
    keep_days: int = 7,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
) -> dict[str, Any]:
    """Trigger manual retention cleanup to remove backups older than keep_days."""
    from app.core.backup_scheduler import cleanup_old_backups
    deleted = cleanup_old_backups(keep_days=keep_days)
    if deleted:
        await log_audit(
            db,
            admin["email"],
            "db_retention_purge",
            target=", ".join(deleted[:5]),
            details=f"Purged {len(deleted)} backup file(s) older than {keep_days} days",
        )
    return {
        "ok": True,
        "deleted_count": len(deleted),
        "deleted_files": deleted,
        "message": f"Purged {len(deleted)} backup(s) older than {keep_days} days" if deleted else f"No backups older than {keep_days} days found.",
    }


@router.post("/create")
async def create_backup(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
) -> dict[str, Any]:
    """Trigger an on-demand database backup."""
    dir_path = _ensure_backup_dir()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    filename = f"iragt-{stamp}.sql.gz"
    target = dir_path / filename

    try:
        _run_backup_job(target)
    except Exception as e:
        logger.error(f"Backup creation error: {e}")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Failed to create backup: {e}")

    stat = target.stat()
    await log_audit(
        db,
        admin["email"],
        "db_backup_create",
        target=filename,
        details=f"Backup created ({stat.st_size} bytes)",
    )

    return {
        "ok": True,
        "message": "Database backup created successfully",
        "filename": filename,
        "size_bytes": stat.st_size,
        "created_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
    }


@router.get("/download/{filename}")
async def download_backup(
    filename: str,
    admin: dict = Depends(get_admin_user),
) -> FileResponse:
    """Download a database backup file."""
    target = _validate_safe_filename(filename)
    if not target.exists() or not target.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Backup file not found")

    media_type = "application/gzip" if target.name.endswith(".gz") else "application/sql"
    return FileResponse(
        path=target,
        filename=target.name,
        media_type=media_type,
    )


@router.post("/upload")
async def upload_backup(
    file: UploadFile = File(...),
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
) -> dict[str, Any]:
    """Upload a database backup file (.sql or .sql.gz)."""
    raw_name = file.filename or "uploaded-backup.sql.gz"
    clean_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", raw_name)
    if not (clean_name.endswith(".sql.gz") or clean_name.endswith(".sql") or clean_name.endswith(".gz")):
        clean_name = f"{clean_name}.sql.gz"

    target = _validate_safe_filename(clean_name)
    
    # If file exists, prepend timestamp to avoid accidental overwrite
    if target.exists():
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        target = _validate_safe_filename(f"{stamp}_{clean_name}")

    try:
        with open(target, "wb") as f_out:
            shutil.copyfileobj(file.file, f_out)
    except Exception as e:
        if target.exists():
            target.unlink(missing_ok=True)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Failed to save uploaded backup: {e}")

    stat = target.stat()
    await log_audit(
        db,
        admin["email"],
        "db_backup_upload",
        target=target.name,
        details=f"Backup uploaded ({stat.st_size} bytes)",
    )

    return {
        "ok": True,
        "message": "Backup uploaded successfully",
        "filename": target.name,
        "size_bytes": stat.st_size,
    }


@router.post("/restore")
async def restore_backup(
    payload: dict[str, Any],
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
) -> dict[str, Any]:
    """Restore database from an existing backup file.
    
    Automatically creates a safety backup before restoring.
    """
    filename = payload.get("filename", "")
    target = _validate_safe_filename(filename)
    if not target.exists() or not target.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Backup file not found")

    dir_path = _ensure_backup_dir()
    safety_stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    safety_filename = f"iragt-pre-restore-{safety_stamp}.sql.gz"
    safety_target = dir_path / safety_filename

    # Step 1: Create automatic safety snapshot
    try:
        _run_backup_job(safety_target)
    except Exception as e:
        logger.warning(f"Could not take safety snapshot prior to restore: {e}")

    # Step 2: Execute restoration
    try:
        _run_restore_job(target)
    except Exception as e:
        logger.error(f"Restore failed: {e}")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Database restore failed: {e}")

    await log_audit(
        db,
        admin["email"],
        "db_restore",
        target=target.name,
        details=f"Restored DB from {target.name}. Safety snapshot: {safety_filename}",
    )

    return {
        "ok": True,
        "message": f"Database successfully restored from {target.name}",
        "safety_backup": safety_filename,
    }


@router.delete("/{filename}")
async def delete_backup(
    filename: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
) -> dict[str, Any]:
    """Delete a database backup file."""
    target = _validate_safe_filename(filename)
    if not target.exists() or not target.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Backup file not found")

    try:
        target.unlink()
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Failed to delete backup file: {e}")

    await log_audit(
        db,
        admin["email"],
        "db_backup_delete",
        target=filename,
        details="Deleted backup file",
    )

    return {
        "ok": True,
        "message": f"Backup file {filename} deleted successfully",
    }
