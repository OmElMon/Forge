"""Seed a local CrewPilot OS demo workspace.

This script is intentionally developer-facing. It creates one demo company with
sample customers, jobs, estimates, and invoices so the product looks alive for
local testing, screenshots, and walkthroughs.
"""

import asyncio
import os
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.company import Company
from app.models.customer import Customer
from app.models.enums import (
    CustomerStatus,
    InvoiceStatus,
    InvoiceType,
    JobStatus,
    TechnicianStatus,
    UserRole,
)
from app.models.invoice import Invoice
from app.models.job import Job
from app.models.membership import Membership
from app.models.technician import Technician
from app.models.user import User

DEMO_COMPANY_NAME = "CrewPilot Demo HVAC"
DEMO_COMPANY_SLUG = "crewpilot-demo-hvac"
DEMO_EMAIL = "demo@crewpilot.local"
DEMO_PASSWORD = "CrewPilotDemo2026"


def _assert_safe_environment() -> None:
    production_like = settings.environment.lower() in {"prod", "production"}
    allowed = os.getenv("CREWPILOT_ALLOW_PRODUCTION_SEED") == "true"
    if production_like and not allowed:
        raise RuntimeError(
            "Refusing to seed demo data while ENVIRONMENT is production. "
            "Set CREWPILOT_ALLOW_PRODUCTION_SEED=true only if you intentionally "
            "want demo data in that database."
        )


async def _get_or_create_demo_company() -> Company:
    async with AsyncSessionLocal() as db:
        company = await db.scalar(select(Company).where(Company.slug == DEMO_COMPANY_SLUG))
        if company is None:
            company = Company(name=DEMO_COMPANY_NAME, slug=DEMO_COMPANY_SLUG)
            db.add(company)
            await db.flush()

        user = await db.scalar(select(User).where(User.email == DEMO_EMAIL))
        if user is None:
            user = User(
                email=DEMO_EMAIL,
                full_name="Demo Owner",
                password_hash=hash_password(DEMO_PASSWORD),
            )
            db.add(user)
            await db.flush()

        membership = await db.scalar(
            select(Membership).where(
                Membership.company_id == company.id,
                Membership.user_id == user.id,
            )
        )
        if membership is None:
            db.add(Membership(company_id=company.id, user_id=user.id, role=UserRole.OWNER))

        await db.commit()
        await db.refresh(company)
        return company


