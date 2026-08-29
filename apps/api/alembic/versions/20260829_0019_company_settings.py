"""Add workspace profile and billing status to companies."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260829_0019"
down_revision: str | None = "20260828_0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("service_area", sa.String(160), nullable=True))
    op.add_column("companies", sa.Column("default_trade", sa.String(80), nullable=True))
    op.add_column(
        "companies",
        sa.Column(
            "notification_prefs",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column(
        "companies",
        sa.Column(
            "billing_status",
            sa.String(32),
            server_default="free",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("companies", "billing_status")
    op.drop_column("companies", "notification_prefs")
    op.drop_column("companies", "default_trade")
    op.drop_column("companies", "service_area")
