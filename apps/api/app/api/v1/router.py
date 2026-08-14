from fastapi import APIRouter

from app.api.v1.endpoints import (
    analytics,
    attention,
    audit_logs,
    auth,
    customers,
    health,
    invoices,
    jobs,
    technicians,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(customers.router)
api_router.include_router(jobs.router)
api_router.include_router(invoices.router)
api_router.include_router(technicians.router)
api_router.include_router(attention.router)
api_router.include_router(analytics.router)
api_router.include_router(audit_logs.router)
