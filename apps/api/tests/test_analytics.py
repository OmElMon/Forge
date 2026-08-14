from datetime import UTC, datetime
from uuid import uuid4

from app.models.customer import Customer
from app.models.enums import CustomerStatus, InvoiceStatus, InvoiceType, JobStatus
from app.models.invoice import Invoice
from app.models.job import Job
from app.services.analytics import build_analytics_summary, rate


def test_rate_handles_empty_denominator() -> None:
    assert rate(4, 0) == 0


def test_build_analytics_summary_tracks_revenue_jobs_and_conversion() -> None:
    company_id = uuid4()
    customer_id = uuid4()
    now = datetime(2026, 8, 13, tzinfo=UTC)
    customers = [
        Customer(
            id=customer_id,
            company_id=company_id,
            name="Marianne Foster",
            status=CustomerStatus.ACTIVE,
            created_at=now,
            updated_at=now,
        ),
        Customer(
            id=uuid4(),
            company_id=company_id,
            name="Caleb Morgan",
            status=CustomerStatus.LEAD,
            created_at=now,
            updated_at=now,
        ),
    ]
    invoices = [
        Invoice(
            id=uuid4(),
            amount_cents=42_600,
            company_id=company_id,
            customer_id=customer_id,
            document_type=InvoiceType.INVOICE,
            status=InvoiceStatus.PAID,
            title="Thermostat installation",
        ),
        Invoice(
            id=uuid4(),
            amount_cents=87_500,
            company_id=company_id,
            customer_id=customer_id,
            document_type=InvoiceType.INVOICE,
            status=InvoiceStatus.PAID,
            title="Blower motor repair",
        ),
        Invoice(
            id=uuid4(),
            amount_cents=120_000,
            company_id=company_id,
            customer_id=customer_id,
            document_type=InvoiceType.INVOICE,
            status=InvoiceStatus.SENT,
            title="Open repair invoice",
        ),
        Invoice(
            id=uuid4(),
            amount_cents=620_000,
            company_id=company_id,
            customer_id=customer_id,
            document_type=InvoiceType.ESTIMATE,
            status=InvoiceStatus.APPROVED,
            title="Furnace replacement estimate",
        ),
        Invoice(
            id=uuid4(),
            amount_cents=12_000,
            company_id=company_id,
            customer_id=customer_id,
            document_type=InvoiceType.ESTIMATE,
            status=InvoiceStatus.CONVERTED,
            title="Converted estimate",
        ),
        Invoice(
            id=uuid4(),
            amount_cents=10_000,
            company_id=company_id,
            customer_id=customer_id,
            document_type=InvoiceType.ESTIMATE,
            status=InvoiceStatus.VOID,
            title="Lost estimate",
        ),
    ]
    jobs = [
        Job(
            id=uuid4(),
            amount_cents=42_600,
            company_id=company_id,
            customer_id=customer_id,
            status=JobStatus.COMPLETED,
            title="Completed job",
        ),
        Job(
            id=uuid4(),
            amount_cents=18_900,
            company_id=company_id,
            customer_id=customer_id,
            scheduled_start=None,
            status=JobStatus.NEW,
            title="Unscheduled job",
        ),
        Job(
            id=uuid4(),
            amount_cents=55_000,
            company_id=company_id,
            customer_id=customer_id,
            scheduled_start=now,
            status=JobStatus.SCHEDULED,
            technician_name="Jordan Reyes",
            title="Assigned job",
        ),
    ]

    summary = build_analytics_summary(customers=customers, invoices=invoices, jobs=jobs)

    assert summary.customer_count == 2
    assert summary.active_customer_count == 1
    assert summary.paid_revenue_cents == 130_100
    assert summary.open_invoice_cents == 120_000
    assert summary.open_estimate_cents == 620_000
    assert summary.pipeline_cents == 740_000
    assert summary.average_paid_ticket_cents == 65_050
    assert summary.invoice_collection_rate == 0.6667
    assert summary.estimate_conversion_rate == 0.3333
    assert summary.job_count == 3
    assert summary.open_job_count == 2
    assert summary.completed_job_count == 1
    assert summary.unscheduled_job_count == 1
    assert summary.unassigned_job_count == 1
