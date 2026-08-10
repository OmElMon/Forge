"""Add pricing amount to jobs."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260810_0007"
down_revision: str | None = "20260810_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column("amount_cents", sa.Integer(), server_default="0", nullable=False),
    )
    op.alter_column("jobs", "amount_cents", server_default=None)


def downgrade() -> None:
    op.drop_column("jobs", "amount_cents")
