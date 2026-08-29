"""Add per-user TOTP MFA settings with hashed recovery codes."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260830_0021"
down_revision: str | None = "20260830_0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "mfa_settings",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("secret", sa.String(64), nullable=False),
        sa.Column("recovery_hashes", postgresql.JSONB(), nullable=False),
        sa.Column(
            "confirmed",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name=op.f("fk_mfa_settings_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_mfa_settings")),
    )
    op.execute('ALTER TABLE IF EXISTS "mfa_settings" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    op.drop_table("mfa_settings")
