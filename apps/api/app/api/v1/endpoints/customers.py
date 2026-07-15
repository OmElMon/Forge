from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_principal
from app.db.session import get_db
from app.models.customer import Customer
from app.schemas.customer import CustomerCreate, CustomerRead, CustomerUpdate
from app.schemas.principal import Principal

router = APIRouter(prefix="/customers", tags=["customers"])


async def get_company_customer(
    customer_id: UUID,
    db: AsyncSession,
    principal: Principal,
) -> Customer:
    result = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.company_id == principal.company_id,
        )
    )
    customer = result.scalar_one_or_none()
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")
    return customer


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


@router.get("/{customer_id}", response_model=CustomerRead)
async def read_customer(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Customer:
    return await get_company_customer(customer_id, db, principal)


@router.patch("/{customer_id}", response_model=CustomerRead)
async def update_customer(
    customer_id: UUID,
    payload: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Customer:
    customer = await get_company_customer(customer_id, db, principal)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(customer, field, value)
    await db.commit()
    await db.refresh(customer)
    return customer
