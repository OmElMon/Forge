from uuid import UUID

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import TechnicianStatus


class Technician(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "technicians"

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(320))
    status: Mapped[TechnicianStatus] = mapped_column(
        Enum(
            TechnicianStatus,
            name="technician_status",
            values_callable=lambda items: [item.value for item in items],
        ),
        default=TechnicianStatus.AVAILABLE,
        nullable=False,
    )
    skills: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
