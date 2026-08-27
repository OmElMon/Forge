"""Thin Celery tasks: scheduled automation sweeps.

Tasks are deliberately thin wrappers — all decision logic lives in the
automation services so it stays unit-testable without a broker.
"""

import asyncio
from uuid import UUID

from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.company import Company
from app.models.enums import UserRole
from app.models.membership import Membership
from app.models.user import User
from app.schemas.principal import Principal
from app.services import automation_rules
from app.worker import celery


@celery.task(name="automation.followup_sweep")
def followup_sweep() -> None:
    """Materialize and deliver follow-ups for every company (idempotent)."""
    asyncio.run(_sweep_all())


async def _sweep_all() -> None:
    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(User, Company, Membership)
                .join(Membership, Membership.user_id == User.id)
                .join(Company, Company.id == Membership.company_id)
                .where(Membership.role == UserRole.OWNER)
                .order_by(User.id.asc(), Membership.created_at.asc())
            )
        ).all()
        owners_by_company: dict[UUID, tuple[User, Company, UserRole]] = {}
        for user, company, membership in rows:
            owners_by_company.setdefault(company.id, (user, company, membership.role))

        for user, company, role in owners_by_company.values():
            principal = Principal(
                user_id=user.id,
                company_id=company.id,
                email=user.email,
                full_name=user.full_name,
                company_name=company.name,
                role=role,
            )
            await automation_rules.materialize_pending_followups(db, principal)
            await automation_rules.deliver_due_followups(db, principal)
            await db.commit()
