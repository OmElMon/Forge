from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import BACK_OFFICE_ROLES, get_principal, require_roles
from app.db.session import get_db
from app.models.customer import Customer
from app.models.enums import CustomerStatus, DomainAggregateType, DomainEventType
from app.models.equipment import Equipment
from app.models.invoice import Invoice
from app.models.job import Job
from app.models.service_address import ServiceAddress
from app.schemas.customer import (
    CustomerCreate,
    CustomerDetail,
    CustomerImportResult,
    CustomerRead,
    CustomerUpdate,
)
from app.schemas.equipment import EquipmentCreate, EquipmentRead, EquipmentUpdate
from app.schemas.principal import Principal
from app.schemas.service_address import (
    ServiceAddressCreate,
    ServiceAddressRead,
    ServiceAddressUpdate,
)
from app.services.audit import record_audit_event
from app.services.customer_import import (
    CUSTOMER_CSV_TEMPLATE,
    materialize_customer_import,
    parse_customer_rows,
)
from app.services.customer_profile import build_customer_detail, filter_customers
from app.services.events import emit_domain_event

router = APIRouter(prefix="/customers", tags=["customers"])


def customer_event_payload(customer: Customer, **extra: object) -> dict[str, object]:
    return {
        "status": customer.status,
        "source": customer.source,
        "preferred_contact": customer.preferred_contact,
        "sms_opt_in": customer.sms_opt_in,
        "name": customer.name,
        **extra,
    }


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


async def get_company_address(
    address_id: UUID,
    customer_id: UUID,
    db: AsyncSession,
    principal: Principal,
) -> ServiceAddress:
    result = await db.execute(
        select(ServiceAddress).where(
            ServiceAddress.id == address_id,
            ServiceAddress.customer_id == customer_id,
            ServiceAddress.company_id == principal.company_id,
        )
    )
    address = result.scalar_one_or_none()
    if address is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Address not found.")
    return address


async def get_company_equipment(
    equipment_id: UUID,
    customer_id: UUID,
    db: AsyncSession,
    principal: Principal,
) -> Equipment:
    result = await db.execute(
        select(Equipment).where(
            Equipment.id == equipment_id,
            Equipment.customer_id == customer_id,
            Equipment.company_id == principal.company_id,
        )
    )
    equipment = result.scalar_one_or_none()
    if equipment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipment not found.")
    return equipment


@router.get("", response_model=list[CustomerRead])
async def list_customers(
    search: str | None = Query(default=None, max_length=160),
    status: CustomerStatus | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[Customer]:
    result = await db.execute(
        select(Customer)
        .where(Customer.company_id == principal.company_id)
        .order_by(Customer.created_at.desc())
    )
    return filter_customers(
        list(result.scalars().all()),  # type: ignore[arg-type]
        search=search,
        status=status,
    )


@router.post("", response_model=CustomerRead, status_code=status.HTTP_201_CREATED)
async def create_customer(
    payload: CustomerCreate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(require_roles(*BACK_OFFICE_ROLES)),
) -> Customer:
    customer = Customer(company_id=principal.company_id, **payload.model_dump())
    db.add(customer)
    await db.flush()
    emit_domain_event(
        db,
        principal,
        aggregate_id=customer.id,
        aggregate_type=DomainAggregateType.CUSTOMER,
        event_type=DomainEventType.CUSTOMER_CREATED,
        payload=customer_event_payload(customer),
    )
    await db.commit()
    await db.refresh(customer)
    return customer


@router.get("/import/template")
async def customer_import_template() -> Response:
    return Response(
        content=f"{CUSTOMER_CSV_TEMPLATE}\n",
        headers={"Content-Disposition": 'attachment; filename="customers-template.csv"'},
        media_type="text/csv",
    )


@router.post("/import", response_model=CustomerImportResult)
async def import_customers(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(require_roles(*BACK_OFFICE_ROLES)),
) -> CustomerImportResult:
    try:
        content = (await file.read()).decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must be a UTF-8 CSV.",
        ) from None
    rows, errors = parse_customer_rows(content)
    created = await materialize_customer_import(rows, db, principal)
    return CustomerImportResult(created=created, skipped_rows=len(errors), errors=errors)


