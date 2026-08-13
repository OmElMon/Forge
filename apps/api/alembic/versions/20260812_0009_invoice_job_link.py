"""Link invoices to source jobs."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260812_0009"
down_revision: str | None = "20260812_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("invoices", sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index(op.f("ix_invoices_job_id"), "invoices", ["job_id"])
    op.create_foreign_key(
        op.f("fk_invoices_job_id_jobs"),
        "invoices",
        "jobs",
        ["job_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_invoices_job_id_jobs"), "invoices", type_="foreignkey")
    op.drop_index(op.f("ix_invoices_job_id"), table_name="invoices")
    op.drop_column("invoices", "job_id")
