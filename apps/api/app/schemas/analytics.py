from pydantic import BaseModel, Field


class AnalyticsSummary(BaseModel):
    paid_revenue_cents: int = 0
    open_invoice_cents: int = 0
    open_estimate_cents: int = 0
    pipeline_cents: int = 0
    average_paid_ticket_cents: int = 0
    invoice_collection_rate: float = Field(default=0, ge=0, le=1)
    estimate_conversion_rate: float = Field(default=0, ge=0, le=1)
    customer_count: int = 0
    active_customer_count: int = 0
    job_count: int = 0
    open_job_count: int = 0
    completed_job_count: int = 0
    unscheduled_job_count: int = 0
    unassigned_job_count: int = 0
