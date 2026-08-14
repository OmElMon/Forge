from app.models.customer import Customer
from app.models.enums import CustomerStatus, InvoiceStatus, InvoiceType, JobStatus
from app.models.invoice import Invoice
from app.models.job import Job
from app.schemas.analytics import AnalyticsSummary

OPEN_JOB_STATUSES = {JobStatus.NEW, JobStatus.SCHEDULED, JobStatus.IN_PROGRESS}
OPEN_INVOICE_STATUSES = {InvoiceStatus.DRAFT, InvoiceStatus.SENT}
OPEN_ESTIMATE_STATUSES = {InvoiceStatus.DRAFT, InvoiceStatus.SENT, InvoiceStatus.APPROVED}


def rate(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0
    return round(numerator / denominator, 4)


def build_analytics_summary(
    *,
    customers: list[Customer],
    invoices: list[Invoice],
    jobs: list[Job],
) -> AnalyticsSummary:
    paid_invoices = [
        invoice
        for invoice in invoices
        if invoice.document_type == InvoiceType.INVOICE and invoice.status == InvoiceStatus.PAID
    ]
    open_invoices = [
        invoice
        for invoice in invoices
        if invoice.document_type == InvoiceType.INVOICE and invoice.status in OPEN_INVOICE_STATUSES
    ]
    billable_invoices = [
        invoice
        for invoice in invoices
        if invoice.document_type == InvoiceType.INVOICE and invoice.status != InvoiceStatus.VOID
    ]
    open_estimates = [
        invoice
        for invoice in invoices
        if invoice.document_type == InvoiceType.ESTIMATE
        and invoice.status in OPEN_ESTIMATE_STATUSES
    ]
    converted_estimates = [
        invoice
        for invoice in invoices
        if invoice.document_type == InvoiceType.ESTIMATE
        and invoice.status == InvoiceStatus.CONVERTED
    ]
    closed_estimates = [
        invoice
        for invoice in invoices
        if invoice.document_type == InvoiceType.ESTIMATE
        and invoice.status in {InvoiceStatus.APPROVED, InvoiceStatus.CONVERTED, InvoiceStatus.VOID}
    ]
    open_jobs = [job for job in jobs if job.status in OPEN_JOB_STATUSES]
    completed_jobs = [job for job in jobs if job.status == JobStatus.COMPLETED]
    paid_revenue_cents = sum(invoice.amount_cents for invoice in paid_invoices)
    open_invoice_cents = sum(invoice.amount_cents for invoice in open_invoices)
    open_estimate_cents = sum(invoice.amount_cents for invoice in open_estimates)
    paid_ticket_count = len(paid_invoices)

    return AnalyticsSummary(
        active_customer_count=len(
            [customer for customer in customers if customer.status == CustomerStatus.ACTIVE]
        ),
        average_paid_ticket_cents=round(paid_revenue_cents / paid_ticket_count)
        if paid_ticket_count
        else 0,
        completed_job_count=len(completed_jobs),
        customer_count=len(customers),
        estimate_conversion_rate=rate(len(converted_estimates), len(closed_estimates)),
        invoice_collection_rate=rate(len(paid_invoices), len(billable_invoices)),
        job_count=len(jobs),
        open_estimate_cents=open_estimate_cents,
        open_invoice_cents=open_invoice_cents,
        open_job_count=len(open_jobs),
        paid_revenue_cents=paid_revenue_cents,
        pipeline_cents=open_invoice_cents + open_estimate_cents,
        unassigned_job_count=len(
            [job for job in open_jobs if job.technician_id is None and not job.technician_name]
        ),
        unscheduled_job_count=len([job for job in open_jobs if job.scheduled_start is None]),
    )
