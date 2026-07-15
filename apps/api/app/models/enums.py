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
