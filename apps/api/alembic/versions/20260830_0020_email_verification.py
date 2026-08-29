"""Add email verification to users and create email_verifications tokens."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260830_0020"
down_revision: str | None = "20260829_0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "email_verified",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "email_verifications",
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
            name=op.f("fk_email_verifications_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_email_verifications")),
        sa.UniqueConstraint(
            "token_fingerprint", name=op.f("uq_email_verifications_token_fingerprint")
        ),
    )
    op.create_index(
        op.f("ix_email_verifications_user_id"),
        "email_verifications",
        ["user_id"],
    )
    op.create_index(
        op.f("ix_email_verifications_token_fingerprint"),
        "email_verifications",
        ["token_fingerprint"],
    )
    op.execute('ALTER TABLE IF EXISTS "email_verifications" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    op.drop_index(
        op.f("ix_email_verifications_token_fingerprint"),
        table_name="email_verifications",
    )
    op.drop_index(
        op.f("ix_email_verifications_user_id"),
        table_name="email_verifications",
    )
    op.drop_table("email_verifications")
    op.drop_column("users", "email_verified_at")
    op.drop_column("users", "email_verified")
