import csv
import io
from dataclasses import dataclass

from pydantic import EmailStr, TypeAdapter
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.enums import (
    CustomerStatus,
    DomainAggregateType,
    DomainEventType,
    PreferredContact,
)
from app.schemas.customer import CustomerImportRowError
from app.schemas.principal import Principal
from app.services.audit import record_audit_event
from app.services.events import emit_domain_event

CUSTOMER_CSV_COLUMNS = (
    "name",
    "phone",
    "email",
    "status",
    "source",
    "preferred_contact",
    "sms_opt_in",
    "notes",
)
CUSTOMER_CSV_TEMPLATE = ",".join(CUSTOMER_CSV_COLUMNS)

_EMAIL_ADAPTER: TypeAdapter = TypeAdapter(EmailStr | None)
_TRUE_VALUES = {"true", "yes", "1", "y"}
_FALSE_VALUES = {"false", "no", "0", "n", ""}


@dataclass
class ImportCustomer:
    name: str
    phone: str | None = None
    email: str | None = None
    status: CustomerStatus = CustomerStatus.LEAD
    source: str | None = None
    preferred_contact: PreferredContact | None = None
    sms_opt_in: bool = False
    notes: str | None = None


def _column_indexes(header: list[str]) -> dict[str, int]:
    indexes: dict[str, int] = {}
    for normalized in CUSTOMER_CSV_COLUMNS:
        if normalized in header:
            indexes[normalized] = header.index(normalized)
    return indexes


def _cell(record: dict[int, str], index: int | None) -> str | None:
    if index is None:
        return None
    value = record.get(index)
    return value.strip() if value is not None else None


def parse_customer_rows(content: str) -> tuple[list[ImportCustomer], list[CustomerImportRowError]]:
    """Split a CSV body into valid import rows and per-row errors.

    ``content`` may carry a UTF-8 BOM. Unknown columns are ignored; the only
    required column is ``name``. Duplicate emails/phone numbers inside one file
    are skipped so an import never creates accidental double records.
    """
    rows: list[ImportCustomer] = []
    errors: list[CustomerImportRowError] = []

    reader = csv.reader(io.StringIO(content.lstrip("\ufeff")))
    parsed = [row for row in reader if any(cell.strip() for cell in row)]
    if not parsed:
        return rows, errors

    header = [cell.strip().lower().replace(" ", "_") for cell in parsed[0]]
    if "name" not in header:
        errors.append(
            CustomerImportRowError(row=1, field="name", message="Missing required 'name' column.")
        )
        return rows, errors
    column_indexes = _column_indexes(header)

    seen_emails: set[str] = set()
    seen_phones: set[str] = set()
    for row_number, cells in enumerate(parsed[1:], start=2):
        record = {index: cell for index, cell in enumerate(cells)}
        name = _cell(record, column_indexes.get("name")) or ""
        row_errors: list[CustomerImportRowError] = []

        if not name:
            row_errors.append(
                CustomerImportRowError(
                    row=row_number, field="name", message="Customer name is required."
                )
            )
        elif len(name) > 160:
            row_errors.append(
                CustomerImportRowError(
                    row=row_number, field="name", message="Name must be 160 characters or fewer."
                )
            )

        email_raw = _cell(record, column_indexes.get("email"))
        if email_raw:
            try:
                email = str(_EMAIL_ADAPTER.validate_python(email_raw))
            except Exception:
                email = None
                row_errors.append(
                    CustomerImportRowError(
                        row=row_number, field="email", message=f"Invalid email '{email_raw}'."
                    )
                )
        else:
            email = None

        phone = _cell(record, column_indexes.get("phone"))
        if phone and len(phone) > 40:
            row_errors.append(
                CustomerImportRowError(
                    row=row_number, field="phone", message="Phone must be 40 characters or fewer."
                )
            )

        status_value = _cell(record, column_indexes.get("status"))
        status, status_error = _parse_status(status_value)
        if status_error:
            row_errors.append(
                CustomerImportRowError(row=row_number, field="status", message=status_error)
            )

        preferred_raw = _cell(record, column_indexes.get("preferred_contact"))
        preferred, preferred_error = _parse_preferred_contact(preferred_raw)
        if preferred_error:
            row_errors.append(
                CustomerImportRowError(
                    row=row_number, field="preferred_contact", message=preferred_error
                )
            )

        sms_raw = _cell(record, column_indexes.get("sms_opt_in"))
        sms_opt_in, sms_error = _parse_bool(sms_raw)
        if sms_error:
            row_errors.append(
                CustomerImportRowError(row=row_number, field="sms_opt_in", message=sms_error)
            )

        source = _cell(record, column_indexes.get("source"))
        if source and len(source) > 80:
            row_errors.append(
                CustomerImportRowError(
                    row=row_number, field="source", message="Source must be 80 characters or fewer."
                )
            )

        notes = _cell(record, column_indexes.get("notes"))
        if notes and len(notes) > 4000:
            row_errors.append(
                CustomerImportRowError(
                    row=row_number, field="notes", message="Notes must be 4000 characters or fewer."
                )
            )

        if email:
            normalized_email = email.lower()
            if normalized_email in seen_emails:
                row_errors.append(
                    CustomerImportRowError(
                        row=row_number, field="email", message="Duplicate email within file."
                    )
                )
            else:
                seen_emails.add(normalized_email)
        if phone:
            normalized_phone = _digits(phone)
            if normalized_phone in seen_phones:
                row_errors.append(
                    CustomerImportRowError(
                        row=row_number, field="phone", message="Duplicate phone within file."
                    )
                )
            else:
                seen_phones.add(normalized_phone)

        if row_errors:
            errors.extend(row_errors)
            continue
        rows.append(
            ImportCustomer(
                name=name,
                phone=phone,
                email=email,
                status=status,
                source=source,
                preferred_contact=preferred,
                sms_opt_in=sms_opt_in,
                notes=notes,
            )
        )
    return rows, errors


