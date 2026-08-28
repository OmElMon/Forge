"""Create password reset tokens for account recovery."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260828_0017"
down_revision: str | None = "20260827_0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "password_resets",
        sa.Column(
            "token_fingerprint",
            sa.String(64),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
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
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name=op.f("fk_password_resets_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_password_resets")),
        sa.UniqueConstraint("token_fingerprint", name=op.f("uq_password_resets_token_fingerprint")),
    )
    op.create_index(
        op.f("ix_password_resets_user_id"),
        "password_resets",
        ["user_id"],
    )
    op.create_index(
        op.f("ix_password_resets_token_fingerprint"),
        "password_resets",
        ["token_fingerprint"],
    )
    op.execute('ALTER TABLE IF EXISTS "password_resets" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    op.drop_index(
        op.f("ix_password_resets_token_fingerprint"),
        table_name="password_resets",
    )
    op.drop_index(
        op.f("ix_password_resets_user_id"),
        table_name="password_resets",
    )
    op.drop_table("password_resets")
