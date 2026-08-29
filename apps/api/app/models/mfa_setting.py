from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User


class MfaSetting(TimestampMixin, Base):
    """Per-user TOTP MFA enrollment.

    The TOTP secret is stored Base32-plaintext because codes must be recoverable
    at verification time; tenancy is scoped by row-level security. Recovery codes
    are stored hashed with pwdlib so they are single-use and never recoverable.
    """

    __tablename__ = "mfa_settings"

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    secret: Mapped[str] = mapped_column(String(64), nullable=False)
    recovery_hashes: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    user: Mapped["User"] = relationship(back_populates="mfa_settings")
