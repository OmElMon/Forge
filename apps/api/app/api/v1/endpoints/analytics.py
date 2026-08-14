from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_principal
from app.db.session import get_db
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.job import Job
from app.schemas.analytics import AnalyticsSummary
from app.schemas.principal import Principal
from app.services.analytics import build_analytics_summary

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary", response_model=AnalyticsSummary)
async def read_analytics_summary(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> AnalyticsSummary:
    customers_result = await db.execute(
        select(Customer).where(Customer.company_id == principal.company_id)
    )
    jobs_result = await db.execute(select(Job).where(Job.company_id == principal.company_id))
    invoices_result = await db.execute(
        select(Invoice).where(Invoice.company_id == principal.company_id)
    )

    return build_analytics_summary(
        customers=list(customers_result.scalars().all()),
        invoices=list(invoices_result.scalars().all()),
        jobs=list(jobs_result.scalars().all()),
    )
