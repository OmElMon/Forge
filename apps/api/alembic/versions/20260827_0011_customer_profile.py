"""Add customer profile depth: contact preferences, service addresses, equipment."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260827_0011"
down_revision: str | None = "20260827_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

customer_preferred_contact = postgresql.ENUM(
    "phone",
    "email",
    "sms",
    name="customer_preferred_contact",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    customer_preferred_contact.create(bind, checkfirst=True)
    op.add_column(
        "customers",
        sa.Column("preferred_contact", customer_preferred_contact, nullable=True),
    )
    op.add_column(
        "customers",
        sa.Column(
            "sms_opt_in",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.create_table(
        "service_addresses",
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("label", sa.String(40), nullable=False),
        sa.Column("address_line1", sa.String(200), nullable=False),
        sa.Column("address_line2", sa.String(200), nullable=True),
        sa.Column("city", sa.String(120), nullable=False),
        sa.Column("state", sa.String(2), nullable=False),
        sa.Column("postal_code", sa.String(20), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
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
            name=op.f("fk_service_addresses_company_id_companies"),
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            ondelete="CASCADE",
            name=op.f("fk_service_addresses_customer_id_customers"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_service_addresses")),
    )
    op.create_index(op.f("ix_service_addresses_company_id"), "service_addresses", ["company_id"])
    op.create_index(op.f("ix_service_addresses_customer_id"), "service_addresses", ["customer_id"])
    op.execute('ALTER TABLE IF EXISTS "service_addresses" ENABLE ROW LEVEL SECURITY')

    op.create_table(
        "equipment",
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("manufacturer", sa.String(120), nullable=True),
        sa.Column("model", sa.String(120), nullable=True),
        sa.Column("serial_number", sa.String(120), nullable=True),
        sa.Column("installed_at", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
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
            name=op.f("fk_equipment_company_id_companies"),
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            ondelete="CASCADE",
            name=op.f("fk_equipment_customer_id_customers"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_equipment")),
    )
    op.create_index(op.f("ix_equipment_company_id"), "equipment", ["company_id"])
    op.create_index(op.f("ix_equipment_customer_id"), "equipment", ["customer_id"])
    op.execute('ALTER TABLE IF EXISTS "equipment" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    op.drop_table("equipment")
    op.drop_table("service_addresses")
    op.drop_column("customers", "sms_opt_in")
    op.drop_column("customers", "preferred_contact")
    customer_preferred_contact.drop(op.get_bind(), checkfirst=True)
