"""Create customers table."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260715_0002"
down_revision: str | None = "20260630_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

customer_status = postgresql.ENUM("lead", "active", "inactive", name="customer_status")


def upgrade() -> None:
    customer_status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "customers",
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("phone", sa.String(40)),
        sa.Column("email", sa.String(320)),
        sa.Column("status", customer_status, nullable=False),
        sa.Column("source", sa.String(80)),
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
            name=op.f("fk_customers_company_id_companies"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_customers")),
    )
    op.create_index(op.f("ix_customers_company_id"), "customers", ["company_id"])
    op.create_index(op.f("ix_customers_email"), "customers", ["email"])
    op.create_index(op.f("ix_customers_name"), "customers", ["name"])


def downgrade() -> None:
    op.drop_table("customers")
    customer_status.drop(op.get_bind(), checkfirst=True)
