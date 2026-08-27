from uuid import UUID

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import IntakeRecordKind, IntakeRecordStatus


class IntakeRecord(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A presale touchpoint (web lead, missed/received call) awaiting response.

    Distinct from a Customer: an intake record is the raw inbound signal that a
    service business should follow up on. Converting one creates a Customer and
    links the two (``customer_id``) so agents build the presale pipeline into CRM.
    """

    __tablename__ = "intake_records"

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    kind: Mapped[IntakeRecordKind] = mapped_column(
        Enum(
            IntakeRecordKind,
            name="intake_record_kind",
            values_callable=lambda items: [item.value for item in items],
        ),
        default=IntakeRecordKind.LEAD,
        nullable=False,
    )
    status: Mapped[IntakeRecordStatus] = mapped_column(
        Enum(
            IntakeRecordStatus,
            name="intake_record_status",
            values_callable=lambda items: [item.value for item in items],
        ),
        default=IntakeRecordStatus.NEW,
        nullable=False,
    )
    name: Mapped[str | None] = mapped_column(String(160))
    phone: Mapped[str | None] = mapped_column(String(40))
    source: Mapped[str | None] = mapped_column(String(80))
    notes: Mapped[str | None] = mapped_column(Text)
    customer_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="SET NULL"),
        nullable=True,
    )

    def __str__(self) -> str:  # pragma: no cover - trivial debug aid
        return f"IntakeRecord(id={self.id}, kind={self.kind}, status={self.status})"
