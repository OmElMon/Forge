"""Track follow-up due delivery to enable proactive reminders."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260827_0014"
down_revision: str | None = "20260827_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "followup_tasks",
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        op.f("ix_followup_tasks_delivered_at"),
        "followup_tasks",
        ["delivered_at"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_followup_tasks_delivered_at"), table_name="followup_tasks")
    op.drop_column("followup_tasks", "delivered_at")
