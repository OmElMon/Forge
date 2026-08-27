from collections.abc import Sequence

from app.models.customer import Customer
from app.models.enums import CustomerStatus, InvoiceStatus, InvoiceType, JobStatus
from app.models.equipment import Equipment
from app.models.invoice import Invoice
from app.models.job import Job
from app.models.service_address import ServiceAddress
from app.schemas.customer import CustomerDetail, CustomerRead
from app.schemas.equipment import EquipmentRead
from app.schemas.service_address import ServiceAddressRead

OPEN_JOB_STATUSES = {JobStatus.NEW, JobStatus.SCHEDULED, JobStatus.IN_PROGRESS}
OPEN_ESTIMATE_STATUSES = {InvoiceStatus.DRAFT, InvoiceStatus.SENT, InvoiceStatus.APPROVED}
OPEN_INVOICE_STATUSES = {InvoiceStatus.DRAFT, InvoiceStatus.SENT, InvoiceStatus.APPROVED}


def filter_customers(
    customers: Sequence[Customer],
    *,
    search: str | None = None,
    status: CustomerStatus | None = None,
) -> list[Customer]:
    """Filter a tenant's customers by free-text search and/or status.

    Search matches case-insensitively against name, phone, and email. Kept as a
    pure in-memory filter so tenant-scale lists stay unit-testable and share a
    single source of truth with the endpoint.
    """
    needle = search.strip().lower() if search else None
    matches: list[Customer] = []
    for customer in customers:
        if status is not None and customer.status != status:
            continue
        if needle is not None:
            haystack = " ".join(
                part for part in (customer.name, customer.phone, customer.email) if part
            ).lower()
            if needle not in haystack:
                continue
        matches.append(customer)
    return matches


def build_customer_detail(
    *,
    addresses: list[ServiceAddress],
    customer: Customer,
    equipment: list[Equipment],
    invoices: list[Invoice],
    jobs: list[Job],
) -> CustomerDetail:
    """Assemble a customer profile with revenue, pipeline, and open-work depth."""
    paid_invoices = [
        invoice
        for invoice in invoices
        if invoice.document_type == InvoiceType.INVOICE and invoice.status == InvoiceStatus.PAID
    ]
    open_estimates = [
        invoice
        for invoice in invoices
        if invoice.document_type == InvoiceType.ESTIMATE
        and invoice.status in OPEN_ESTIMATE_STATUSES
    ]
    open_invoices = [
        invoice
        for invoice in invoices
        if invoice.document_type == InvoiceType.INVOICE and invoice.status in OPEN_INVOICE_STATUSES
    ]
    open_jobs = [job for job in jobs if job.status in OPEN_JOB_STATUSES]

    return CustomerDetail(
        **CustomerRead.model_validate(customer).model_dump(),
        equipment=[EquipmentRead.model_validate(item) for item in equipment],
        lifetime_value_cents=sum(invoice.amount_cents for invoice in paid_invoices),
        open_estimate_cents=sum(invoice.amount_cents for invoice in open_estimates),
        open_estimate_count=len(open_estimates),
        open_invoice_cents=sum(invoice.amount_cents for invoice in open_invoices),
        open_invoice_count=len(open_invoices),
        open_job_count=len(open_jobs),
        paid_invoice_count=len(paid_invoices),
        service_addresses=[ServiceAddressRead.model_validate(item) for item in addresses],
    )
