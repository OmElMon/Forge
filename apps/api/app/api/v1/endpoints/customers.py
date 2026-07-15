from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_principal
from app.db.session import get_db
from app.models.customer import Customer
from app.schemas.customer import CustomerCreate, CustomerRead
from app.schemas.principal import Principal

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("", response_model=list[CustomerRead])
async def list_customers(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[Customer]:
    result = await db.execute(
        select(Customer)
        .where(Customer.company_id == principal.company_id)
        .order_by(Customer.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("", response_model=CustomerRead, status_code=status.HTTP_201_CREATED)
async def create_customer(
    payload: CustomerCreate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Customer:
    customer = Customer(company_id=principal.company_id, **payload.model_dump())
    db.add(customer)
    await db.commit()
    await db.refresh(customer)
    return customer
