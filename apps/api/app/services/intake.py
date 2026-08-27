from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.enums import (
    CustomerStatus,
    DomainAggregateType,
    DomainEventType,
    IntakeRecordStatus,
)
from app.models.intake_record import IntakeRecord
from app.schemas.principal import Principal
from app.services.audit import record_audit_event
from app.services.events import emit_domain_event


async def get_company_intake_record(
    record_id: UUID,
    db: AsyncSession,
    principal: Principal,
) -> IntakeRecord | None:
    from sqlalchemy import select

    result = await db.execute(
        select(IntakeRecord).where(
            IntakeRecord.id == record_id,
            IntakeRecord.company_id == principal.company_id,
        )
    )
    return result.scalar_one_or_none()


def intake_event_payload(record: IntakeRecord) -> dict[str, object]:
    return {
        "kind": record.kind,
        "status": record.status,
        "name": record.name,
        "phone": record.phone,
        "source": record.source,
    }


async def convert_intake_record(
    record: IntakeRecord,
    db: AsyncSession,
    principal: Principal,
) -> Customer:
    """Turn an intake record into a customer (presale pipeline -> CRM)."""
    customer = Customer(
        company_id=principal.company_id,
        name=record.name or "New lead",
        phone=record.phone,
        status=CustomerStatus.LEAD,
        source=record.source or "intake",
        notes=record.notes,
    )
    db.add(customer)
    await db.flush()
    record.status = IntakeRecordStatus.CONVERTED
    record.customer_id = customer.id
    record_audit_event(
        db,
        principal,
        action="intake.converted",
        context={"intake_id": record.id, "customer_id": customer.id, "name": customer.name},
        resource_id=customer.id,
        resource_type="customer",
    )
    emit_domain_event(
        db,
        principal,
        aggregate_id=record.id,
        aggregate_type=DomainAggregateType.INTAKE,
        event_type=DomainEventType.INTAKE_RECORD_CONVERTED,
        payload={"customer_id": customer.id, "kind": record.kind, "phone": record.phone},
    )
    emit_domain_event(
        db,
        principal,
        aggregate_id=customer.id,
        aggregate_type=DomainAggregateType.CUSTOMER,
        event_type=DomainEventType.CUSTOMER_CREATED,
        payload={"name": customer.name, "status": CustomerStatus.LEAD.value},
    )
    await db.commit()
    await db.refresh(customer)
    return customer
