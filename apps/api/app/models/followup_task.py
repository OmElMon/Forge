from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import FollowupTaskStatus


class FollowupTask(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Tenant-scoped automation follow-up generated from the domain event stream.

    Rules materialize follow-ups when an operational event marks state that needs
    a human touch (estimate sent/approved, invoice sent). Deduplication relies on
    a partial unique index over ``(company_id, unique_key)`` for open tasks.
    """

    __tablename__ = "followup_tasks"

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    customer_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )
    job_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("jobs.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    invoice_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("invoices.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    rule_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[FollowupTaskStatus] = mapped_column(
        Enum(
            FollowupTaskStatus,
            name="followup_task_status",
            values_callable=lambda items: [item.value for item in items],
        ),
        default=FollowupTaskStatus.OPEN,
        index=True,
        nullable=False,
    )
    unique_key: Mapped[str | None] = mapped_column(String(180))
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by_user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
