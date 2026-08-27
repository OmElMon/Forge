from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_principal
from app.db.session import get_db
from app.models.customer import Customer
from app.models.enums import (
    DomainAggregateType,
    DomainEventType,
    InvoiceStatus,
    InvoiceType,
)
from app.models.invoice import Invoice
from app.models.invoice_line_item import InvoiceLineItem
from app.models.job import Job
from app.schemas.invoice import InvoiceConversionRead, InvoiceCreate, InvoiceRead, InvoiceUpdate
from app.schemas.invoice_line_item import (
    InvoiceLineItemCreate,
    InvoiceLineItemRead,
    InvoiceLineItemUpdate,
)
from app.schemas.principal import Principal
from app.services.audit import record_audit_event
from app.services.events import emit_domain_event

router = APIRouter(prefix="/invoices", tags=["invoices"])


def invoice_transition_event_type(
    *,
    next_status: InvoiceStatus,
    next_type: InvoiceType,
    previous_status: InvoiceStatus,
    previous_type: InvoiceType,
) -> DomainEventType:
    if previous_type == InvoiceType.ESTIMATE and next_type == InvoiceType.INVOICE:
        return DomainEventType.ESTIMATE_CONVERTED
    if next_status == InvoiceStatus.SENT:
        return DomainEventType.INVOICE_SENT
    if (
        previous_type == InvoiceType.ESTIMATE
        and next_status == InvoiceStatus.APPROVED
        and previous_status in {InvoiceStatus.DRAFT, InvoiceStatus.SENT}
    ):
        return DomainEventType.ESTIMATE_APPROVED
    if (
        next_type == InvoiceType.INVOICE
        and next_status == InvoiceStatus.PAID
        and previous_status != InvoiceStatus.PAID
    ):
        return DomainEventType.INVOICE_PAID
    return DomainEventType.INVOICE_UPDATED


def converted_invoice_title(estimate_title: str) -> str:
    if "estimate" in estimate_title.lower():
        return estimate_title.lower().replace("estimate", "invoice").title()
    return f"{estimate_title} invoice"


def append_workflow_note(existing_notes: str | None, note: str) -> str:
    if not existing_notes:
        return note
    return f"{existing_notes.rstrip()}\n\n{note}"


def invoice_audit_context(invoice: Invoice, **extra: object) -> dict[str, object]:
    return {
        "amount_cents": invoice.amount_cents,
        "customer_id": invoice.customer_id,
        "document_type": invoice.document_type,
        "job_id": invoice.job_id,
        "status": invoice.status,
        "title": invoice.title,
        **extra,
    }


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


