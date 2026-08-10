"""Enable row-level security on application tables."""

from collections.abc import Sequence

from alembic import op

revision: str = "20260804_0004"
down_revision: str | None = "20260728_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APPLICATION_TABLES = (
    "audit_logs",
    "companies",
    "customers",
    "jobs",
    "memberships",
    "refresh_sessions",
    "users",
)


def upgrade() -> None:
    for table_name in APPLICATION_TABLES:
        op.execute(f'ALTER TABLE IF EXISTS "{table_name}" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    for table_name in reversed(APPLICATION_TABLES):
        op.execute(f'ALTER TABLE IF EXISTS "{table_name}" DISABLE ROW LEVEL SECURITY')