def _parse_status(value: str | None) -> tuple[CustomerStatus, str | None]:
    if not value:
        return CustomerStatus.LEAD, None
    try:
        return CustomerStatus(value), None
    except ValueError:
        valid = ", ".join(item.value for item in CustomerStatus)
        return CustomerStatus.LEAD, f"Invalid status '{value}' (expected one of: {valid})."


def _parse_preferred_contact(value: str | None) -> tuple[PreferredContact | None, str | None]:
    if not value:
        return None, None
    try:
        return PreferredContact(value), None
    except ValueError:
        valid = ", ".join(item.value for item in PreferredContact)
        return None, f"Invalid preferred_contact '{value}' (expected one of: {valid})."


def _parse_bool(value: str | None) -> tuple[bool, str | None]:
    normalized = (value or "").strip().lower()
    if normalized in _TRUE_VALUES:
        return True, None
    if normalized in _FALSE_VALUES:
        return False, None
    return False, f"Invalid boolean '{value}' (expected true/false/yes/no/1/0)."


def _digits(value: str) -> str:
    return "".join(chunk for chunk in value if chunk.isdigit())


async def materialize_customer_import(
    rows: list[ImportCustomer],
    db: AsyncSession,
    principal: Principal,
) -> int:
    """Persist valid import rows as tenant-scoped customers with events + audit."""
    created = 0
    for row in rows:
        customer = Customer(
            company_id=principal.company_id,
            email=row.email,
            name=row.name,
            notes=row.notes,
            phone=row.phone,
            preferred_contact=row.preferred_contact,
            sms_opt_in=row.sms_opt_in,
            source=row.source,
            status=row.status,
        )
        db.add(customer)
        await db.flush()
        emit_domain_event(
            db,
            principal,
            aggregate_id=customer.id,
            aggregate_type=DomainAggregateType.CUSTOMER,
            event_type=DomainEventType.CUSTOMER_CREATED,
            payload={
                "name": customer.name,
                "status": customer.status,
                "source": customer.source or "import",
                "imported": True,
            },
        )
        created += 1
    if created:
        record_audit_event(
            db,
            principal,
            action="customer.import",
            context={"created": created, "rows_submitted": len(rows)},
            resource_id=None,
            resource_type="customer",
        )
    await db.commit()
    return created
