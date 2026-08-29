"""Create tenant-scoped workspace invites."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260828_0018"
down_revision: str | None = "20260828_0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

user_role = postgresql.ENUM(
    "owner",
    "admin",
    "dispatcher",
    "technician",
    "office_staff",
    name="user_role",
    create_type=False,
)


def upgrade() -> None:
    op.create_table(
        "invites",
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("full_name", sa.String(160), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("token_fingerprint", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            ondelete="RESTRICT",
            name=op.f("fk_invites_company_id_companies"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name=op.f("fk_invites_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_invites")),
        sa.UniqueConstraint("token_fingerprint", name=op.f("uq_invites_token_fingerprint")),
    )
    op.create_index(op.f("ix_invites_company_id"), "invites", ["company_id"])
    op.create_index(op.f("ix_invites_user_id"), "invites", ["user_id"])
    op.create_index(op.f("ix_invites_email"), "invites", ["email"])
    op.create_index(op.f("ix_invites_token_fingerprint"), "invites", ["token_fingerprint"])
    op.execute('ALTER TABLE IF EXISTS "invites" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    op.drop_index(op.f("ix_invites_token_fingerprint"), table_name="invites")
    op.drop_index(op.f("ix_invites_email"), table_name="invites")
    op.drop_index(op.f("ix_invites_user_id"), table_name="invites")
    op.drop_index(op.f("ix_invites_company_id"), table_name="invites")
    op.drop_table("invites")
