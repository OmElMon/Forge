from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_principal
from app.db.session import get_db
from app.models.technician import Technician
from app.schemas.principal import Principal
from app.schemas.technician import TechnicianCreate, TechnicianRead, TechnicianUpdate

router = APIRouter(prefix="/technicians", tags=["technicians"])


async def get_company_technician(
    technician_id: UUID,
    db: AsyncSession,
    principal: Principal,
) -> Technician:
    result = await db.execute(
        select(Technician).where(
            Technician.id == technician_id,
            Technician.company_id == principal.company_id,
        )
    )
    technician = result.scalar_one_or_none()
    if technician is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found.")
    return technician


@router.get("", response_model=list[TechnicianRead])
async def list_technicians(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[Technician]:
    result = await db.execute(
        select(Technician)
        .where(Technician.company_id == principal.company_id)
        .order_by(Technician.name.asc())
    )
    return list(result.scalars().all())


@router.post("", response_model=TechnicianRead, status_code=status.HTTP_201_CREATED)
async def create_technician(
    payload: TechnicianCreate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Technician:
    technician = Technician(company_id=principal.company_id, **payload.model_dump())
    db.add(technician)
    await db.commit()
    await db.refresh(technician)
    return technician


@router.get("/{technician_id}", response_model=TechnicianRead)
async def read_technician(
    technician_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Technician:
    return await get_company_technician(technician_id, db, principal)


@router.patch("/{technician_id}", response_model=TechnicianRead)
async def update_technician(
    technician_id: UUID,
    payload: TechnicianUpdate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Technician:
    technician = await get_company_technician(technician_id, db, principal)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(technician, field, value)
    await db.commit()
    await db.refresh(technician)
    return technician
