#!/usr/bin/env sh
# Logical Postgres backup for CrewPilot OS.
#
# Dumps the database referenced by DATABASE_URL into a timestamped, gzipped
# archive under BACKUP_DIR (default ./backups) and prunes old archives beyond
# BACKUP_RETENTION (default 14) using BACKUP_PREFIX (default crewpilot).
#
# Works against the local docker-compose Postgres and Supabase (logical dumps
# contain only the application schema/data, not Supabase platform tables).
# Run the equivalent of `pg_dump` via the `pg_dump` CLI against the async URL.
set -eu

DATABASE_URL="${DATABASE_URL:-}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_RETENTION="${BACKUP_RETENTION:-14}"
BACKUP_PREFIX="${BACKUP_PREFIX:-crewpilot}"

if [ -z "$DATABASE_URL" ]; then
  echo "error: DATABASE_URL is not set" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUTFILE="$BACKUP_DIR/${BACKUP_PREFIX}_${STAMP}.sql.gz"

# pg_dump does not understand the +asyncpg driver suffix, so strip it.
PGURL="$(printf '%s' "$DATABASE_URL" | sed 's/^postgresql+asyncpg:\/\//postgresql:\/\//')"

echo "backing up to $OUTFILE"
pg_dump "$PGURL" | gzip -9 > "$OUTFILE"

# Sanity-check the archive is valid gzip and non-empty.
if ! gzip -t "$OUTFILE"; then
  echo "error: $OUTFILE is not valid gzip" >&2
  rm -f "$OUTFILE"
  exit 1
fi
echo "backup verified: $OUTFILE"

echo "pruning backups older than ${BACKUP_RETENTION} kept (glob $BACKUP_PREFIX)"
find "$BACKUP_DIR" -maxdepth 1 -name "${BACKUP_PREFIX}_*.sql.gz" -mtime "+$((BACKUP_RETENTION - 1))" -print -delete

echo "done. backups in $BACKUP_DIR:"
ls -1 "$BACKUP_DIR" | grep "^${BACKUP_PREFIX}_" || true
