from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class AutomationPolicy(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Per-company override controlling whether an automation rule materializes."""

    __tablename__ = "automation_policies"
    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "rule_type",
            name="uq_automation_policies_company_rule",
        ),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    rule_type: Mapped[str] = mapped_column(String(80), nullable=False)
    enabled: Mapped[bool] = mapped_column(
        Boolean,
        server_default=func.true(),
        default=True,
        nullable=False,
    )
