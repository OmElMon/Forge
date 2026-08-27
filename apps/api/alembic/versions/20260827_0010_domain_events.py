"""Create tenant-scoped domain event stream for automation/AI consumption."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260827_0010"
down_revision: str | None = "20260812_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "domain_events",
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(120), nullable=False),
        sa.Column("aggregate_type", sa.String(80), nullable=False),
        sa.Column("aggregate_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("source", sa.String(40), server_default="api", nullable=False),
        sa.Column("correlation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            ondelete="RESTRICT",
            name=op.f("fk_domain_events_company_id_companies"),
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            ondelete="SET NULL",
            name=op.f("fk_domain_events_actor_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_domain_events")),
    )
    op.create_index(op.f("ix_domain_events_company_id"), "domain_events", ["company_id"])
    op.create_index(op.f("ix_domain_events_event_type"), "domain_events", ["event_type"])
    op.create_index(op.f("ix_domain_events_aggregate_id"), "domain_events", ["aggregate_id"])
    op.create_index(op.f("ix_domain_events_actor_user_id"), "domain_events", ["actor_user_id"])
    op.create_index(op.f("ix_domain_events_occurred_at"), "domain_events", ["occurred_at"])
    op.execute('ALTER TABLE IF EXISTS "domain_events" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    op.drop_index(op.f("ix_domain_events_occurred_at"), table_name="domain_events")
    op.drop_index(op.f("ix_domain_events_actor_user_id"), table_name="domain_events")
    op.drop_index(op.f("ix_domain_events_aggregate_id"), table_name="domain_events")
    op.drop_index(op.f("ix_domain_events_event_type"), table_name="domain_events")
    op.drop_index(op.f("ix_domain_events_company_id"), table_name="domain_events")
    op.drop_table("domain_events")
