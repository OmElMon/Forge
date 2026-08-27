from datetime import UTC, datetime
from uuid import uuid4

from app.models.customer import Customer
from app.models.enums import (
    CustomerStatus,
    InvoiceStatus,
    InvoiceType,
    JobStatus,
    PreferredContact,
)
from app.models.equipment import Equipment
from app.models.invoice import Invoice
from app.models.job import Job
from app.models.service_address import ServiceAddress
from app.services.customer_profile import build_customer_detail

NOW = datetime(2026, 8, 27, 12, 0, 0, tzinfo=UTC)


def make_customer(**overrides: object) -> Customer:
    defaults: dict[str, object] = {
        "company_id": uuid4(),
        "created_at": NOW,
        "email": "customer@example.com",
        "id": uuid4(),
        "name": "Marianne Foster",
        "notes": None,
        "phone": "+15551234567",
        "preferred_contact": PreferredContact.EMAIL,
        "sms_opt_in": True,
        "source": "referral",
        "status": CustomerStatus.ACTIVE,
        "updated_at": NOW,
    }
    defaults.update(overrides)
    return Customer(**defaults)  # type: ignore[arg-type]


def make_invoice(
    *,
    amount_cents: int,
    document_type: InvoiceType,
    status: InvoiceStatus,
    customer_id: object,
) -> Invoice:
    return Invoice(
        amount_cents=amount_cents,
        company_id=uuid4(),
        created_at=NOW,
        customer_id=customer_id,  # type: ignore[arg-type]
        document_type=document_type,
        due_at=None,
        id=uuid4(),
        job_id=None,
        notes=None,
        status=status,
        title="Seasonal maintenance",
        updated_at=NOW,
    )


def make_job(*, customer_id: object, status: JobStatus) -> Job:
    return Job(
        amount_cents=5000,
        company_id=uuid4(),
        created_at=NOW,
        customer_id=customer_id,  # type: ignore[arg-type]
        id=uuid4(),
        notes=None,
        scheduled_start=None,
        status=status,
        technician_id=None,
        technician_name=None,
        title="AC not cooling",
        updated_at=NOW,
    )


def test_customer_detail_sums_lifetime_value_from_paid_invoices() -> None:
    customer = make_customer()
    customer_id = customer.id
    invoices = [
        make_invoice(
            amount_cents=25000,
            customer_id=customer_id,
            document_type=InvoiceType.INVOICE,
            status=InvoiceStatus.PAID,
        ),
        make_invoice(
            amount_cents=9000,
            customer_id=customer_id,
            document_type=InvoiceType.INVOICE,
            status=InvoiceStatus.PAID,
        ),
        make_invoice(
            amount_cents=14000,
            customer_id=customer_id,
            document_type=InvoiceType.INVOICE,
            status=InvoiceStatus.SENT,
        ),
        make_invoice(
            amount_cents=30000,
            customer_id=customer_id,
            document_type=InvoiceType.ESTIMATE,
            status=InvoiceStatus.SENT,
        ),
    ]

    detail = build_customer_detail(
        addresses=[], customer=customer, equipment=[], invoices=invoices, jobs=[]
    )

    assert detail.lifetime_value_cents == 34000
    assert detail.paid_invoice_count == 2


def test_customer_detail_counts_open_work_and_pipeline() -> None:
    customer = make_customer()
    customer_id = customer.id
    invoices = [
        make_invoice(
            amount_cents=12000,
            customer_id=customer_id,
            document_type=InvoiceType.ESTIMATE,
            status=InvoiceStatus.SENT,
        ),
        make_invoice(
            amount_cents=8000,
            customer_id=customer_id,
            document_type=InvoiceType.ESTIMATE,
            status=InvoiceStatus.PAID,
        ),
        make_invoice(
            amount_cents=20000,
            customer_id=customer_id,
            document_type=InvoiceType.INVOICE,
            status=InvoiceStatus.PAID,
        ),
        make_invoice(
            amount_cents=5000,
            customer_id=customer_id,
            document_type=InvoiceType.INVOICE,
            status=InvoiceStatus.DRAFT,
        ),
    ]
    jobs = [
        make_job(customer_id=customer_id, status=JobStatus.SCHEDULED),
        make_job(customer_id=customer_id, status=JobStatus.IN_PROGRESS),
        make_job(customer_id=customer_id, status=JobStatus.COMPLETED),
    ]

    detail = build_customer_detail(
        addresses=[], customer=customer, equipment=[], invoices=invoices, jobs=jobs
    )

    assert detail.open_job_count == 2
    # Only SENT estimate counts as an open estimate (PAID estimate is not a valid
    # estimate lifecycle, so it must not inflate the pipeline).
    assert detail.open_estimate_count == 1
    assert detail.open_estimate_cents == 12000
    assert detail.open_invoice_count == 1
    assert detail.open_invoice_cents == 5000


def test_customer_detail_includes_addresses_and_equipment() -> None:
    customer = make_customer()
    address = ServiceAddress(
        address_line1="123 Maple St",
        address_line2=None,
        city="Austin",
        company_id=customer.company_id,
        created_at=NOW,
        customer_id=customer.id,
        id=uuid4(),
        label="Home",
        notes=None,
        postal_code="78701",
        state="TX",
        updated_at=NOW,
    )
    equipment = Equipment(
        company_id=customer.company_id,
        created_at=NOW,
        customer_id=customer.id,
        id=uuid4(),
        installed_at=None,
        manufacturer="Carrier",
        model="Performance 96",
        name="Furnace",
        notes="Last serviced June 2026",
        serial_number="ABC123",
        updated_at=NOW,
    )

    detail = build_customer_detail(
        addresses=[address], customer=customer, equipment=[equipment], invoices=[], jobs=[]
    )

    assert len(detail.service_addresses) == 1
    assert detail.service_addresses[0].address_line1 == "123 Maple St"
    assert detail.service_addresses[0].state == "TX"
    assert len(detail.equipment) == 1
    assert detail.equipment[0].manufacturer == "Carrier"
    assert detail.equipment[0].serial_number == "ABC123"
    assert detail.preferred_contact == PreferredContact.EMAIL
    assert detail.sms_opt_in is True
