from fastapi import APIRouter

from app.api.v1.endpoints import (
    admin,
    analytics,
    attention,
    audit_logs,
    auth,
    companies,
    customers,
    dispatch,
    events,
    followups,
    health,
    intake,
    invites,
    invoices,
    jobs,
    memberships,
    technicians,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(companies.router)
api_router.include_router(admin.router)
api_router.include_router(customers.router)
api_router.include_router(jobs.router)
api_router.include_router(invoices.router)
api_router.include_router(technicians.router)
api_router.include_router(attention.router)
api_router.include_router(analytics.router)
api_router.include_router(audit_logs.router)
api_router.include_router(events.router)
api_router.include_router(followups.router)
api_router.include_router(dispatch.router)
api_router.include_router(intake.router)
api_router.include_router(invites.router)
api_router.include_router(memberships.router)
