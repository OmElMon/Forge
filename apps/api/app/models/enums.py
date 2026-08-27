from enum import StrEnum


class UserRole(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    DISPATCHER = "dispatcher"
    TECHNICIAN = "technician"
    OFFICE_STAFF = "office_staff"


class CompanyStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"


class CustomerStatus(StrEnum):
    LEAD = "lead"
    ACTIVE = "active"
    INACTIVE = "inactive"


class PreferredContact(StrEnum):
    PHONE = "phone"
    EMAIL = "email"
    SMS = "sms"


class JobStatus(StrEnum):
    NEW = "new"
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELED = "canceled"


class InvoiceType(StrEnum):
    ESTIMATE = "estimate"
    INVOICE = "invoice"


class InvoiceStatus(StrEnum):
    DRAFT = "draft"
    SENT = "sent"
    APPROVED = "approved"
    CONVERTED = "converted"
    PAID = "paid"
    VOID = "void"


class TechnicianStatus(StrEnum):
    AVAILABLE = "available"
    ON_JOB = "on_job"
    OFF_TODAY = "off_today"


class FollowupTaskStatus(StrEnum):
    OPEN = "open"
    RESOLVED = "resolved"


class DomainEventType(StrEnum):
    CUSTOMER_CREATED = "customer.created"
    CUSTOMER_UPDATED = "customer.updated"
    CUSTOMER_STAGE_CHANGED = "customer.stage.changed"
    CUSTOMER_ADDRESS_ADDED = "customer.address.added"
    CUSTOMER_ADDRESS_UPDATED = "customer.address.updated"
    CUSTOMER_ADDRESS_REMOVED = "customer.address.removed"
    CUSTOMER_EQUIPMENT_ADDED = "customer.equipment.added"
    CUSTOMER_EQUIPMENT_UPDATED = "customer.equipment.updated"
    CUSTOMER_EQUIPMENT_REMOVED = "customer.equipment.removed"
    TECHNICIAN_CREATED = "technician.created"
    TECHNICIAN_UPDATED = "technician.updated"
    TECHNICIAN_AVAILABILITY_CHANGED = "technician.availability.changed"
    JOB_CREATED = "job.created"
    JOB_UPDATED = "job.updated"
    JOB_SCHEDULED = "job.scheduled"
    JOB_ASSIGNED = "job.assigned"
    JOB_STARTED = "job.started"
    JOB_COMPLETED = "job.completed"
    JOB_CANCELED = "job.canceled"
    INVOICE_CREATED = "invoice.created"
    INVOICE_UPDATED = "invoice.updated"
    INVOICE_SENT = "invoice.sent"
    ESTIMATE_APPROVED = "estimate.approved"
    ESTIMATE_CONVERTED = "estimate.converted"
    INVOICE_PAID = "invoice.paid"
    INVOICE_LINE_ITEM_ADDED = "invoice.line_item.added"
    INVOICE_LINE_ITEM_UPDATED = "invoice.line_item.updated"
    INVOICE_LINE_ITEM_REMOVED = "invoice.line_item.deleted"
    FOLLOWUP_CREATED = "followup.created"
    FOLLOWUP_DUE = "followup.due"
    FOLLOWUP_RESOLVED = "followup.resolved"


class DomainAggregateType(StrEnum):
    CUSTOMER = "customer"
    TECHNICIAN = "technician"
    JOB = "job"
    INVOICE = "invoice"
    FOLLOWUP = "followup"