async def ensure_company_job(
    job_id: UUID,
    customer_id: UUID,
    db: AsyncSession,
    principal: Principal,
) -> None:
    result = await db.execute(
        select(Job.id).where(
            Job.id == job_id,
            Job.customer_id == customer_id,
            Job.company_id == principal.company_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")


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


async def get_company_line_item(
    line_item_id: UUID,
    invoice_id: UUID,
    db: AsyncSession,
    principal: Principal,
) -> InvoiceLineItem:
    result = await db.execute(
        select(InvoiceLineItem)
        .join(Invoice, Invoice.id == InvoiceLineItem.invoice_id)
        .where(
            InvoiceLineItem.id == line_item_id,
            InvoiceLineItem.invoice_id == invoice_id,
            Invoice.company_id == principal.company_id,
        )
    )
    line_item = result.scalar_one_or_none()
    if line_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Line item not found.")
    return line_item


async def recalculate_invoice_total(invoice_id: UUID, db: AsyncSession) -> None:
    result = await db.execute(
        select(InvoiceLineItem).where(InvoiceLineItem.invoice_id == invoice_id)
    )
    line_items = result.scalars().all()
    total_cents = sum(item.quantity * item.unit_amount_cents for item in line_items)
    invoice = await db.get(Invoice, invoice_id)
    if invoice is not None:
        invoice.amount_cents = total_cents


def ensure_invoice_transition(
    invoice: Invoice,
    *,
    allowed_types: set[InvoiceType],
    allowed_statuses: set[InvoiceStatus],
    detail: str,
) -> None:
    if invoice.document_type not in allowed_types or invoice.status not in allowed_statuses:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


async def copy_invoice_line_items(
    *,
    source_invoice_id: UUID,
    target_invoice_id: UUID,
    db: AsyncSession,
) -> None:
    result = await db.execute(
        select(InvoiceLineItem)
        .where(InvoiceLineItem.invoice_id == source_invoice_id)
        .order_by(InvoiceLineItem.sort_order.asc(), InvoiceLineItem.created_at.asc())
    )
    source_items = result.scalars().all()
    db.add_all(
        [
            InvoiceLineItem(
                invoice_id=target_invoice_id,
                description=item.description,
                quantity=item.quantity,
                unit_amount_cents=item.unit_amount_cents,
                sort_order=item.sort_order,
            )
            for item in source_items
        ]
    )


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
    if payload.job_id is not None:
        await ensure_company_job(payload.job_id, payload.customer_id, db, principal)
    invoice = Invoice(company_id=principal.company_id, **payload.model_dump())
    db.add(invoice)
    await db.flush()
    record_audit_event(
        db,
        principal,
        action="invoice.created",
        context=invoice_audit_context(invoice),
        resource_id=invoice.id,
        resource_type="invoice",
    )
    emit_domain_event(
        db,
        principal,
        aggregate_id=invoice.id,
        aggregate_type=DomainAggregateType.INVOICE,
        event_type=DomainEventType.INVOICE_CREATED,
        payload=invoice_audit_context(invoice),
    )
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
    previous_status = invoice.status
    previous_type = invoice.document_type
    if "customer_id" in updates:
        await ensure_company_customer(updates["customer_id"], db, principal)
    next_customer_id = updates.get("customer_id", invoice.customer_id)
    if updates.get("job_id") is not None:
        await ensure_company_job(updates["job_id"], next_customer_id, db, principal)
    elif "customer_id" in updates and invoice.job_id is not None:
        await ensure_company_job(invoice.job_id, next_customer_id, db, principal)
    changed_fields = sorted(updates)
    for field, value in updates.items():
        setattr(invoice, field, value)
    event_type = invoice_transition_event_type(
        next_status=invoice.status,
        next_type=invoice.document_type,
        previous_status=previous_status,
        previous_type=previous_type,
    )
    record_audit_event(
        db,
        principal,
        action="invoice.updated",
        context=invoice_audit_context(invoice, changed_fields=changed_fields),
        resource_id=invoice.id,
        resource_type="invoice",
    )
    emit_domain_event(
        db,
        principal,
        aggregate_id=invoice.id,
        aggregate_type=DomainAggregateType.INVOICE,
        event_type=event_type,
        payload=invoice_audit_context(
            invoice,
            changed_fields=changed_fields,
            previous_document_type=previous_type,
            previous_status=previous_status,
        ),
    )
    await db.commit()
    await db.refresh(invoice)
    return invoice


@router.post("/{invoice_id}/send", response_model=InvoiceRead)
async def send_invoice(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Invoice:
    invoice = await get_company_invoice(invoice_id, db, principal)
    ensure_invoice_transition(
        invoice,
        allowed_types={InvoiceType.ESTIMATE, InvoiceType.INVOICE},
        allowed_statuses={InvoiceStatus.DRAFT},
        detail="Only draft estimates or invoices can be sent.",
    )
    invoice.status = InvoiceStatus.SENT
    record_audit_event(
        db,
        principal,
        action="invoice.sent",
        context=invoice_audit_context(invoice),
        resource_id=invoice.id,
        resource_type="invoice",
    )
    emit_domain_event(
        db,
        principal,
        aggregate_id=invoice.id,
        aggregate_type=DomainAggregateType.INVOICE,
        event_type=DomainEventType.INVOICE_SENT,
        payload=invoice_audit_context(invoice),
    )
    await db.commit()
    await db.refresh(invoice)
    return invoice


@router.post("/{invoice_id}/approve", response_model=InvoiceRead)
async def approve_estimate(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Invoice:
    invoice = await get_company_invoice(invoice_id, db, principal)
    ensure_invoice_transition(
        invoice,
        allowed_types={InvoiceType.ESTIMATE},
        allowed_statuses={InvoiceStatus.DRAFT, InvoiceStatus.SENT},
        detail="Only draft or sent estimates can be approved.",
    )
    invoice.status = InvoiceStatus.APPROVED
    record_audit_event(
        db,
        principal,
        action="estimate.approved",
        context=invoice_audit_context(invoice),
        resource_id=invoice.id,
        resource_type="invoice",
    )
    emit_domain_event(
        db,
        principal,
        aggregate_id=invoice.id,
        aggregate_type=DomainAggregateType.INVOICE,
        event_type=DomainEventType.ESTIMATE_APPROVED,
        payload=invoice_audit_context(invoice),
    )
    await db.commit()
    await db.refresh(invoice)
    return invoice


@router.post("/{invoice_id}/mark-paid", response_model=InvoiceRead)
async def mark_invoice_paid(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Invoice:
    invoice = await get_company_invoice(invoice_id, db, principal)
    ensure_invoice_transition(
        invoice,
        allowed_types={InvoiceType.INVOICE},
        allowed_statuses={InvoiceStatus.DRAFT, InvoiceStatus.SENT, InvoiceStatus.APPROVED},
        detail="Only open invoices can be marked paid.",
    )
    invoice.status = InvoiceStatus.PAID
    record_audit_event(
        db,
        principal,
        action="invoice.paid",
        context=invoice_audit_context(invoice),
        resource_id=invoice.id,
        resource_type="invoice",
    )
    emit_domain_event(
        db,
        principal,
        aggregate_id=invoice.id,
        aggregate_type=DomainAggregateType.INVOICE,
        event_type=DomainEventType.INVOICE_PAID,
        payload=invoice_audit_context(invoice),
    )
    await db.commit()
    await db.refresh(invoice)
    return invoice


@router.post("/{invoice_id}/convert-to-invoice", response_model=InvoiceConversionRead)
async def convert_estimate_to_invoice(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> dict[str, Invoice]:
    estimate = await get_company_invoice(invoice_id, db, principal)
    ensure_invoice_transition(
        estimate,
        allowed_types={InvoiceType.ESTIMATE},
        allowed_statuses={InvoiceStatus.APPROVED},
        detail="Only approved estimates can be converted to invoices.",
    )

    invoice = Invoice(
        amount_cents=estimate.amount_cents,
        company_id=estimate.company_id,
        customer_id=estimate.customer_id,
        document_type=InvoiceType.INVOICE,
        due_at=estimate.due_at,
        job_id=estimate.job_id,
        notes=append_workflow_note(estimate.notes, "Converted from approved estimate."),
        status=InvoiceStatus.DRAFT,
        title=converted_invoice_title(estimate.title),
    )
    db.add(invoice)
    await db.flush()
    await copy_invoice_line_items(
        source_invoice_id=estimate.id,
        target_invoice_id=invoice.id,
        db=db,
    )
    estimate.status = InvoiceStatus.CONVERTED
    correlation_id = uuid4()
    record_audit_event(
        db,
        principal,
        action="estimate.converted",
        context=invoice_audit_context(estimate, converted_invoice_id=invoice.id),
        resource_id=estimate.id,
        resource_type="invoice",
    )
    emit_domain_event(
        db,
        principal,
        aggregate_id=estimate.id,
        aggregate_type=DomainAggregateType.INVOICE,
        correlation_id=correlation_id,
        event_type=DomainEventType.ESTIMATE_CONVERTED,
        payload=invoice_audit_context(estimate, converted_invoice_id=invoice.id),
    )
    record_audit_event(
        db,
        principal,
        action="invoice.created_from_estimate",
        context=invoice_audit_context(invoice, source_estimate_id=estimate.id),
        resource_id=invoice.id,
        resource_type="invoice",
    )
    emit_domain_event(
        db,
        principal,
        aggregate_id=invoice.id,
        aggregate_type=DomainAggregateType.INVOICE,
        correlation_id=correlation_id,
        event_type=DomainEventType.INVOICE_CREATED,
        payload=invoice_audit_context(invoice, source_estimate_id=estimate.id),
    )
    await db.commit()
    await db.refresh(estimate)
    await db.refresh(invoice)
    return {"source_estimate": estimate, "invoice": invoice}


@router.get("/{invoice_id}/line-items", response_model=list[InvoiceLineItemRead])
async def list_invoice_line_items(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[InvoiceLineItem]:
    await get_company_invoice(invoice_id, db, principal)
    result = await db.execute(
        select(InvoiceLineItem)
        .where(InvoiceLineItem.invoice_id == invoice_id)
        .order_by(InvoiceLineItem.sort_order.asc(), InvoiceLineItem.created_at.asc())
    )
    return list(result.scalars().all())


@router.post(
    "/{invoice_id}/line-items",
    response_model=InvoiceLineItemRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_invoice_line_item(
    invoice_id: UUID,
    payload: InvoiceLineItemCreate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> InvoiceLineItem:
    await get_company_invoice(invoice_id, db, principal)
    line_item = InvoiceLineItem(invoice_id=invoice_id, **payload.model_dump())
    db.add(line_item)
    await db.flush()
    await recalculate_invoice_total(invoice_id, db)
    invoice = await get_company_invoice(invoice_id, db, principal)
    record_audit_event(
        db,
        principal,
        action="invoice.line_item_created",
        context=invoice_audit_context(invoice, line_item_id=line_item.id),
        resource_id=invoice.id,
        resource_type="invoice",
    )
    emit_domain_event(
        db,
        principal,
        aggregate_id=invoice.id,
        aggregate_type=DomainAggregateType.INVOICE,
        event_type=DomainEventType.INVOICE_LINE_ITEM_ADDED,
        payload=invoice_audit_context(
            invoice,
            line_item_id=line_item.id,
            description=line_item.description,
            unit_amount_cents=line_item.unit_amount_cents,
            quantity=line_item.quantity,
        ),
    )
    await db.commit()
    await db.refresh(line_item)
    return line_item


@router.patch(
    "/{invoice_id}/line-items/{line_item_id}",
    response_model=InvoiceLineItemRead,
)
async def update_invoice_line_item(
    invoice_id: UUID,
    line_item_id: UUID,
    payload: InvoiceLineItemUpdate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> InvoiceLineItem:
    line_item = await get_company_line_item(line_item_id, invoice_id, db, principal)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(line_item, field, value)
    await recalculate_invoice_total(invoice_id, db)
    invoice = await get_company_invoice(invoice_id, db, principal)
    record_audit_event(
        db,
        principal,
        action="invoice.line_item_updated",
        context=invoice_audit_context(
            invoice,
            changed_fields=sorted(updates),
            line_item_id=line_item.id,
        ),
        resource_id=invoice.id,
        resource_type="invoice",
    )
    emit_domain_event(
        db,
        principal,
        aggregate_id=invoice.id,
        aggregate_type=DomainAggregateType.INVOICE,
        event_type=DomainEventType.INVOICE_LINE_ITEM_UPDATED,
        payload=invoice_audit_context(
            invoice,
            changed_fields=sorted(updates),
            line_item_id=line_item.id,
        ),
    )
    await db.commit()
    await db.refresh(line_item)
    return line_item


@router.delete("/{invoice_id}/line-items/{line_item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invoice_line_item(
    invoice_id: UUID,
    line_item_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> None:
    line_item = await get_company_line_item(line_item_id, invoice_id, db, principal)
    await db.delete(line_item)
    await db.flush()
    await recalculate_invoice_total(invoice_id, db)
    invoice = await get_company_invoice(invoice_id, db, principal)
    record_audit_event(
        db,
        principal,
        action="invoice.line_item_deleted",
        context=invoice_audit_context(invoice, line_item_id=line_item_id),
        resource_id=invoice.id,
        resource_type="invoice",
    )
    emit_domain_event(
        db,
        principal,
        aggregate_id=invoice.id,
        aggregate_type=DomainAggregateType.INVOICE,
        event_type=DomainEventType.INVOICE_LINE_ITEM_REMOVED,
        payload=invoice_audit_context(invoice, line_item_id=line_item_id),
    )
    await db.commit()