async def _replace_demo_business_data(company: Company) -> None:
    now = datetime.now(UTC)
    async with AsyncSessionLocal() as db:
        await db.execute(delete(Invoice).where(Invoice.company_id == company.id))
        await db.execute(delete(Job).where(Job.company_id == company.id))
        await db.execute(delete(Technician).where(Technician.company_id == company.id))
        await db.execute(delete(Customer).where(Customer.company_id == company.id))
        await db.flush()

        customers = [
            Customer(
                company_id=company.id,
                name="Marianne Foster",
                phone="555-123-4567",
                email="marianne@example.com",
                status=CustomerStatus.ACTIVE,
                source="Referral",
                notes="Prefers morning appointments. Furnace is in the basement.",
            ),
            Customer(
                company_id=company.id,
                name="Caleb Morgan",
                phone="555-832-1190",
                email="caleb@example.com",
                status=CustomerStatus.ACTIVE,
                source="Google",
                notes="Maintenance plan candidate. Ask about filter subscription.",
            ),
            Customer(
                company_id=company.id,
                name="Sarah Chen",
                phone="555-441-0291",
                email="sarah@example.com",
                status=CustomerStatus.LEAD,
                source="Phone call",
                notes="Interested in smart thermostat options.",
            ),
            Customer(
                company_id=company.id,
                name="Liam Bennett",
                phone="555-901-7742",
                email="liam@example.com",
                status=CustomerStatus.LEAD,
                source="Yard sign",
                notes="Asked for replacement quote before end of week.",
            ),
        ]
        db.add_all(customers)
        await db.flush()

        customer_by_name = {customer.name: customer for customer in customers}
        technicians = [
            Technician(
                company_id=company.id,
                name="Jordan Reyes",
                phone="555-310-8801",
                email="jordan@example.com",
                status=TechnicianStatus.ON_JOB,
                skills=["diagnostics", "maintenance", "air conditioning"],
                notes="Strong troubleshooter for no-cool calls.",
            ),
            Technician(
                company_id=company.id,
                name="Dana Smith",
                phone="555-310-8802",
                email="dana@example.com",
                status=TechnicianStatus.AVAILABLE,
                skills=["maintenance", "tune-ups", "customer education"],
                notes="Great with recurring maintenance customers.",
            ),
            Technician(
                company_id=company.id,
                name="Ari Khan",
                phone="555-310-8803",
                email="ari@example.com",
                status=TechnicianStatus.AVAILABLE,
                skills=["installs", "sales", "furnaces"],
                notes="Best fit for replacement walkthroughs.",
            ),
            Technician(
                company_id=company.id,
                name="Priya Patel",
                phone="555-310-8804",
                email="priya@example.com",
                status=TechnicianStatus.OFF_TODAY,
                skills=["thermostats", "controls", "smart home"],
                notes="Off today; usually owns thermostat installs.",
            ),
        ]
        db.add_all(technicians)
        await db.flush()
        technician_by_name = {technician.name: technician for technician in technicians}

        jobs = [
            Job(
                company_id=company.id,
                customer_id=customer_by_name["Marianne Foster"].id,
                technician_id=technician_by_name["Jordan Reyes"].id,
                title="AC not cooling",
                status=JobStatus.IN_PROGRESS,
                scheduled_start=now.replace(hour=8, minute=0, second=0, microsecond=0),
                technician_name="Jordan Reyes",
                notes="Outdoor unit fan not starting. Bring capacitor kit.",
            ),
            Job(
                company_id=company.id,
                customer_id=customer_by_name["Caleb Morgan"].id,
                technician_id=technician_by_name["Dana Smith"].id,
                title="Seasonal maintenance",
                status=JobStatus.SCHEDULED,
                scheduled_start=now.replace(hour=10, minute=30, second=0, microsecond=0),
                technician_name="Dana Smith",
                notes="Check refrigerant levels and clean coils.",
            ),
            Job(
                company_id=company.id,
                customer_id=customer_by_name["Liam Bennett"].id,
                technician_id=technician_by_name["Ari Khan"].id,
                title="Furnace replacement walkthrough",
                status=JobStatus.SCHEDULED,
                scheduled_start=now.replace(hour=13, minute=0, second=0, microsecond=0),
                technician_name="Ari Khan",
                notes="Measure install space and confirm venting route.",
            ),
            Job(
                company_id=company.id,
                customer_id=customer_by_name["Sarah Chen"].id,
                title="Thermostat installation",
                status=JobStatus.NEW,
                scheduled_start=now + timedelta(days=1, hours=2),
                technician_name=None,
                notes="Customer wants Wi-Fi thermostat recommendation.",
            ),
        ]
        db.add_all(jobs)

        invoices = [
            Invoice(
                company_id=company.id,
                customer_id=customer_by_name["Liam Bennett"].id,
                document_type=InvoiceType.ESTIMATE,
                status=InvoiceStatus.SENT,
                title="Furnace replacement estimate",
                amount_cents=984000,
                due_at=now + timedelta(days=7),
                notes="Includes equipment, labor, permit, and disposal.",
            ),
            Invoice(
                company_id=company.id,
                customer_id=customer_by_name["Sarah Chen"].id,
                document_type=InvoiceType.ESTIMATE,
                status=InvoiceStatus.APPROVED,
                title="Smart thermostat estimate",
                amount_cents=42600,
                due_at=now + timedelta(days=5),
                notes="Customer approved Ecobee option over the phone.",
            ),
            Invoice(
                company_id=company.id,
                customer_id=customer_by_name["Marianne Foster"].id,
                document_type=InvoiceType.INVOICE,
                status=InvoiceStatus.PAID,
                title="Emergency AC diagnostic",
                amount_cents=18900,
                due_at=now,
                notes="Paid by card after visit.",
            ),
            Invoice(
                company_id=company.id,
                customer_id=customer_by_name["Caleb Morgan"].id,
                document_type=InvoiceType.INVOICE,
                status=InvoiceStatus.SENT,
                title="Seasonal maintenance visit",
                amount_cents=24900,
                due_at=now + timedelta(days=14),
                notes="Invoice sent after maintenance appointment.",
            ),
        ]
        db.add_all(invoices)
        await db.commit()


async def main() -> None:
    _assert_safe_environment()
    company = await _get_or_create_demo_company()
    await _replace_demo_business_data(company)
    print("Seeded CrewPilot OS demo workspace.")
    print(f"Company: {DEMO_COMPANY_NAME}")
    print(f"Email:    {DEMO_EMAIL}")
    print(f"Password: {DEMO_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(main())
