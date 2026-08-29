from pydantic import BaseModel

from app.schemas.company import CompanyRead


class AdminCompanyOverview(BaseModel):
    company: CompanyRead
    member_count: int
    open_invites: int
    audit_total: int
