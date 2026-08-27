"""Create tenant-scoped automation follow-up tasks consumed from domain events."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260827_0012"
down_revision: str | None = "20260827_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

followup_task_status = postgresql.ENUM(
    "open",
    "resolved",
    name="followup_task_status",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    followup_task_status.create(bind, checkfirst=True)
    op.create_table(
        "followup_tasks",
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("rule_type", sa.String(80), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", followup_task_status, nullable=False),
        sa.Column("unique_key", sa.String(180), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
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
            name=op.f("fk_followup_tasks_company_id_companies"),
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            ondelete="CASCADE",
            name=op.f("fk_followup_tasks_customer_id_customers"),
        ),
        sa.ForeignKeyConstraint(
            ["job_id"],
            ["jobs.id"],
            ondelete="SET NULL",
            name=op.f("fk_followup_tasks_job_id_jobs"),
        ),
        sa.ForeignKeyConstraint(
            ["invoice_id"],
            ["invoices.id"],
            ondelete="SET NULL",
            name=op.f("fk_followup_tasks_invoice_id_invoices"),
        ),
        sa.ForeignKeyConstraint(
            ["resolved_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
            name=op.f("fk_followup_tasks_resolved_by_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_followup_tasks")),
    )
    op.create_index(op.f("ix_followup_tasks_company_id"), "followup_tasks", ["company_id"])
    op.create_index(op.f("ix_followup_tasks_customer_id"), "followup_tasks", ["customer_id"])
    op.create_index(op.f("ix_followup_tasks_job_id"), "followup_tasks", ["job_id"])
    op.create_index(op.f("ix_followup_tasks_invoice_id"), "followup_tasks", ["invoice_id"])
    op.create_index(op.f("ix_followup_tasks_rule_type"), "followup_tasks", ["rule_type"])
    op.create_index(op.f("ix_followup_tasks_status"), "followup_tasks", ["status"])
    op.create_index(op.f("ix_followup_tasks_due_at"), "followup_tasks", ["due_at"])
    op.create_index(
        "ux_followup_tasks_open_unique_key",
        "followup_tasks",
        ["company_id", "unique_key"],
        unique=True,
        postgresql_where=sa.text("status = 'open'"),
    )
    op.execute('ALTER TABLE IF EXISTS "followup_tasks" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    op.drop_index(
        "ux_followup_tasks_open_unique_key",
        table_name="followup_tasks",
        postgresql_where=sa.text("status = 'open'"),
    )
    op.drop_table("followup_tasks")
    followup_task_status.drop(op.get_bind(), checkfirst=True)
