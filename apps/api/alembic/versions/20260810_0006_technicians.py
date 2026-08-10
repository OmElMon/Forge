"""Create technicians table and link jobs."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260810_0006"
down_revision: str | None = "20260810_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

technician_status = postgresql.ENUM(
    "available",
    "on_job",
    "off_today",
    name="technician_status",
    create_type=False,
)


def upgrade() -> None:
    technician_status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "technicians",
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("phone", sa.String(40)),
        sa.Column("email", sa.String(320)),
        sa.Column("status", technician_status, nullable=False),
        sa.Column("skills", postgresql.JSONB(), nullable=False),
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
            name=op.f("fk_technicians_company_id_companies"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_technicians")),
    )
    op.create_index(op.f("ix_technicians_company_id"), "technicians", ["company_id"])
    op.create_index(op.f("ix_technicians_status"), "technicians", ["status"])
    op.execute('ALTER TABLE IF EXISTS "technicians" ENABLE ROW LEVEL SECURITY')

    op.add_column("jobs", sa.Column("technician_id", postgresql.UUID(as_uuid=True)))
    op.create_index(op.f("ix_jobs_technician_id"), "jobs", ["technician_id"])
    op.create_foreign_key(
        op.f("fk_jobs_technician_id_technicians"),
        "jobs",
        "technicians",
        ["technician_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_jobs_technician_id_technicians"), "jobs", type_="foreignkey")
    op.drop_index(op.f("ix_jobs_technician_id"), table_name="jobs")
    op.drop_column("jobs", "technician_id")
    op.drop_table("technicians")
    technician_status.drop(op.get_bind(), checkfirst=True)
