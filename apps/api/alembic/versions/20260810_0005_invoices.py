"""Create invoices table."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260810_0005"
down_revision: str | None = "20260804_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

invoice_type = postgresql.ENUM(
    "estimate",
    "invoice",
    name="invoice_type",
    create_type=False,
)

invoice_status = postgresql.ENUM(
    "draft",
    "sent",
    "approved",
    "converted",
    "paid",
    "void",
    name="invoice_status",
    create_type=False,
)


def upgrade() -> None:
    invoice_type.create(op.get_bind(), checkfirst=True)
    invoice_status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "invoices",
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_type", invoice_type, nullable=False),
        sa.Column("status", invoice_status, nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True)),
        sa.Column("notes", sa.Text()),
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
            name=op.f("fk_invoices_company_id_companies"),
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            ondelete="CASCADE",
            name=op.f("fk_invoices_customer_id_customers"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_invoices")),
    )
    op.create_index(op.f("ix_invoices_company_id"), "invoices", ["company_id"])
    op.create_index(op.f("ix_invoices_customer_id"), "invoices", ["customer_id"])
    op.create_index(op.f("ix_invoices_document_type"), "invoices", ["document_type"])
    op.create_index(op.f("ix_invoices_status"), "invoices", ["status"])
    op.execute('ALTER TABLE IF EXISTS "invoices" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    op.drop_table("invoices")
    invoice_status.drop(op.get_bind(), checkfirst=True)
    invoice_type.drop(op.get_bind(), checkfirst=True)
