"""Create tenant-scoped intake records for presale leads and calls."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260827_0016"
down_revision: str | None = "20260827_0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "intake_records",
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "kind",
            postgresql.ENUM(
                "lead",
                "call",
                name="intake_record_kind",
            ),
            server_default="lead",
            nullable=False,
        ),
        sa.Column(
            "status",
            postgresql.ENUM(
                "new",
                "contacted",
                "closed",
                "converted",
                name="intake_record_status",
            ),
            server_default="new",
            nullable=False,
        ),
        sa.Column("name", sa.String(160), nullable=True),
        sa.Column("phone", sa.String(40), nullable=True),
        sa.Column("source", sa.String(80), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=True),
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
            name=op.f("fk_intake_records_company_id_companies"),
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            ondelete="SET NULL",
            name=op.f("fk_intake_records_customer_id_customers"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_intake_records")),
    )
    op.create_index(
        op.f("ix_intake_records_company_id"),
        "intake_records",
        ["company_id"],
    )
    op.create_index(
        op.f("ix_intake_records_company_id_status"),
        "intake_records",
        ["company_id", "status"],
        unique=False,
    )
    op.execute('ALTER TABLE IF EXISTS "intake_records" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    op.drop_index(
        op.f("ix_intake_records_company_id_status"),
        table_name="intake_records",
    )
    op.drop_index(
        op.f("ix_intake_records_company_id"),
        table_name="intake_records",
    )
    op.drop_table("intake_records")
    op.execute("DROP TYPE IF EXISTS intake_record_kind")
    op.execute("DROP TYPE IF EXISTS intake_record_status")
