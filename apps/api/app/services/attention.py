from datetime import UTC, datetime
from uuid import UUID

from app.models.customer import Customer
from app.models.enums import InvoiceStatus, InvoiceType, JobStatus
from app.models.invoice import Invoice
from app.models.job import Job
from app.schemas.attention import AttentionItem, AttentionSummary

OPEN_JOB_STATUSES = {JobStatus.NEW, JobStatus.SCHEDULED, JobStatus.IN_PROGRESS}
OPEN_INVOICE_STATUSES = {InvoiceStatus.DRAFT, InvoiceStatus.SENT, InvoiceStatus.APPROVED}
OPEN_ESTIMATE_STATUSES = {InvoiceStatus.SENT, InvoiceStatus.APPROVED}
INVOICE_COVERAGE_STATUSES = {
    InvoiceStatus.DRAFT,
    InvoiceStatus.SENT,
    InvoiceStatus.APPROVED,
    InvoiceStatus.PAID,
}
PRIORITY_WEIGHT = {"urgent": 0, "high": 1, "medium": 2}


def _customer_name(customer_by_id: dict[UUID, Customer], customer_id: UUID) -> str:
    customer = customer_by_id.get(customer_id)
    return customer.name if customer else "Unknown customer"


def _is_past_due(value: datetime | None, now: datetime) -> bool:
    if value is None:
        return False
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.date() < now.date()


def build_attention_summary(
    *,
    customers: list[Customer],
    jobs: list[Job],
    invoices: list[Invoice],
    now: datetime | None = None,
    limit: int = 12,
) -> AttentionSummary:
    current_time = now or datetime.now(UTC)
    customer_by_id = {customer.id: customer for customer in customers}
    items: list[AttentionItem] = []

    open_estimates = [
        invoice
        for invoice in invoices
        if (
            invoice.document_type == InvoiceType.ESTIMATE
            and invoice.status in OPEN_ESTIMATE_STATUSES
        )
    ]
    open_invoices = [
        invoice
        for invoice in invoices
        if invoice.document_type == InvoiceType.INVOICE and invoice.status in OPEN_INVOICE_STATUSES
    ]
    open_jobs = [job for job in jobs if job.status in OPEN_JOB_STATUSES]
    overdue_invoices = [
        invoice for invoice in open_invoices if _is_past_due(invoice.due_at, current_time)
    ]
    unscheduled_jobs = [job for job in open_jobs if job.scheduled_start is None]
    unassigned_jobs = [
        job for job in open_jobs if job.technician_id is None and not job.technician_name
    ]
    invoiced_job_ids = {
        invoice.job_id
        for invoice in invoices
        if invoice.job_id and invoice.status in INVOICE_COVERAGE_STATUSES
    }
    completed_uninvoiced_jobs = [
        job for job in jobs if job.status == JobStatus.COMPLETED and job.id not in invoiced_job_ids
    ]

    for invoice in open_estimates:
        approved = invoice.status == InvoiceStatus.APPROVED
        items.append(
            AttentionItem(
                category="estimate_follow_up",
                priority="high" if approved else "medium",
                title="Estimate ready to convert" if approved else "Estimate awaiting follow-up",
                description=(
                    f"{_customer_name(customer_by_id, invoice.customer_id)} has "
                    f"{invoice.title.lower()} quoted but not closed."
                ),
                action_label="Open estimate",
                action_href=f"/dashboard/invoices?focus={invoice.id}",
                source_type="invoice",
                source_id=invoice.id,
                customer_id=invoice.customer_id,
                customer_name=_customer_name(customer_by_id, invoice.customer_id),
                amount_cents=invoice.amount_cents,
                due_at=invoice.due_at,
                created_at=invoice.created_at,
            )
        )

    for invoice in open_invoices:
        overdue = _is_past_due(invoice.due_at, current_time)
        items.append(
            AttentionItem(
                category="invoice_collection",
                priority="urgent" if overdue else "high",
                title="Overdue invoice" if overdue else "Invoice awaiting payment",
                description=(
                    f"{_customer_name(customer_by_id, invoice.customer_id)} owes on "
                    f"{invoice.title.lower()}."
                ),
                action_label="Collect payment",
                action_href=f"/dashboard/invoices?focus={invoice.id}",
                source_type="invoice",
                source_id=invoice.id,
                customer_id=invoice.customer_id,
                customer_name=_customer_name(customer_by_id, invoice.customer_id),
                amount_cents=invoice.amount_cents,
                due_at=invoice.due_at,
                created_at=invoice.created_at,
            )
        )

    for job in unscheduled_jobs:
        customer_name = _customer_name(customer_by_id, job.customer_id)
        items.append(
            AttentionItem(
                category="job_scheduling",
                priority="medium",
                title="Job missing schedule",
                description=(
                    f"{customer_name} has {job.title.lower()} waiting for a time slot."
                ),
                action_label="Schedule job",
                action_href=f"/dashboard/jobs?focus={job.id}",
                source_type="job",
                source_id=job.id,
                customer_id=job.customer_id,
                customer_name=customer_name,
                amount_cents=job.amount_cents,
                due_at=job.scheduled_start,
                created_at=job.created_at,
            )
        )

    for job in unassigned_jobs:
        customer_name = _customer_name(customer_by_id, job.customer_id)
        items.append(
            AttentionItem(
                category="job_assignment",
                priority="medium",
                title="Job missing technician",
                description=f"{customer_name} has {job.title.lower()} without an assigned tech.",
                action_label="Assign technician",
                action_href=f"/dashboard/jobs?focus={job.id}",
                source_type="job",
                source_id=job.id,
                customer_id=job.customer_id,
                customer_name=customer_name,
                amount_cents=job.amount_cents,
                due_at=job.scheduled_start,
                created_at=job.created_at,
            )
        )

    for job in completed_uninvoiced_jobs:
        customer_name = _customer_name(customer_by_id, job.customer_id)
        items.append(
            AttentionItem(
                category="job_invoicing",
                priority="high",
                title="Completed job needs invoice",
                description=f"{customer_name} has completed work that has not been billed.",
                action_label="Create invoice",
                action_href=f"/dashboard/jobs?focus={job.id}",
                source_type="job",
                source_id=job.id,
                customer_id=job.customer_id,
                customer_name=customer_name,
                amount_cents=job.amount_cents,
                due_at=job.scheduled_start,
                created_at=job.created_at,
            )
        )

    items.sort(
        key=lambda item: (
            PRIORITY_WEIGHT[item.priority],
            -item.amount_cents,
            -item.created_at.timestamp(),
        )
    )

    open_estimate_cents = sum(invoice.amount_cents for invoice in open_estimates)
    open_invoice_cents = sum(invoice.amount_cents for invoice in open_invoices)
    return AttentionSummary(
        revenue_at_risk_cents=open_estimate_cents + open_invoice_cents,
        open_estimate_cents=open_estimate_cents,
        open_invoice_cents=open_invoice_cents,
        overdue_invoice_count=len(overdue_invoices),
        unscheduled_job_count=len(unscheduled_jobs),
        unassigned_job_count=len(unassigned_jobs),
        completed_uninvoiced_job_count=len(completed_uninvoiced_jobs),
        items=items[:limit],
    )
