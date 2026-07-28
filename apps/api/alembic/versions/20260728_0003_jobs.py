"""Create jobs table."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260728_0003"
down_revision: str | None = "20260715_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

job_status = postgresql.ENUM(
    "new",
    "scheduled",
    "in_progress",
    "completed",
    "canceled",
    name="job_status",
    create_type=False,
)


def upgrade() -> None:
    job_status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "jobs",
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("status", job_status, nullable=False),
        sa.Column("scheduled_start", sa.DateTime(timezone=True)),
        sa.Column("technician_name", sa.String(120)),
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
            name=op.f("fk_jobs_company_id_companies"),
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            ondelete="CASCADE",
            name=op.f("fk_jobs_customer_id_customers"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_jobs")),
    )
    op.create_index(op.f("ix_jobs_company_id"), "jobs", ["company_id"])
    op.create_index(op.f("ix_jobs_customer_id"), "jobs", ["customer_id"])
    op.create_index(op.f("ix_jobs_scheduled_start"), "jobs", ["scheduled_start"])
    op.create_index(op.f("ix_jobs_status"), "jobs", ["status"])


def downgrade() -> None:
    op.drop_table("jobs")
    job_status.drop(op.get_bind(), checkfirst=True)
