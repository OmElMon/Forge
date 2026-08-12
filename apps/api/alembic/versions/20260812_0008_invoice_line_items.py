"""Create invoice line items table."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260812_0008"
down_revision: str | None = "20260810_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "invoice_line_items",
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("description", sa.String(240), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_amount_cents", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
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
            ["invoice_id"],
            ["invoices.id"],
            ondelete="CASCADE",
            name=op.f("fk_invoice_line_items_invoice_id_invoices"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_invoice_line_items")),
    )
    op.create_index(
        op.f("ix_invoice_line_items_invoice_id"),
        "invoice_line_items",
        ["invoice_id"],
    )
    op.execute('ALTER TABLE IF EXISTS "invoice_line_items" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    op.drop_index(op.f("ix_invoice_line_items_invoice_id"), table_name="invoice_line_items")
    op.drop_table("invoice_line_items")
