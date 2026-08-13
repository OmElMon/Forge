from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_principal
from app.db.session import get_db
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.job import Job
from app.schemas.attention import AttentionSummary
from app.schemas.principal import Principal
from app.services.attention import build_attention_summary

router = APIRouter(prefix="/attention", tags=["attention"])


@router.get("", response_model=AttentionSummary)
async def read_attention_queue(
    limit: int = Query(default=12, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> AttentionSummary:
    customers_result = await db.execute(
        select(Customer).where(Customer.company_id == principal.company_id)
    )
    jobs_result = await db.execute(select(Job).where(Job.company_id == principal.company_id))
    invoices_result = await db.execute(
        select(Invoice).where(Invoice.company_id == principal.company_id)
    )

    return build_attention_summary(
        customers=list(customers_result.scalars().all()),
        jobs=list(jobs_result.scalars().all()),
        invoices=list(invoices_result.scalars().all()),
        limit=limit,
    )
