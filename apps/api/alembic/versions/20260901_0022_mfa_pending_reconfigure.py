"""Add pending MFA reconfigure fields so the old secret stays active until confirmed."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260901_0022"
down_revision: str | None = "20260830_0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "mfa_settings",
        sa.Column("pending_secret", sa.String(64), nullable=True),
    )
    op.add_column(
        "mfa_settings",
        sa.Column("pending_recovery_hashes", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("mfa_settings", "pending_recovery_hashes")
    op.drop_column("mfa_settings", "pending_secret")
