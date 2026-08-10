from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_principal
from app.db.session import get_db
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.schemas.invoice import InvoiceCreate, InvoiceRead, InvoiceUpdate
from app.schemas.principal import Principal

router = APIRouter(prefix="/invoices", tags=["invoices"])


async def ensure_company_customer(
    customer_id: UUID,
    db: AsyncSession,
    principal: Principal,
) -> None:
    result = await db.execute(
        select(Customer.id).where(
            Customer.id == customer_id,
            Customer.company_id == principal.company_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")


async def get_company_invoice(
    invoice_id: UUID,
    db: AsyncSession,
    principal: Principal,
) -> Invoice:
    result = await db.execute(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.company_id == principal.company_id,
        )
    )
    invoice = result.scalar_one_or_none()
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found.")
    return invoice


@router.get("", response_model=list[InvoiceRead])
async def list_invoices(
    customer_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[Invoice]:
    query = select(Invoice).where(Invoice.company_id == principal.company_id)
    if customer_id is not None:
        query = query.where(Invoice.customer_id == customer_id)
    result = await db.execute(query.order_by(Invoice.created_at.desc()))
    return list(result.scalars().all())


@router.post("", response_model=InvoiceRead, status_code=status.HTTP_201_CREATED)
async def create_invoice(
    payload: InvoiceCreate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Invoice:
    await ensure_company_customer(payload.customer_id, db, principal)
    invoice = Invoice(company_id=principal.company_id, **payload.model_dump())
    db.add(invoice)
    await db.commit()
    await db.refresh(invoice)
    return invoice


@router.get("/{invoice_id}", response_model=InvoiceRead)
async def read_invoice(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Invoice:
    return await get_company_invoice(invoice_id, db, principal)


@router.patch("/{invoice_id}", response_model=InvoiceRead)
async def update_invoice(
    invoice_id: UUID,
    payload: InvoiceUpdate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Invoice:
    invoice = await get_company_invoice(invoice_id, db, principal)
    updates = payload.model_dump(exclude_unset=True)
    if "customer_id" in updates:
        await ensure_company_customer(updates["customer_id"], db, principal)
    for field, value in updates.items():
        setattr(invoice, field, value)
    await db.commit()
    await db.refresh(invoice)
    return invoice
