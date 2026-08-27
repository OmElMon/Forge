"""Create tenant-scoped automation policy toggles for follow-up rules."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260827_0015"
down_revision: str | None = "20260827_0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "automation_policies",
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rule_type", sa.String(80), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.true(), nullable=False),
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
            ondelete="CASCADE",
            name=op.f("fk_automation_policies_company_id_companies"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_automation_policies")),
        sa.UniqueConstraint(
            "company_id",
            "rule_type",
            name="uq_automation_policies_company_rule",
        ),
    )
    op.create_index(
        op.f("ix_automation_policies_company_id"),
        "automation_policies",
        ["company_id"],
    )
    op.execute('ALTER TABLE IF EXISTS "automation_policies" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    op.drop_index(
        op.f("ix_automation_policies_company_id"),
        table_name="automation_policies",
    )
    op.drop_table("automation_policies")