@router.get("/{customer_id}", response_model=CustomerDetail)
async def read_customer(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> CustomerDetail:
    customer = await get_company_customer(customer_id, db, principal)
    addresses_result = await db.execute(
        select(ServiceAddress)
        .where(
            ServiceAddress.customer_id == customer_id,
            ServiceAddress.company_id == principal.company_id,
        )
        .order_by(ServiceAddress.created_at.asc())
    )
    equipment_result = await db.execute(
        select(Equipment)
        .where(
            Equipment.customer_id == customer_id,
            Equipment.company_id == principal.company_id,
        )
        .order_by(Equipment.created_at.asc())
    )
    invoices_result = await db.execute(
        select(Invoice).where(
            Invoice.customer_id == customer_id,
            Invoice.company_id == principal.company_id,
        )
    )
    jobs_result = await db.execute(
        select(Job).where(
            Job.customer_id == customer_id,
            Job.company_id == principal.company_id,
        )
    )
    return build_customer_detail(
        addresses=list(addresses_result.scalars().all()),
        customer=customer,
        equipment=list(equipment_result.scalars().all()),
        invoices=list(invoices_result.scalars().all()),
        jobs=list(jobs_result.scalars().all()),
    )


@router.patch("/{customer_id}", response_model=CustomerRead)
async def update_customer(
    customer_id: UUID,
    payload: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(require_roles(*BACK_OFFICE_ROLES)),
) -> Customer:
    customer = await get_company_customer(customer_id, db, principal)
    updates = payload.model_dump(exclude_unset=True)
    previous_status = customer.status
    changed_fields = sorted(updates)
    for field, value in updates.items():
        setattr(customer, field, value)
    event_type = (
        DomainEventType.CUSTOMER_STAGE_CHANGED
        if "status" in updates and customer.status != previous_status
        else DomainEventType.CUSTOMER_UPDATED
    )
    emit_domain_event(
        db,
        principal,
        aggregate_id=customer.id,
        aggregate_type=DomainAggregateType.CUSTOMER,
        event_type=event_type,
        payload=customer_event_payload(
            customer,
            changed_fields=changed_fields,
            previous_status=previous_status,
        ),
    )
    await db.commit()
    await db.refresh(customer)
    return customer


@router.get("/{customer_id}/addresses", response_model=list[ServiceAddressRead])
async def list_service_addresses(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[ServiceAddress]:
    await get_company_customer(customer_id, db, principal)
    result = await db.execute(
        select(ServiceAddress)
        .where(
            ServiceAddress.customer_id == customer_id,
            ServiceAddress.company_id == principal.company_id,
        )
        .order_by(ServiceAddress.created_at.asc())
    )
    return list(result.scalars().all())


@router.post(
    "/{customer_id}/addresses",
    response_model=ServiceAddressRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_service_address(
    customer_id: UUID,
    payload: ServiceAddressCreate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(require_roles(*BACK_OFFICE_ROLES)),
) -> ServiceAddress:
    await get_company_customer(customer_id, db, principal)
    address = ServiceAddress(
        company_id=principal.company_id,
        customer_id=customer_id,
        **payload.model_dump(),
    )
    db.add(address)
    await db.flush()
    record_audit_event(
        db,
        principal,
        action="customer.address.created",
        context={"address_line1": address.address_line1, "city": address.city},
        resource_id=customer_id,
        resource_type="customer",
    )
    emit_domain_event(
        db,
        principal,
        aggregate_id=customer_id,
        aggregate_type=DomainAggregateType.CUSTOMER,
        event_type=DomainEventType.CUSTOMER_ADDRESS_ADDED,
        payload={"address_id": address.id, "label": address.label, "city": address.city},
    )
    await db.commit()
    await db.refresh(address)
    return address


@router.patch("/{customer_id}/addresses/{address_id}", response_model=ServiceAddressRead)
async def update_service_address(
    customer_id: UUID,
    address_id: UUID,
    payload: ServiceAddressUpdate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(require_roles(*BACK_OFFICE_ROLES)),
) -> ServiceAddress:
    address = await get_company_address(address_id, customer_id, db, principal)
    updates = payload.model_dump(exclude_unset=True)
    changed_fields = sorted(updates)
    for field, value in updates.items():
        setattr(address, field, value)
    record_audit_event(
        db,
        principal,
        action="customer.address.updated",
        context={"address_line1": address.address_line1, "city": address.city},
        resource_id=customer_id,
        resource_type="customer",
    )
    emit_domain_event(
        db,
        principal,
        aggregate_id=customer_id,
        aggregate_type=DomainAggregateType.CUSTOMER,
        event_type=DomainEventType.CUSTOMER_ADDRESS_UPDATED,
        payload={
            "address_id": address.id,
            "changed_fields": changed_fields,
            "label": address.label,
        },
    )
    await db.commit()
    await db.refresh(address)
    return address


@router.delete(
    "/{customer_id}/addresses/{address_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_service_address(
    customer_id: UUID,
    address_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(require_roles(*BACK_OFFICE_ROLES)),
) -> None:
    address = await get_company_address(address_id, customer_id, db, principal)
    await db.delete(address)
    record_audit_event(
        db,
        principal,
        action="customer.address.deleted",
        context={"address_line1": address.address_line1, "city": address.city},
        resource_id=customer_id,
        resource_type="customer",
    )
    emit_domain_event(
        db,
        principal,
        aggregate_id=customer_id,
        aggregate_type=DomainAggregateType.CUSTOMER,
        event_type=DomainEventType.CUSTOMER_ADDRESS_REMOVED,
        payload={"address_id": address_id, "label": address.label},
    )
    await db.commit()


@router.get("/{customer_id}/equipment", response_model=list[EquipmentRead])
async def list_customer_equipment(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[Equipment]:
    await get_company_customer(customer_id, db, principal)
    result = await db.execute(
        select(Equipment)
        .where(
            Equipment.customer_id == customer_id,
            Equipment.company_id == principal.company_id,
        )
        .order_by(Equipment.created_at.asc())
    )
    return list(result.scalars().all())


@router.post(
    "/{customer_id}/equipment",
    response_model=EquipmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_customer_equipment(
    customer_id: UUID,
    payload: EquipmentCreate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(require_roles(*BACK_OFFICE_ROLES)),
) -> Equipment:
    await get_company_customer(customer_id, db, principal)
    equipment = Equipment(
        company_id=principal.company_id,
        customer_id=customer_id,
        **payload.model_dump(),
    )
    db.add(equipment)
    await db.flush()
    record_audit_event(
        db,
        principal,
        action="customer.equipment.created",
        context={"name": equipment.name, "model": equipment.model},
        resource_id=customer_id,
        resource_type="customer",
    )
    emit_domain_event(
        db,
        principal,
        aggregate_id=customer_id,
        aggregate_type=DomainAggregateType.CUSTOMER,
        event_type=DomainEventType.CUSTOMER_EQUIPMENT_ADDED,
        payload={"equipment_id": equipment.id, "name": equipment.name, "model": equipment.model},
    )
    await db.commit()
    await db.refresh(equipment)
    return equipment


@router.patch("/{customer_id}/equipment/{equipment_id}", response_model=EquipmentRead)
async def update_customer_equipment(
    customer_id: UUID,
    equipment_id: UUID,
    payload: EquipmentUpdate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(require_roles(*BACK_OFFICE_ROLES)),
) -> Equipment:
    equipment = await get_company_equipment(equipment_id, customer_id, db, principal)
    updates = payload.model_dump(exclude_unset=True)
    changed_fields = sorted(updates)
    for field, value in updates.items():
        setattr(equipment, field, value)
    record_audit_event(
        db,
        principal,
        action="customer.equipment.updated",
        context={"name": equipment.name, "model": equipment.model},
        resource_id=customer_id,
        resource_type="customer",
    )
    emit_domain_event(
        db,
        principal,
        aggregate_id=customer_id,
        aggregate_type=DomainAggregateType.CUSTOMER,
        event_type=DomainEventType.CUSTOMER_EQUIPMENT_UPDATED,
        payload={
            "equipment_id": equipment.id,
            "changed_fields": changed_fields,
            "name": equipment.name,
        },
    )
    await db.commit()
    await db.refresh(equipment)
    return equipment


@router.delete(
    "/{customer_id}/equipment/{equipment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_customer_equipment(
    customer_id: UUID,
    equipment_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(require_roles(*BACK_OFFICE_ROLES)),
) -> None:
    equipment = await get_company_equipment(equipment_id, customer_id, db, principal)
    await db.delete(equipment)
    record_audit_event(
        db,
        principal,
        action="customer.equipment.deleted",
        context={"name": equipment.name, "model": equipment.model},
        resource_id=customer_id,
        resource_type="customer",
    )
    emit_domain_event(
        db,
        principal,
        aggregate_id=customer_id,
        aggregate_type=DomainAggregateType.CUSTOMER,
        event_type=DomainEventType.CUSTOMER_EQUIPMENT_REMOVED,
        payload={"equipment_id": equipment_id, "name": equipment.name},
    )
    await db.commit()
