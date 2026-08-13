from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.models.customer import Customer
from app.models.enums import CustomerStatus, InvoiceStatus, InvoiceType, JobStatus
from app.models.invoice import Invoice
from app.models.job import Job
from app.services.attention import build_attention_summary


def test_attention_summary_prioritizes_revenue_and_operations_risk() -> None:
    company_id = uuid4()
    customer_id = uuid4()
    now = datetime(2026, 8, 12, tzinfo=UTC)
    customer = Customer(
        id=customer_id,
        company_id=company_id,
        name="Marianne Foster",
        status=CustomerStatus.ACTIVE,
        created_at=now,
        updated_at=now,
    )
    overdue_invoice = Invoice(
        id=uuid4(),
        company_id=company_id,
        customer_id=customer_id,
        document_type=InvoiceType.INVOICE,
        status=InvoiceStatus.SENT,
        title="Thermostat installation",
        amount_cents=42600,
        due_at=now - timedelta(days=2),
        created_at=now - timedelta(days=5),
        updated_at=now,
    )
    approved_estimate = Invoice(
        id=uuid4(),
        company_id=company_id,
        customer_id=customer_id,
        document_type=InvoiceType.ESTIMATE,
        status=InvoiceStatus.APPROVED,
        title="Furnace replacement",
        amount_cents=620000,
        due_at=None,
        created_at=now - timedelta(days=1),
        updated_at=now,
    )
    unscheduled_job = Job(
        id=uuid4(),
        company_id=company_id,
        customer_id=customer_id,
        title="Seasonal maintenance",
        status=JobStatus.NEW,
        scheduled_start=None,
        amount_cents=18900,
        created_at=now,
        updated_at=now,
    )
    completed_job = Job(
        id=uuid4(),
        company_id=company_id,
        customer_id=customer_id,
        title="Blower motor repair",
        status=JobStatus.COMPLETED,
        scheduled_start=now - timedelta(days=1),
        amount_cents=87500,
        created_at=now - timedelta(days=1),
        updated_at=now,
    )

    summary = build_attention_summary(
        customers=[customer],
        jobs=[unscheduled_job, completed_job],
        invoices=[overdue_invoice, approved_estimate],
        now=now,
    )

    assert summary.revenue_at_risk_cents == 662600
    assert summary.open_estimate_cents == 620000
    assert summary.open_invoice_cents == 42600
    assert summary.overdue_invoice_count == 1
    assert summary.unscheduled_job_count == 1
    assert summary.unassigned_job_count == 1
    assert summary.completed_uninvoiced_job_count == 1
    assert [item.category for item in summary.items] == [
        "invoice_collection",
        "estimate_follow_up",
        "job_invoicing",
        "job_scheduling",
        "job_assignment",
    ]
    assert summary.items[0].priority == "urgent"
    assert summary.items[0].customer_name == "Marianne Foster"


def test_attention_summary_does_not_flag_completed_job_with_invoice() -> None:
    company_id = uuid4()
    customer_id = uuid4()
    job_id = uuid4()
    now = datetime(2026, 8, 12, tzinfo=UTC)
    customer = Customer(
        id=customer_id,
        company_id=company_id,
        name="Caleb Morgan",
        status=CustomerStatus.ACTIVE,
        created_at=now,
        updated_at=now,
    )
    completed_job = Job(
        id=job_id,
        company_id=company_id,
        customer_id=customer_id,
        title="Seasonal maintenance",
        status=JobStatus.COMPLETED,
        scheduled_start=now - timedelta(days=1),
        amount_cents=18900,
        created_at=now - timedelta(days=1),
        updated_at=now,
    )
    paid_invoice = Invoice(
        id=uuid4(),
        company_id=company_id,
        customer_id=customer_id,
        job_id=job_id,
        document_type=InvoiceType.INVOICE,
        status=InvoiceStatus.PAID,
        title="Seasonal maintenance invoice",
        amount_cents=18900,
        due_at=now,
        created_at=now,
        updated_at=now,
    )

    summary = build_attention_summary(
        customers=[customer],
        jobs=[completed_job],
        invoices=[paid_invoice],
        now=now,
    )

    assert summary.completed_uninvoiced_job_count == 0
    assert summary.items == []
