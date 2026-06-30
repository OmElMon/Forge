from typing import TYPE_CHECKING

from sqlalchemy import Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import CompanyStatus

if TYPE_CHECKING:
    from app.models.membership import Membership


class Company(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "companies"

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    status: Mapped[CompanyStatus] = mapped_column(
        Enum(
            CompanyStatus,
            name="company_status",
            values_callable=lambda items: [item.value for item in items],
        ),
        default=CompanyStatus.ACTIVE,
        nullable=False,
    )
    timezone: Mapped[str] = mapped_column(String(64), default="America/New_York", nullable=False)

    memberships: Mapped[list["Membership"]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )
